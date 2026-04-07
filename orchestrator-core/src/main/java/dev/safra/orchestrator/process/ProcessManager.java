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
      if (def.getEnv() != null) {
        env.putAll(def.getEnv());
      }

      String javaHome = def.getJavaHome();
      if (javaHome == null || javaHome.isBlank()) {
        javaHome = detectJavaHome(def.getJavaVersion());
      }

      if (javaHome != null && !javaHome.isBlank()) {
        env.put("JAVA_HOME", javaHome);
        String path = env.getOrDefault("PATH", "");
        String javaBin = Path.of(javaHome, "bin").toString();
        env.put("PATH", javaBin + ":" + path);
      }

      try {
        if (!Files.exists(logPath)) {
          Files.createFile(logPath);
          Files.writeString(logPath, "[orchestrator] Processo iniciando...\n", java.nio.charset.StandardCharsets.UTF_8,
              java.nio.file.StandardOpenOption.APPEND);
        }
      } catch (Exception e) {
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
