/**
 * Conversion tests (AISE-012): exact hand-computed numeric outputs for the
 * deterministic camera/pose/scale conversion into the WorldSculpt engine
 * frame. All expected values were computed by hand from the conventions
 * documented in conversion.ts / backend.ts.
 */

import { describe, expect, test } from "bun:test";
import {
  CONVENTION_ROTATION_X180,
  applyTransform4x4,
  convertIntrinsicsToEngine,
  convertPoseToEngineFrame,
  engineScaleDeclaration,
  metersPerUnit,
  multiplyMatrix3,
  type AiseCameraPose,
} from "./conversion";

const IDENTITY = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
] as const;

const ROT_Y_90 = [
  [0, 0, 1],
  [0, 1, 0],
  [-1, 0, 0],
] as const;

describe("scale conversion", () => {
  test("metersPerUnit: millimeter → 0.001, meter → 1", () => {
    expect(metersPerUnit("millimeter")).toBe(0.001);
    expect(metersPerUnit("meter")).toBe(1);
  });

  test("engineScaleDeclaration: supported metric constraints map onto the engine's meter-based metric scale; others are unsupported", () => {
    expect(engineScaleDeclaration(null)).toBe("metric-meters");
    expect(engineScaleDeclaration("metric")).toBe("metric-meters");
    expect(engineScaleDeclaration("metric-meter")).toBe("metric-meters");
    expect(engineScaleDeclaration("metric-millimeter")).toBe("metric-meters");
    expect(engineScaleDeclaration("imperial-feet")).toBeNull();
  });
});

describe("camera intrinsics conversion (pixels → normalized)", () => {
  test("focal lengths and principal point divide by width/height", () => {
    const converted = convertIntrinsicsToEngine({
      fxPixels: 640,
      fyPixels: 720,
      cxPixels: 640,
      cyPixels: 360,
      widthPixels: 1280,
      heightPixels: 720,
    });
    expect(converted.fx).toBe(0.5); // 640 / 1280
    expect(converted.fy).toBe(1); // 720 / 720
    expect(converted.cx).toBe(0.5); // 640 / 1280
    expect(converted.cy).toBe(0.5); // 360 / 720
    expect(converted.widthPixels).toBe(1280);
    expect(converted.heightPixels).toBe(720);
  });
});

describe("camera pose conversion (AISE y-down/z-forward → engine y-up/−z-forward)", () => {
  test("identity rotation, millimeter translation → meters with Rx(180°) rotation", () => {
    const pose: AiseCameraPose = {
      position: [1000, -2000, 3000],
      rotation: IDENTITY,
      unit: "millimeter",
    };
    const converted = convertPoseToEngineFrame(pose, 3);
    expect(converted.frameIndex).toBe(3);
    expect(converted.position).toEqual([1, -2, 3]);
    expect(converted.rotation).toEqual([
      [1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
    ]);
  });

  test("meter pose keeps its magnitude; rotation is Rx(180°)·R (hand-computed Ry(90°) case)", () => {
    const pose: AiseCameraPose = {
      position: [2, 3, 5],
      rotation: ROT_Y_90,
      unit: "meter",
    };
    const converted = convertPoseToEngineFrame(pose, 0);
    expect(converted.position).toEqual([2, 3, 5]);
    // Rx(180°) · Ry(90°) = [[0,0,1],[0,-1,0],[1,0,0]]
    expect(converted.rotation).toEqual([
      [0, 0, 1],
      [0, -1, 0],
      [1, 0, 0],
    ]);
  });

  test("multiplyMatrix3: identity is neutral; Rx(180°) flips y and z rows", () => {
    expect(multiplyMatrix3(IDENTITY, ROT_Y_90)).toEqual(ROT_Y_90);
    expect(multiplyMatrix3(CONVENTION_ROTATION_X180, IDENTITY)).toEqual([
      [1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
    ]);
  });
});

describe("4×4 transform application (scene mesh normalization)", () => {
  const IDENTITY4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
  const TRANSLATE_X_10 = [1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
  const ROT_Y_90_4 = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1] as const;

  test("identity leaves the point unchanged", () => {
    expect(applyTransform4x4(IDENTITY4, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  test("pure translation adds to the point (hand-computed)", () => {
    expect(applyTransform4x4(TRANSLATE_X_10, [1, 2, 3])).toEqual([11, 2, 3]);
  });

  test("Ry(90°) maps (1,0,0) → (0,0,−1) (hand-computed)", () => {
    expect(applyTransform4x4(ROT_Y_90_4, [1, 0, 0])).toEqual([0, 0, -1]);
  });
});
