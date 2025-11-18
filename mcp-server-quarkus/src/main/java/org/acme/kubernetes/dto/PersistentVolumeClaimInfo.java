package org.acme.kubernetes.dto;

public record PersistentVolumeClaimInfo(
        String namespace,
        String name,
        String status,
        String storageClass,
        String volumeName,
        String requestedStorage) {
}
