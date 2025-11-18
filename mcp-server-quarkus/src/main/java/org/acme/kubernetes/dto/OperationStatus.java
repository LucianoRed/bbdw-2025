package org.acme.kubernetes.dto;

import java.time.Instant;

public record OperationStatus(
        String action,
        String target,
        boolean success,
        String message,
        Instant timestamp) {
}
