package org.acme.kubernetes.dto;

import java.util.Map;

public record BinpackingNode(
        String nodeName,
        int runningPods,
        Map<String, Integer> podsByNamespace,
        Map<String, String> conditions,
        Map<String, String> capacity) {
}
