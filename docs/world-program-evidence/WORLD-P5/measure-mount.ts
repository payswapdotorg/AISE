/**
 * WORLD-P5 — the BROWSER measurement mount (the software-render legs
 * of the measurement protocol). Bundled by measure.ts with esbuild
 * and driven by Playwright; NOT a product surface.
 *
 * The mount exposes window.__P5_MEASURE__ over ONE fixture (the size
 * is injected by rewriting the FIXTURE_SIZE token before bundling —
 * the corpus generator is shared with the Node legs, so both legs
 * measure the SAME deterministic world).
 */

import { createBabylonSceneRuntime } from "@aise/world-scene-runtime";
import type { BabylonSceneRuntime } from "@aise/world-scene-runtime";
import { viewportFixture, FIXTURE_SIZES } from "./corpus";

/* The fixture size is injected by the harness (token rewrite). */
const FIXTURE_SIZE = 10 as (typeof FIXTURE_SIZES)[number];

declare global {
  interface Window {
    __P5_MEASURE__?: {
      readonly fixtureSize: number;
      readonly renderer: string;
      readonly vendor: string;
      readonly version: string;
      warmup(): { ticks: number; drawCalls: number; activeMeshes: number };
      /** Time 25 render passes; returns per-frame ms (raw). */
      measureFrames(runs: number): number[];
      drawCalls(): number;
      activeMeshes(): number;
      dispose(): void;
    };
  }
}

function mount(): void {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  document.body.appendChild(canvas);
  const fixture = viewportFixture(FIXTURE_SIZE);
  const runtimeOutcome = createBabylonSceneRuntime({
    engine: { mode: "webgl", canvas },
    geometry: (ref) => {
      const box = fixture.boxes.get(ref.assetId);
      return box === undefined
        ? null
        : { kind: "box" as const, min: box.min, max: box.max };
    },
  });
  if (!runtimeOutcome.ok) {
    throw new Error(`runtime creation failed: ${runtimeOutcome.failure.detail}`);
  }
  const runtime: BabylonSceneRuntime = runtimeOutcome.value;
  const load = runtime.loadScene(fixture.scene);
  if (!load.ok) {
    throw new Error(`loadScene failed: ${load.failure.detail}`);
  }
  const handle = load.value;
  runtime.setCamera(handle, fixture.camera);
  runtime.renderOnce(handle);

  let disposed = false;
  window.__P5_MEASURE__ = {
    fixtureSize: FIXTURE_SIZE,
    renderer: runtime.rendererInfo()?.renderer ?? "unknown",
    vendor: runtime.rendererInfo()?.vendor ?? "unknown",
    version: runtime.rendererInfo()?.version ?? "unknown",
    warmup(): { ticks: number; drawCalls: number; activeMeshes: number } {
      let ticks = 0;
      for (;;) {
        runtime.renderOnce(handle);
        ticks += 1;
        const stats = runtime.frameStats(handle);
        if ((stats.ok && stats.value.drawCalls > 0) || ticks >= 60) break;
      }
      const stats = runtime.frameStats(handle);
      return {
        ticks,
        drawCalls: stats.ok ? stats.value.drawCalls : -1,
        activeMeshes: stats.ok ? stats.value.activeMeshes : -1,
      };
    },
    measureFrames(runs: number): number[] {
      const samples: number[] = [];
      for (let i = 0; i < runs; i++) {
        const start = performance.now();
        runtime.renderOnce(handle);
        samples.push(performance.now() - start);
      }
      return samples;
    },
    drawCalls(): number {
      const stats = runtime.frameStats(handle);
      return stats.ok ? stats.value.drawCalls : -1;
    },
    activeMeshes(): number {
      const stats = runtime.frameStats(handle);
      return stats.ok ? stats.value.activeMeshes : -1;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      runtime.dispose(handle);
      runtime.shutdown();
    },
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount());
  } else {
    mount();
  }
}
