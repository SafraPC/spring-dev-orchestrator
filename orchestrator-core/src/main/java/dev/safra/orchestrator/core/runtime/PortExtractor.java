package dev.safra.orchestrator.core.runtime;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

public class PortExtractor {
  private final StateStore store;

  public PortExtractor(StateStore store) {
    this.store = store;
  }

  public Optional<Integer> extract(Path serviceDir) {
    Optional<Integer> fromProps = extractFromProperties(serviceDir);
    if (fromProps.isPresent())
      return fromProps;
    return extractFromYaml(serviceDir);
  }

  private Optional<Integer> extractFromProperties(Path serviceDir) {
    Path[] files = {
        serviceDir.resolve("src/main/resources/application.properties"),
        serviceDir.resolve("src/main/resources/application-local.properties"),
        serviceDir.resolve("application.properties"),
        serviceDir.resolve("application-local.properties")
    };

    for (Path propsFile : files) {
      if (!Files.exists(propsFile))
        continue;
      String content = store.readSmallText(propsFile, 8192);
      if (content == null)
        continue;

      for (String line : content.split("\n")) {
        line = line.trim();
        if (line.isEmpty() || line.startsWith("#"))
          continue;
        if (line.startsWith("server.port") || line.startsWith("SERVER_PORT")) {
          String[] parts = line.split("=");
          if (parts.length >= 2) {
            try {
              String portStr = parts[1].trim().split("#")[0].trim();
              return Optional.of(Integer.parseInt(portStr));
            } catch (NumberFormatException ignored) {
            }
          }
        }
      }
    }
    return Optional.empty();
  }

  private Optional<Integer> extractFromYaml(Path serviceDir) {
    Path[] files = {
        serviceDir.resolve("src/main/resources/application.yml"),
        serviceDir.resolve("src/main/resources/application.yaml"),
        serviceDir.resolve("src/main/resources/application-local.yml"),
        serviceDir.resolve("src/main/resources/application-local.yaml"),
        serviceDir.resolve("application.yml"),
        serviceDir.resolve("application.yaml")
    };

    for (Path ymlFile : files) {
      if (!Files.exists(ymlFile))
        continue;
      String content = store.readSmallText(ymlFile, 8192);
      if (content == null)
        continue;

      String[] lines = content.split("\n");
      boolean inServerSection = false;
      int serverIndent = -1;

      for (String line : lines) {
        String trimmed = line.trim();
        if (trimmed.isEmpty() || trimmed.startsWith("#"))
          continue;
        if (trimmed.equals("---")) {
          inServerSection = false;
          serverIndent = -1;
          continue;
        }

        int indent = 0;
        for (int i = 0; i < line.length() && (line.charAt(i) == ' ' || line.charAt(i) == '\t'); i++) {
          indent++;
        }

        if (trimmed.startsWith("server:")) {
          inServerSection = true;
          serverIndent = indent;
          continue;
        }

        if (inServerSection) {
          if (indent <= serverIndent && !trimmed.startsWith("-") && !trimmed.isEmpty()) {
            inServerSection = false;
            continue;
          }
          if (trimmed.startsWith("port:") || trimmed.startsWith("port ")) {
            String portStr = trimmed.replaceFirst("^port:?", "").trim().split("#")[0].trim();
            portStr = stripQuotes(portStr);
            try {
              return Optional.of(Integer.parseInt(portStr));
            } catch (NumberFormatException ignored) {
            }
          }
        }
      }
    }
    return Optional.empty();
  }

  private String stripQuotes(String s) {
    if ((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.substring(1, s.length() - 1);
    }
    return s;
  }
}
