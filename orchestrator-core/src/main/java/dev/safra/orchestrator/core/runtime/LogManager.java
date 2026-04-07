package dev.safra.orchestrator.core.runtime;

import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

public class LogManager {
  private final ObjectMapper om;
  private final BiConsumer<String, JsonNode> emitEvent;
  private final AtomicBoolean shutdown;
  private final Map<String, LogSubscription> subs = new ConcurrentHashMap<>();

  public LogManager(ObjectMapper om, BiConsumer<String, JsonNode> emitEvent, AtomicBoolean shutdown) {
    this.om = om;
    this.emitEvent = emitEvent;
    this.shutdown = shutdown;
  }

  public JsonNode subscribe(String name, String logFilePath, int tail) {
    String subId = UUID.randomUUID().toString();
    Path logFile = Path.of(logFilePath).toAbsolutePath().normalize();

    LogSubscription sub = new LogSubscription(subId, name, logFile, tail, shutdown, line -> {
      ObjectNode payload = om.createObjectNode();
      payload.put("subId", subId);
      payload.put("service", name);
      payload.put("line", line);
      emitEvent.accept("log", payload);
    });
    subs.put(subId, sub);

    ObjectNode initialPayload = om.createObjectNode();
    initialPayload.put("subId", subId);
    initialPayload.put("service", name);
    initialPayload.put("line", "Conectando aos logs de " + name + "...");
    emitEvent.accept("log", initialPayload);

    sub.start();

    ObjectNode res = om.createObjectNode();
    res.put("subId", subId);
    return res;
  }

  public JsonNode unsubscribe(String subId) {
    LogSubscription sub = subs.remove(subId);
    if (sub != null)
      sub.stop();
    return om.createObjectNode().put("ok", true);
  }

  public void emitLogStatus(String serviceName, String message) {
    for (var entry : subs.entrySet()) {
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

  public void removeSubscriptionsFor(String serviceName) {
    subs.entrySet().removeIf(entry -> {
      if (entry.getValue().getService().equals(serviceName)) {
        entry.getValue().stop();
        return true;
      }
      return false;
    });
  }

  public void shutdownAll() {
    for (LogSubscription s : subs.values()) {
      s.stop();
    }
  }
}
