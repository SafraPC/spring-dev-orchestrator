package dev.safra.orchestrator.core.runtime;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.safra.orchestrator.model.ServiceDefinition;
import dev.safra.orchestrator.model.ServiceDescriptor;
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

  public ServiceManager(ObjectMapper om, ProcessManager processManager, LogManager logManager,
      BiConsumer<String, JsonNode> emitEvent, Map<String, ServiceDescriptor> services,
      Runnable persistRuntime) {
    this.om = om;
    this.processManager = processManager;
    this.logManager = logManager;
    this.emitEvent = emitEvent;
    this.services = services;
    this.persistRuntime = persistRuntime;
  }

  public JsonNode list() {
    refreshStatuses();
    persistRuntime.run();
    return om.valueToTree(services.values().stream()
        .map(this::toView)
        .sorted(Comparator.comparing(ServiceView::name))
        .toList());
  }

  public JsonNode start(String name) {
    ServiceDescriptor sd = requireService(name);
    ServiceRuntime rt = sd.getRuntime();

    if (rt.getPid() != null) {
      if (processManager.isAlive(rt.getPid())) {
        return om.valueToTree(toView(sd));
      }
      rt.setPid(null);
      rt.setStatus(ServiceStatus.STOPPED);
    }

    logManager.emitLogStatus(name, "Iniciando serviço " + name + "...");

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
      throw new IllegalStateException("Falha ao iniciar serviço: " + name + " - " + e.getMessage(), e);
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
      logManager.removeSubscriptionsFor(name);
    }
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
    return om.valueToTree(services.values().stream()
        .filter(sd -> hasContainer(sd, containerId))
        .map(this::toView)
        .sorted(Comparator.comparing(ServiceView::name))
        .toList());
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
    List<ServiceView> views = services.values().stream()
        .sorted(Comparator.comparing(sd -> sd.getDefinition().getName()))
        .map(this::toView)
        .toList();
    emitEvent.accept("services", om.valueToTree(views));
  }

  private void scheduleHealthCheck(String name, long pid, ServiceDescriptor sd) {
    Thread healthThread = new Thread(() -> {
      try {
        Thread.sleep(2000);
        if (!processManager.isAlive(pid)) {
          ServiceRuntime rt = sd.getRuntime();
          rt.setStatus(ServiceStatus.ERROR);
          rt.setLastError("Processo terminou após iniciar. Verifique os logs.");
          rt.setPid(null);

          try {
            Path logFile = Path.of(sd.getDefinition().getLogFile());
            if (Files.exists(logFile)) {
              List<String> allLines = Files.readAllLines(logFile);
              if (!allLines.isEmpty()) {
                int startIdx = Math.max(0, allLines.size() - 10);
                String errorSummary = String.join("\n", allLines.subList(startIdx, allLines.size()));
                logManager.emitLogStatus(name, "Processo terminou. Últimas linhas:\n" + errorSummary);
              }
            }
          } catch (Exception ignored) {
          }

          persistRuntime.run();
          emitServiceChanged(name);
        }
      } catch (InterruptedException ignored) {
        Thread.currentThread().interrupt();
      }
    }, "check-alive-" + name);
    healthThread.setDaemon(true);
    healthThread.start();
  }
}
