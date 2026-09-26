/**
 * GBIM-003 — the Three.js 3D viewport (PRESENTATION ADAPTER ONLY).
 *
 * Laws implemented here (work-order acceptance):
 *  - the scene NEVER mutates canonical state: it emits selection/hover/
 *    placement/measure events upward and renders `SceneElementSeed`s whose
 *    AISE references were derived server-side;
 *  - sectioning (a clipping plane) and every other visual effect are local
 *    renderer state — they cannot reach quantities or validation;
 *  - Three.js object ids (mesh uuids) are EXTERNAL references, exposed for
 *    the inspector as such, never used as AISE identity.
 *
 * Spike-only code (NOT production engine code).
 */

"use client";

import { useEffect, useRef, useState } from "react";
import type * as ThreeNS from "three";
import type { PlacementPoint, SceneElementSeed, SandboxViewState } from "../../types";
import { layout } from "../styles";

export interface Scene3DProps {
  readonly seeds: readonly SceneElementSeed[];
  readonly viewState: SandboxViewState;
  readonly measureMode: boolean;
  readonly placingActive: boolean;
  readonly externalRefs: ReadonlyMap<string, string>;
  readonly onSelect: (aiseId: string | null) => void;
  readonly onHover: (aiseId: string | null) => void;
  readonly onViewChange: (azimuthDeg: number, elevationDeg: number) => void;
  readonly onGroundClick: (point: PlacementPoint) => void;
  readonly onRendererUnavailable: (reason: string) => void;
  readonly onSceneRefs?: (refs: ReadonlyMap<string, string>) => void;
}

interface MeasureState {
  readonly points: readonly { readonly x: number; readonly y: number; readonly z: number }[];
  readonly distanceM: number | null;
}

const KIND_COLORS: Record<string, number> = {
  wall: 0xb8b2a6,
  partition: 0xd9c9a8,
  slab: 0xc9c9c9,
  footing: 0xa8a29a,
  column: 0xb5a793,
  beam: 0xc4ad8b,
  roof: 0x8fa3b8,
  "opening-door": 0x7d9c6c,
  "opening-window": 0x7ba0af,
  room: 0x999999,
  proposed: 0x5f83b5,
};

