package dev.safra.orchestrator.core.ipc;

import com.fasterxml.jackson.databind.JsonNode;

public record IpcResponse(String id, boolean ok, JsonNode result, IpcError error) {

  public static IpcResponse ok(String id, JsonNode result) {
    return new IpcResponse(id, true, result, null);
  }

  public static IpcResponse err(String id, String code, String message) {
    return new IpcResponse(id, false, null, new IpcError(code, message));
  }
}
