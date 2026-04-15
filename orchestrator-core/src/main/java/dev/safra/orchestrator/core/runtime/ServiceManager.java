package dev.safra.orchestrator.core.runtime;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.function.Supplier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.safra.orchestrator.model.ServiceDefinition;
import dev.safra.orchestrator.model.ServiceDescriptor;
import dev.safra.orchestrator.model.ProjectType;
import dev.safra.orchestrator.model.ServiceRuntime;
import dev.safra.orchestrator.model.ServiceStatus;
import dev.safra.orchestrator.process.ProcessManager;
import dev.safra.orchestrator.process.StopResult;
public class ServiceManager {
  private final ObjectMapper om;
  private final ProcessManager processManager;
  private final LogManager logManager;
  private final BiConsumer<String, JsonNode> emitEvent;
  private final Map<String, ServiceDescriptor> services;
  private final Runnable persistRuntime;
  private final Runnable persistWorkspace;
  private final Supplier<Workspace> workspaceSupplier;

  public ServiceManager(ObjectMapper om, ProcessManager processManager, LogManager logManager,
      BiConsumer<String, JsonNode> emitEvent, Map<String, ServiceDescriptor> services,
      Runnable persistRuntime, Runnable persistWorkspace, Supplier<Workspace> workspaceSupplier) {
    this.om = om;
    this.processManager = processManager;
    this.logManager = logManager;
    this.emitEvent = emitEvent;
    this.services = services;
    this.persistRuntime = persistRuntime;
    this.persistWorkspace = persistWorkspace;
    this.workspaceSupplier = workspaceSupplier;
  }

  public JsonNode list() {
    return om.valueToTree(sortedViews(services.values().stream().map(this::toView).toList()));
  }

  public JsonNode start(String name) {
    ServiceDescriptor sd = requireService(name);
    ServiceRuntime rt = sd.getRuntime();
    ServiceDefinition def = sd.getDefinition();
    if (def.getProjectType() != null && def.getProjectType() != ProjectType.SPRING_BOOT
        && def.getAvailableScripts() != null && !def.getAvailableScripts().isEmpty()) {
      String selected = WorkspaceDefinitionSync.selectRuntimeJsScript(def.getSelectedScript(), def.getAvailableScripts());
      if (selected != null && (def.getSelectedScript() == null || !def.getSelectedScript().equals(selected) || def.getCommand() == null || def.getCommand().isEmpty())) {
        def.setSelectedScript(selected); def.setCommand(List.of("npm", "run", selected)); persistWorkspace.run();
      }
    }

    if (rt.getPid() != null) {
      if (processManager.isAlive(rt.getPid())) {
        return om.valueToTree(toView(sd));
      }
      rt.setPid(null);
      rt.setStatus(ServiceStatus.STOPPED);
    }

    logManager.emitLogStatus(name, "Iniciando servico " + name + "...");

    try {
      long pid = processManager.start(sd.getDefinition());
      rt.setPid(pid);
      rt.setStatus(ServiceStatus.RUNNING);
      rt.setLastStartAt(Instant.now());
      rt.setLastError(null);

      logManager.emitLogStatus(name, "Processo iniciado com PID: " + pid);
      persistRuntime.run();
      emitServiceChanged(name);

      scheduleHealthCheck(name, pid, sd);

      return om.valueToTree(toView(sd));
    } catch (Exception e) {
      rt.setStatus(ServiceStatus.ERROR);
      rt.setLastError(e.getMessage());
      rt.setPid(null);
      logManager.emitLogStatus(name, "Erro ao iniciar: " + e.getMessage());
      persistRuntime.run();
      emitServiceChanged(name);
      throw new IllegalStateException("Falha ao iniciar servico: " + name + " - " + e.getMessage(), e);
    }
  }

  public JsonNode stop(String name) {
    ServiceDescriptor sd = requireService(name);
    ServiceRuntime rt = sd.getRuntime();
    Long pid = rt.getPid();

    StopResult r = pid == null ? StopResult.noPid() : processManager.stop(pid);

    if (r.isOk()) {
      rt.setPid(null);
      rt.setStatus(ServiceStatus.STOPPED);
      rt.setLastStopAt(Instant.now());
    } else {
      rt.setStatus(ServiceStatus.ERROR);
      rt.setLastError(r.getMessage());
    }

    persistRuntime.run();
    emitServiceChanged(name);
    return om.valueToTree(r);
  }

  public JsonNode restart(String name) {
    stop(name);
    return start(name);
  }
  public JsonNode startAll() {
    List<ServiceView> out = new ArrayList<>();
    for (ServiceDescriptor sd : new ArrayList<>(services.values())) {
      try {
        JsonNode started = start(sd.getDefinition().getName());
        out.add(om.treeToValue(started, ServiceView.class));
      } catch (Exception e) {
        out.add(toView(sd));
      }
    }
    return om.valueToTree(out);
  }

  public JsonNode stopAll() {
    List<StopResult> out = new ArrayList<>();
    for (ServiceDescriptor sd : new ArrayList<>(services.values())) {
      try {
        JsonNode stopped = stop(sd.getDefinition().getName());
        out.add(om.treeToValue(stopped, StopResult.class));
      } catch (Exception e) {
        out.add(StopResult.failed(
            sd.getRuntime().getPid() != null ? sd.getRuntime().getPid() : 0,
            "Erro ao parar: " + e.getMessage()));
      }
    }
    emitServicesChanged();
    return om.valueToTree(out);
  }

