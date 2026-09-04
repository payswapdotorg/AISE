"use client";

/**
 * The 3D shell canvas (AISE-015): a three.js renderer over the
 * read-only model view.
 *
 * The browser RENDERS; it never computes or holds canonical
 * geometry — every mesh is built directly from the server's
 * projected corners/normals (metres). Objects are colored by
 * their epistemic state (AC-082); clicking selects (AC-081) via
 * raycast; OrbitControls for inspection.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { epistemicColor } from "./epistemic-badge";
import type { ObjectView } from "@/server/model-view";

export interface ModelCanvasProps {
  readonly objects: readonly ObjectView[];
  readonly selectedObjectId: string | undefined;
  readonly onSelect: (objectId: string | undefined) => void;
}

interface Rendered {
  readonly mesh: THREE.Mesh;
  readonly edges: THREE.LineSegments;
}

export default function ModelCanvas({ objects, selectedObjectId, onSelect }: ModelCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(new Map<string, Rendered>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedRef = useRef<string | undefined>(undefined);

  // Build the scene once per model version.
  useEffect(() => {
    const containerElement = containerRef.current;
    if (containerElement === null) {
      return;
    }
    const container = containerElement;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10151c);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(6, 9, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe9f5, 0.35);
    fill.position.set(-5, 3, -6);
    scene.add(fill);

    // Grid + axes for scale (metres).
    const bounds = sceneBounds(objects);
    const grid = new THREE.GridHelper(
      Math.max(2, Math.ceil(Math.max(bounds.x, bounds.z) * 1.4)),
      Math.max(2, Math.ceil(Math.max(bounds.x, bounds.z) * 1.4)),
      0x2a3340,
      0x1c232d,
    );
    grid.position.set(bounds.center.x, 0, bounds.center.z);
    scene.add(grid);

    const rendered = renderedRef.current;
    rendered.clear();
    for (const object of objects) {
      const built = buildObject(object);
      if (built !== undefined) {
        scene.add(built.mesh);
        scene.add(built.edges);
        rendered.set(object.objectId, built);
      }
    }

    // Camera framing: look at the room's center from a corner.
    const center = new THREE.Vector3(bounds.center.x, bounds.y / 2, bounds.center.z);
    const radius = Math.max(bounds.x, bounds.y, bounds.z, 1);
    camera.position.set(center.x + radius * 0.9, center.y + radius * 0.8, center.z + radius * 1.1);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();

    // Selection: raycast on pointer tap (not drags).
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    function onPointerDown(event: PointerEvent): void {
      downX = event.clientX;
      downY = event.clientY;
    }
    function onPointerUp(event: PointerEvent): void {
      if (Math.abs(event.clientX - downX) + Math.abs(event.clientY - downY) > 6) {
        return; // a drag, not a tap
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const meshes = [...rendered.values()].map((entry) => entry.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      const hitObjectId = hits.length > 0 ? (hits[0]!.object.userData.objectId as string) : undefined;
      onSelectRef.current(hitObjectId);
    }
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    function resize(): void {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    let frame = 0;
    let disposed = false;
    function tick(): void {
      if (disposed) {
        return;
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      renderer.dispose();
      for (const entry of rendered.values()) {
        entry.mesh.geometry.dispose();
        (entry.mesh.material as THREE.Material).dispose();
        entry.edges.geometry.dispose();
        (entry.edges.material as THREE.Material).dispose();
      }
      rendered.clear();
      container.removeChild(renderer.domElement);
    };
    // Rebuild only when the model version's content changes.
  }, [objects]);

  // Highlight pass (selection only — no scene rebuild).
  useEffect(() => {
    for (const [objectId, entry] of renderedRef.current) {
      const isSelected = objectId === selectedObjectId;
      const material = entry.mesh.material as THREE.MeshStandardMaterial;
      material.emissive = new THREE.Color(isSelected ? 0x2dd4bf : 0x000000);
      material.emissiveIntensity = isSelected ? 0.55 : 0;
      const edgeMaterial = entry.edges.material as THREE.LineBasicMaterial;
      edgeMaterial.color = new THREE.Color(isSelected ? 0x5eead4 : 0x64748b);
    }
    selectedRef.current = selectedObjectId;
  }, [selectedObjectId, objects]);

  return <div ref={containerRef} className="canvas-container" role="img" aria-label="3D model view" />;
}

/** Builds one object's mesh from its projected rectangle (metres, world space). */
function buildObject(object: ObjectView): Rendered | undefined {
  const geometry = object.geometry;
  if (geometry === undefined || geometry.corners.length !== 4) {
    return undefined;
  }
  const [c0, c1, c2, c3] = geometry.corners;
  if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) {
    return undefined;
  }
  const positions = new Float32Array([
    ...c0, ...c1, ...c2,
    ...c0, ...c2, ...c3,
  ]);
  const quad = new THREE.BufferGeometry();
  quad.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  quad.computeVertexNormals();

  const color = new THREE.Color(epistemicColor(object.epistemicState));
  const material = new THREE.MeshStandardMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: object.objectClass === "WINDOW" || object.objectClass === "DOOR",
    opacity: object.objectClass === "WINDOW" ? 0.35 : object.objectClass === "DOOR" ? 0.6 : 0.82,
    roughness: 0.9,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(quad, material);
  mesh.userData.objectId = object.objectId;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(quad),
    new THREE.LineBasicMaterial({ color: 0x64748b }),
  );

  return { mesh, edges };
}

/** The model's world bounds (metres) for framing and the grid. */
function sceneBounds(objects: readonly ObjectView[]): {
  x: number;
  y: number;
  z: number;
  center: { x: number; y: number; z: number };
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const object of objects) {
    for (const corner of object.geometry?.corners ?? []) {
      any = true;
      minX = Math.min(minX, corner[0]);
      minY = Math.min(minY, corner[1]);
      maxZ = Math.max(maxZ, corner[2]);
      minZ = Math.min(minZ, corner[2]);
      maxX = Math.max(maxX, corner[0]);
      maxY = Math.max(maxY, corner[1]);
    }
  }
  if (!any) {
    return { x: 1, y: 1, z: 1, center: { x: 0, y: 0, z: 0 } };
  }
  return {
    x: Math.max(maxX - minX, 0.5),
    y: Math.max(maxY - minY, 0.5),
    z: Math.max(maxZ - minZ, 0.5),
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
  };
}
