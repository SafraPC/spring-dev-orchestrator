package dev.safra.orchestrator.process;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

public final class MavenLaunchCommands {

  private MavenLaunchCommands() {
  }

  public static List<String> normalizeWindowsMvnw(List<String> cmd, Path workDir) {
    if (cmd.isEmpty()) {
      return cmd;
    }
    if (!isWindows()) {
      return cmd;
    }
    String first = cmd.get(0);
    if ("mvn".equalsIgnoreCase(first)) {
      Optional<Path> mvnCmd = resolveMvnCmd();
      if (mvnCmd.isPresent()) {
        List<String> next = new ArrayList<>();
        next.add("cmd.exe");
        next.add("/c");
        next.add(mvnCmd.get().toString());
        for (int i = 1; i < cmd.size(); i++) {
          next.add(cmd.get(i));
        }
        return next;
      }
      return cmd;
    }
    if (!"./mvnw".equals(first) && !"mvnw".equals(first)) {
      return cmd;
    }
    Path cmdFile = workDir.resolve("mvnw.cmd");
    if (!Files.exists(cmdFile)) {
      cmdFile = workDir.resolve("mvnw.bat");
    }
    if (!Files.exists(cmdFile)) {
      cmdFile = workDir.resolve("mvnw");
    }
    if (!Files.exists(cmdFile)) {
      return cmd;
    }
    String launcher = cmdFile.getFileName().toString();
    List<String> next = new ArrayList<>();
    next.add("cmd.exe");
    next.add("/c");
    next.add(launcher);
    for (int i = 1; i < cmd.size(); i++) {
      next.add(cmd.get(i));
    }
    return next;
  }

  public static List<String> wrapWindowsMvn(List<String> cmd) {
    if (!isWindows() || cmd.isEmpty() || !"mvn".equalsIgnoreCase(cmd.get(0))) {
      return cmd;
    }
    List<String> next = new ArrayList<>();
    next.add("cmd.exe");
    next.add("/c");
    next.add("mvn.cmd");
    for (int i = 1; i < cmd.size(); i++) {
      next.add(cmd.get(i));
    }
    return next;
  }

  private static boolean isWindows() {
    return System.getProperty("os.name").toLowerCase().contains("win");
  }

  private static Optional<Path> resolveMvnCmd() {
    String mavenHome = System.getenv("MAVEN_HOME");
    if (mavenHome != null && !mavenHome.isBlank()) {
      Path mvn = Path.of(mavenHome, "bin", "mvn.cmd");
      if (Files.exists(mvn)) {
        return Optional.of(mvn);
      }
    }
    String localAppData = System.getenv("LOCALAPPDATA");
    if (localAppData != null && !localAppData.isBlank()) {
      Path deps = Path.of(localAppData, "OrchestratorBuildDeps");
      if (Files.isDirectory(deps)) {
        try (var dirs = Files.list(deps)) {
          Optional<Path> latest = dirs
              .filter(Files::isDirectory)
              .filter(p -> p.getFileName().toString().startsWith("apache-maven-"))
              .map(p -> p.resolve("bin").resolve("mvn.cmd"))
              .filter(Files::exists)
              .max(Comparator.comparingLong(p -> p.toFile().lastModified()));
          if (latest.isPresent()) {
            return latest;
          }
        } catch (Exception ignored) {
        }
      }
    }
    return Optional.empty();
  }
}
