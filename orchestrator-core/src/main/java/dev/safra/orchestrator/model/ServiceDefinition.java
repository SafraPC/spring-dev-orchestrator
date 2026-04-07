package dev.safra.orchestrator.model;

import java.util.List;
import java.util.Map;

import lombok.Data;

@Data
public class ServiceDefinition {
  private String name;
  private String path;
  private List<String> command;
  private String logFile;
  private Map<String, String> env;
  private String javaHome;
  private String javaVersion;
  private List<String> containerIds;
}
