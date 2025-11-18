package org.acme.kubernetes.dto;

import java.util.List;

public record VpaSummary(
        String namespace,
        String name,
        String targetKind,
        String targetName,
        String updateMode,
        List<String> controlledResources) {
}
