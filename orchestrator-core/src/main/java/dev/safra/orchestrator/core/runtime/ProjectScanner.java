package dev.safra.orchestrator.core.runtime;

import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import dev.safra.orchestrator.model.ServiceDefinition;

public class ProjectScanner {
  private final StateStore store;
  private final PortExtractor portExtractor;
  private final Path logsDir;

  public ProjectScanner(StateStore store, PortExtractor portExtractor, Path logsDir) {
    this.store = store;
    this.portExtractor = portExtractor;
    this.logsDir = logsDir;
  }

  public List<ServiceDefinition> scanRoot(Path root, List<String> excludeDirs) {
    List<ServiceDefinition> out = new ArrayList<>();
    if (!Files.isDirectory(root))
      return out;
    List<String> excluded = excludeDirs != null ? excludeDirs : List.of();

    try {
      Files.walkFileTree(root, Set.of(), 6, new SimpleFileVisitor<>() {
        @Override
        public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
          String name = dir.getFileName() == null ? "" : dir.getFileName().toString();
          if (name.equals(".git") || name.equals("target") || name.equals("node_modules") || name.equals(".idea"))
            return FileVisitResult.SKIP_SUBTREE;
          if (excluded.contains(name))
            return FileVisitResult.SKIP_SUBTREE;
          return FileVisitResult.CONTINUE;
        }

        @Override
        public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
          if (!file.getFileName().toString().equals("pom.xml"))
            return FileVisitResult.CONTINUE;
          Path dir = file.getParent();
          if (dir == null)
            return FileVisitResult.CONTINUE;
          if (isAggregatorPom(file))
            return FileVisitResult.CONTINUE;

          Path mvnw = dir.resolve("mvnw");
          boolean hasMvnw = Files.exists(mvnw);
          if (!isSpringBootPom(file) && !hasMvnw)
            return FileVisitResult.CONTINUE;

          String serviceName = dir.getFileName().toString();
          int port = portExtractor.extract(dir).orElse(18080 + (Math.abs(serviceName.hashCode()) % 120));

          ServiceDefinition def = new ServiceDefinition();
          def.setName(serviceName);
          def.setPath(dir.toAbsolutePath().normalize().toString());
          def.setLogFile(logsDir.resolve(serviceName + ".log").toString());
          def.setContainerIds(new ArrayList<>());

          Map<String, String> env = new HashMap<>();
          env.put("SERVER_PORT", String.valueOf(port));
          def.setEnv(env);

          def.setJavaVersion(extractJavaVersion(file));

          String mvnCmd = hasMvnw ? "./mvnw" : "mvn";
          def.setCommand(List.of(mvnCmd, "-q", "-DskipTests",
              "-Dspring-boot.run.arguments=--server.port=" + port, "spring-boot:run"));
          out.add(def);
          return FileVisitResult.CONTINUE;
        }
      });
    } catch (Exception e) {
      e.printStackTrace();
    }
    return out;
  }

  private boolean isAggregatorPom(Path pom) {
    String txt = store.readSmallText(pom, 64_000);
    if (txt == null)
      return false;
    return txt.contains("<packaging>pom</packaging>") && txt.contains("<modules>") && txt.contains("<module>");
  }

  public String extractJavaVersion(Path pom) {
    String txt = store.readSmallText(pom, 96_000);
    if (txt == null) return null;
    java.util.regex.Matcher m = java.util.regex.Pattern
        .compile("<java\\.version>\\s*(\\d+)\\s*</java\\.version>").matcher(txt);
    if (m.find()) return m.group(1);
    m = java.util.regex.Pattern
        .compile("<maven\\.compiler\\.(?:source|target|release)>\\s*(\\d+)\\s*</maven\\.compiler").matcher(txt);
    if (m.find()) return m.group(1);
    if (txt.contains("spring-boot-starter-parent")) {
      java.util.regex.Matcher pv = java.util.regex.Pattern
          .compile("<parent>[\\s\\S]*?<version>\\s*(\\d+)\\.(\\d+)").matcher(txt);
      if (pv.find()) {
        int major = Integer.parseInt(pv.group(1));
        if (major >= 3) return "17";
      }
    }
    return null;
  }

  private boolean isSpringBootPom(Path pom) {
    String txt = store.readSmallText(pom, 96_000);
    if (txt == null)
      return false;
    String lower = txt.toLowerCase();
    return lower.contains("spring-boot") || lower.contains("springframework.boot")
        || lower.contains("spring-boot-starter") || lower.contains("spring-boot-parent")
        || (lower.contains("<parent>") && lower.contains("spring-boot"))
        || lower.contains("org.springframework.boot");
  }
}
