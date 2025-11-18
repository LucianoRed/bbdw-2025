package org.acme.kubernetes.dto;

import java.util.List;
import java.util.Map;

public record DeploymentSummary(
        String namespace,
        String name,
        int desiredReplicas,
        int readyReplicas,
        int availableReplicas,
        Map<String, String> labels,
        Map<String, String> selector,
        List<String> containers) {
}
