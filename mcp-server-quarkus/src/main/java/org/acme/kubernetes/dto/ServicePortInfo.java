package org.acme.kubernetes.dto;

public record ServicePortInfo(
        String name,
        String protocol,
        Integer port,
        Integer targetPort,
        Integer nodePort) {
}
