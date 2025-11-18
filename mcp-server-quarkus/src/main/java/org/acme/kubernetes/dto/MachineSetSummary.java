package org.acme.kubernetes.dto;

import java.util.Map;

public record MachineSetSummary(
        String namespace,
        String name,
        Integer replicas,
        Integer readyReplicas,
        Map<String, String> labels) {
}
