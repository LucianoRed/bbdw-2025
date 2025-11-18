package org.acme.kubernetes.dto;

import java.util.List;
import java.util.Map;

public record ServiceSummary(
        String namespace,
        String name,
        String type,
        String clusterIP,
        List<ServicePortInfo> ports,
        Map<String, String> selector,
        Map<String, String> labels) {
}
