package org.acme.kubernetes.dto;

public record PodLogsResult(
        String namespace,
        String pod,
        String container,
        int tailLines,
        int byteLimit,
        String logs) {
}
