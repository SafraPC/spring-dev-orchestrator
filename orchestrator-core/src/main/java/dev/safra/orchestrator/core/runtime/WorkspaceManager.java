package dev.safra.orchestrator.core.runtime;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.BiConsumer;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.safra.orchestrator.model.ProjectType;
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
  private final JsProjectScanner jsScanner;
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
    this.jsScanner = new JsProjectScanner(om, logsDir);
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
    if (workspace.getContainers() == null)
      workspace.setContainers(new HashMap<>());
    if (workspace.getRemovedServices() == null)
      workspace.setRemovedServices(new HashSet<>());

    Map<String, ServiceRuntime> runtime = store.readJson(runtimeFile, new TypeReference<Map<String, ServiceRuntime>>() {
    }).orElseGet(HashMap::new);
    Map<String, ServiceDescriptor> existing = new HashMap<>(services);
    services.clear();

    for (ServiceDefinition def : workspace.getServices()) {
      if (def.getName() == null || def.getName().isBlank())
        continue;
      Path servicePath = Path.of(def.getPath());
      boolean isSpring = def.getProjectType() == null || def.getProjectType() == ProjectType.SPRING_BOOT;
      if (Files.exists(servicePath) && isSpring) {
        applyPortFromConfig(def, servicePath);
        if (def.getJavaVersion() == null || def.getJavaVersion().isBlank()) {
          Path pom = servicePath.resolve("pom.xml");
          if (Files.exists(pom)) {
            def.setJavaVersion(scanner.extractJavaVersion(pom));
          }
        }
        if (def.getProjectType() == null)
          def.setProjectType(ProjectType.SPRING_BOOT);
      }

      if (def.getContainerIds() == null)
        def.setContainerIds(new ArrayList<>());
      ServiceDescriptor sd = new ServiceDescriptor();
      sd.setDefinition(def);
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
    syncServiceOrder();
    syncContainerOrder();
    persistRuntime();
    persistWorkspace();
  }

  public JsonNode importRootAndScan(String root) {
    if (root == null || root.isBlank())
      throw new IllegalArgumentException("params.root é obrigatório");
    return importRootsAndScan(List.of(root));
  }

  public JsonNode importRootsAndScan(List<String> roots) {
    if (roots == null || roots.isEmpty())
      throw new IllegalArgumentException("params.roots é obrigatório");

    List<Path> importedPaths = new ArrayList<>();
    List<ServiceDefinition> found = new ArrayList<>();
    for (String root : roots) {
      Path p = Path.of(root).toAbsolutePath().normalize();
      importedPaths.add(p);
      found.addAll(scanner.scanRoot(p, workspace.getExcludeDirs()));
      found.addAll(jsScanner.scanRoot(p, workspace.getExcludeDirs()));
    }

    Set<String> existingNames = new HashSet<>();
    for (ServiceDefinition s : workspace.getServices())
      existingNames.add(s.getName());

    int added = 0;
    for (ServiceDefinition def : found) {
      if (existingNames.contains(def.getName()))
        continue;
      if (def.getProjectType() == null)
        continue;
      Path defPath = Path.of(def.getPath());
      boolean underImported = importedPaths.stream().anyMatch(defPath::startsWith);
      if (!underImported)
        continue;
      workspace.getServices().add(def);
      existingNames.add(def.getName());
      added++;
    }

    if (added > 0) {
      syncServiceOrder();
      persistWorkspace();
    }

    loadAll();
    emitEvent.accept("workspace", om.valueToTree(workspace));
    return buildSortedServiceList();
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
    for (String r : workspace.getRoots()) {
      found.addAll(scanner.scanRoot(Path.of(r), workspace.getExcludeDirs()));
      found.addAll(jsScanner.scanRoot(Path.of(r), workspace.getExcludeDirs()));
    }

    Map<String, ServiceDefinition> byName = new HashMap<>();
    for (ServiceDefinition d : found) {
      if (!workspace.getRemovedServices().contains(d.getName()))
        byName.put(d.getName(), d);
    }

    for (Map.Entry<String, List<String>> entry : savedContainerIds.entrySet()) {
      ServiceDefinition def = byName.get(entry.getKey());
      if (def != null) {
        List<String> valid = entry.getValue().stream().filter(id -> workspace.getContainers().containsKey(id)).toList();
        def.setContainerIds(new ArrayList<>(valid));
      }
    }

    workspace.setServices(new ArrayList<>(byName.values()));
    syncServiceOrder();
    syncContainerOrder();
    persistWorkspace();
    loadAll();
    emitEvent.accept("workspace", om.valueToTree(workspace));

    return buildSortedServiceList();
  }

  private JsonNode buildSortedServiceList() {
    return om.valueToTree(sortedViews(services.values().stream()
        .map(this::toView).toList()));
  }

  private ServiceView toView(ServiceDescriptor sd) {
    var d = sd.getDefinition();
    var r = sd.getRuntime();
    return new ServiceView(d.getName(), d.getPath(), d.getCommand(), d.getLogFile(),
        d.getEnv(), d.getJavaHome(), d.getJavaVersion(), d.getContainerIds(),
        d.getProjectType(), d.getAvailableScripts(),
        r.getPid(), r.getStatus(), r.getLastStartAt(), r.getLastStopAt(), r.getLastError());
  }

  public JsonNode reorderServices(List<String> order) {
    workspace.setServiceOrder(order != null ? new ArrayList<>(order) : new ArrayList<>());
    persistWorkspace();
    return om.valueToTree(workspace);
  }

  public JsonNode reorderContainers(List<String> order) {
    workspace.setContainerOrder(order != null ? new ArrayList<>(order) : new ArrayList<>());
    persistWorkspace();
    return om.valueToTree(workspace);
  }

  public void syncServiceOrder() {
    if (workspace.getServiceOrder() == null)
      workspace.setServiceOrder(new ArrayList<>());
    List<String> order = workspace.getServiceOrder();
    List<String> existing = workspace.getServices().stream().map(ServiceDefinition::getName).toList();
    order.retainAll(existing);
    existing.stream().filter(n -> !order.contains(n)).forEach(order::add);
  }

  public void syncContainerOrder() {
    if (workspace.getContainerOrder() == null)
      workspace.setContainerOrder(new ArrayList<>());
    List<String> order = workspace.getContainerOrder();
    List<String> existing = new ArrayList<>(workspace.getContainers().keySet());
    order.retainAll(existing);
    existing.stream().filter(id -> !order.contains(id)).forEach(order::add);
  }

  List<ServiceView> sortedViews(List<ServiceView> views) {
    List<String> order = workspace.getServiceOrder();
    if (order == null || order.isEmpty())
      return views;
    return views.stream()
        .sorted(Comparator.comparingInt(v -> {
          int idx = order.indexOf(v.name());
          return idx >= 0 ? idx : Integer.MAX_VALUE;
        }))
        .toList();
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
    for (int i = 0; i < cmd.size(); i++) {
      if (cmd.get(i).startsWith("-Dspring-boot.run.arguments=--server.port=")) {
        cmd.set(i, "-Dspring-boot.run.arguments=--server.port=" + port);
        def.setCommand(cmd);
        return;
      }
    }
    String mvnCmd = Files.exists(servicePath.resolve("mvnw")) ? "./mvnw" : "mvn";
    def.setCommand(
        List.of(mvnCmd, "-q", "-DskipTests", "-Dspring-boot.run.arguments=--server.port=" + port, "spring-boot:run"));
  }
}
