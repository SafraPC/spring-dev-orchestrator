package dev.safra.orchestrator.core.runtime;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import dev.safra.orchestrator.model.ProjectType;
import dev.safra.orchestrator.model.ServiceStatus;

public record ServiceView(
        String name,
        String path,
        List<String> command,
        String logFile,
        Map<String, String> env,
        String javaHome,
        String javaVersion,
        List<String> containerIds,
        ProjectType projectType,
        List<String> availableScripts,
        Long pid,
        ServiceStatus status,
        Instant lastStartAt,
        Instant lastStopAt,
        String lastError) {
}
