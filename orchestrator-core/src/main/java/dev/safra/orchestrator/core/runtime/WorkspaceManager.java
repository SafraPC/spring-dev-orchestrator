package dev.safra.orchestrator.core.runtime;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.BiConsumer;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.safra.orchestrator.model.ServiceDefinition;
import dev.safra.orchestrator.model.ServiceDescriptor;
import dev.safra.orchestrator.model.ServiceRuntime;
import dev.safra.orchestrator.model.ServiceStatus;

public class WorkspaceManager {
  private final Path stateDir;
  private final Path workspaceFile;
  private final Path runtimeFile;
  private final ObjectMapper om;
  private final StateStore store;
  private final PortExtractor portExtractor;
  private final ProjectScanner scanner;
  private final BiConsumer<String, JsonNode> emitEvent;

  private Workspace workspace;
  private final Map<String, ServiceDescriptor> services;

  public WorkspaceManager(Path stateDir, ObjectMapper om, StateStore store,
      PortExtractor portExtractor, BiConsumer<String, JsonNode> emitEvent,
      Map<String, ServiceDescriptor> services) {
    this.stateDir = stateDir;
    this.om = om;
    this.store = store;
    this.portExtractor = portExtractor;
    this.emitEvent = emitEvent;
    this.services = services;
    this.workspaceFile = stateDir.resolve("workspace.json");
    this.runtimeFile = stateDir.resolve("runtime.json");
    Path logsDir = stateDir.resolve("logs");
    this.scanner = new ProjectScanner(store, portExtractor, logsDir);
  }

  public Workspace getWorkspace() {
    return workspace;
  }

  public void loadAll() {
    try {
      Files.createDirectories(stateDir);
      Files.createDirectories(stateDir.resolve("logs"));
    } catch (Exception e) {
      throw new IllegalStateException("Não consegui criar stateDir: " + stateDir, e);
    }

    this.workspace = store.readJson(workspaceFile, Workspace.class).orElseGet(Workspace::new);
    if (this.workspace.getContainers() == null)
      workspace.setContainers(new HashMap<>());

    Map<String, ServiceRuntime> runtime = store.readJson(runtimeFile, new TypeReference<Map<String, ServiceRuntime>>() {
    }).orElseGet(HashMap::new);
    Map<String, ServiceDescriptor> existing = new HashMap<>(services);
    services.clear();

    for (ServiceDefinition def : workspace.getServices()) {
      if (def.getName() == null || def.getName().isBlank())
        continue;
      Path servicePath = Path.of(def.getPath());
      if (Files.exists(servicePath)) {
        applyPortFromConfig(def, servicePath);
        if (def.getJavaVersion() == null || def.getJavaVersion().isBlank()) {
          Path pom = servicePath.resolve("pom.xml");
          if (Files.exists(pom)) {
            def.setJavaVersion(scanner.extractJavaVersion(pom));
          }
        }
      }

      ServiceDescriptor sd = new ServiceDescriptor();
      sd.setDefinition(def);
      if (def.getContainerIds() == null)
        def.setContainerIds(new ArrayList<>());

      ServiceRuntime rt = existing.containsKey(def.getName())
          ? existing.get(def.getName()).getRuntime()
          : runtime.getOrDefault(def.getName(), new ServiceRuntime());

      if (rt.getPid() != null) {
        boolean alive = ProcessHandle.of(rt.getPid()).map(ProcessHandle::isAlive).orElse(false);
        rt.setStatus(alive ? ServiceStatus.RUNNING : ServiceStatus.STOPPED);
        if (!alive)
          rt.setPid(null);
      }
      sd.setRuntime(rt);
      services.put(def.getName(), sd);
    }
    persistRuntime();
    persistWorkspace();
  }

  public JsonNode importRootAndScan(String root) {
    if (root == null || root.isBlank())
      throw new IllegalArgumentException("params.root é obrigatório");
    Path rootPath = Path.of(root).toAbsolutePath().normalize();
    if (!workspace.getRoots().contains(rootPath.toString()))
      workspace.getRoots().add(rootPath.toString());
    persistWorkspace();
    return scanRoots();
  }

