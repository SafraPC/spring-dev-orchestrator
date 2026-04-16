package dev.safra.orchestrator.process;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public final class WindowsCommandResolver {
  private WindowsCommandResolver() {
  }

  public static Optional<Path> resolvePowerShell() {
    return resolveFromPath("powershell.exe")
        .or(() -> resolveFromPath("pwsh.exe"))
        .or(() -> resolveFromSystemRoot("System32", "WindowsPowerShell", "v1.0", "powershell.exe"))
        .or(() -> resolveFromProgramFiles("PowerShell", "7", "pwsh.exe"))
        .or(() -> resolveFromProgramFilesX86("PowerShell", "7", "pwsh.exe"));
  }

  private static Optional<Path> resolveFromPath(String executable) {
    String path = System.getenv("PATH");
    if (path == null || path.isBlank()) {
      return Optional.empty();
    }
    for (String entry : path.split(File.pathSeparator)) {
      if (entry == null || entry.isBlank()) {
        continue;
      }
      Path candidate = Path.of(entry, executable);
      if (Files.isRegularFile(candidate)) {
        return Optional.of(candidate);
      }
    }
    return Optional.empty();
  }

  private static Optional<Path> resolveFromSystemRoot(String first, String... more) {
    String root = System.getenv("SystemRoot");
    return resolveAbsolute(root, first, more);
  }

  private static Optional<Path> resolveFromProgramFiles(String first, String... more) {
    String root = System.getenv("ProgramFiles");
    return resolveAbsolute(root, first, more);
  }

  private static Optional<Path> resolveFromProgramFilesX86(String first, String... more) {
    String root = System.getenv("ProgramFiles(x86)");
    return resolveAbsolute(root, first, more);
  }

  private static Optional<Path> resolveAbsolute(String root, String first, String... more) {
    if (root == null || root.isBlank()) {
      return Optional.empty();
    }
    List<String> segments = new ArrayList<>();
    segments.add(first);
    for (String segment : more) {
      segments.add(segment);
    }
    Path candidate = Path.of(root, segments.toArray(String[]::new));
    return Files.isRegularFile(candidate) ? Optional.of(candidate) : Optional.empty();
  }
}
