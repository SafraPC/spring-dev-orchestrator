package dev.safra.orchestrator.core.runtime;

import java.util.ArrayList;
import java.util.UUID;
import java.util.function.Supplier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.safra.orchestrator.model.Container;
import dev.safra.orchestrator.model.ServiceDefinition;

public class ContainerManager {
  private final ObjectMapper om;
  private final Supplier<Workspace> workspaceSupplier;
  private final Runnable persistWorkspace;

  public ContainerManager(ObjectMapper om, Supplier<Workspace> workspaceSupplier, Runnable persistWorkspace) {
    this.om = om;
    this.workspaceSupplier = workspaceSupplier;
    this.persistWorkspace = persistWorkspace;
  }

  private Workspace ws() {
    return workspaceSupplier.get();
  }

  public JsonNode create(String name, String description) {
    if (name == null || name.isBlank())
      throw new IllegalArgumentException("params.name é obrigatório");

    String id = UUID.randomUUID().toString();
    Container container = new Container(id, name, description != null ? description : "");
    ws().getContainers().put(id, container);
    persistWorkspace.run();
    return om.valueToTree(container);
  }

  public JsonNode update(String id, String name, String description) {
    if (id == null || id.isBlank())
      throw new IllegalArgumentException("params.id é obrigatório");

    Container container = ws().getContainers().get(id);
    if (container == null)
      throw new IllegalArgumentException("Container não encontrado: " + id);

    if (name != null)
      container.setName(name);
    if (description != null)
      container.setDescription(description);

    persistWorkspace.run();
    return om.valueToTree(container);
  }

  public JsonNode delete(String id) {
    if (id == null || id.isBlank())
      throw new IllegalArgumentException("params.id é obrigatório");

    Workspace w = ws();
    Container removed = w.getContainers().remove(id);
    if (removed == null)
      throw new IllegalArgumentException("Container não encontrado: " + id);

    for (ServiceDefinition def : w.getServices()) {
      if (def.getContainerIds() != null) {
        def.getContainerIds().remove(id);
      }
    }

    persistWorkspace.run();
    return om.valueToTree(removed);
  }

  public JsonNode list() {
    return om.valueToTree(ws().getContainers().values());
  }

  public void addService(String serviceName, String containerId) {
    if (containerId == null || containerId.isBlank())
      throw new IllegalArgumentException("params.containerId é obrigatório");

    Workspace w = ws();
    if (!w.getContainers().containsKey(containerId))
      throw new IllegalArgumentException("Container não encontrado: " + containerId);

    ServiceDefinition def = w.getServices().stream()
        .filter(s -> s.getName().equals(serviceName))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Serviço não encontrado: " + serviceName));

    if (def.getContainerIds() == null) {
      def.setContainerIds(new ArrayList<>());
    }
    if (!def.getContainerIds().contains(containerId)) {
      def.getContainerIds().add(containerId);
    }
    persistWorkspace.run();
  }

  public void removeService(String serviceName, String containerId) {
    if (containerId == null || containerId.isBlank())
      throw new IllegalArgumentException("params.containerId é obrigatório");

    ServiceDefinition def = ws().getServices().stream()
        .filter(s -> s.getName().equals(serviceName))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Serviço não encontrado: " + serviceName));

    if (def.getContainerIds() != null) {
      def.getContainerIds().remove(containerId);
    }
    persistWorkspace.run();
  }
}
