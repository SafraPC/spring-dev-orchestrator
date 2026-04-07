package dev.safra.orchestrator.core.runtime;

import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

public class LogSubscription {
  private final String subId;
  private final String service;
  private final Path file;
  private final int tailLines;
  private final AtomicBoolean shutdown;
  private final Consumer<String> onLine;

  private final Duration pollInterval = Duration.ofMillis(250);
  private final AtomicBoolean running = new AtomicBoolean(false);
  private Thread t;

  public LogSubscription(String subId, String service, Path file, int tailLines, AtomicBoolean shutdown,
      Consumer<String> onLine) {
    this.subId = subId;
    this.service = service;
    this.file = file;
    this.tailLines = tailLines;
    this.shutdown = shutdown;
    this.onLine = onLine;
  }

  public void start() {
    if (!running.compareAndSet(false, true))
      return;
    t = new Thread(this::loop, "log-tail-" + service + "-" + subId);
    t.setDaemon(true);
    t.start();
  }

  public void stop() {
    running.set(false);
    if (t != null)
      t.interrupt();
  }

  public String getService() {
    return service;
  }

  private void loop() {
    int waitAttempts = 0;
    int maxWaitAttempts = 120;
    long pollMs = 50;

    while (!Files.exists(file) && waitAttempts < maxWaitAttempts && running.get() && !shutdown.get()) {
      try {
        Thread.sleep(pollMs);
        waitAttempts++;
        if (waitAttempts > 100) {
          pollMs = pollInterval.toMillis();
        }
        if (waitAttempts % 40 == 0) {
          onLine
              .accept("[logTail] ⏳ Aguardando criação do arquivo de log... (" + (waitAttempts * pollMs / 1000) + "s)");
        }
      } catch (InterruptedException ignored) {
        return;
      }
    }

    if (!Files.exists(file)) {
      onLine.accept("[logTail] ⚠️ Arquivo de log não encontrado após " + (waitAttempts * pollMs / 1000) + " segundos: "
          + file.getFileName());
      onLine.accept("[logTail] O processo pode ter falhado ao iniciar. Verifique os logs de erro.");
    } else {
      onLine.accept("[logTail] ✓ Arquivo de log encontrado, iniciando leitura...");
    }

    AtomicLong pos = new AtomicLong(0);
    AtomicReference<String> carry = new AtomicReference<>("");

    if (Files.exists(file)) {
      try {
        long fileSize = Files.size(file);
        pos.set(fileSize);

        List<String> lastLines = readLastLines(file, tailLines);
        for (String l : lastLines) {
          if (l != null)
            onLine.accept(l);
        }
        if (lastLines.isEmpty()) {
          onLine.accept("[logTail] Arquivo de log existe mas está vazio. Aguardando logs do processo...");
        }
      } catch (Exception e) {
        e.printStackTrace();
        pos.set(0);
      }
    } else {
      pos.set(0);
    }

    while (running.get() && !shutdown.get()) {
      try {
        if (Files.exists(file)) {
          List<String> lines = readNewLines(file, pos, carry);
          if (!lines.isEmpty()) {
            for (String l : lines) {
              if (l != null)
                onLine.accept(l);
            }
          } else {
            long currentSize = Files.size(file);
            if (currentSize < pos.get()) {
              pos.set(0);
              carry.set("");
            }
          }
        }
      } catch (java.io.IOException e) {
        pos.set(0);
        carry.set("");
        if (running.get() && !shutdown.get()) {
          onLine.accept("[logTail] ⚠️ Erro de leitura: " + e.getMessage() + " - Tentando novamente...");
        }
      } catch (Exception e) {
        e.printStackTrace();
        if (running.get() && !shutdown.get()) {
          onLine.accept("[logTail] ❌ Erro inesperado: " + e.getMessage());
        }
      }
      try {
        Thread.sleep(pollInterval.toMillis());
      } catch (InterruptedException ignored) {
        break;
      }
    }
  }

  private static List<String> readNewLines(Path file, AtomicLong pos, AtomicReference<String> carry) throws Exception {
    if (!Files.exists(file))
      return List.of();
    try (RandomAccessFile raf = new RandomAccessFile(file.toFile(), "r")) {
      long len = raf.length();
      long p = pos.get();
      if (p > len) {
        p = 0;
        pos.set(0);
        carry.set("");
      }
      if (p == len)
        return List.of();

      raf.seek(p);
      byte[] bytes = new byte[(int) (len - p)];
      raf.readFully(bytes);
      pos.set(len);

      String chunk = new String(bytes, StandardCharsets.UTF_8);
      String combined = carry.get() + chunk;
      String[] split = combined.split("\\R", -1);

      List<String> out = new ArrayList<>();
      for (int i = 0; i < split.length - 1; i++)
        out.add(split[i]);
      String last = split[split.length - 1];
      if (combined.endsWith("\n") || combined.endsWith("\r")) {
        carry.set("");
      } else {
        carry.set(last);
      }
      return out;
    }
  }

  private static List<String> readLastLines(Path file, int maxLines) {
    try {
      if (maxLines <= 0)
        return List.of();
      if (!Files.exists(file))
        return List.of();
      try (RandomAccessFile raf = new RandomAccessFile(file.toFile(), "r")) {
        long len = raf.length();
        if (len == 0)
          return List.of();

        long pos = len - 1;
        int lines = 0;
        while (pos >= 0 && lines < maxLines) {
          raf.seek(pos);
          int b = raf.read();
          if (b == '\n')
            lines++;
          pos--;
        }
        long start = Math.max(0, pos + 1);
        raf.seek(start);
        byte[] bytes = new byte[(int) (len - start)];
        raf.readFully(bytes);
        String txt = new String(bytes, StandardCharsets.UTF_8);
        String[] split = txt.split("\\R");
        List<String> out = new ArrayList<>();
        for (String s : split)
          if (!s.isEmpty())
            out.add(s);
        if (out.size() > maxLines)
          return out.subList(out.size() - maxLines, out.size());
        return out;
      }
    } catch (Exception e) {
      return List.of("[logTail] erro ao ler últimas linhas: " + e.getMessage());
    }
  }
}
