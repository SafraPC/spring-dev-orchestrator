package dev.safra.orchestrator.core.runtime;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import dev.safra.orchestrator.model.ProjectType;
import dev.safra.orchestrator.model.ServiceDefinition;

public final class WorkspaceDefinitionSync {
  private static final Set<String> NON_RUNTIME_JS_SCRIPTS = Set.of(
      "build", "test", "lint", "typecheck", "check", "format", "preview");

  private WorkspaceDefinitionSync() {
  }

  public static void applyPortFromConfig(ServiceDefinition def, Path servicePath, PortExtractor portExtractor) {
    Optional<Integer> configPort = portExtractor.extract(servicePath);
    if (configPort.isEmpty()) {
      return;
    }
    int port = configPort.get();
    if (def.getEnv() == null) {
      def.setEnv(new HashMap<>());
    }
    def.getEnv().put("SERVER_PORT", String.valueOf(port));
    List<String> cmd = new ArrayList<>(def.getCommand());
    for (int i = 0; i < cmd.size(); i++) {
      if (cmd.get(i).startsWith("-Dspring-boot.run.arguments=--server.port=")) {
        cmd.set(i, "-Dspring-boot.run.arguments=--server.port=" + port);
        def.setCommand(cmd);
        return;
      }
    }
    boolean hasMvnw = Files.exists(servicePath.resolve("mvnw"))
        || Files.exists(servicePath.resolve("mvnw.cmd"))
        || Files.exists(servicePath.resolve("mvnw.bat"));
    String mvnCmd = hasMvnw ? "./mvnw" : "mvn";
    def.setCommand(
        List.of(mvnCmd, "-q", "-DskipTests", "-Dspring-boot.run.arguments=--server.port=" + port, "spring-boot:run"));
  }

  public static void mergeScannedWithPrevious(Map<String, ServiceDefinition> byName,
      Map<String, ServiceDefinition> previousByName) {
    for (ServiceDefinition def : byName.values()) {
      ServiceDefinition prev = previousByName.get(def.getName());
      if (prev == null) {
        continue;
      }
      Path defPath = Path.of(def.getPath()).toAbsolutePath().normalize();
      Path prevPath = Path.of(prev.getPath()).toAbsolutePath().normalize();
      if (!defPath.equals(prevPath)) {
        continue;
      }
      ProjectType pt = def.getProjectType();
      if (pt != null && pt != ProjectType.SPRING_BOOT) {
        if (def.getAvailableScripts() != null && !def.getAvailableScripts().isEmpty()) {
          String preferred = prev.getSelectedScript();
          String runtimeScript = selectRuntimeJsScript(preferred, def.getAvailableScripts());
          if (runtimeScript != null) {
            def.setSelectedScript(runtimeScript);
            def.setCommand(List.of("npm", "run", runtimeScript));
          }
        }
        continue;
      }
      if (prev.getJavaHome() != null && !prev.getJavaHome().isBlank()) {
        def.setJavaHome(prev.getJavaHome());
        if (prev.getJavaVersion() != null && !prev.getJavaVersion().isBlank()) {
          def.setJavaVersion(prev.getJavaVersion());
        }
      } else if (prev.getJavaVersion() != null && !prev.getJavaVersion().isBlank()
          && (def.getJavaVersion() == null || !prev.getJavaVersion().equals(def.getJavaVersion()))) {
        def.setJavaVersion(prev.getJavaVersion());
        def.setJavaHome(null);
      }
    }
  }

  public static String selectRuntimeJsScript(String preferred, List<String> available) {
    if (available == null || available.isEmpty()) return null;
    if (preferred != null && !preferred.isBlank() && available.contains(preferred)
        && !NON_RUNTIME_JS_SCRIPTS.contains(preferred.toLowerCase())) {
      return preferred;
    }
    for (String candidate : List.of("dev", "start", "serve")) {
      if (available.contains(candidate)) return candidate;
    }
    for (String script : available) {
      if (!NON_RUNTIME_JS_SCRIPTS.contains(script.toLowerCase())) return script;
    }
    return available.get(0);
  }

  public static void applyJsPort(ServiceDefinition def, int port) {
    if (def.getEnv() == null) {
      def.setEnv(new HashMap<>());
    }
    String value = String.valueOf(port);
    def.getEnv().put("SERVER_PORT", value);
    def.getEnv().put("PORT", value);
    List<String> cmd = def.getCommand();
    if (cmd == null || cmd.isEmpty()) return;
    List<String> updated = new ArrayList<>(cmd);
    boolean changed = false;
    for (int i = 0; i < updated.size(); i++) {
      String token = updated.get(i);
      if ("--port".equalsIgnoreCase(token) || "-p".equalsIgnoreCase(token)) {
        if (i + 1 < updated.size()) {
          updated.set(i + 1, value);
          changed = true;
        }
      } else if (token.startsWith("--port=") || token.startsWith("--PORT=")) {
        int idx = token.indexOf('=');
        updated.set(i, token.substring(0, idx + 1) + value);
        changed = true;
      }
    }
    if (!changed && updated.size() >= 2 && "npm".equalsIgnoreCase(updated.get(0)) && "run".equalsIgnoreCase(updated.get(1))) {
      updated.add("--");
      updated.add("--port");
      updated.add(value);
      updated.add("--strictPort");
      changed = true;
    }
    if (changed) def.setCommand(updated);
  }
}