export function Scene3D(props: Scene3DProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [measure, setMeasure] = useState<MeasureState>({ points: [], distanceM: null });
  const measureRef = useRef<MeasureState>({ points: [], distanceM: null });
  const stateRef = useRef(props);
  stateRef.current = props;

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const init = async (): Promise<void> => {
      let THREE: typeof ThreeNS;
      try {
        THREE = (await import("three")) as typeof ThreeNS;
      } catch (error) {
        if (!disposed) {
          props.onRendererUnavailable(error instanceof Error ? error.message : String(error));
        }
        return;
      }
      const canvas = canvasRef.current;
      if (canvas === null || disposed) {
        return;
      }

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.localClippingEnabled = true;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeceae6);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x888877, 1.0));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(12, 18, 8);
      scene.add(sun);

      const grid = new THREE.GridHelper(24, 48, 0xbbb7ae, 0xd6d2ca);
      scene.add(grid);

      const contentGroup = new THREE.Group();
      scene.add(contentGroup);

      const materials: ThreeNS.Material[] = [];
      const geometries: ThreeNS.BufferGeometry[] = [];

      const buildMeshes = (): void => {
        const sceneRefs = new Map<string, string>();
        for (const child of [...contentGroup.children]) {
          contentGroup.remove(child);
        }
        for (const material of materials) {
          material.dispose();
        }
        materials.length = 0;
        for (const geometry of geometries) {
          geometry.dispose();
        }
        geometries.length = 0;

        for (const seed of stateRef.current.seeds) {
          const color = KIND_COLORS[seed.kind] ?? 0x999999;
          const isSelected = seed.aiseId === stateRef.current.viewState.selectedAiseId;
          const isHovered = seed.aiseId === stateRef.current.viewState.hoveredAiseId;
          if (seed.kind === "room") {
            const boxGeometry = new THREE.BoxGeometry(seed.box.sx, seed.box.sy, seed.box.sz);
            const edges = new THREE.EdgesGeometry(boxGeometry);
            const line = new THREE.LineSegments(
              edges,
              new THREE.LineBasicMaterial({ color: 0x8b857a }),
            );
            line.position.set(seed.box.cx, seed.box.cy, seed.box.cz);
            line.userData = { aiseId: seed.aiseId };
            sceneRefs.set(seed.aiseId, line.uuid);
            geometries.push(boxGeometry, edges);
            materials.push(line.material as ThreeNS.Material);
            contentGroup.add(line);
            continue;
          }
          const geometry = new THREE.BoxGeometry(seed.box.sx, seed.box.sy, seed.box.sz);
          const material = new THREE.MeshStandardMaterial({
            color,
            transparent: seed.kind === "roof" || seed.kind === "proposed" || seed.source === "engine-proposed",
            opacity:
              seed.kind === "roof"
                ? 0.35
                : seed.kind === "proposed" || seed.source === "engine-proposed"
                  ? 0.55
                  : seed.kind === "opening-door" || seed.kind === "opening-window"
                    ? 0.8
                    : 1,
            clippingPlanes: [],
            emissive: new THREE.Color(isSelected ? 0x6b5423 : isHovered ? 0x3d3425 : 0x000000),
            emissiveIntensity: isSelected ? 0.5 : isHovered ? 0.25 : 0,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(seed.box.cx, seed.box.cy, seed.box.cz);
          mesh.userData = { aiseId: seed.aiseId };
          sceneRefs.set(seed.aiseId, mesh.uuid);
          geometries.push(geometry);
          materials.push(material);
          contentGroup.add(mesh);
          if (isSelected || isHovered) {
            const edges = new THREE.EdgesGeometry(geometry);
            const outline = new THREE.LineSegments(
              edges,
              new THREE.LineBasicMaterial({ color: isSelected ? 0x8a6d3b : 0x9a9a9a }),
            );
            outline.position.copy(mesh.position);
            geometries.push(edges);
            materials.push(outline.material as ThreeNS.Material);
            contentGroup.add(outline);
          }
        }
        stateRef.current.onSceneRefs?.(sceneRefs);
      };

      buildMeshes();
      const rebuildSubscription = { current: buildMeshes };
      void rebuildSubscription;

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

      const pickAiseId = (event: PointerEvent): string | null => {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(contentGroup.children, false);
        for (const hit of hits) {
          const aiseId = hit.object.userData.aiseId;
          if (typeof aiseId === "string" && aiseId !== "room-001") {
            return aiseId;
          }
        }
        return null;
      };

      const groundPointOf = (event: PointerEvent): PlacementPoint | null => {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const target = new THREE.Vector3();
        const hit = raycaster.ray.intersectPlane(groundPlane, target);
        return hit === null ? null : { x: target.x, z: target.z };
      };

      const measureGroup = new THREE.Group();
      scene.add(measureGroup);
      const clearMeasure = (): void => {
        for (const child of [...measureGroup.children]) {
          measureGroup.remove(child);
        }
      };
      const drawMeasure = (points: readonly { x: number; y: number; z: number }[]): void => {
        clearMeasure();
        for (const point of points) {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xb3362b }),
          );
          dot.position.set(point.x, point.y, point.z);
          measureGroup.add(dot);
        }
        if (points.length === 2) {
          const first = points[0];
          const second = points[1];
          if (first !== undefined && second !== undefined) {
            const geometry = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(first.x, first.y, first.z),
              new THREE.Vector3(second.x, second.y, second.z),
            ]);
            measureGroup.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xb3362b })));
          }
        }
      };

      let azimuth = props.viewState.azimuthDeg;
      let elevation = props.viewState.elevationDeg;
      let radius = 16;
      const applyCamera = (): void => {
        const az = (azimuth * Math.PI) / 180;
        const el = (elevation * Math.PI) / 180;
        camera.position.set(
          radius * Math.cos(el) * Math.sin(az),
          radius * Math.sin(el) + 1.5,
          radius * Math.cos(el) * Math.cos(az),
        );
        camera.lookAt(0, 1.2, 0);
      };
      applyCamera();

      const sectionPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 3);
      const applySection = (): void => {
        const view = stateRef.current.viewState;
        if (view.sectionEnabled) {
          sectionPlane.constant = view.sectionHeightM;
          renderer.clippingPlanes = [sectionPlane];
        } else {
          renderer.clippingPlanes = [];
        }
      };
      applySection();

      let dragging = false;
      let dragMoved = 0;
      let lastX = 0;
      let lastY = 0;

      const onPointerDown = (event: PointerEvent): void => {
        if (event.button === 0) {
          dragging = true;
          dragMoved = 0;
          lastX = event.clientX;
          lastY = event.clientY;
        }
      };

      const onPointerMove = (event: PointerEvent): void => {
        if (dragging) {
          const dx = event.clientX - lastX;
          const dy = event.clientY - lastY;
          lastX = event.clientX;
          lastY = event.clientY;
          dragMoved += Math.abs(dx) + Math.abs(dy);
          if (dragMoved > 3) {
            azimuth = (azimuth - dx * 0.4 + 360) % 360;
            elevation = Math.min(85, Math.max(5, elevation + dy * 0.3));
            applyCamera();
            stateRef.current.onViewChange(azimuth, elevation);
          }
          return;
        }
        const hovered = pickAiseId(event);
        if (hovered !== stateRef.current.viewState.hoveredAiseId) {
          stateRef.current.onHover(hovered);
          buildMeshes();
        }
      };

      const onPointerUp = (event: PointerEvent): void => {
        dragging = false;
        if (dragMoved > 4) {
          return;
        }
        const current = stateRef.current;
        if (current.measureMode) {
          const rect = canvas.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(contentGroup.children, false);
          const hit = hits[0];
          if (hit !== undefined) {
            const point = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
            const points = [...measureRef.current.points, point].slice(-2);
            const first = points[0];
            const second = points[1];
            const distance =
              first !== undefined && second !== undefined
                ? Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z)
                : null;
            const next = { points, distanceM: distance };
            measureRef.current = next;
            setMeasure(next);
            drawMeasure(points);
          }
          return;
        }
        if (current.placingActive) {
          const ground = groundPointOf(event);
          if (ground !== null) {
            current.onGroundClick(ground);
          }
          return;
        }
        current.onSelect(pickAiseId(event));
      };

      const onWheel = (event: WheelEvent): void => {
        event.preventDefault();
        radius = Math.min(40, Math.max(6, radius + event.deltaY * 0.02));
        applyCamera();
      };

      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });

      const resize = (): void => {
        const parent = canvas.parentElement;
        if (parent === null) {
          return;
        }
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(1, height);
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      if (canvas.parentElement !== null) {
        observer.observe(canvas.parentElement);
      }

      let raf = 0;
      const animate = (): void => {
        if (disposed) {
          return;
        }
        applySection();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(animate);
      };
      animate();

      // Rebuild on prop changes (seeds / selection / hover).
      const lastBuilt = { selected: props.viewState.selectedAiseId, hovered: props.viewState.hoveredAiseId, seedCount: props.seeds.length, seedIds: props.seeds.map((seed) => seed.aiseId).join(",") };
      const syncCheck = (): void => {
        if (disposed) {
          return;
        }
        const current = stateRef.current;
        const signature = {
          selected: current.viewState.selectedAiseId,
          hovered: current.viewState.hoveredAiseId,
          seedCount: current.seeds.length,
          seedIds: current.seeds.map((seed) => seed.aiseId).join(","),
        };
        if (
          signature.selected !== lastBuilt.selected ||
          signature.hovered !== lastBuilt.hovered ||
          signature.seedCount !== lastBuilt.seedCount ||
          signature.seedIds !== lastBuilt.seedIds
        ) {
          lastBuilt.selected = signature.selected;
          lastBuilt.hovered = signature.hovered;
          lastBuilt.seedCount = signature.seedCount;
          lastBuilt.seedIds = signature.seedIds;
          buildMeshes();
        }
        setTimeout(syncCheck, 120);
      };
      syncCheck();

      cleanup = (): void => {
        cancelAnimationFrame(raf);
        observer.disconnect();
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("wheel", onWheel);
        for (const material of materials) {
          material.dispose();
        }
        for (const geometry of geometries) {
          geometry.dispose();
        }
        renderer.dispose();
      };
    };

    void init();
    return () => {
      disposed = true;
      if (cleanup !== null) {
        cleanup();
      }
    };
    // The scene is (re)initialized once; prop changes flow through stateRef.
  }, []);

  return (
    <div style={layout.viewportWrap}>
      <canvas ref={canvasRef} style={layout.canvas} aria-label="3D viewport of the GBIM-000 fixture" />
      <div style={layout.overlayTop}>
        {measure.distanceM !== null ? (
          <span style={{ ...layout.overlayChip, fontWeight: 700 }}>
            Measured: {measure.distanceM.toFixed(3)} m (renderer presentation only — not a quantity)
          </span>
        ) : null}
        {props.measureMode ? (
          <span style={layout.overlayChip}>Measure mode: click two surfaces</span>
        ) : null}
        {props.placingActive ? (
          <span style={layout.overlayChip}>Placing: click the ground plane</span>
        ) : null}
      </div>
    </div>
  );
}