  public JsonNode remove(String name) {
    ServiceDescriptor sd = services.remove(name);
    if (sd != null) {
      Long pid = sd.getRuntime().getPid();
      if (pid != null)
        processManager.stop(pid);
      if (sd.getDefinition().getContainerIds() != null)
        sd.getDefinition().getContainerIds().clear();
      logManager.removeSubscriptionsFor(name);
    }
    Workspace ws = workspaceSupplier.get();
    ws.getServices().removeIf(d -> d.getName().equals(name));
    ws.getRemovedServices().add(name);
    persistWorkspace.run();
    persistRuntime.run();
    emitServicesChanged();
    return list();
  }

  public JsonNode startByContainer(String containerId) {
    List<ServiceView> out = new ArrayList<>();
    List<ServiceDescriptor> toStart = services.values().stream()
        .filter(sd -> hasContainer(sd, containerId))
        .toList();

    for (ServiceDescriptor sd : toStart) {
      try {
        JsonNode started = start(sd.getDefinition().getName());
        out.add(om.treeToValue(started, ServiceView.class));
      } catch (Exception e) {
        out.add(toView(sd));
      }
    }
    return om.valueToTree(out);
  }

  public JsonNode stopByContainer(String containerId) {
    List<StopResult> out = new ArrayList<>();
    List<ServiceDescriptor> toStop = services.values().stream()
        .filter(sd -> hasContainer(sd, containerId))
        .toList();

    for (ServiceDescriptor sd : toStop) {
      try {
        JsonNode stopped = stop(sd.getDefinition().getName());
        out.add(om.treeToValue(stopped, StopResult.class));
      } catch (Exception e) {
        out.add(StopResult.failed(
            sd.getRuntime().getPid() != null ? sd.getRuntime().getPid() : 0,
            "Erro ao parar: " + e.getMessage()));
      }
    }
    emitServicesChanged();
    return om.valueToTree(out);
  }

  public JsonNode getByContainer(String containerId) {
    return om.valueToTree(sortedViews(services.values().stream()
        .filter(sd -> hasContainer(sd, containerId))
        .map(this::toView)
        .toList()));
  }
  public ServiceDescriptor requireService(String name) {
    ServiceDescriptor sd = services.get(name);
    if (sd == null)
      throw new IllegalArgumentException("Serviço não encontrado: " + name);
    return sd;
  }

  public void refreshStatuses() {
    for (ServiceDescriptor sd : services.values()) {
      ServiceRuntime rt = sd.getRuntime();
      if (rt.getPid() != null) {
        if (!processManager.isAlive(rt.getPid()) && rt.getStatus() == ServiceStatus.RUNNING) {
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
  }

  public ServiceView toView(ServiceDescriptor sd) {
    var def = sd.getDefinition();
    var rt = sd.getRuntime();
    return new ServiceView(
        def.getName(), def.getPath(), def.getCommand(), def.getLogFile(),
        def.getEnv(), def.getJavaHome(), def.getJavaVersion(), def.getContainerIds(),
        def.getProjectType(), def.getAvailableScripts(), def.getSelectedScript(),
        rt.getPid(), rt.getStatus(), rt.getLastStartAt(), rt.getLastStopAt(), rt.getLastError());
  }

  private boolean hasContainer(ServiceDescriptor sd, String containerId) {
    ServiceDefinition def = sd.getDefinition();
    return def.getContainerIds() != null && def.getContainerIds().contains(containerId);
  }

  private void emitServiceChanged(String name) {
    ServiceDescriptor sd = services.get(name);
    if (sd != null)
      emitEvent.accept("service", om.valueToTree(toView(sd)));
  }

  private void emitServicesChanged() {
    List<ServiceView> views = sortedViews(services.values().stream().map(this::toView).toList());
    emitEvent.accept("services", om.valueToTree(views));
  }

  private List<ServiceView> sortedViews(List<ServiceView> views) {
    List<String> order = workspaceSupplier.get().getServiceOrder();
    if (order == null || order.isEmpty()) return views;
    return views.stream()
        .sorted(Comparator.comparingInt(v -> {
          int idx = order.indexOf(v.name());
          return idx >= 0 ? idx : Integer.MAX_VALUE;
        }))
        .toList();
  }

  private void scheduleHealthCheck(String name, long pid, ServiceDescriptor sd) {
    Thread t = new Thread(() -> {
      try {
        Thread.sleep(2000);
        if (processManager.isAlive(pid)) return;
        ServiceRuntime rt = sd.getRuntime();
        rt.setStatus(ServiceStatus.ERROR);
        rt.setLastError("Processo terminou após iniciar. Verifique os logs.");
        rt.setPid(null);
        try {
          Path logFile = Path.of(sd.getDefinition().getLogFile());
          if (Files.exists(logFile)) {
            List<String> lines = Files.readAllLines(logFile);
            if (!lines.isEmpty()) {
              String tail = String.join("\n", lines.subList(Math.max(0, lines.size() - 10), lines.size()));
              logManager.emitLogStatus(name, "Processo terminou. Últimas linhas:\n" + tail);
            }
          }
        } catch (Exception ignored) {}
        persistRuntime.run();
        emitServiceChanged(name);
      } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
    }, "check-alive-" + name);
    t.setDaemon(true);
    t.start();
  }
}
