package dev.safra.orchestrator.process;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import dev.safra.orchestrator.model.ProjectType;
import dev.safra.orchestrator.model.ServiceDefinition;

public class ProcessManager {
  private final Duration gracefulTimeout;
  private final Duration killTimeout;
  private final JavaVersionDetector javaDetector = new JavaVersionDetector();

  public ProcessManager(Duration gracefulTimeout, Duration killTimeout) {
    this.gracefulTimeout = gracefulTimeout;
    this.killTimeout = killTimeout;
  }

  public JavaVersionDetector getJavaDetector() {
    return javaDetector;
  }

  public long start(ServiceDefinition def) {
    validateDefinition(def);
    freePort(def);
    try {
      Path workDir = Path.of(def.getPath()).toAbsolutePath().normalize();
      Path logPath = Path.of(def.getLogFile()).toAbsolutePath().normalize();

      if (logPath.getParent() != null) {
        Files.createDirectories(logPath.getParent());
      }

      List<String> cmd = new ArrayList<>(def.getCommand());
      if (!cmd.isEmpty() && "./mvnw".equals(cmd.get(0))) {
        try {
          java.io.File mvnw = workDir.resolve("mvnw").toFile();
          if (mvnw.exists()) {
            mvnw.setExecutable(true);
          }
        } catch (Exception ignored) {
        }
      }
      ProcessBuilder pb = new ProcessBuilder(cmd);
      pb.directory(workDir.toFile());
      pb.redirectErrorStream(true);
      pb.redirectOutput(ProcessBuilder.Redirect.appendTo(logPath.toFile()));

      Map<String, String> env = pb.environment();
      if (def.getEnv() != null) env.putAll(def.getEnv());

      boolean isJava = def.getProjectType() == null || def.getProjectType() == ProjectType.SPRING_BOOT;
      String path = env.getOrDefault("PATH", "");

      if (isJava) {
        path = setupJavaPath(def, env, path);
      } else {
        path = setupNodePath(env, path);
      }

      for (String extra : new String[]{"/opt/homebrew/bin", "/usr/local/bin"}) {
        if (!path.contains(extra) && Files.isDirectory(Path.of(extra))) path = extra + ":" + path;
      }
      env.put("PATH", path);

      try {
        if (!Files.exists(logPath)) Files.createFile(logPath);
        String info = isJava
            ? "[orchestrator] Iniciando com JAVA_HOME=" + env.getOrDefault("JAVA_HOME", "system")
            : "[orchestrator] Iniciando projeto " + def.getProjectType();
        Files.writeString(logPath, info + "\n",
            java.nio.charset.StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.APPEND);
      } catch (Exception ignored) {
      }

      Process p = pb.start();
      long pid = p.pid();

      monitorProcess(pid, def.getName());

      return pid;
    } catch (IOException e) {
      throw new IllegalStateException("Falha ao iniciar processo para serviço: " + def.getName(), e);
    }
  }

