package org.acme.kubernetes.dto;

import java.time.Instant;

public record EnvVarPatchResult(
        String namespace,
        String deployment,
        String container,
        String variable,
        String value,
        String action,
        Instant timestamp) {
}