  public JsonNode removeRoot(String root) {
    if (root == null || root.isBlank())
      throw new IllegalArgumentException("params.root é obrigatório");
    workspace.getRoots().removeIf(r -> r.equals(root));
    persistWorkspace();
    return scanRoots();
  }

  public JsonNode setExcludeDirs(List<String> excludeDirs) {
    workspace.setExcludeDirs(excludeDirs);
    persistWorkspace();
    return om.valueToTree(workspace);
  }

  public JsonNode scanRoots() {
    Map<String, List<String>> savedContainerIds = new HashMap<>();
    for (ServiceDefinition def : workspace.getServices()) {
      if (def.getContainerIds() != null && !def.getContainerIds().isEmpty()) {
        savedContainerIds.put(def.getName(), new ArrayList<>(def.getContainerIds()));
      }
    }

    List<ServiceDefinition> found = new ArrayList<>();
    for (String r : workspace.getRoots())
      found.addAll(scanner.scanRoot(Path.of(r), workspace.getExcludeDirs()));

    Map<String, ServiceDefinition> byName = new HashMap<>();
    for (ServiceDefinition d : found)
      byName.put(d.getName(), d);

    for (Map.Entry<String, List<String>> entry : savedContainerIds.entrySet()) {
      ServiceDefinition def = byName.get(entry.getKey());
      if (def != null) {
        List<String> valid = entry.getValue().stream().filter(id -> workspace.getContainers().containsKey(id)).toList();
        def.setContainerIds(new ArrayList<>(valid));
      }
    }

    workspace.setServices(byName.values().stream().sorted(Comparator.comparing(ServiceDefinition::getName)).toList());
    persistWorkspace();
    loadAll();
    emitEvent.accept("workspace", om.valueToTree(workspace));

    return om.valueToTree(services.values().stream()
        .map(sd -> new ServiceView(sd.getDefinition().getName(), sd.getDefinition().getPath(),
            sd.getDefinition().getCommand(),
            sd.getDefinition().getLogFile(), sd.getDefinition().getEnv(), sd.getDefinition().getJavaHome(),
            sd.getDefinition().getJavaVersion(), sd.getDefinition().getContainerIds(),
            sd.getRuntime().getPid(), sd.getRuntime().getStatus(),
            sd.getRuntime().getLastStartAt(), sd.getRuntime().getLastStopAt(), sd.getRuntime().getLastError()))
        .sorted(Comparator.comparing(ServiceView::name))
        .toList());
  }

  public void persistWorkspace() {
    store.writeJson(workspaceFile, workspace);
  }

  public void persistRuntime() {
    Map<String, ServiceRuntime> m = new HashMap<>();
    for (ServiceDescriptor sd : services.values())
      m.put(sd.getDefinition().getName(), sd.getRuntime());
    store.writeJson(runtimeFile, m);
  }

  private void applyPortFromConfig(ServiceDefinition def, Path servicePath) {
    Optional<Integer> configPort = portExtractor.extract(servicePath);
    if (configPort.isEmpty())
      return;
    int port = configPort.get();
    if (def.getEnv() == null)
      def.setEnv(new HashMap<>());
    def.getEnv().put("SERVER_PORT", String.valueOf(port));

    List<String> cmd = new ArrayList<>(def.getCommand());
    boolean updated = false;
    for (int i = 0; i < cmd.size(); i++) {
      if (cmd.get(i).startsWith("-Dspring-boot.run.arguments=--server.port=")) {
        cmd.set(i, "-Dspring-boot.run.arguments=--server.port=" + port);
        updated = true;
        break;
      }
    }
    if (updated) {
      def.setCommand(cmd);
    } else {
      String mvnCmd = Files.exists(servicePath.resolve("mvnw")) ? "./mvnw" : "mvn";
      def.setCommand(
          List.of(mvnCmd, "-q", "-DskipTests", "-Dspring-boot.run.arguments=--server.port=" + port, "spring-boot:run"));
    }
  }
}
