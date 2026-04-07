package dev.safra.orchestrator.core.runtime;

import java.io.BufferedInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

public class StateStore {
  private final ObjectMapper om;

  public StateStore(ObjectMapper om) {
    this.om = om;
  }

  public <T> Optional<T> readJson(Path file, Class<T> type) {
    try {
      if (!Files.exists(file))
        return Optional.empty();
      byte[] bytes = Files.readAllBytes(file);
      if (bytes.length == 0)
        return Optional.empty();
      return Optional.of(om.readValue(bytes, type));
    } catch (Exception e) {
      backupCorrupt(file);
      return Optional.empty();
    }
  }

  public <T> Optional<T> readJson(Path file, TypeReference<T> type) {
    try {
      if (!Files.exists(file))
        return Optional.empty();
      byte[] bytes = Files.readAllBytes(file);
      if (bytes.length == 0)
        return Optional.empty();
      return Optional.of(om.readValue(bytes, type));
    } catch (Exception e) {
      backupCorrupt(file);
      return Optional.empty();
    }
  }

  public void writeJson(Path file, Object value) {
    try {
      Files.createDirectories(file.getParent());
      byte[] bytes = om.writerWithDefaultPrettyPrinter().writeValueAsBytes(value);
      Files.write(file, bytes);
    } catch (Exception e) {
      throw new IllegalStateException("Falha ao salvar: " + file, e);
    }
  }

  public String readSmallText(Path file, int maxBytes) {
    try {
      if (!Files.exists(file))
        return null;
      long size = Files.size(file);
      int read = (int) Math.min(size, maxBytes);
      byte[] buf = new byte[read];
      try (BufferedInputStream in = new BufferedInputStream(Files.newInputStream(file))) {
        int n = in.read(buf);
        if (n <= 0)
          return null;
        return new String(buf, 0, n, StandardCharsets.UTF_8);
      }
    } catch (Exception e) {
      return null;
    }
  }

  private void backupCorrupt(Path file) {
    try {
      Files.move(file, file.resolveSibling(file.getFileName() + ".bak-" + System.currentTimeMillis()));
    } catch (Exception ignored) {
    }
  }
}
