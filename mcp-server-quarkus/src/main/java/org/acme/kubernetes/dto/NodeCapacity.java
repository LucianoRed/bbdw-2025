package org.acme.kubernetes.dto;

import java.util.Map;

public record NodeCapacity(
        String name,
        Map<String, String> capacity,
        Map<String, String> allocatable,
        Map<String, String> labels) {
}
