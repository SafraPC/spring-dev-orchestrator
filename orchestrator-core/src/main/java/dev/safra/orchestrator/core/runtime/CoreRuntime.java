package dev.safra.orchestrator.core.runtime;

import java.io.BufferedInputStream;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import dev.safra.orchestrator.model.Container;
import dev.safra.orchestrator.model.ServiceDefinition;
import dev.safra.orchestrator.model.ServiceDescriptor;
import dev.safra.orchestrator.model.ServiceRuntime;
import dev.safra.orchestrator.model.ServiceStatus;
import dev.safra.orchestrator.process.ProcessManager;
import dev.safra.orchestrator.process.StopResult;

public class CoreRuntime {
  private final Path stateDir;
  private final ObjectMapper om;
  private final BiConsumer<String, JsonNode> emitEvent;

  private final Path workspaceFile;
  private final Path runtimeFile;
  private final Path logsDir;

  private final Duration gracefulTimeout = Duration.ofSeconds(8);
  private final Duration killTimeout = Duration.ofSeconds(3);

  private final Map<String, ServiceDescriptor> services = new ConcurrentHashMap<>();
  private final ProcessManager processManager = new ProcessManager(gracefulTimeout, killTimeout);

  private final Map<String, LogSubscription> logSubs = new ConcurrentHashMap<>();
  private final AtomicBoolean shutdown = new AtomicBoolean(false);

  private Workspace workspace;

  public CoreRuntime(Path stateDir, ObjectMapper om, TriEventEmitter eventEmitter) {
    this.stateDir = stateDir;
    this.om = om;
    this.emitEvent = (ev, payload) -> eventEmitter.emit(om, ev, payload);

    this.workspaceFile = stateDir.resolve("workspace.json");
    this.runtimeFile = stateDir.resolve("runtime.json");
    this.logsDir = stateDir.resolve("logs");

    LogFileWriter.initialize(stateDir);
    LogFileWriter.log("CoreRuntime inicializado em: " + stateDir);

    loadAll();

    startProcessMonitor();
    LogFileWriter.log("Monitor de processos iniciado");
  }

  private void startProcessMonitor() {
    Thread.ofVirtual().name("process-monitor").start(() -> {
      while (!shutdown.get()) {
        try {
          Thread.sleep(5000);

          for (ServiceDescriptor sd : services.values()) {
            ServiceRuntime rt = sd.getRuntime();
            String name = sd.getDefinition().getName();

            if (rt.getPid() != null) {
              boolean alive = processManager.isAlive(rt.getPid());
              if (!alive && rt.getStatus() == ServiceStatus.RUNNING) {
                rt.setStatus(ServiceStatus.STOPPED);
                rt.setPid(null);
                rt.setLastStopAt(Instant.now());
                persistRuntime();
                emitServiceChanged(name);
              }
            } else if (rt.getStatus() == ServiceStatus.RUNNING) {
              rt.setStatus(ServiceStatus.STOPPED);
              persistRuntime();
              emitServiceChanged(name);
            }
          }
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          break;
        } catch (Exception e) {
        }
      }
    });
  }

  public JsonNode handle(String method, JsonNode params) throws JsonProcessingException, IllegalArgumentException {
    if (method == null || method.isBlank())
      throw new IllegalArgumentException("method é obrigatório");
    return switch (method) {
      case "ping" -> om.getNodeFactory().textNode("pong");
      case "getWorkspace" -> om.valueToTree(workspace);
      case "setExcludeDirs" -> setExcludeDirs(params);
      case "importRootAndScan" -> importRootAndScan(params);
      case "removeRoot" -> removeRoot(params);
      case "scanRoots" -> scanRoots();
      case "listServices" -> listServices();
      case "startService" -> startService(params);
      case "stopService" -> stopService(params);
      case "restartService" -> restartService(params);
      case "startAll" -> startAll();
      case "stopAll" -> stopAll();
      case "subscribeLogs" -> subscribeLogs(params);
      case "unsubscribeLogs" -> unsubscribeLogs(params);
      case "removeService" -> removeService(params);
      case "createContainer" -> createContainer(params);
      case "updateContainer" -> updateContainer(params);
      case "deleteContainer" -> deleteContainer(params);
      case "listContainers" -> listContainers();
      case "addServiceToContainer" -> addServiceToContainer(params);
      case "removeServiceFromContainer" -> removeServiceFromContainer(params);
      case "getServicesByContainer" -> getServicesByContainer(params);
      case "startContainer" -> startContainer(params);
      case "stopContainer" -> stopContainer(params);
      case "openServiceFolder" -> openServiceFolder(params);
      case "openServiceTerminal" -> openServiceTerminal(params);
      case "openServiceInEditor" -> openServiceInEditor(params);
      default -> throw new IllegalArgumentException("Método desconhecido: " + method);
    };
  }

  public void shutdown() {
    LogFileWriter.log("CoreRuntime encerrando...");
    shutdown.set(true);
    for (LogSubscription s : logSubs.values()) {
      s.stop();
    }
    LogFileWriter.close();
  }

