/**
 * GBIM-003 — the deterministic 2D plan view (SVG, the AISE svg-viewer
 * idiom: deterministic projection, stable `data-aise-id` join keys).
 *
 * The plan is SYNCHRONIZED with the 3D view through the shared sandbox
 * view state (selection, section, placement) — both views select the SAME
 * stable AISE references, never renderer ids.
 *
 * Spike-only code (NOT production engine code).
 */

"use client";

import type { PlacementPoint, SceneElementSeed, SandboxViewState } from "../../types";
import { layout } from "../styles";

export interface Plan2DProps {
  readonly seeds: readonly SceneElementSeed[];
  readonly viewState: SandboxViewState;
  readonly placingPoints: readonly PlacementPoint[];
  readonly onSelect: (aiseId: string | null) => void;
  readonly onPlanClick: (point: PlacementPoint) => void;
}

const SCALE = 64; // px per meter
const ORIGIN_X = 300;
const ORIGIN_Y = 260;

function toSvg(x: number, z: number): { px: number; py: number } {
  return { px: ORIGIN_X + x * SCALE, py: ORIGIN_Y - z * SCALE };
}

function rectOf(seed: SceneElementSeed): { x: number; y: number; w: number; h: number } | null {
  const a = toSvg(seed.box.cx - seed.box.sx / 2, seed.box.cz + seed.box.sz / 2);
  const b = toSvg(seed.box.cx + seed.box.sx / 2, seed.box.cz - seed.box.sz / 2);
  return { x: Math.min(a.px, b.px), y: Math.min(a.py, b.py), w: Math.abs(b.px - a.px), h: Math.abs(b.py - a.py) };
}

const PLAN_FILL: Record<string, string> = {
  slab: "#e3e3e0",
  wall: "#b8b2a6",
  partition: "#d9c9a8",
  footing: "#efe9df",
  column: "#b5a793",
  beam: "#e8dcc7",
  "opening-door": "#cfe3c6",
  "opening-window": "#cfe6ec",
  proposed: "#dbe6f5",
  roof: "none",
  room: "none",
};

