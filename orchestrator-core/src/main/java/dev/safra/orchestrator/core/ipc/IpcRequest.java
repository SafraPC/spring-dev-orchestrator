package dev.safra.orchestrator.core.ipc;

import com.fasterxml.jackson.databind.JsonNode;

public record IpcRequest(String id, String method, JsonNode params) {
}
