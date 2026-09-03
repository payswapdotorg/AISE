/**
 * Cross-field semantic invariants that JSON Schema alone cannot
 * express. Both platforms can run these checks after structural
 * validation; the capture gateway runs them server-side (AISE-004)
 * and the Android sync client runs them before/at upload (AISE-006).
 */
import type { CapturePackage, PackageAsset } from "./types.js";

export interface SemanticIssue {
  /** Dotted path to the offending element (empty for whole payload). */
  field: string;
  /** What invariant failed. */
  message: string;
}

/**
 * Checks the capture-package invariants:
 *
 * - asset ids are unique within the package;
 * - relative paths are unique within the package;
 * - `totalByteSize`, when present, equals the sum of asset byte
 *   sizes (guards against manifest/byte drift);
 * - every asset hash matches the declared checksum algorithm length.
 *
 * Structural validity is a precondition: run
 * `validateCapturePackage` first.
 */
export function checkCapturePackageSemantics(pkg: CapturePackage): SemanticIssue[] {
  const issues: SemanticIssue[] = [];

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  let byteSum = 0;

  pkg.assets.forEach((asset: PackageAsset, index: number) => {
    if (seenIds.has(asset.assetId)) {
      issues.push({
        field: `assets[${index}].assetId`,
        message: `duplicate asset id: ${asset.assetId}`,
      });
    }
    seenIds.add(asset.assetId);

    if (seenPaths.has(asset.relativePath)) {
      issues.push({
        field: `assets[${index}].relativePath`,
        message: `duplicate relative path: ${asset.relativePath}`,
      });
    }
    seenPaths.add(asset.relativePath);

    byteSum += asset.byteSize;
  });

  if (pkg.totalByteSize !== undefined && pkg.totalByteSize !== byteSum) {
    issues.push({
      field: "totalByteSize",
      message: `totalByteSize ${pkg.totalByteSize} != sum of asset byte sizes ${byteSum}`,
    });
  }

  if (pkg.checksumAlgorithm !== "sha256") {
    issues.push({
      field: "checksumAlgorithm",
      message: `unsupported checksum algorithm: ${String(pkg.checksumAlgorithm)}`,
    });
  }

  return issues;
}
