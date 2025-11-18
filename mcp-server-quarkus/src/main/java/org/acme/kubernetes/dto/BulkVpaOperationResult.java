package org.acme.kubernetes.dto;

import java.util.List;

public record BulkVpaOperationResult(
        String namespace,
        int created,
        int skipped,
        List<VpaSummary> vpas) {
}