  private void loadAll() {
    try {
      Files.createDirectories(stateDir);
      Files.createDirectories(logsDir);
    } catch (Exception e) {
      throw new IllegalStateException("Não consegui criar stateDir: " + stateDir, e);
    }

    this.workspace = readJson(workspaceFile, Workspace.class).orElseGet(Workspace::new);
    if (this.workspace.getContainers() == null) {
      this.workspace.setContainers(new HashMap<>());
    }
    Map<String, ServiceRuntime> runtime = readJson(runtimeFile, new TypeReference<Map<String, ServiceRuntime>>() {
    })
        .orElseGet(HashMap::new);

    Map<String, ServiceDescriptor> existingServices = new HashMap<>(services);
    services.clear();

    for (ServiceDefinition def : workspace.getServices()) {
      if (def.getName() == null || def.getName().isBlank()) {
        continue;
      }
      
      Path servicePath = Path.of(def.getPath());
      if (Files.exists(servicePath)) {
        Optional<Integer> configPort = extractPortFromConfig(servicePath);
        if (configPort.isPresent()) {
          int port = configPort.get();
          if (def.getEnv() == null) {
            def.setEnv(new HashMap<>());
          }
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
            Path mvnw = servicePath.resolve("mvnw");
            boolean hasMvnw = Files.exists(mvnw);
            if (hasMvnw) {
              def.setCommand(List.of("./mvnw", "-q", "-DskipTests",
                  "-Dspring-boot.run.arguments=--server.port=" + port,
                  "spring-boot:run"));
            } else {
              def.setCommand(List.of("mvn", "-q", "-DskipTests",
                  "-Dspring-boot.run.arguments=--server.port=" + port,
                  "spring-boot:run"));
            }
          }
        }
      }
      
      ServiceDescriptor sd = new ServiceDescriptor();
      sd.setDefinition(def);

      if (def.getContainerIds() == null) {
        def.setContainerIds(new ArrayList<>());
      }

      ServiceRuntime rt;
      if (existingServices.containsKey(def.getName())) {
        rt = existingServices.get(def.getName()).getRuntime();
      } else {
        rt = runtime.getOrDefault(def.getName(), new ServiceRuntime());
      }

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

  private void persistWorkspace() {
    writeJson(workspaceFile, workspace);
  }

  private void persistRuntime() {
    Map<String, ServiceRuntime> m = new HashMap<>();
    for (ServiceDescriptor sd : services.values()) {
      m.put(sd.getDefinition().getName(), sd.getRuntime());
    }
    writeJson(runtimeFile, m);
  }

  private JsonNode setExcludeDirs(JsonNode params) {
    List<String> ex = new ArrayList<>();
    if (params != null && params.has("excludeDirs") && params.get("excludeDirs").isArray()) {
      for (JsonNode n : params.get("excludeDirs")) {
        ex.add(n.asText());
      }
    }
    workspace.setExcludeDirs(ex);
    persistWorkspace();
    return om.valueToTree(workspace);
  }

  private JsonNode importRootAndScan(JsonNode params) {
    String root = params != null && params.hasNonNull("root") ? params.get("root").asText() : null;
    if (root == null || root.isBlank())
      throw new IllegalArgumentException("params.root é obrigatório");

    Path rootPath = Path.of(root).toAbsolutePath().normalize();
    String normalizedRoot = rootPath.toString();


    if (!workspace.getRoots().contains(normalizedRoot)) {
      workspace.getRoots().add(normalizedRoot);
    }
    persistWorkspace();
    return scanRoots();
  }

  private JsonNode removeRoot(JsonNode params) {
    String root = params != null && params.hasNonNull("root") ? params.get("root").asText() : null;
    if (root == null || root.isBlank())
      throw new IllegalArgumentException("params.root é obrigatório");
    workspace.getRoots().removeIf(r -> r.equals(root));
    persistWorkspace();
    return scanRoots();
  }

  private JsonNode removeService(JsonNode params) {
    String name = reqName(params);
    ServiceDescriptor sd = services.remove(name);
    if (sd != null) {
      Long pid = sd.getRuntime().getPid();
      if (pid != null) {
        processManager.stop(pid);
      }
      logSubs.entrySet().removeIf(entry -> entry.getValue().getService().equals(name));
    }
    persistRuntime();
    emitServicesChanged();
    return listServices();
  }

  private JsonNode scanRoots() {
    List<ServiceDefinition> found = new ArrayList<>();
    for (String r : workspace.getRoots()) {
      found.addAll(scanRoot(Path.of(r)));
    }

    Map<String, ServiceDefinition> byName = new HashMap<>();
    for (ServiceDefinition d : found)
      byName.put(d.getName(), d);


    workspace.setServices(byName.values().stream()
        .sorted(Comparator.comparing(ServiceDefinition::getName))
        .toList());
    persistWorkspace();

    loadAll();
    emitWorkspaceChanged();
    return listServices();
  }

  private List<ServiceDefinition> scanRoot(Path root) {
    List<ServiceDefinition> out = new ArrayList<>();
    if (!Files.isDirectory(root)) {
      return out;
    }

    int maxDepth = 6;
    try {
      Files.walkFileTree(root, java.util.Set.of(), maxDepth, new SimpleFileVisitor<>() {
        @Override
        public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
          String name = dir.getFileName() == null ? "" : dir.getFileName().toString();
          if (name.equals(".git") || name.equals("target") || name.equals("node_modules") || name.equals(".idea")) {
            return FileVisitResult.SKIP_SUBTREE;
          }
          if (workspace.getExcludeDirs().contains(name)) {
            return FileVisitResult.SKIP_SUBTREE;
          }
          return FileVisitResult.CONTINUE;
        }

        @Override
        public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
          if (!file.getFileName().toString().equals("pom.xml"))
            return FileVisitResult.CONTINUE;
          Path dir = file.getParent();
          if (dir == null)
            return FileVisitResult.CONTINUE;

          if (isLikelyAggregatorPom(file)) {
            return FileVisitResult.CONTINUE;
          }

          Path mvnw = dir.resolve("mvnw");
          boolean hasMvnw = Files.exists(mvnw);

          boolean isSpringBoot = isLikelySpringBootPom(file);

          if (!isSpringBoot && !hasMvnw) {
            return FileVisitResult.CONTINUE;
          }

          String serviceName = dir.getFileName().toString();
          ServiceDefinition def = new ServiceDefinition();
          def.setName(serviceName);
          def.setPath(dir.toAbsolutePath().normalize().toString());
          def.setLogFile(logsDir.resolve(serviceName + ".log").toString());
          def.setContainerIds(new ArrayList<>());

          int port = extractPortFromConfig(dir).orElse(18080 + (Math.abs(serviceName.hashCode()) % 120));

          Map<String, String> env = new java.util.HashMap<>();
          env.put("SERVER_PORT", String.valueOf(port));
          def.setEnv(env);

          if (hasMvnw) {
            def.setCommand(List.of("./mvnw", "-q", "-DskipTests",
                "-Dspring-boot.run.arguments=--server.port=" + port,
                "spring-boot:run"));
          } else {
            def.setCommand(List.of("mvn", "-q", "-DskipTests",
                "-Dspring-boot.run.arguments=--server.port=" + port,
                "spring-boot:run"));
          }
          out.add(def);
          return FileVisitResult.CONTINUE;
        }
      });
    } catch (Exception e) {
      e.printStackTrace();
    }
    return out;
  }

  private JsonNode listServices() {
    for (ServiceDescriptor sd : services.values()) {
      ServiceRuntime rt = sd.getRuntime();
      if (rt.getPid() != null) {
        boolean alive = processManager.isAlive(rt.getPid());
        if (!alive && rt.getStatus() == ServiceStatus.RUNNING) {
          rt.setStatus(ServiceStatus.STOPPED);
          rt.setPid(null);
          rt.setLastStopAt(Instant.now());
          emitServiceChanged(sd.getDefinition().getName());
        }
      } else if (rt.getStatus() == ServiceStatus.RUNNING) {
        rt.setStatus(ServiceStatus.STOPPED);
        emitServiceChanged(sd.getDefinition().getName());
      }
    }
    persistRuntime();

    return om.valueToTree(services.values().stream()
        .map(this::toView)
        .sorted(Comparator.comparing(ServiceView::name))
        .toList());
  }

  private ServiceDescriptor requireService(String name) {
    ServiceDescriptor sd = services.get(name);
    if (sd == null)
      throw new IllegalArgumentException("Serviço não encontrado: " + name);
    return sd;
  }

  private JsonNode startService(JsonNode params) {
    String name = reqName(params);
    ServiceDescriptor sd = requireService(name);
    ServiceRuntime rt = sd.getRuntime();

    if (rt.getPid() != null) {
      boolean alive = processManager.isAlive(rt.getPid());
      if (alive) {
        LogFileWriter.log("startService: Serviço " + name + " já está rodando (PID: " + rt.getPid() + ")");
        return om.valueToTree(toView(sd));
      } else {
        LogFileWriter.log("startService: PID " + rt.getPid() + " não está mais vivo, limpando");
        rt.setPid(null);
        rt.setStatus(ServiceStatus.STOPPED);
      }
    }

    LogFileWriter.log("startService: Iniciando serviço: " + name);
    LogFileWriter.log("startService: Path: " + sd.getDefinition().getPath());
    LogFileWriter.log("startService: Log: " + sd.getDefinition().getLogFile());

    emitLogStatus(name, "🚀 Iniciando serviço " + name + "...");

    try {
      long pid = processManager.start(sd.getDefinition());
      rt.setPid(pid);
      rt.setStatus(ServiceStatus.RUNNING);
      rt.setLastStartAt(Instant.now());
      rt.setLastError(null);

      LogFileWriter.log("startService: Processo iniciado com PID: " + pid);
      emitLogStatus(name, "✓ Processo iniciado com PID: " + pid);

      persistRuntime();
      emitServiceChanged(name);

      Thread.ofVirtual().name("check-alive-" + name).start(() -> {
        try {
          Thread.sleep(2000);
          boolean stillAlive = processManager.isAlive(pid);
          LogFileWriter.log("startService: Verificação após 2s - PID " + pid + " está vivo: " + stillAlive);

          if (!stillAlive) {
            rt.setStatus(ServiceStatus.ERROR);
            rt.setLastError("Processo terminou após iniciar. Verifique os logs para detalhes.");
            rt.setPid(null);
            LogFileWriter.log("startService: Processo " + pid + " terminou após 2 segundos");

            // Tenta ler as últimas linhas do log para mostrar o erro
            try {
              Path logFile = Path.of(sd.getDefinition().getLogFile());
              if (Files.exists(logFile)) {
                List<String> errorLines = java.nio.file.Files.readAllLines(logFile);
                if (!errorLines.isEmpty()) {
                  // Pega as últimas 10 linhas que podem conter o erro
                  int start = Math.max(0, errorLines.size() - 10);
                  List<String> lastErrorLines = errorLines.subList(start, errorLines.size());
                  String errorSummary = String.join("\n", lastErrorLines);
                  emitLogStatus(name, "❌ Processo terminou. Últimas linhas do log:\n" + errorSummary);
                } else {
                  emitLogStatus(name, "❌ Processo terminou imediatamente. Arquivo de log está vazio.");
                }
              } else {
                emitLogStatus(name, "❌ Processo terminou imediatamente. Arquivo de log não foi criado.");
              }
            } catch (Exception e) {
              emitLogStatus(name, "❌ Erro: Processo terminou após iniciar. Verifique os logs.");
            }

            persistRuntime();
            emitServiceChanged(name);
          } else {
            LogFileWriter.log("startService: Serviço " + name + " está rodando corretamente");
            emitLogStatus(name, "✓ Serviço " + name + " está rodando");
          }
        } catch (InterruptedException ignored) {
          Thread.currentThread().interrupt();
        }
      });

      return om.valueToTree(toView(sd));
    } catch (Exception e) {
      rt.setStatus(ServiceStatus.ERROR);
      rt.setLastError(e.getMessage());
      rt.setPid(null);
      LogFileWriter.log("startService: ERRO ao iniciar " + name + ": " + e.getMessage());
      e.printStackTrace();
      emitLogStatus(name, "❌ Erro ao iniciar: " + e.getMessage());
      persistRuntime();
      emitServiceChanged(name);
      throw new IllegalStateException("Falha ao iniciar serviço: " + name + " - " + e.getMessage(), e);
    }
  }

  private void emitLogStatus(String serviceName, String message) {
    for (var entry : logSubs.entrySet()) {
      LogSubscription sub = entry.getValue();
      if (sub.getService().equals(serviceName)) {
        ObjectNode payload = om.createObjectNode();
        payload.put("subId", entry.getKey());
        payload.put("service", serviceName);
        payload.put("line", message);
        emitEvent.accept("log", payload);
      }
    }
  }

  private JsonNode stopService(JsonNode params) {
    String name = reqName(params);
    ServiceDescriptor sd = requireService(name);
    ServiceRuntime rt = sd.getRuntime();
    Long pid = rt.getPid();
    StopResult r;
    if (pid == null) {
      r = StopResult.noPid();
    } else {
      r = processManager.stop(pid);
    }
    if (r.isOk()) {
      rt.setPid(null);
      rt.setStatus(ServiceStatus.STOPPED);
      rt.setLastStopAt(Instant.now());
    } else {
      rt.setStatus(ServiceStatus.ERROR);
      rt.setLastError(r.getMessage());
    }
    persistRuntime();
    emitServiceChanged(name);
    return om.valueToTree(r);
  }

  private JsonNode restartService(JsonNode params) {
    String name = reqName(params);
    stopService(obj("name", name));
    return startService(obj("name", name));
  }

  private JsonNode startAll() throws JsonProcessingException, IllegalArgumentException {
    List<ServiceView> out = new ArrayList<>();
    List<ServiceDescriptor> toStart = new ArrayList<>(services.values());

    for (ServiceDescriptor sd : toStart) {
      try {
        JsonNode started = startService(obj("name", sd.getDefinition().getName()));
        out.add(om.treeToValue(started, ServiceView.class));
      } catch (Exception e) {
        ServiceView errorView = toView(sd);
        out.add(errorView);
      }
    }
    return om.valueToTree(out);
  }

  private JsonNode stopAll() throws JsonProcessingException, IllegalArgumentException {
    LogFileWriter.log("stopAll: Iniciando parada de todos os serviços");
    List<StopResult> out = new ArrayList<>();
    List<ServiceDescriptor> toStop = new ArrayList<>(services.values());

    LogFileWriter.log("stopAll: Total de serviços para parar: " + toStop.size());

    for (ServiceDescriptor sd : toStop) {
      try {
        String name = sd.getDefinition().getName();
        LogFileWriter.log("stopAll: Parando serviço: " + name);
        JsonNode stopped = stopService(obj("name", name));
        out.add(om.treeToValue(stopped, StopResult.class));
        LogFileWriter.log("stopAll: Serviço " + name + " parado com sucesso");
      } catch (Exception e) {
        String name = sd.getDefinition().getName();
        LogFileWriter.log("stopAll: ERRO ao parar " + name + ": " + e.getMessage());
        e.printStackTrace();
        StopResult errorResult = StopResult.failed(
            sd.getRuntime().getPid() != null ? sd.getRuntime().getPid() : 0,
            "Erro ao parar: " + e.getMessage());
        out.add(errorResult);
      }
    }

    LogFileWriter.log("stopAll: Concluído. Total de resultados: " + out.size());
    emitServicesChanged();

    return om.valueToTree(out);
  }

  private JsonNode subscribeLogs(JsonNode params) {
    String name = reqName(params);
    int tail = params != null && params.has("tail") ? params.get("tail").asInt(200) : 200;
    ServiceDescriptor sd = requireService(name);

    String subId = UUID.randomUUID().toString();
    Path logFile = Path.of(sd.getDefinition().getLogFile()).toAbsolutePath().normalize();

    LogFileWriter
        .log("subscribeLogs: Criando subscrição para " + name + " (subId: " + subId + ", logFile: " + logFile + ")");

    LogSubscription sub = new LogSubscription(subId, name, logFile, tail, shutdown, (line) -> {
      try {
        ObjectNode payload = om.createObjectNode();
        payload.put("subId", subId);
        payload.put("service", name);
        payload.put("line", line);
        LogFileWriter
            .log("subscribeLogs: Emitindo linha de log (subId: " + subId + ", tamanho: " + line.length() + " chars)");
        emitEvent.accept("log", payload);
      } catch (Exception e) {
        LogFileWriter.log("subscribeLogs: ERRO ao emitir linha de log: " + e.getMessage());
        e.printStackTrace();
      }
    });
    logSubs.put(subId, sub);

    ObjectNode initialPayload = om.createObjectNode();
    initialPayload.put("subId", subId);
    initialPayload.put("service", name);
    initialPayload.put("line", "📋 Conectando aos logs de " + name + "...");
    LogFileWriter.log("subscribeLogs: Enviando mensagem inicial de conexão");
    emitEvent.accept("log", initialPayload);

    sub.start();
    LogFileWriter.log("subscribeLogs: Subscrição iniciada para " + name);

    ObjectNode res = om.createObjectNode();
    res.put("subId", subId);
    return res;
  }

  private JsonNode unsubscribeLogs(JsonNode params) {
    String subId = params != null && params.hasNonNull("subId") ? params.get("subId").asText() : null;
    if (subId == null || subId.isBlank())
      throw new IllegalArgumentException("params.subId é obrigatório");
    LogSubscription sub = logSubs.remove(subId);
    if (sub != null)
      sub.stop();
    return om.createObjectNode().put("ok", true);
  }

  private String reqName(JsonNode params) {
    String name = params != null && params.hasNonNull("name") ? params.get("name").asText() : null;
    if (name == null || name.isBlank())
      throw new IllegalArgumentException("params.name é obrigatório");
    return name;
  }

  private ObjectNode obj(String k, String v) {
    ObjectNode n = om.createObjectNode();
    n.put(k, v);
    return n;
  }

  private void emitWorkspaceChanged() {
    emitEvent.accept("workspace", om.valueToTree(workspace));
  }

  private void emitServiceChanged(String name) {
    ServiceDescriptor sd = services.get(name);
    if (sd == null)
      return;
    emitEvent.accept("service", om.valueToTree(toView(sd)));
  }

  private void emitServicesChanged() {
    List<ServiceView> views = services.values().stream()
        .sorted(Comparator.comparing(sd -> sd.getDefinition().getName()))
        .map(this::toView)
        .toList();
    emitEvent.accept("services", om.valueToTree(views));
  }

  private ServiceView toView(ServiceDescriptor sd) {
    var def = sd.getDefinition();
    var rt = sd.getRuntime();
    return new ServiceView(
        def.getName(),
        def.getPath(),
        def.getCommand(),
        def.getLogFile(),
        def.getEnv(),
        def.getJavaHome(),
        def.getContainerIds(),
        rt.getPid(),
        rt.getStatus(),
        rt.getLastStartAt(),
        rt.getLastStopAt(),
        rt.getLastError());
  }

  private boolean isLikelyAggregatorPom(Path pom) {
    String txt = readSmallText(pom, 64_000);
    if (txt == null)
      return false;
    boolean packagingPom = txt.contains("<packaging>pom</packaging>");
    boolean hasModules = txt.contains("<modules>") && txt.contains("<module>");
    return packagingPom && hasModules;
  }

  private boolean isLikelySpringBootPom(Path pom) {
    String txt = readSmallText(pom, 96_000);
    if (txt == null)
      return false;
    String lower = txt.toLowerCase();
    return lower.contains("spring-boot")
        || lower.contains("springframework.boot")
        || lower.contains("spring-boot-starter")
        || lower.contains("spring-boot-parent")
        || (lower.contains("<parent>") && lower.contains("spring-boot"))
        || lower.contains("org.springframework.boot");
  }

  private String readSmallText(Path file, int maxBytes) {
    try {
      if (!Files.exists(file))
        return null;
      long size = Files.size(file);
      int read = (int) Math.min(size, maxBytes);
      byte[] buf = new byte[read];
      try (BufferedInputStream in = new BufferedInputStream(Files.newInputStream(file))) {
        int n = in.read(buf);
        if (n <= 0)
          return null;
        return new String(buf, 0, n, java.nio.charset.StandardCharsets.UTF_8);
      }
    } catch (Exception e) {
      return null;
    }
  }

  private Optional<Integer> extractPortFromConfig(Path serviceDir) {
    Path[] propsFiles = {
      serviceDir.resolve("src/main/resources/application.properties"),
      serviceDir.resolve("src/main/resources/application-local.properties"),
      serviceDir.resolve("application.properties"),
      serviceDir.resolve("application-local.properties")
    };
    
    Path[] ymlFiles = {
      serviceDir.resolve("src/main/resources/application.yml"),
      serviceDir.resolve("src/main/resources/application.yaml"),
      serviceDir.resolve("src/main/resources/application-local.yml"),
      serviceDir.resolve("src/main/resources/application-local.yaml"),
      serviceDir.resolve("application.yml"),
      serviceDir.resolve("application.yaml")
    };

    for (Path propsFile : propsFiles) {
      if (Files.exists(propsFile)) {
        String content = readSmallText(propsFile, 8192);
        if (content != null) {
          for (String line : content.split("\n")) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            if (line.startsWith("server.port") || line.startsWith("SERVER_PORT")) {
              String[] parts = line.split("=");
              if (parts.length >= 2) {
                try {
                  String portStr = parts[1].trim().split("#")[0].trim();
                  return Optional.of(Integer.parseInt(portStr));
                } catch (NumberFormatException e) {
                }
              }
            }
          }
        }
      }
    }

    for (Path ymlFile : ymlFiles) {
      if (Files.exists(ymlFile)) {
        String content = readSmallText(ymlFile, 8192);
        if (content != null) {
          String[] lines = content.split("\n");
          boolean inServerSection = false;
          int serverIndent = -1;
          for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
            
            if (trimmed.equals("---")) {
              inServerSection = false;
              serverIndent = -1;
              continue;
            }
            
            int indent = 0;
            for (int i = 0; i < line.length() && (line.charAt(i) == ' ' || line.charAt(i) == '\t'); i++) {
              indent++;
            }
            
            if (trimmed.startsWith("server:")) {
              inServerSection = true;
              serverIndent = indent;
              continue;
            }
            
            if (inServerSection) {
              if (indent <= serverIndent && !trimmed.startsWith("-") && !line.trim().isEmpty()) {
                inServerSection = false;
                continue;
              }
              
              if (trimmed.startsWith("port:") || trimmed.startsWith("port ")) {
                String portStr = trimmed.replaceFirst("^port:?", "").trim().split("#")[0].trim();
                if (portStr.startsWith("\"") && portStr.endsWith("\"")) {
                  portStr = portStr.substring(1, portStr.length() - 1);
                } else if (portStr.startsWith("'") && portStr.endsWith("'")) {
                  portStr = portStr.substring(1, portStr.length() - 1);
                }
                try {
                  return Optional.of(Integer.parseInt(portStr));
                } catch (NumberFormatException e) {
                }
              }
            }
          }
        }
      }
    }

    return Optional.empty();
  }

  private <T> Optional<T> readJson(Path file, Class<T> type) {
    try {
      if (!Files.exists(file))
        return Optional.empty();
      byte[] bytes = Files.readAllBytes(file);
      if (bytes.length == 0)
        return Optional.empty();
      return Optional.of(om.readValue(bytes, type));
    } catch (Exception e) {
      try {
        Files.move(file, file.resolveSibling(file.getFileName() + ".bak-" + System.currentTimeMillis()));
      } catch (Exception ignored) {
      }
      return Optional.empty();
    }
  }

  private <T> Optional<T> readJson(Path file, TypeReference<T> type) {
    try {
      if (!Files.exists(file))
        return Optional.empty();
      byte[] bytes = Files.readAllBytes(file);
      if (bytes.length == 0)
        return Optional.empty();
      return Optional.of(om.readValue(bytes, type));
    } catch (Exception e) {
      try {
        Files.move(file, file.resolveSibling(file.getFileName() + ".bak-" + System.currentTimeMillis()));
      } catch (Exception ignored) {
      }
      return Optional.empty();
    }
  }

  private void writeJson(Path file, Object value) {
    try {
      Files.createDirectories(file.getParent());
      byte[] bytes = om.writerWithDefaultPrettyPrinter().writeValueAsBytes(value);
      Files.write(file, bytes);
    } catch (Exception e) {
      throw new IllegalStateException("Falha ao salvar: " + file, e);
    }
  }


  private JsonNode createContainer(JsonNode params) {
    String name = params != null && params.hasNonNull("name") ? params.get("name").asText() : null;
    if (name == null || name.isBlank())
      throw new IllegalArgumentException("params.name é obrigatório");

    String description = params != null && params.hasNonNull("description") ? params.get("description").asText() : "";
    String id = UUID.randomUUID().toString();

    Container container = new Container(id, name, description);
    workspace.getContainers().put(id, container);
    persistWorkspace();
    emitWorkspaceChanged();

    return om.valueToTree(container);
  }

  private JsonNode updateContainer(JsonNode params) {
    String id = params != null && params.hasNonNull("id") ? params.get("id").asText() : null;
    if (id == null || id.isBlank())
      throw new IllegalArgumentException("params.id é obrigatório");

    Container container = workspace.getContainers().get(id);
    if (container == null)
      throw new IllegalArgumentException("Container não encontrado: " + id);

    if (params.hasNonNull("name")) {
      container.setName(params.get("name").asText());
    }
    if (params.hasNonNull("description")) {
      container.setDescription(params.get("description").asText());
    }

    persistWorkspace();
    emitWorkspaceChanged();

    return om.valueToTree(container);
  }

  private JsonNode deleteContainer(JsonNode params) {
    String id = params != null && params.hasNonNull("id") ? params.get("id").asText() : null;
    if (id == null || id.isBlank())
      throw new IllegalArgumentException("params.id é obrigatório");

    Container removed = workspace.getContainers().remove(id);
    if (removed == null)
      throw new IllegalArgumentException("Container não encontrado: " + id);

    for (ServiceDefinition def : workspace.getServices()) {
      if (def.getContainerIds() != null) {
        def.getContainerIds().remove(id);
      }
    }

    persistWorkspace();
    emitWorkspaceChanged();

    return om.valueToTree(removed);
  }

  private JsonNode listContainers() {
    return om.valueToTree(workspace.getContainers().values());
  }

  private JsonNode addServiceToContainer(JsonNode params) {
    String serviceName = reqName(params);
    String containerId = params != null && params.hasNonNull("containerId") ? params.get("containerId").asText() : null;
    if (containerId == null || containerId.isBlank())
      throw new IllegalArgumentException("params.containerId é obrigatório");

    if (!workspace.getContainers().containsKey(containerId))
      throw new IllegalArgumentException("Container não encontrado: " + containerId);

    ServiceDefinition def = workspace.getServices().stream()
        .filter(s -> s.getName().equals(serviceName))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Serviço não encontrado: " + serviceName));

    if (def.getContainerIds() == null) {
      def.setContainerIds(new ArrayList<>());
    }
    if (!def.getContainerIds().contains(containerId)) {
      def.getContainerIds().add(containerId);
    }

    persistWorkspace();
    emitWorkspaceChanged();

    return listServices();
  }

  private JsonNode removeServiceFromContainer(JsonNode params) {
    String serviceName = reqName(params);
    String containerId = params != null && params.hasNonNull("containerId") ? params.get("containerId").asText() : null;
    if (containerId == null || containerId.isBlank())
      throw new IllegalArgumentException("params.containerId é obrigatório");

    ServiceDefinition def = workspace.getServices().stream()
        .filter(s -> s.getName().equals(serviceName))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Serviço não encontrado: " + serviceName));

    if (def.getContainerIds() != null) {
      def.getContainerIds().remove(containerId);
    }

    persistWorkspace();
    emitWorkspaceChanged();

    return listServices();
  }

  private JsonNode getServicesByContainer(JsonNode params) {
    String containerId = params != null && params.hasNonNull("containerId") ? params.get("containerId").asText() : null;
    if (containerId == null || containerId.isBlank())
      throw new IllegalArgumentException("params.containerId é obrigatório");

    List<ServiceView> result = services.values().stream()
        .filter(sd -> {
          ServiceDefinition def = sd.getDefinition();
          return def.getContainerIds() != null && def.getContainerIds().contains(containerId);
        })
        .map(this::toView)
        .sorted(Comparator.comparing(ServiceView::name))
        .toList();

    return om.valueToTree(result);
  }

  private JsonNode startContainer(JsonNode params) {
    String containerId = params != null && params.hasNonNull("containerId") ? params.get("containerId").asText() : null;
    if (containerId == null || containerId.isBlank())
      throw new IllegalArgumentException("params.containerId é obrigatório");

    List<ServiceView> out = new ArrayList<>();
    List<ServiceDescriptor> toStart = services.values().stream()
        .filter(sd -> {
          ServiceDefinition def = sd.getDefinition();
          return def.getContainerIds() != null && def.getContainerIds().contains(containerId);
        })
        .toList();

    for (ServiceDescriptor sd : toStart) {
      try {
        JsonNode started = startService(obj("name", sd.getDefinition().getName()));
        out.add(om.treeToValue(started, ServiceView.class));
      } catch (Exception e) {
        ServiceView errorView = toView(sd);
        out.add(errorView);
      }
    }

    return om.valueToTree(out);
  }

  private JsonNode stopContainer(JsonNode params) {
    String containerId = params != null && params.hasNonNull("containerId") ? params.get("containerId").asText() : null;
    if (containerId == null || containerId.isBlank())
      throw new IllegalArgumentException("params.containerId é obrigatório");

    List<StopResult> out = new ArrayList<>();
    List<ServiceDescriptor> toStop = services.values().stream()
        .filter(sd -> {
          ServiceDefinition def = sd.getDefinition();
          return def.getContainerIds() != null && def.getContainerIds().contains(containerId);
        })
        .toList();

    LogFileWriter.log("stopContainer: Parando " + toStop.size() + " serviços do container " + containerId);

    for (ServiceDescriptor sd : toStop) {
      try {
        JsonNode stopped = stopService(obj("name", sd.getDefinition().getName()));
        out.add(om.treeToValue(stopped, StopResult.class));
      } catch (Exception e) {
        StopResult errorResult = StopResult.failed(
            sd.getRuntime().getPid() != null ? sd.getRuntime().getPid() : 0,
            "Erro ao parar: " + e.getMessage());
        out.add(errorResult);
      }
    }

    emitServicesChanged();
    return om.valueToTree(out);
  }


  private JsonNode openServiceFolder(JsonNode params) {
    String serviceName = reqName(params);
    ServiceDescriptor sd = requireService(serviceName);
    Path servicePath = Path.of(sd.getDefinition().getPath()).toAbsolutePath().normalize();

    try {
      String os = System.getProperty("os.name").toLowerCase();
      ProcessBuilder pb;

      if (os.contains("win")) {
        pb = new ProcessBuilder("explorer", servicePath.toString());
      } else if (os.contains("mac")) {
        pb = new ProcessBuilder("open", servicePath.toString());
      } else {
        pb = new ProcessBuilder("xdg-open", servicePath.toString());
      }

      pb.start();
      return om.getNodeFactory().objectNode().put("ok", true).put("message", "Pasta aberta");
    } catch (Exception e) {
      throw new IllegalStateException("Erro ao abrir pasta: " + e.getMessage(), e);
    }
  }

  private JsonNode openServiceTerminal(JsonNode params) {
    String serviceName = reqName(params);
    ServiceDescriptor sd = requireService(serviceName);
    Path servicePath = Path.of(sd.getDefinition().getPath()).toAbsolutePath().normalize();

    try {
      String os = System.getProperty("os.name").toLowerCase();
      ProcessBuilder pb;

      if (os.contains("win")) {
        pb = new ProcessBuilder("cmd", "/c", "start", "cmd", "/k", "cd", "/d", servicePath.toString());
      } else if (os.contains("mac")) {
        pb = null;
        try {
          Process test = new ProcessBuilder("which", "warp").start();
          if (test.waitFor() == 0) {
            pb = new ProcessBuilder("warp", "terminal", "--directory", servicePath.toString());
          }
        } catch (Exception ignored) {
        }
        if (pb == null) {
          String script = "tell application \"Terminal\"\n"
              + "  activate\n"
              + "  do script \"cd '" + servicePath.toString().replace("'", "\\'") + "'\"\n"
              + "end tell";
          pb = new ProcessBuilder("osascript", "-e", script);
        }
      } else {
        String[] terminals = { "gnome-terminal", "konsole", "xterm", "terminator" };
        pb = null;
        for (String term : terminals) {
          try {
            Process test = new ProcessBuilder("which", term).start();
            if (test.waitFor() == 0) {
              if (term.equals("gnome-terminal")) {
                pb = new ProcessBuilder(term, "--working-directory", servicePath.toString());
              } else if (term.equals("konsole")) {
                pb = new ProcessBuilder(term, "--workdir", servicePath.toString());
              } else {
                pb = new ProcessBuilder(term, "-e", "bash", "-c", "cd '" + servicePath + "' && exec bash");
              }
              break;
            }
          } catch (Exception ignored) {
          }
        }
        if (pb == null) {
          throw new IllegalStateException(
              "Nenhum terminal encontrado. Tente instalar gnome-terminal, konsole ou xterm");
        }
      }

      pb.start();
      return om.getNodeFactory().objectNode().put("ok", true).put("message", "Terminal aberto");
    } catch (Exception e) {
      throw new IllegalStateException("Erro ao abrir terminal: " + e.getMessage(), e);
    }
  }

  private JsonNode openServiceInEditor(JsonNode params) {
    String serviceName = reqName(params);
    ServiceDescriptor sd = requireService(serviceName);
    Path servicePath = Path.of(sd.getDefinition().getPath()).toAbsolutePath().normalize();

    try {
      String os = System.getProperty("os.name").toLowerCase();
      ProcessBuilder pb = null;

      String[] editors = { "cursor", "code" };

      for (String editor : editors) {
        try {
          Process test;
          if (os.contains("win")) {
            test = new ProcessBuilder("where", editor).start();
          } else {
            test = new ProcessBuilder("which", editor).start();
          }
          if (test.waitFor() == 0) {
            pb = new ProcessBuilder(editor, servicePath.toString());
            break;
          }
        } catch (Exception ignored) {
        }
      }

      if (pb == null) {
        if (os.contains("win")) {
          pb = new ProcessBuilder("code", servicePath.toString());
        } else if (os.contains("mac")) {
          pb = new ProcessBuilder("open", "-a", "Cursor", servicePath.toString());
          try {
            pb.start();
            return om.getNodeFactory().objectNode().put("ok", true).put("message", "Editor aberto");
          } catch (Exception e) {
            pb = new ProcessBuilder("open", "-a", "Visual Studio Code", servicePath.toString());
          }
        } else {
          throw new IllegalStateException("Nenhum editor encontrado. Instale Cursor ou VSCode e adicione ao PATH");
        }
      }

      pb.start();
      return om.getNodeFactory().objectNode().put("ok", true).put("message", "Editor aberto");
    } catch (Exception e) {
      throw new IllegalStateException("Erro ao abrir editor: " + e.getMessage(), e);
    }
  }

  @FunctionalInterface
  public interface TriEventEmitter {
    void emit(ObjectMapper om, String event, JsonNode payload);
  }
}
