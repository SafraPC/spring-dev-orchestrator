package dev.safra.orchestrator.core.runtime;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class ExternalToolLauncher {

  public void openFolder(Path servicePath) {
    try {
      String os = System.getProperty("os.name").toLowerCase();
      ProcessBuilder pb;

      if (os.contains("win")) {
        pb = new ProcessBuilder("explorer", servicePath.toString());
      } else if (os.contains("mac")) {
        pb = new ProcessBuilder("open", servicePath.toString());
      } else {
        pb = new ProcessBuilder("xdg-open", servicePath.toString());
      }

      pb.start();
    } catch (Exception e) {
      throw new IllegalStateException("Erro ao abrir pasta: " + e.getMessage(), e);
    }
  }

  public void openTerminal(Path servicePath) {
    try {
      String os = System.getProperty("os.name").toLowerCase();
      ProcessBuilder pb;

      if (os.contains("win")) {
        pb = new ProcessBuilder("cmd", "/c", "start", "cmd", "/k", "cd", "/d", servicePath.toString());
      } else if (os.contains("mac")) {
        pb = launchMacTerminal(servicePath);
      } else {
        pb = launchLinuxTerminal(servicePath);
      }

      pb.start();
    } catch (Exception e) {
      throw new IllegalStateException("Erro ao abrir terminal: " + e.getMessage(), e);
    }
  }

  public void openEditor(Path servicePath) {
    try {
      String os = System.getProperty("os.name").toLowerCase();
      ProcessBuilder pb = findEditor(os, servicePath);
      pb.start();
    } catch (Exception e) {
      throw new IllegalStateException("Erro ao abrir editor: " + e.getMessage(), e);
    }
  }

  private ProcessBuilder launchMacTerminal(Path path) throws Exception {
    try {
      Process test = new ProcessBuilder("which", "warp").start();
      if (test.waitFor() == 0) {
        return new ProcessBuilder("warp", "terminal", "--directory", path.toString());
      }
    } catch (Exception ignored) {
    }

    String script = "tell application \"Terminal\"\n"
        + "  activate\n"
        + "  do script \"cd '" + path.toString().replace("'", "\\'") + "'\"\n"
        + "end tell";
    return new ProcessBuilder("osascript", "-e", script);
  }

  private ProcessBuilder launchLinuxTerminal(Path path) {
    String[] terminals = { "gnome-terminal", "konsole", "xterm", "terminator" };
    for (String term : terminals) {
      try {
        Process test = new ProcessBuilder("which", term).start();
        if (test.waitFor() == 0) {
          return switch (term) {
            case "gnome-terminal" -> new ProcessBuilder(term, "--working-directory", path.toString());
            case "konsole" -> new ProcessBuilder(term, "--workdir", path.toString());
            default -> new ProcessBuilder(term, "-e", "bash", "-c", "cd '" + path + "' && exec bash");
          };
        }
      } catch (Exception ignored) {
      }
    }
    throw new IllegalStateException("Nenhum terminal encontrado. Instale gnome-terminal, konsole ou xterm");
  }

  private ProcessBuilder findEditor(String os, Path path) throws Exception {
    if (os.contains("win")) {
      return findWindowsEditor(path);
    }
    String[] editors = { "cursor", "code" };
    String whichCmd = "which";

    for (String editor : editors) {
      try {
        Process test = new ProcessBuilder(whichCmd, editor).start();
        if (test.waitFor() == 0) {
          return new ProcessBuilder(editor, path.toString());
        }
      } catch (Exception ignored) {
      }
    }

    if (os.contains("mac")) {
      return new ProcessBuilder("open", "-a", "Cursor", path.toString());
    }

    throw new IllegalStateException("Nenhum editor encontrado. Instale Cursor ou VSCode e adicione ao PATH");
  }

  private ProcessBuilder findWindowsEditor(Path path) throws Exception {
    String[] aliases = { "cursor", "code", "code-insiders" };
    for (String alias : aliases) {
      try {
        Process test = new ProcessBuilder("where", alias).start();
        if (test.waitFor() == 0) {
          return new ProcessBuilder("cmd", "/c", "start", "", alias, path.toString());
        }
      } catch (Exception ignored) {
      }
    }
    String local = System.getenv("LOCALAPPDATA");
    String user = System.getenv("USERPROFILE");
    List<Path> candidates = new ArrayList<>();
    if (local != null && !local.isBlank()) {
      candidates.add(Path.of(local, "Programs", "Cursor", "Cursor.exe"));
      candidates.add(Path.of(local, "Programs", "cursor", "Cursor.exe"));
      candidates.add(Path.of(local, "Programs", "Microsoft VS Code", "Code.exe"));
      candidates.add(Path.of(local, "Programs", "Microsoft VS Code Insiders", "Code - Insiders.exe"));
    }
    if (user != null && !user.isBlank()) {
      candidates.add(Path.of(user, "AppData", "Local", "Programs", "Cursor", "Cursor.exe"));
      candidates.add(Path.of(user, "AppData", "Local", "Programs", "Microsoft VS Code", "Code.exe"));
      candidates.add(Path.of(user, "AppData", "Local", "Programs", "Microsoft VS Code Insiders", "Code - Insiders.exe"));
    }
    for (Path exe : candidates) {
      if (Files.exists(exe)) {
        return new ProcessBuilder(exe.toString(), path.toString());
      }
    }
    throw new IllegalStateException("Nenhum editor encontrado. Instale Cursor ou VSCode");
  }
}
