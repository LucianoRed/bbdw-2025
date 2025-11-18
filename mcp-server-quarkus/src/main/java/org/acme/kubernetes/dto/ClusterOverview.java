package org.acme.kubernetes.dto;

import java.util.List;
import java.util.Map;

public record ClusterOverview(
        int namespaces,
        int nodes,
        int deployments,
        int pods,
        Map<String, Integer> podPhases,
        NodeCapacity capacityTotals,
        List<NodeCapacity> nodeCapacities) {
}