export function Plan2D(props: Plan2DProps): React.JSX.Element {
  const { seeds, viewState } = props;
  const room = seeds.find((seed) => seed.kind === "room");
  const selected = viewState.selectedAiseId;

  const clickable = (seed: SceneElementSeed): React.SVGProps<SVGRectElement> => ({
    onClick: () => {
      props.onSelect(seed.aiseId === selected ? null : seed.aiseId);
    },
    style: { cursor: "pointer" },
    ...({ "data-aise-id": seed.aiseId } as Record<string, string>),
  });

  return (
    <div style={{ ...layout.viewportWrap, background: "#fbfaf8", display: "block", overflow: "auto" }}>
      <svg
        viewBox="0 0 600 520"
        style={{ width: "100%", maxWidth: 900, minHeight: 420, display: "block", margin: "0 auto" }}
        role="img"
        aria-label="2D plan view of the GBIM-000 fixture"
        onClick={(event) => {
          if (props.placingPoints.length >= 2) {
            return;
          }
          const svg = event.currentTarget;
          const rect = svg.getBoundingClientRect();
          const viewBoxWidth = 600;
          const scale = rect.width / viewBoxWidth;
          const px = (event.clientX - rect.left) / scale;
          const py = (event.clientY - rect.top) / scale;
          const x = (px - ORIGIN_X) / SCALE;
          const z = (ORIGIN_Y - py) / SCALE;
          props.onPlanClick({ x, z });
        }}
      >
        {/* grid */}
        {Array.from({ length: 13 }, (_, index) => -6 + index).map((meter) => {
          const v = toSvg(meter, 0);
          const h = toSvg(0, meter);
          return (
            <g key={`grid-${meter}`} stroke="#eeece8" strokeWidth={1}>
              <line x1={v.px} y1={60} x2={v.px} y2={460} />
              <line x1={40} y1={h.py} x2={560} y2={h.py} />
            </g>
          );
        })}

        {/* elements (paint order: slab, footing, wall, openings, partition, column, beam) */}
        {seeds
          .filter((seed) => seed.kind !== "room" && seed.kind !== "roof")
          .sort((a, b) => planOrder(a) - planOrder(b))
          .map((seed) => {
            const box = rectOf(seed);
            if (box === null) {
              return null;
            }
            const isSelected = seed.aiseId === selected;
            const dashed = seed.kind === "footing" || seed.kind === "beam";
            return (
              <rect
                key={seed.aiseId}
                x={box.x}
                y={box.y}
                width={box.w}
                height={box.h}
                fill={PLAN_FILL[seed.kind] ?? "#ddd"}
                stroke={isSelected ? "#8a6d3b" : dashed ? "#a09884" : "#7d776c"}
                strokeWidth={isSelected ? 3 : 1.2}
                strokeDasharray={dashed ? "5 3" : seed.source === "engine-proposed" ? "7 4" : undefined}
                opacity={seed.kind === "slab" ? 0.6 : 1}
                {...clickable(seed)}
              />
            );
          })}

        {/* door swing arc */}
        <path
          d="M 172 67.2 A 57.6 57.6 0 0 1 229.6 124.8"
          fill="none"
          stroke="#7d9c6c"
          strokeWidth={1.4}
          strokeDasharray="4 3"
        />

        {/* placement preview */}
        {props.placingPoints.map((point, index) => {
          const { px, py } = toSvg(point.x, point.z);
          return <circle key={`place-${index}`} cx={px} cy={py} r={4} fill="#8a6d3b" />;
        })}
        {props.placingPoints.length === 2 ? (
          (() => {
            const first = props.placingPoints[0];
            const second = props.placingPoints[1];
            if (first === undefined || second === undefined) {
              return null;
            }
            const a = toSvg(first.x, first.z);
            const b = toSvg(second.x, second.z);
            return <line x1={a.px} y1={a.py} x2={b.px} y2={b.py} stroke="#8a6d3b" strokeWidth={2.4} strokeDasharray="8 4" />;
          })()
        ) : null}

        {/* dimensions */}
        {room !== undefined ? (
          <g stroke="#6f6a61" strokeWidth={1} fill="#6f6a61" fontSize={11} fontFamily="ui-monospace, monospace">
            <line x1={toSvg(-4, 3.4).px} y1={44} x2={toSvg(4, 3.4).px} y2={44} />
            <text x={ORIGIN_X - 18} y={38}>
              8.00 m
            </text>
            <line x1={566} y1={toSvg(0, 3).py} x2={566} y2={toSvg(0, -3).py} />
            <text x={572} y={ORIGIN_Y} transform={`rotate(90 572 ${ORIGIN_Y})`}>
              6.00 m
            </text>
          </g>
        ) : null}

        {/* azimuth indicator (synchronized with the 3D camera) */}
        <g transform="translate(56 486)">
          <circle r={18} fill="#fff" stroke="#d8d4cc" />
          <g transform={`rotate(${-viewState.azimuthDeg})`}>
            <line x1={0} y1={12} x2={0} y2={-13} stroke="#8a6d3b" strokeWidth={2} />
            <polygon points="0,-16 -4,-8 4,-8" fill="#8a6d3b" />
          </g>
          <text x={22} y={4} fontSize={10} fill="#6f6a61">
            3D azimuth {viewState.azimuthDeg.toFixed(0)}°
          </text>
        </g>

        {/* section indicator (synchronized with the 3D clip plane) */}
        <text x={40} y={508} fontSize={10} fill="#6f6a61">
          {viewState.sectionEnabled
            ? `Section active at +${viewState.sectionHeightM.toFixed(2)} m (3D clipped above; plan unaffected)`
            : "Section off (toggle in the studio view)"}
        </text>
      </svg>
    </div>
  );
}

function planOrder(seed: SceneElementSeed): number {
  const order: Record<string, number> = {
    slab: 0,
    footing: 1,
    wall: 2,
    "opening-door": 3,
    "opening-window": 3,
    partition: 4,
    column: 5,
    beam: 6,
    proposed: 7,
    room: 9,
    roof: 9,
  };
  return order[seed.kind] ?? 8;
}
