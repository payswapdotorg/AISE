package com.aise.field.fixtures

import com.aise.field.domain.model.*

object ProjectFixtures {

    val SAMPLE_PROJECT = Project(
        id = "proj-101",
        name = "Alpha Facility Inspection",
        description = "Building 42 Architectural Survey",
        createdAt = 1725321600000L,
        updatedAt = 1725321600000L
    )

    val SAMPLE_SESSION = CaptureSession(
        id = "session-201",
        projectId = "proj-101",
        intent = CaptureIntent.AS_BUILT,
        assuranceProfile = AssuranceProfile.HIGH_ASSURANCE,
        status = SessionStatus.DRAFT,
        createdAt = 1725321605000L
    )

    val SAMPLE_ASSET = CaptureAsset(
        id = "asset-301",
        sessionId = "session-201",
        assetType = AssetType.PHOTO,
        filePath = "/storage/emulated/0/AISE/captures/photo_001.jpg",
        status = AssetStatus.LOCAL_ONLY,
        createdAt = 1725321610000L
    )
}
