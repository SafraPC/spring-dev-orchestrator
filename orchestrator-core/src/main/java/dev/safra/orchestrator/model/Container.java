package dev.safra.orchestrator.model;

import lombok.Data;

@Data
public class Container {
  private String id;
  private String name;
  private String description;

  public Container() {
  }

  public Container(String id, String name, String description) {
    this.id = id;
    this.name = name;
    this.description = description;
  }
}
