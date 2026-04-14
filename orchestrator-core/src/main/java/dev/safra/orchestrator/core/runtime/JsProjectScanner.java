package dev.safra.orchestrator.core.runtime;

import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.safra.orchestrator.model.ProjectType;
import dev.safra.orchestrator.model.ServiceDefinition;

public class JsProjectScanner {

  private static final Set<String> RELEVANT_SCRIPTS = Set.of(
      "dev", "start", "start:dev", "start:debug", "serve", "preview", "build");
  private static final Set<String> SKIP_DIRS = Set.of(
      ".git", "target", "node_modules", ".idea", ".next", "dist", "build", ".turbo", ".cache");
  private static final Pattern PORT_FLAG = Pattern.compile("(?:--port|--PORT|-p)\\s+(\\d+)");

  private final ObjectMapper om;
  private final Path logsDir;

  public JsProjectScanner(ObjectMapper om, Path logsDir) {
    this.om = om;
    this.logsDir = logsDir;
  }

  public List<ServiceDefinition> scanRoot(Path root, List<String> excludeDirs) {
    List<ServiceDefinition> out = new ArrayList<>();
    if (!Files.isDirectory(root)) return out;
    List<String> excluded = excludeDirs != null ? excludeDirs : List.of();
    Set<Path> foundProjectDirs = new HashSet<>();

    try {
      Files.walkFileTree(root, Set.of(), 6, new SimpleFileVisitor<>() {
        @Override
        public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
          String name = dir.getFileName() == null ? "" : dir.getFileName().toString();
          if (SKIP_DIRS.contains(name) || excluded.contains(name))
            return FileVisitResult.SKIP_SUBTREE;
          for (Path p : foundProjectDirs) {
            if (dir.startsWith(p)) return FileVisitResult.SKIP_SUBTREE;
          }
          return FileVisitResult.CONTINUE;
        }

        @Override
        public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
          if (!file.getFileName().toString().equals("package.json"))
            return FileVisitResult.CONTINUE;
          Path dir = file.getParent();
          if (dir == null) return FileVisitResult.CONTINUE;
          if (Files.exists(dir.resolve("pom.xml"))) return FileVisitResult.CONTINUE;

          ServiceDefinition def = parsePackageJson(file, dir);
          if (def != null) {
            out.add(def);
            foundProjectDirs.add(dir);
          }
          return FileVisitResult.CONTINUE;
        }
      });
    } catch (Exception e) {
      e.printStackTrace();
    }
    return out;
  }

  private ServiceDefinition parsePackageJson(Path pkgFile, Path dir) {
    try {
      byte[] bytes = Files.readAllBytes(pkgFile);
      if (bytes.length == 0) return null;
      JsonNode root = om.readTree(bytes);

      if (isMonorepoRoot(root)) return null;

      ProjectType type = detectType(root);
      if (type == null) return null;

      String serviceName = dir.getFileName().toString();
      List<String> scripts = extractScripts(root);
      if (scripts.isEmpty()) return null;

      int port = extractPort(root, type, dir);
      String defaultScript = pickDefaultScript(scripts, type);

      ServiceDefinition def = new ServiceDefinition();
      def.setName(serviceName);
      def.setPath(dir.toAbsolutePath().normalize().toString());
      def.setLogFile(logsDir.resolve(serviceName + ".log").toString());
      def.setContainerIds(new ArrayList<>());
      def.setProjectType(type);
      def.setAvailableScripts(scripts);
      def.setCommand(List.of("npm", "run", defaultScript));

      Map<String, String> env = new HashMap<>();
      env.put("SERVER_PORT", String.valueOf(port));
      env.put("PORT", String.valueOf(port));
      def.setEnv(env);

      return def;
    } catch (Exception e) {
      return null;
    }
  }

  private boolean isMonorepoRoot(JsonNode root) {
    if (root.has("workspaces")) return true;
    JsonNode devDeps = root.path("devDependencies");
    if (devDeps.has("lerna") || devDeps.has("nx") || devDeps.has("turbo")) return true;
    JsonNode deps = root.path("dependencies");
    return deps.has("lerna") || deps.has("nx");
  }

  private ProjectType detectType(JsonNode root) {
    JsonNode deps = root.path("dependencies");
    JsonNode devDeps = root.path("devDependencies");

    if (hasDep(deps, "next") || hasDep(devDeps, "next")) return ProjectType.NEXT;
    if (hasDep(deps, "@nestjs/core") || hasDep(devDeps, "@nestjs/core")) return ProjectType.NEST;
    if (hasDep(deps, "vue") || hasDep(devDeps, "vue")) return ProjectType.VUE;
    if (hasDep(deps, "react") || hasDep(devDeps, "react")) return ProjectType.REACT;
    return null;
  }

  private boolean hasDep(JsonNode deps, String name) {
    return deps != null && deps.has(name);
  }

  private List<String> extractScripts(JsonNode root) {
    JsonNode scripts = root.path("scripts");
    if (scripts.isMissingNode() || !scripts.isObject()) return List.of();
    List<String> out = new ArrayList<>();
    scripts.fieldNames().forEachRemaining(name -> {
      if (RELEVANT_SCRIPTS.contains(name)) out.add(name);
    });
    return out;
  }

  private int extractPort(JsonNode root, ProjectType type, Path dir) {
    JsonNode scripts = root.path("scripts");
    if (scripts.isObject()) {
      for (var it = scripts.fields(); it.hasNext(); ) {
        var entry = it.next();
        Matcher m = PORT_FLAG.matcher(entry.getValue().asText(""));
        if (m.find()) {
          try { return Integer.parseInt(m.group(1)); } catch (NumberFormatException ignored) {}
        }
      }
    }
    Path envFile = dir.resolve(".env");
    if (Files.exists(envFile)) {
      try {
        for (String line : Files.readAllLines(envFile)) {
          String trimmed = line.trim();
          if (trimmed.startsWith("PORT=")) {
            try { return Integer.parseInt(trimmed.substring(5).trim()); } catch (NumberFormatException ignored) {}
          }
        }
      } catch (Exception ignored) {}
    }
    return switch (type) {
      case VUE -> 5173;
      default -> 3000;
    };
  }

  private String pickDefaultScript(List<String> scripts, ProjectType type) {
    if (type == ProjectType.NEST) {
      if (scripts.contains("start:dev")) return "start:dev";
      if (scripts.contains("start:debug")) return "start:debug";
    }
    if (scripts.contains("dev")) return "dev";
    if (scripts.contains("start")) return "start";
    if (scripts.contains("serve")) return "serve";
    return scripts.get(0);
  }
}
