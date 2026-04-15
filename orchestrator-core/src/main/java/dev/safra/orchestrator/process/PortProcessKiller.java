package dev.safra.orchestrator.process;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

final class PortProcessKiller {
  private PortProcessKiller() {
  }

  static void freePort(Map<String, String> env, boolean windows) {
    if (env == null) return;
    String portStr = env.getOrDefault("SERVER_PORT", env.get("PORT"));
    if (portStr == null || portStr.isBlank()) return;
    try {
      int port = Integer.parseInt(portStr.trim());
      if (isPortFree(port)) return;
      if (windows) {
        killWindowsPort(port);
      } else {
        killUnixPort(port);
      }
      waitUntilPortFree(port);
    } catch (Exception e) {
      throw new IllegalStateException("Falha ao liberar porta " + portStr + ": " + e.getMessage(), e);
    }
  }

  private static void killWindowsPort(int port) throws Exception {
    Process netstat = new ProcessBuilder("cmd.exe", "/c", "netstat -ano -p tcp")
        .redirectErrorStream(true)
        .start();
    String output = new String(netstat.getInputStream().readAllBytes());
    netstat.waitFor(5, TimeUnit.SECONDS);
    Set<String> pids = new HashSet<>();
    for (String line : output.split("\\R")) {
      String row = line.trim();
      if (!row.startsWith("TCP")) continue;
      String[] parts = row.split("\\s+");
      if (parts.length < 5) continue;
      String local = parts[1];
      if (!local.endsWith(":" + port)) continue;
      pids.add(parts[parts.length - 1]);
    }
    for (String pid : pids) {
      if (!pid.isBlank() && !"0".equals(pid)) {
        new ProcessBuilder("taskkill", "/PID", pid, "/T", "/F")
            .redirectErrorStream(true)
            .start()
            .waitFor(3, TimeUnit.SECONDS);
      }
    }
  }

  private static void killUnixPort(int port) throws Exception {
    Process lsof = new ProcessBuilder("lsof", "-ti", ":" + port)
        .redirectErrorStream(true)
        .start();
    String output = new String(lsof.getInputStream().readAllBytes()).trim();
    lsof.waitFor(5, TimeUnit.SECONDS);
    if (output.isEmpty()) return;
    for (String pidLine : output.split("\\R")) {
      String pid = pidLine.trim();
      if (!pid.isEmpty()) {
        new ProcessBuilder("kill", "-9", pid)
            .redirectErrorStream(true)
            .start()
            .waitFor(3, TimeUnit.SECONDS);
      }
    }
  }

  private static void waitUntilPortFree(int port) throws Exception {
    for (int i = 0; i < 15; i++) {
      if (isPortFree(port)) return;
      Thread.sleep(200);
    }
    throw new IllegalStateException("Porta " + port + " continua em uso apos tentativa de liberacao.");
  }

  private static boolean isPortFree(int port) {
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
