package dev.safra.orchestrator.core;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.safra.orchestrator.core.ipc.IpcEvent;
import dev.safra.orchestrator.core.ipc.IpcRequest;
import dev.safra.orchestrator.core.ipc.IpcResponse;
import dev.safra.orchestrator.core.runtime.CoreRuntime;

public class Main {
  public static void main(String[] args) throws Exception {
    Map<String, String> a = Args.parse(args);
    var stateDir = Args.stateDir(a);
    ObjectMapper om = Json.mapper();

    CoreRuntime runtime = new CoreRuntime(stateDir, om, Main::emitEvent);

    try (BufferedReader br = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
      String line;
      while ((line = br.readLine()) != null) {
        line = line.trim();
        if (line.isEmpty())
          continue;

        IpcRequest req;
        try {
          req = om.readValue(line, IpcRequest.class);
        } catch (Exception e) {
          writeLine(
              om.writeValueAsString(IpcResponse.err("unknown", "PARSE_ERROR", "Malformed request: " + e.getMessage())));
          continue;
        }

        IpcResponse resp;
        try {
          JsonNode result = runtime.handle(req.method(), req.params());
          resp = IpcResponse.ok(req.id(), result);
        } catch (IllegalArgumentException e) {
          resp = IpcResponse.err(req.id(), "BAD_REQUEST", e.getMessage());
        } catch (Exception e) {
          resp = IpcResponse.err(req.id(), "INTERNAL_ERROR", e.getMessage() == null ? e.toString() : e.getMessage());
        }

        writeLine(om.writeValueAsString(resp));
      }
    } finally {
      runtime.shutdown();
    }
  }

  private static void emitEvent(ObjectMapper om, String event, JsonNode payload) {
    try {
      IpcEvent ev = new IpcEvent(event, payload);
      writeLine(om.writeValueAsString(ev));
    } catch (Exception ignored) {
    }
  }

  private static synchronized void writeLine(String s) {
    System.out.println(s);
    System.out.flush();
  }
}
