package dev.safra.orchestrator.core.runtime;

import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.safra.orchestrator.model.ServiceDescriptor;
import dev.safra.orchestrator.process.JavaVersionDetector;
import dev.safra.orchestrator.process.ProcessManager;

public class CoreRuntime {
  private final ObjectMapper om;
  private final BiConsumer<String, JsonNode> emitEvent;
  private final AtomicBoolean shutdown = new AtomicBoolean(false);
  private final Map<String, ServiceDescriptor> services = new ConcurrentHashMap<>();

  private final WorkspaceManager workspaceManager;
  private final ServiceManager serviceManager;
  private final ContainerManager containerManager;
  private final LogManager logManager;
  private final ExternalToolLauncher launcher;
  private final ProcessManager processManager;

  public CoreRuntime(Path stateDir, ObjectMapper om, TriEventEmitter eventEmitter) {
    this.om = om;
    this.emitEvent = (ev, payload) -> eventEmitter.emit(om, ev, payload);

    StateStore store = new StateStore(om);
    PortExtractor portExtractor = new PortExtractor(store);
    this.processManager = new ProcessManager(Duration.ofSeconds(8), Duration.ofSeconds(3));

    this.logManager = new LogManager(om, emitEvent, shutdown);
    this.workspaceManager = new WorkspaceManager(stateDir, om, store, portExtractor, emitEvent, services);
    this.launcher = new ExternalToolLauncher();

    LogFileWriter.initialize(stateDir);
    workspaceManager.loadAll();

    this.serviceManager = new ServiceManager(om, processManager, logManager, emitEvent, services,
        () -> workspaceManager.persistRuntime(), () -> workspaceManager.persistWorkspace(),
        () -> workspaceManager.getWorkspace());
    this.containerManager = new ContainerManager(om, () -> workspaceManager.getWorkspace(),
        () -> workspaceManager.persistWorkspace());

    startProcessMonitor();
  }

