package dev.safra.orchestrator.core;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

public final class Args {
  private Args() {
  }

  public static Map<String, String> parse(String[] args) {
    Map<String, String> m = new HashMap<>();
    for (int i = 0; i < args.length; i++) {
      String a = args[i];
      if (!a.startsWith("--"))
        continue;
      String key = a.substring(2);
      String val = "true";
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        val = args[i + 1];
        i++;
      }
      m.put(key, val);
    }
    return m;
  }

  public static Path stateDir(Map<String, String> args) {
    String v = args.getOrDefault("stateDir", ".orchestrator");
    return Path.of(v).toAbsolutePath().normalize();
  }
}
