package dev.safra.orchestrator.model;

import java.time.Instant;

import lombok.Data;

@Data
public class ServiceRuntime {
  private Long pid;
  private ServiceStatus status = ServiceStatus.STOPPED;
  private Instant lastStartAt;
  private Instant lastStopAt;
  private String lastError;
}
