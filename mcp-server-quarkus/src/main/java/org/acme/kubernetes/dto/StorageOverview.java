package org.acme.kubernetes.dto;

import java.util.List;

public record StorageOverview(
        List<PersistentVolumeClaimInfo> persistentVolumeClaims,
        List<PersistentVolumeInfo> persistentVolumes) {
}
