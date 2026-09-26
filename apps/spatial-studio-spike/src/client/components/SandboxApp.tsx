/**
 * GBIM-003 — the Spatial Studio sandbox root (Atelier-inspired patterns,
 * AISE-lawful semantics).
 *
 * STATE CUSTODY (acceptance):
 *  - `workspace` is a PROJECTION of engine outputs fetched from the server;
 *    nothing in this component or its children ever mutates it locally;
 *  - selection / hover / camera / section / measurement are presentation
 *    state only — they are never POSTed and cannot reach canonical state;
 *  - the ONLY mutation path is: staged draft -> typed intent (browser-cut
 *    constructor) -> POST /api/spike/apply -> engine applyOperation ->
 *    new projection. Same path for direct manipulation and the agent.
 *
 * Spike-only code (NOT production engine code).
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgentCompileDto,
  ApplyResultDto,
  OperationRecordDto,
  PreviewDto,
  SandboxViewState,
  SceneElementSeed,
  WorkspaceDto,
} from "../../types";
import { buildFixtureSceneSeed, overlaySeeds, type OverlayPlacement } from "../../scene/scene-model";
import {
  buildSandboxDirectManipulationIntent,
  distanceOf,
  initialParameterValues,
  type ComponentSpec,
} from "../intent-builder";
import {
  applyIntent,
  compileAgentUtterance,
  deriveOperationIds,
  fetchEvidence,
  fetchWorkspace,
  previewIntent,
  resetWorkspace,
  reviseOpening,
} from "../api-client";
import { badgeStyle, layout, THEME } from "../styles";
import { Scene3D } from "./Scene3D";
import { Plan2D } from "./Plan2D";
import {
  AgentPane,
  BoqPane,
  ConsequenceHud,
  EvidencePane,
  FallbackPane,
  IfcPane,
  InspectorPane,
  LibraryPane,
  OperationsPane,
  StagingForm,
  StatusStrip,
  type EquivalenceState,
  type EvidenceFile,
} from "./panes";

type Mode = "studio-3d" | "plan-2d" | "boq" | "agent" | "evidence" | "ifc";

interface Staging {
  readonly spec: ComponentSpec;
  readonly points: readonly { readonly x: number; readonly z: number }[];
  readonly values: Record<string, string>;
  readonly intent: unknown | null;
}

const MODES: readonly { readonly id: Mode; readonly label: string }[] = [
  { id: "studio-3d", label: "3D studio" },
  { id: "plan-2d", label: "2D plan" },
  { id: "boq", label: "BOQ & export" },
  { id: "agent", label: "Agent lane" },
  { id: "ifc", label: "IFC interop" },
  { id: "evidence", label: "Evidence" },
];

export function SandboxApp(): React.JSX.Element {
  const [workspace, setWorkspace] = useState<WorkspaceDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("studio-3d");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rendererAvailable, setRendererAvailable] = useState<boolean | null>(null);
  const [fallbackForced, setFallbackForced] = useState(false);
  const [viewState, setViewState] = useState<SandboxViewState>({
    azimuthDeg: 42,
    elevationDeg: 24,
    sectionEnabled: false,
    sectionHeightM: 1.2,
    selectedAiseId: null,
    hoveredAiseId: null,
  });
  const [measureMode, setMeasureMode] = useState(false);
  const [staging, setStaging] = useState<Staging | null>(null);
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const [overlays, setOverlays] = useState<readonly OverlayPlacement[]>([]);
  const [externalRendererRefs, setExternalRendererRefs] = useState<ReadonlyMap<string, string>>(new Map());
  const [equivalence, setEquivalence] = useState<EquivalenceState | null>(null);
  const [evidence, setEvidence] = useState<EvidenceFile | null>(null);

  useEffect(() => {
    fetchWorkspace()
      .then((result) => {
        setWorkspace(result.workspace);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  useEffect(() => {
    if (mode === "evidence" && evidence === null) {
      fetchEvidence()
        .then((result) => {
          setEvidence(result as EvidenceFile);
        })
        .catch(() => {
          setEvidence({
            generatedAt: "unavailable",
            fixtureSha256: "-",
            checks: [
              {
                id: "evidence-load",
                title: "evidence results JSON",
                verdict: "PARTIAL",
                evidence: "the results file was not reachable from this host — see the committed docs/productization-evidence/GBIM-003/results/",
              },
            ],
            scorecard: [],
          });
        });
    }
  }, [mode, evidence]);

  const seeds = useMemo<readonly SceneElementSeed[]>(() => {
    if (workspace === null) {
      return [];
    }
    const fixtureSeeds = buildFixtureSceneSeed(workspace.fixture, workspace.operationRecords);
    return [...fixtureSeeds, ...overlaySeeds(overlays)];
  }, [workspace, overlays]);

  /* ---------------- staging / placement ---------------- */

  const armComponent = (spec: ComponentSpec): void => {
    setPreview(null);
    setMeasureMode(false);
    setStaging({ spec, points: [], values: initialParameterValues(spec), intent: null });
    setMessage(`Placing ${spec.label}: ${spec.note}`);
  };

  const handleGroundClick = (point: { readonly x: number; readonly z: number }): void => {
    setStaging((current) => {
      if (current === null || current.points.length >= current.spec.pointsRequired) {
        return current;
      }
      const points = [...current.points, point];
      let values = current.values;
      if (current.spec.pointsRequired === 2 && points.length === 2) {
        const [a, b] = points as [{ x: number; z: number }, { x: number; z: number }];
        const length = distanceOf(a, b);
        if (current.values.length === undefined || current.values.length !== undefined) {
          values = { ...current.values, length: length.toFixed(2) };
        }
        void length;
      }
      return { ...current, points, values };
    });
  };

  const stagePreview = async (): Promise<void> => {
    if (staging === null || workspace === null) {
      return;
    }
    setBusy(true);
    try {
      const intent = buildSandboxDirectManipulationIntent(
        { componentKind: staging.spec.kind, points: staging.points, parameterValues: staging.values },
        workspace.solutionId,
        workspace.versionNumber,
        `intent-sandbox-${Date.now() % 100000}`,
      );
      const result = await previewIntent(intent);
      setPreview(result);
      setStaging({ ...staging, intent });
      setMessage(`Staged ${staging.spec.label} — engine dry-run: ${result.outcome}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const applyStaged = async (): Promise<void> => {
    if (staging === null || staging.intent === null) {
      return;
    }
    await applyThroughEngine(staging.intent, "direct-manipulation", staging);
  };

  const applyThroughEngine = async (
    intent: unknown,
    origin: string,
    stagingContext: Staging | null,
  ): Promise<void> => {
    setBusy(true);
    try {
      const result: ApplyResultDto = await applyIntent(intent, origin);
      if (result.ok && result.workspace !== null) {
        setWorkspace(result.workspace);
        if (stagingContext !== null && result.operationId !== null) {
          setOverlays((current) => [...current, overlayPlacementOf(stagingContext, result.operationId ?? "")]);
        }
        setPreview(null);
        setStaging(null);
      }
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const overlayPlacementOf = (context: Staging, operationId: string): OverlayPlacement => {
    const spec = context.spec;
    const values = context.values;
    const numeric = (name: string, fallback: number): number => {
      const raw = Number(values[name]);
      return Number.isFinite(raw) && raw > 0 ? raw : fallback;
    };
    if (spec.kind === "wall" || spec.kind === "partition" || spec.kind === "beam") {
      const [a, b] =
        context.points.length === 2
          ? (context.points as [{ x: number; z: number }, { x: number; z: number }])
          : [
              { x: -2, z: -1.5 },
              { x: -2, z: 1.5 },
            ];
      const height = numeric("height", 3);
      const thickness = numeric("thickness", 0.2);
      const width = numeric("width", spec.kind === "beam" ? 0.25 : thickness);
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      const alongX = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z);
      const length = numeric("length", distanceOf(a, b));
      return {
        operationId,
        label: `${spec.label} (proposed)`,
        engineType: spec.engineType ?? "unknown",
        box: alongX
          ? { cx, cy: height / 2, cz, sx: length, sy: height, sz: width }
          : { cx, cy: height / 2, cz, sx: width, sy: height, sz: length },
      };
    }
    if (spec.kind === "door" || spec.kind === "window") {
      const point = context.points[0] ?? { x: 3.2, z: 2.9 };
      const width = numeric("width", 0.9);
      const height = numeric("height", 2.1);
      const sill = spec.kind === "window" ? 0.9 : 0;
      return {
        operationId,
        label: `${spec.label} (proposed)`,
        engineType: spec.engineType ?? "unknown",
        box: { cx: point.x, cy: sill + height / 2, cz: 2.9, sx: width, sy: height, sz: 0.22 },
      };
    }
    if (spec.kind === "footing") {
      const point = context.points[0] ?? { x: -3.5, z: 2.5 };
      return {
        operationId,
        label: `${spec.label} (proposed)`,
        engineType: spec.engineType ?? "unknown",
        box: { cx: point.x, cy: -0.35, cz: point.z, sx: numeric("length", 0.4), sy: numeric("depth", 0.3), sz: numeric("width", 0.4) },
      };
    }
    // slab + unsupported kinds: room-center ghost
    return {
      operationId,
      label: `${spec.label} (proposed)`,
      engineType: spec.engineType ?? "unknown",
      box: { cx: 0, cy: 0.1, cz: 0, sx: numeric("length", 8), sy: 0.2, sz: numeric("width", 6) },
    };
  };

  /* ---------------- revision / reset ---------------- */

  const reviseOpeningAction = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await reviseOpening(1.5, 1.2);
      if (result.workspace !== null) {
        setWorkspace(result.workspace);
      }
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const resetAction = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await resetWorkspace();
      setWorkspace(result.workspace);
      setOverlays([]);
      setPreview(null);
      setStaging(null);
      setEquivalence(null);
      setMessage("workspace reset to the fixture template");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- agent lane ---------------- */

  const compileAction = async (utterance: string): Promise<AgentCompileDto | null> => {
    setBusy(true);
    try {
      const result = await compileAgentUtterance(utterance);
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const runEquivalence = async (): Promise<void> => {
    if (workspace === null) {
      return;
    }
    setBusy(true);
    try {
      const draft = {
        componentKind: "wall" as const,
        points: [] as readonly { readonly x: number; readonly z: number }[],
        parameterValues: { length: "8", height: "3", thickness: "0.2", material: "concrete-block" },
      };
      const directIntent = buildSandboxDirectManipulationIntent(
        draft,
        workspace.solutionId,
        workspace.versionNumber,
        "intent-equivalence-direct",
        // the agent compiler anchors utterances to the session focus
        // ("the wall") — the direct side must describe the SAME target.
        "wall-001",
      );
      const utterance =
        "Build a new block wall 8 m long, 3 m high and 200 mm thick from concrete blocks in the wall.";
      const compiled = await compileAgentUtterance(utterance);
      if (compiled.kind !== "operation-intent" || compiled.intent === null) {
        setEquivalence({
          directOperationId: "(not derived)",
          agentOperationId: "(not derived)",
          equal: false,
          utterance,
          detail: `the compiler did not produce an intent (${compiled.kind}: ${compiled.detail})`,
        });
        return;
      }
      const operationIndex = workspace.operationRecords.length;
      const result = await deriveOperationIds([
        { intent: directIntent, operationIndex },
        { intent: compiled.intent, operationIndex },
      ]);
      const [directId, agentId] = result.ids;
      setEquivalence({
        directOperationId: directId ?? "(missing)",
        agentOperationId: agentId ?? "(missing)",
        equal: directId === agentId,
        utterance,
        detail:
          directId === agentId
            ? "identical operation identity — the 200 mm utterance canonicalized to 0.2 m and produced the same semantics"
            : "identities diverged — semantics differ (investigate target anchoring)",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- selection (shared, stable refs) ---------------- */

  const selectAiseId = useCallback((aiseId: string | null): void => {
    setViewState((current) => ({ ...current, selectedAiseId: aiseId }));
  }, []);

  const selectOperation = (record: OperationRecordDto): void => {
    if (record.operationId !== null) {
      const overlay = overlays.find((entry) => entry.operationId === record.operationId);
      if (overlay !== undefined) {
        selectAiseId(`op:${record.operationId}`);
        setMode("studio-3d");
        return;
      }
    }
    const elementId = record.targetElementId.split(":").pop() ?? record.targetElementId;
    selectAiseId(elementId);
    if (mode === "boq" || mode === "evidence" || mode === "agent") {
      setMode("studio-3d");
    }
  };

  const rendererActive = rendererAvailable !== false && !fallbackForced;

  const studioBody = (
    <>
      {rendererActive ? (
        mode === "studio-3d" ? (
          <Scene3D
            seeds={seeds}
            viewState={viewState}
            measureMode={measureMode}
            placingActive={staging !== null && staging.points.length < staging.spec.pointsRequired}
            externalRefs={externalRendererRefs}
            onSelect={selectAiseId}
            onHover={(hovered) => {
              setViewState((current) => ({ ...current, hoveredAiseId: hovered }));
            }}
            onViewChange={(azimuthDeg, elevationDeg) => {
              setViewState((current) => ({ ...current, azimuthDeg, elevationDeg }));
            }}
            onGroundClick={handleGroundClick}
            onRendererUnavailable={(reason) => {
              setRendererAvailable(false);
              setMessage(`3D renderer unavailable (${reason}) — fell back to the accessible text view`);
            }}
            onSceneRefs={(refs) => {
              setExternalRendererRefs(refs);
            }}
          />
        ) : (
          <Plan2D
            seeds={seeds}
            viewState={viewState}
            placingPoints={staging !== null ? staging.points : []}
            onSelect={selectAiseId}
            onPlanClick={handleGroundClick}
          />
        )
      ) : (
        <FallbackPane
          workspace={workspace}
          reason={fallbackForced ? "forced by the operator (fallback demo)" : "WebGL/Three.js failed to initialize"}
          seeds={seeds}
          onSelectOperation={selectOperation}
        />
      )}
      {rendererActive ? (
        <div style={{ padding: "8px 12px", borderTop: `1px solid ${THEME.border}`, background: THEME.panel }}>
          <div style={layout.row}>
            <button
              type="button"
              style={measureMode ? layout.buttonActive : layout.button}
              onClick={() => {
                setMeasureMode(!measureMode);
              }}
            >
              Measure
            </button>
            <label style={{ ...layout.small, ...layout.dim }}>
              <input
                type="checkbox"
                checked={viewState.sectionEnabled}
                onChange={(event) => {
                  setViewState((current) => ({ ...current, sectionEnabled: event.target.checked }));
                }}
              />{" "}
              Section
            </label>
            <label style={{ ...layout.small, ...layout.dim }}>
              height {viewState.sectionHeightM.toFixed(2)} m
              <input
                type="range"
                min={0}
                max={3}
                step={0.05}
                value={viewState.sectionHeightM}
                onChange={(event) => {
                  setViewState((current) => ({ ...current, sectionHeightM: Number(event.target.value) }));
                }}
              />
            </label>
            <label style={{ ...layout.small, ...layout.dim }}>
              azimuth {viewState.azimuthDeg.toFixed(0)}°
              <input
                type="range"
                min={0}
                max={360}
                value={viewState.azimuthDeg}
                onChange={(event) => {
                  setViewState((current) => ({ ...current, azimuthDeg: Number(event.target.value) }));
                }}
              />
            </label>
            <label style={{ ...layout.small, ...layout.dim }}>
              elevation {viewState.elevationDeg.toFixed(0)}°
              <input
                type="range"
                min={5}
                max={85}
                value={viewState.elevationDeg}
                onChange={(event) => {
                  setViewState((current) => ({ ...current, elevationDeg: Number(event.target.value) }));
                }}
              />
            </label>
            <span style={{ ...layout.small, ...layout.dim }}>
              selection: {viewState.selectedAiseId ?? "—"} (presentation state; never POSTed)
            </span>
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <div style={layout.app}>
      <header style={layout.header}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={layout.title}>AISE Spatial Studio — GBIM-003 spike sandbox</h1>
          <p style={layout.subtitle}>
            Three.js presentation adapter over the canonical AISE solution engine · renderer holds no
            authority · every consequence from engine quantities/verification
          </p>
        </div>
        <nav aria-label="sandbox modes" style={layout.row}>
          {MODES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              style={mode === entry.id ? layout.buttonActive : layout.button}
              onClick={() => {
                setMode(entry.id);
              }}
            >
              {entry.label}
            </button>
          ))}
        </nav>
        <label style={{ ...layout.small, ...layout.dim }} title="Demonstrate the renderer-unavailable fallback">
          <input
            type="checkbox"
            checked={fallbackForced}
            onChange={(event) => {
              setFallbackForced(event.target.checked);
            }}
          />{" "}
          simulate renderer unavailable
        </label>
      </header>

      <div style={layout.main}>
        <aside style={layout.sidebar} aria-label="sandbox sidebar">
          <LibraryPane
            activeKind={staging?.spec.kind ?? null}
            onArm={armComponent}
            onCancel={() => {
              setStaging(null);
              setPreview(null);
            }}
            onResetWorkspace={() => void resetAction()}
            busy={busy}
          />
          {staging !== null ? (
            <StagingForm
              spec={staging.spec}
              points={staging.points}
              values={staging.values}
              busy={busy}
              onValueChange={(name, value) => {
                setStaging((current) =>
                  current === null ? current : { ...current, values: { ...current.values, [name]: value } },
                );
              }}
              onStage={() => void stagePreview()}
              onCancel={() => {
                setStaging(null);
                setPreview(null);
              }}
            />
          ) : null}
          <ConsequenceHud
            preview={preview}
            stagedSpec={staging?.spec ?? null}
            busy={busy}
            onApply={() => void applyStaged()}
            onDiscard={() => {
              setStaging(null);
              setPreview(null);
            }}
          />
          <InspectorPane
            workspace={workspace}
            seeds={seeds}
            selectedAiseId={viewState.selectedAiseId}
            externalRendererRef={viewState.selectedAiseId === null ? null : externalRendererRefs.get(viewState.selectedAiseId) ?? null}
            onReviseOpening={() => void reviseOpeningAction()}
            busy={busy}
          />
        </aside>
        <main style={layout.content} aria-label="sandbox viewport">
          {loadError !== null ? (
            <div style={{ padding: 16 }}>
              <p style={{ color: THEME.bad, fontWeight: 700 }}>workspace failed to load</p>
              <p style={{ ...layout.small, ...layout.mono }}>{loadError}</p>
            </div>
          ) : mode === "boq" ? (
            <BoqPane workspace={workspace} onSelectOperation={selectOperation} />
          ) : mode === "agent" ? (
            <AgentPane
              workspace={workspace}
              busy={busy}
              onCompile={compileAction}
              onApplyIntent={(intent, origin) => {
                void applyThroughEngine(intent, origin, null);
              }}
              onRunEquivalence={() => void runEquivalence()}
              equivalence={equivalence}
            />
          ) : mode === "evidence" ? (
            <EvidencePane evidence={evidence} />
          ) : mode === "ifc" ? (
            <IfcPane
              aiseIds={seeds.map((seed) => seed.aiseId)}
            />
          ) : (
            studioBody
          )}
          <OperationsPane workspace={workspace} selectedAiseId={viewState.selectedAiseId} onSelectOperation={selectOperation} />
        </main>
      </div>

      <footer style={{ marginTop: "auto", padding: "8px 16px", background: THEME.panel, borderTop: `1px solid ${THEME.border}`, fontSize: 11, color: THEME.textDim }}>
        GBIM-003 spike evidence sandbox — base 0bb8c87 · {workspace === null ? "loading…" : `fixture ${workspace.fixtureSha256.slice(0, 12)}… · validation ${workspace.validation.outcome}`} ·{" "}
        <span style={badgeStyle(rendererAvailable === false ? "needs-input" : "applied")}>
          renderer {rendererAvailable === null ? "initializing" : rendererAvailable ? "available" : "unavailable → fallback"}
        </span>
      </footer>
      <StatusStrip message={message} workspace={workspace} />
    </div>
  );
}

/**
 * The scene derives from the fixture served by /api/spike/open (the pinned
 * GBIM-000 canonical fixture, consumed verbatim by the sandbox).
 */
