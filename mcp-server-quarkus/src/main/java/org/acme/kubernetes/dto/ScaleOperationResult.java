package org.acme.kubernetes.dto;

import java.time.Instant;

public record ScaleOperationResult(
        String namespace,
        String name,
        int requestedReplicas,
        int actualReplicas,
        Instant timestamp) {
}
