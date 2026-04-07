package dev.safra.orchestrator.process;

import lombok.Value;

@Value
public class StopResult {
  boolean ok;
  String message;
  long pid;

  public static StopResult stopped(long pid, String signal) {
    return new StopResult(true, "Processo finalizado (" + signal + ")", pid);
  }

  public static StopResult alreadyStopped(long pid) {
    return new StopResult(true, "Processo já estava parado", pid);
  }

  public static StopResult noPid() {
    return new StopResult(true, "Serviço não possui PID registrado", 0);
  }

  public static StopResult notFound(long pid) {
    return new StopResult(true, "PID não encontrado no SO", pid);
  }

  public static StopResult failed(long pid, String reason) {
    return new StopResult(false, reason, pid);
  }
}
