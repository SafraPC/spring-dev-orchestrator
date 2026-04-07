package dev.safra.orchestrator.model;

import lombok.Data;

@Data
public class ServiceDescriptor {
  private ServiceDefinition definition;
  private ServiceRuntime runtime = new ServiceRuntime();
}