  public boolean isAlive(long pid) {
    return ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false);
  }

  public StopResult stop(long pid) {
    Optional<ProcessHandle> opt = ProcessHandle.of(pid);
    if (opt.isEmpty()) {
      return StopResult.notFound(pid);
    }
    ProcessHandle h = opt.get();
    if (!h.isAlive()) {
      return StopResult.alreadyStopped(pid);
    }

    boolean termSent = h.destroy(); // SIGTERM (Unix)
    boolean exited = waitForExit(h, gracefulTimeout);
    if (exited) {
      return StopResult.stopped(pid, termSent ? "SIGTERM" : "TERM_NOT_SENT");
    }

    boolean killSent = h.destroyForcibly(); // SIGKILL (Unix)
    boolean exitedAfterKill = waitForExit(h, killTimeout);
    if (exitedAfterKill) {
      return StopResult.stopped(pid, killSent ? "SIGKILL" : "KILL_NOT_SENT");
    }
    return StopResult.failed(pid, "Não foi possível finalizar o processo (TERM+KILL) dentro do timeout.");
  }

  private boolean waitForExit(ProcessHandle h, Duration timeout) {
    try {
      return h.onExit().toCompletableFuture().get(timeout.toMillis(), TimeUnit.MILLISECONDS) != null;
    } catch (Exception ignored) {
      return !h.isAlive();
    }
  }

  private void validateDefinition(ServiceDefinition def) {
    if (def.getName() == null || def.getName().isBlank()) {
      throw new IllegalArgumentException("name é obrigatório");
    }
    if (def.getPath() == null || def.getPath().isBlank()) {
      throw new IllegalArgumentException("path é obrigatório");
    }
    if (def.getCommand() == null || def.getCommand().isEmpty()) {
      throw new IllegalArgumentException("command é obrigatório");
    }
    if (def.getLogFile() == null || def.getLogFile().isBlank()) {
      throw new IllegalArgumentException("logFile é obrigatório");
    }
  }

  private String detectJavaHome(String requiredVersion) {
    return javaDetector.resolveJavaHome(requiredVersion);
  }

  private String setupJavaPath(ServiceDefinition def, Map<String, String> env, String path) {
    String javaHome = def.getJavaHome();
    if (javaHome == null || javaHome.isBlank()) javaHome = detectJavaHome(def.getJavaVersion());
    if (javaHome != null && !javaHome.isBlank()) {
      env.put("JAVA_HOME", javaHome);
      path = Path.of(javaHome, "bin") + ":" + path;
    }
    String home = System.getProperty("user.home");
    String sdkmanMvn = home + "/.sdkman/candidates/maven/current/bin";
    if (Files.isDirectory(Path.of(sdkmanMvn))) path = sdkmanMvn + ":" + path;
    return path;
  }

  private String setupNodePath(Map<String, String> env, String path) {
    String home = System.getProperty("user.home");
    String[] nodePaths = {
        home + "/.nvm/versions/node",
        home + "/.volta/bin",
        home + "/.fnm/aliases/default/bin"
    };
    for (String dir : nodePaths) {
      Path p = Path.of(dir);
      if (!Files.isDirectory(p)) continue;
      if (dir.endsWith("/node")) {
        try (var stream = Files.list(p)) {
          var latest = stream.filter(Files::isDirectory).max(java.util.Comparator.naturalOrder());
          if (latest.isPresent()) path = latest.get().resolve("bin") + ":" + path;
        } catch (Exception ignored) {}
      } else {
        path = dir + ":" + path;
      }
    }
    return path;
  }

  private void freePort(ServiceDefinition def) {
    if (def.getEnv() == null) return;
    String portStr = def.getEnv().getOrDefault("SERVER_PORT", def.getEnv().get("PORT"));
    if (portStr == null || portStr.isBlank()) return;
    try {
      int port = Integer.parseInt(portStr.trim());
      Process lsof = new ProcessBuilder("lsof", "-ti", ":" + port)
          .redirectErrorStream(true).start();
      String output = new String(lsof.getInputStream().readAllBytes()).trim();
      lsof.waitFor(5, TimeUnit.SECONDS);
      if (output.isEmpty()) return;
      for (String pidLine : output.split("\\R")) {
        String pid = pidLine.trim();
        if (!pid.isEmpty()) {
          new ProcessBuilder("kill", "-9", pid).start().waitFor(3, TimeUnit.SECONDS);
        }
      }
    } catch (Exception ignored) {}
  }

  private void monitorProcess(long pid, String serviceName) {
    Thread t = new Thread(() -> {
      try {
        Optional<ProcessHandle> opt = ProcessHandle.of(pid);
        if (opt.isEmpty())
          return;
        opt.get().onExit().thenRun(() -> {
        });
      } catch (Exception ignored) {
      }
    }, "monitor-" + serviceName);
    t.setDaemon(true);
    t.start();
  }
}
