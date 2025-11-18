package org.acme.kubernetes.dto;

import java.time.Instant;

public record EventInfo(
        String namespace,
        String involvedKind,
        String involvedName,
        String type,
        String reason,
        String message,
        Instant lastTimestamp,
        Integer count) {
}
