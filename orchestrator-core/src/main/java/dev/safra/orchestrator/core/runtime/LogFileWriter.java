package dev.safra.orchestrator.core.runtime;

import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class LogFileWriter {
  private static PrintWriter writer;
  private static Path logFile;

  public static void initialize(Path stateDir) {
    try {
      logFile = stateDir.resolve("orchestrator-debug.log");
      writer = new PrintWriter(new FileWriter(logFile.toFile(), true));
      log("=== Orchestrator Core Iniciado ===");
    } catch (IOException e) {
      System.err.println("Erro ao inicializar LogFileWriter: " + e.getMessage());
    }
  }

  public static void log(String message) {
    String timestamp = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    String logLine = "[" + timestamp + "] " + message;

    if (writer != null) {
      writer.println(logLine);
      writer.flush();
    }

    System.err.println(logLine);
  }

  public static void close() {
    if (writer != null) {
      log("=== Orchestrator Core Encerrado ===");
      writer.close();
    }
  }
}
