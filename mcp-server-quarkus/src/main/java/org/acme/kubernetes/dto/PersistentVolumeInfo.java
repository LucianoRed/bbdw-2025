package org.acme.kubernetes.dto;

import java.util.List;

public record PersistentVolumeInfo(
        String name,
        String status,
        String storageClass,
        String capacity,
        List<String> accessModes) {
}
