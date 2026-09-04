"use client";

/**
 * The engineering workspace shell (AISE-015, AC-081/082):
 * 3D canvas + object list + property inspector over the
 * read-only model view. Client-side interaction only —
 * selection state is UI state, never canonical state.
 */
import { useMemo, useState } from "react";
import ModelCanvas from "./model-canvas";
import { EpistemicBadge, epistemicColor } from "./epistemic-badge";
import type { ModelVersionView, ObjectView } from "@/server/model-view";

export interface WorkspaceShellProps {
  readonly model: ModelVersionView;
}

export function WorkspaceShell({ model }: WorkspaceShellProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const selected = useMemo(
    () => model.objects.find((object) => object.objectId === selectedId),
    [model.objects, selectedId],
  );

  const epistemicStates = Object.keys(model.epistemicSummary.objects);

  return (
    <div className="workspace">
      <aside className="object-list" aria-label="Objects">
        <h2>
          Objects <span className="dim">{model.objects.length}</span>
        </h2>
        <ul>
          {model.objects.map((object) => (
            <li key={object.objectId}>
              <button
                type="button"
                className={object.objectId === selectedId ? "object-row selected" : "object-row"}
                style={{ borderLeftColor: epistemicColor(object.epistemicState) }}
                onClick={() => setSelectedId(object.objectId)}
              >
                <span className="object-class">{object.objectClass}</span>
                <span className="object-name dim">{object.name ?? object.objectId}</span>
                <EpistemicBadge state={object.epistemicState} />
              </button>
            </li>
          ))}
        </ul>
        <h2>Epistemic composition</h2>
        <ul className="epistemic-legend">
          {epistemicStates.map((state) => (
            <li key={state}>
              <EpistemicBadge state={state} />
              <span>
                {model.epistemicSummary.objects[state]} object
                {model.epistemicSummary.objects[state] === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      </aside>

      <section className="canvas-area">
        <ModelCanvas
          objects={model.objects}
          selectedObjectId={selectedId}
          onSelect={(objectId) => setSelectedId(objectId)}
        />
      </section>

      <aside className="inspector" aria-label="Inspector">
        {selected === undefined ? (
          <div className="inspector-empty">
            <h2>Inspector</h2>
            <p className="dim">Select an object in the list or the 3D view.</p>
          </div>
        ) : (
          <ObjectInspector object={selected} />
        )}
        <div className="inspector-model">
          <h2>Model</h2>
          <dl>
            <dt>model</dt>
            <dd className="mono">{model.modelId}</dd>
            <dt>version</dt>
            <dd>v{model.version}</dd>
            <dt>spaces</dt>
            <dd>{model.spaces.length}</dd>
            <dt>objects</dt>
            <dd>{model.objects.length}</dd>
            <dt>relationships</dt>
            <dd>{model.relationships.length}</dd>
            <dt>digest</dt>
            <dd className="mono">{model.digest.slice(0, 24)}…</dd>
          </dl>
        </div>
      </aside>
    </div>
  );
}

function ObjectInspector({ object }: { object: ObjectView }) {
  return (
    <div>
      <h2>
        {object.objectClass} <span className="dim">{object.name ?? ""}</span>
      </h2>
      <p className="mono dim object-id">{object.objectId}</p>
      <dl className="object-facts">
        <dt>epistemic</dt>
        <dd>
          <EpistemicBadge state={object.epistemicState} />
        </dd>
        <dt>content</dt>
        <dd className="mono">{object.contentHash.slice(0, 16)}…</dd>
        {object.geometry !== undefined ? (
          <>
            {object.geometry.widthM !== undefined ? (
              <FragmentRow label="width" value={`${object.geometry.widthM.toFixed(3)} m`} />
            ) : null}
            {object.geometry.heightM !== undefined ? (
              <FragmentRow label="height" value={`${object.geometry.heightM.toFixed(3)} m`} />
            ) : null}
            {object.geometry.areaM2 !== undefined ? (
              <FragmentRow label="area" value={`${object.geometry.areaM2.toFixed(3)} m²`} />
            ) : null}
            {object.geometry.elevationM !== undefined ? (
              <FragmentRow label="elevation" value={`${object.geometry.elevationM.toFixed(3)} m`} />
            ) : null}
            {object.geometry.sillM !== undefined ? (
              <FragmentRow label="sill" value={`${object.geometry.sillM.toFixed(3)} m`} />
            ) : null}
            {object.geometry.headM !== undefined ? (
              <FragmentRow label="head" value={`${object.geometry.headM.toFixed(3)} m`} />
            ) : null}
          </>
        ) : null}
      </dl>
      {object.properties.length > 0 ? (
        <>
          <h3>Properties</h3>
          <ul className="property-list">
            {object.properties.map((property) => (
              <li key={property.key}>
                <div className="property-head">
                  <span className="property-key">{property.key}</span>
                  <EpistemicBadge state={property.status} />
                </div>
                {property.value !== undefined ? (
                  <div className="property-value">
                    {property.value} {property.unit ?? ""}
                    {property.uncertainty !== undefined ? (
                      <span className="dim"> {property.uncertainty}</span>
                    ) : null}
                  </div>
                ) : null}
                {property.presence !== undefined ? (
                  <div className="property-value dim">{property.presence}</div>
                ) : null}
                <div className="property-meta dim">
                  {property.kind ?? ""}
                  {property.method !== undefined ? ` · ${property.method}` : ""}
                </div>
                {property.evidenceRefs !== undefined && property.evidenceRefs.length > 0 ? (
                  <div className="property-evidence mono">
                    evidence: {property.evidenceRefs.join(", ")}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