  public JsonNode handle(String method, JsonNode params) {
    if (method == null || method.isBlank())
      throw new IllegalArgumentException("method é obrigatório");

    return switch (method) {
      case "ping" -> om.getNodeFactory().textNode("pong");
      case "getWorkspace" -> om.valueToTree(workspaceManager.getWorkspace());
      case "setExcludeDirs" -> {
        List<String> ex = new ArrayList<>();
        if (params != null && params.has("excludeDirs") && params.get("excludeDirs").isArray()) {
          for (JsonNode n : params.get("excludeDirs"))
            ex.add(n.asText());
        }
        yield workspaceManager.setExcludeDirs(ex);
      }
      case "importRootAndScan" -> workspaceManager.importRootAndScan(
          params != null && params.hasNonNull("root") ? params.get("root").asText() : null);
      case "importRootsAndScan" -> {
        List<String> roots = new ArrayList<>();
        if (params != null && params.has("roots") && params.get("roots").isArray()) {
          for (JsonNode n : params.get("roots"))
            roots.add(n.asText());
        }
        yield workspaceManager.importRootsAndScan(roots);
      }
      case "removeRoot" -> workspaceManager.removeRoot(
          params != null && params.hasNonNull("root") ? params.get("root").asText() : null);
      case "scanRoots" -> workspaceManager.scanRoots();
      case "listServices" -> serviceManager.list();
      case "startService" -> serviceManager.start(reqName(params));
      case "stopService" -> serviceManager.stop(reqName(params));
      case "restartService" -> serviceManager.restart(reqName(params));
      case "startAll" -> serviceManager.startAll();
      case "stopAll" -> serviceManager.stopAll();
      case "removeService" -> serviceManager.remove(reqName(params));
      case "subscribeLogs" -> {
        String name = reqName(params);
        int tail = params != null && params.has("tail") ? params.get("tail").asInt(200) : 200;
        ServiceDescriptor sd = serviceManager.requireService(name);
        yield logManager.subscribe(name, sd.getDefinition().getLogFile(), tail);
      }
      case "unsubscribeLogs" -> {
        String subId = params != null && params.hasNonNull("subId") ? params.get("subId").asText() : null;
        if (subId == null || subId.isBlank())
          throw new IllegalArgumentException("params.subId é obrigatório");
        yield logManager.unsubscribe(subId);
      }
      case "createContainer" -> containerManager.create(
          params != null && params.hasNonNull("name") ? params.get("name").asText() : null,
          params != null && params.hasNonNull("description") ? params.get("description").asText() : "");
      case "updateContainer" -> containerManager.update(
          params != null && params.hasNonNull("id") ? params.get("id").asText() : null,
          params != null && params.hasNonNull("name") ? params.get("name").asText() : null,
          params != null && params.hasNonNull("description") ? params.get("description").asText() : null);
      case "deleteContainer" -> {
        String id = params != null && params.hasNonNull("id") ? params.get("id").asText() : null;
        JsonNode result = containerManager.delete(id);
        emitEvent.accept("workspace", om.valueToTree(workspaceManager.getWorkspace()));
        yield result;
      }
      case "listContainers" -> containerManager.list();
      case "addServiceToContainer" -> {
        containerManager.addService(reqName(params),
            params != null && params.hasNonNull("containerId") ? params.get("containerId").asText() : null);
        emitEvent.accept("workspace", om.valueToTree(workspaceManager.getWorkspace()));
        yield serviceManager.list();
      }
      case "removeServiceFromContainer" -> {
        containerManager.removeService(reqName(params),
            params != null && params.hasNonNull("containerId") ? params.get("containerId").asText() : null);
        emitEvent.accept("workspace", om.valueToTree(workspaceManager.getWorkspace()));
        yield serviceManager.list();
      }
      case "getServicesByContainer" -> serviceManager.getByContainer(
          params != null && params.hasNonNull("containerId") ? params.get("containerId").asText() : null);
      case "startContainer" -> serviceManager.startByContainer(
          params != null && params.hasNonNull("containerId") ? params.get("containerId").asText() : null);
      case "stopContainer" -> serviceManager.stopByContainer(
          params != null && params.hasNonNull("containerId") ? params.get("containerId").asText() : null);
      case "openServiceFolder" -> {
        ServiceDescriptor sd = serviceManager.requireService(reqName(params));
        launcher.openFolder(Path.of(sd.getDefinition().getPath()).toAbsolutePath().normalize());
        yield om.getNodeFactory().objectNode().put("ok", true).put("message", "Pasta aberta");
      }
      case "openServiceTerminal" -> {
        ServiceDescriptor sd = serviceManager.requireService(reqName(params));
        launcher.openTerminal(Path.of(sd.getDefinition().getPath()).toAbsolutePath().normalize());
        yield om.getNodeFactory().objectNode().put("ok", true).put("message", "Terminal aberto");
      }
      case "openServiceInEditor" -> {
        ServiceDescriptor sd = serviceManager.requireService(reqName(params));
        launcher.openEditor(Path.of(sd.getDefinition().getPath()).toAbsolutePath().normalize());
        yield om.getNodeFactory().objectNode().put("ok", true).put("message", "Editor aberto");
      }
      case "listJdks" -> {
        List<JavaVersionDetector.JdkInfo> jdks = processManager.getJavaDetector().detectAll();
        yield om.valueToTree(jdks);
      }
      case "setServiceJavaVersion" -> {
        String name = reqName(params);
        String version = params != null && params.hasNonNull("javaVersion") ? params.get("javaVersion").asText() : null;
        ServiceDescriptor sd = serviceManager.requireService(name);
        sd.getDefinition().setJavaVersion(version);
        sd.getDefinition().setJavaHome(null);
        if (version != null && !version.isBlank()) {
          String resolved = processManager.getJavaDetector().resolveJavaHome(version);
          sd.getDefinition().setJavaHome(resolved);
        }
        workspaceManager.persistWorkspace();
        workspaceManager.persistRuntime();
        emitEvent.accept("service", om.valueToTree(serviceManager.toView(sd)));
        yield serviceManager.list();
      }
      default -> throw new IllegalArgumentException("Método desconhecido: " + method);
    };
  }

  public void shutdown() {
    shutdown.set(true);
    logManager.shutdownAll();
    LogFileWriter.close();
  }

  private void startProcessMonitor() {
    Thread t = new Thread(() -> {
      while (!shutdown.get()) {
        try {
          Thread.sleep(5000);
          serviceManager.refreshStatuses();
          workspaceManager.persistRuntime();
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          break;
        } catch (Exception ignored) {
        }
      }
    }, "process-monitor");
    t.setDaemon(true);
    t.start();
  }

  private String reqName(JsonNode params) {
    String name = params != null && params.hasNonNull("name") ? params.get("name").asText() : null;
    if (name == null || name.isBlank())
      throw new IllegalArgumentException("params.name é obrigatório");
    return name;
  }

  @FunctionalInterface
  public interface TriEventEmitter {
    void emit(ObjectMapper om, String event, JsonNode payload);
  }
}
