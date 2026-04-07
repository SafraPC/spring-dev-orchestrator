package dev.safra.orchestrator.process;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import lombok.Data;

public class JavaVersionDetector {

  private static final Pattern VERSION_PATTERN = Pattern.compile("\"(\\d+)(?:\\.(\\d+))?");

  @Data
  public static class JdkInfo {
    private final String majorVersion;
    private final String fullVersion;
    private final String path;
    private final String vendor;

    public JdkInfo(String majorVersion, String fullVersion, String path, String vendor) {
      this.majorVersion = majorVersion;
      this.fullVersion = fullVersion;
      this.path = path;
      this.vendor = vendor;
    }
  }

  public List<JdkInfo> detectAll() {
    Map<String, JdkInfo> byPath = new LinkedHashMap<>();
    scanSdkman(byPath);
    scanHomebrew(byPath);
    scanSystemJavaHome(byPath);
    scanJavaVirtualMachines(byPath);
    scanCurrentJavaHome(byPath);

    List<JdkInfo> result = new ArrayList<>(byPath.values());
    result.sort(Comparator.comparingInt(j -> parseMajor(j.getMajorVersion())));
    return result;
  }

  public String resolveJavaHome(String requiredVersion) {
    if (requiredVersion == null || requiredVersion.isBlank()) {
      String env = System.getenv("JAVA_HOME");
      return (env != null && !env.isBlank()) ? env : null;
    }

    List<JdkInfo> all = detectAll();
    for (JdkInfo jdk : all) {
      if (jdk.getMajorVersion().equals(requiredVersion)) {
        return jdk.getPath();
      }
    }
    return null;
  }

  private void scanSdkman(Map<String, JdkInfo> out) {
    Path sdkmanDir = Path.of(System.getProperty("user.home"), ".sdkman", "candidates", "java");
    if (!Files.isDirectory(sdkmanDir)) return;
    try (Stream<Path> dirs = Files.list(sdkmanDir)) {
      dirs.filter(Files::isDirectory)
          .filter(d -> !d.getFileName().toString().equals("current"))
          .forEach(d -> probeAndAdd(d, "SDKMAN", out));
    } catch (Exception ignored) {
    }
  }

  private void scanHomebrew(Map<String, JdkInfo> out) {
    String[] prefixes = {"/opt/homebrew/opt", "/usr/local/opt"};
    for (String prefix : prefixes) {
      Path base = Path.of(prefix);
      if (!Files.isDirectory(base)) continue;
      try (Stream<Path> dirs = Files.list(base)) {
        dirs.filter(d -> d.getFileName().toString().startsWith("openjdk"))
            .map(d -> d.resolve("libexec/openjdk.jdk/Contents/Home"))
            .filter(Files::isDirectory)
            .forEach(d -> probeAndAdd(d, "Homebrew", out));
      } catch (Exception ignored) {
      }
    }
  }

  private void scanSystemJavaHome(Map<String, JdkInfo> out) {
    if (!System.getProperty("os.name").toLowerCase().contains("mac")) return;
    String[] versions = {"8", "11", "17", "21", "22", "23", "24"};
    for (String v : versions) {
      try {
        Process p = new ProcessBuilder("/usr/libexec/java_home", "-v", v).start();
        String path = new String(p.getInputStream().readAllBytes()).trim();
        if (p.waitFor() == 0 && !path.isBlank()) {
          probeAndAdd(Path.of(path), "System", out);
        }
      } catch (Exception ignored) {
      }
    }
  }

  private void scanJavaVirtualMachines(Map<String, JdkInfo> out) {
    Path jvmDir = Path.of("/Library/Java/JavaVirtualMachines");
    if (!Files.isDirectory(jvmDir)) return;
    try (Stream<Path> dirs = Files.list(jvmDir)) {
      dirs.filter(Files::isDirectory)
          .map(d -> d.resolve("Contents/Home"))
          .filter(Files::isDirectory)
          .forEach(d -> probeAndAdd(d, "System", out));
    } catch (Exception ignored) {
    }
  }

  private void scanCurrentJavaHome(Map<String, JdkInfo> out) {
    String env = System.getenv("JAVA_HOME");
    if (env != null && !env.isBlank()) {
      probeAndAdd(Path.of(env), "Current", out);
    }
  }

  private void probeAndAdd(Path javaHome, String source, Map<String, JdkInfo> out) {
    String resolved = javaHome.toAbsolutePath().normalize().toString();
    if (out.containsKey(resolved)) return;
    Path javaBin = javaHome.resolve("bin/java");
    if (!Files.exists(javaBin)) return;
    try {
      Process p = new ProcessBuilder(javaBin.toString(), "-version").start();
      String stderr = new String(p.getErrorStream().readAllBytes());
      if (p.waitFor() != 0) return;

      Matcher m = VERSION_PATTERN.matcher(stderr);
      if (!m.find()) return;

      String major = m.group(1);
      String full = m.group(0).replace("\"", "");

      String vendor = source;
      if (stderr.contains("Zulu")) vendor = "Zulu";
      else if (stderr.contains("Temurin")) vendor = "Temurin";
      else if (stderr.contains("GraalVM")) vendor = "GraalVM";
      else if (stderr.contains("Oracle")) vendor = "Oracle";
      else if (stderr.contains("OpenJDK") || stderr.contains("openjdk")) vendor = "OpenJDK";

      out.put(resolved, new JdkInfo(major, full, resolved, vendor));
    } catch (Exception ignored) {
    }
  }

  private int parseMajor(String v) {
    try { return Integer.parseInt(v); }
    catch (Exception e) { return 0; }
  }
}
