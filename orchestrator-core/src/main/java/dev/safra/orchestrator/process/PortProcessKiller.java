package dev.safra.orchestrator.process;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

public final class PortProcessKiller {
  private PortProcessKiller() {
  }

  static void freePort(Map<String, String> env, boolean windows) {
    if (env == null) return;
    String portStr = env.getOrDefault("SERVER_PORT", env.get("PORT"));
    if (portStr == null || portStr.isBlank()) return;
    try {
      int port = Integer.parseInt(portStr.trim());
      if (isPortFree(port)) return;
      for (int attempt = 0; attempt < 2; attempt++) {
        if (windows) {
          killWindowsPort(port);
        } else {
          killUnixPort(port);
        }
        if (waitUntilPortFree(port, attempt == 0 ? 20 : 30)) return;
      }
      throw new IllegalStateException("Porta " + port + " continua em uso após tentativa de liberação.");
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      throw new IllegalStateException("Falha ao liberar porta " + portStr + ": " + e.getMessage(), e);
    }
  }

  private static void killWindowsPort(int port) throws Exception {
    Set<String> pids = findPidsNetstat(port);
    if (pids.isEmpty()) pids = findPidsPowerShell(port);
    for (String pid : pids) {
      new ProcessBuilder("taskkill", "/PID", pid, "/T", "/F")
          .redirectErrorStream(true)
          .start()
          .waitFor(5, TimeUnit.SECONDS);
    }
  }

  private static Set<String> findPidsNetstat(int port) {
    Set<String> pids = new HashSet<>();
    try {
      Process netstat = new ProcessBuilder("cmd.exe", "/c", "netstat -ano -p tcp")
          .redirectErrorStream(true).start();
      String output = new String(netstat.getInputStream().readAllBytes());
      netstat.waitFor(5, TimeUnit.SECONDS);
      String suffix = ":" + port;
      for (String line : output.split("\\R")) {
        String row = line.trim();
        if (!row.startsWith("TCP")) continue;
        String[] parts = row.split("\\s+");
        if (parts.length < 5) continue;
        if (!parts[1].endsWith(suffix)) continue;
        String pid = parts[parts.length - 1];
        if (!pid.isBlank() && !"0".equals(pid)) pids.add(pid);
      }
    } catch (Exception ignored) {
    }
    return pids;
  }

  private static Set<String> findPidsPowerShell(int port) {
    Set<String> pids = new HashSet<>();
    try {
      String powershell = WindowsCommandResolver.resolvePowerShell().map(Path::toString).orElse(null);
      if (powershell == null) return pids;
      String cmd = "(Get-NetTCPConnection -LocalPort " + port
          + " -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique";
      Process ps = new ProcessBuilder(powershell, "-NoProfile", "-Command", cmd)
          .redirectErrorStream(true).start();
      String output = new String(ps.getInputStream().readAllBytes()).trim();
      ps.waitFor(8, TimeUnit.SECONDS);
      for (String line : output.split("\\R")) {
        String pid = line.trim();
        if (!pid.isEmpty() && pid.matches("\\d+") && !"0".equals(pid)) pids.add(pid);
      }
    } catch (Exception ignored) {
    }
    return pids;
  }

  private static void killUnixPort(int port) throws Exception {
    Process lsof = new ProcessBuilder("lsof", "-ti", ":" + port)
        .redirectErrorStream(true).start();
    String output = new String(lsof.getInputStream().readAllBytes()).trim();
    lsof.waitFor(5, TimeUnit.SECONDS);
    if (output.isEmpty()) return;
    for (String pidLine : output.split("\\R")) {
      String pid = pidLine.trim();
      if (!pid.isEmpty()) {
        new ProcessBuilder("kill", "-9", pid)
            .redirectErrorStream(true).start().waitFor(3, TimeUnit.SECONDS);
      }
    }
  }

  private static boolean waitUntilPortFree(int port, int maxAttempts) throws InterruptedException {
    for (int i = 0; i < maxAttempts; i++) {
      Thread.sleep(300);
      if (isPortFree(port)) return true;
    }
    return false;
  }

  public static void killPort(int port, boolean windows) {
    if (isPortFree(port)) return;
    try {
      for (int attempt = 0; attempt < 2; attempt++) {
        if (windows) {
          killWindowsPort(port);
        } else {
          killUnixPort(port);
        }
        if (waitUntilPortFree(port, attempt == 0 ? 20 : 30)) return;
      }
      throw new IllegalStateException("Porta " + port + " continua em uso após tentativa de liberação.");
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      throw new IllegalStateException("Falha ao liberar porta " + port + ": " + e.getMessage(), e);
    }
  }

  public static boolean isPortFree(int port) {
    return canBind(port, null) && canBind(port, InetAddress.getLoopbackAddress());
  }

  private static boolean canBind(int port, InetAddress host) {
    try (ServerSocket socket = new ServerSocket()) {
      socket.setReuseAddress(true);
      InetSocketAddress addr = host == null ? new InetSocketAddress(port) : new InetSocketAddress(host, port);
      socket.bind(addr);
      return true;
    } catch (Exception ignored) {
      return false;
    }
  }
}
