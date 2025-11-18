package org.acme.kubernetes.dto;

import java.util.List;
import java.util.Map;

public record BinpackingSummary(
        String scope,
        List<BinpackingNode> nodes,
        Map<String, Integer> namespacePodTotals) {
}
