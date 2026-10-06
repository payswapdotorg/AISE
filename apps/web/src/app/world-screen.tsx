/**
 * WORLD-P5 — the product world screen: the world station surface of
 * the product SPA (`#/world`, the route the desktop shell's world
 * journey loads).
 *
 * THE MOUNT LAWS:
 *  - the COMMITTED station record renders by default (the P4 one-
 *    record discipline: the browser renders the record verbatim);
 *  - the LIVE station renders when the route carries a project scope:
 *    the backend's world-station route (`GET /v1/world/projects/:id/
 *    station?case=…`) serves the LIVE bound record through the SAME
 *    `WorldStationSources` ports — the browser stays crypto-free (the
 *    binding runs server-side; the served record renders verbatim);
 *  - honest states only: a live fetch that fails renders the typed
 *    unavailable note + the committed station (never a fabricated
 *    live station);
 *  - the in-world deep link (`?element=…`) opens with the typed
 *    select-element command (the prepared `parseWorldHashQuery` seam).
 */

import { useEffect, useReducer, useState } from "react";
import type { ReactNode } from "react";
import { WorldStation, StandaloneWorldStation } from "./world/station";
import type { StationRecord } from "./world/record";
import {
  initialStationViewState,
  reduceStationCommand,
  type StationCommand,
  type StationViewState,
} from "./world/browser-station";
import { formatRoute } from "./router";
import type { WorldQuery } from "./router";
import committedRecordData from "./world/station-record.json";

const COMMITTED_RECORD = committedRecordData as unknown as StationRecord;

interface LiveStationState {
  readonly status: "idle" | "loading" | "served" | "unavailable";
  readonly record: StationRecord | null;
  readonly unavailableReason: string | null;
}

/** Fetch the LIVE served station record (same-origin, the api seam). */
async function fetchLiveStationRecord(
  project: string,
  caseId: string | undefined,
): Promise<LiveStationState> {
  const query = caseId !== undefined ? `?case=${encodeURIComponent(caseId)}` : "";
  const path = `/v1/world/projects/${encodeURIComponent(project)}/station${query}`;
  try {
    const response = await fetch(path, { headers: { accept: "application/json" } });
    if (!response.ok) {
      const detail = `the world-station route answered ${String(response.status)}`;
      return { status: "unavailable", record: null, unavailableReason: detail };
    }
    const body = (await response.json()) as {
      ok?: boolean;
      station?: StationRecord;
    };
    if (body.ok !== true || body.station === undefined) {
      return {
        status: "unavailable",
        record: null,
        unavailableReason: "the world-station route answered without a station",
      };
    }
    return { status: "served", record: body.station, unavailableReason: null };
  } catch (error) {
    return {
      status: "unavailable",
      record: null,
      unavailableReason: `the live station is not served here: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function LiveWorldStation({
  record,
  initialElement,
}: {
  readonly record: StationRecord;
  readonly initialElement: string | undefined;
}): ReactNode {
  const [state, dispatch] = useReducer(
    (state: StationViewState, command: StationCommand): StationViewState => {
      const reduced = reduceStationCommand(record, state, command);
      return reduced.ok ? reduced.state : state;
    },
    record,
    (r) => initialStationViewState(r),
  );
  useEffect(() => {
    if (initialElement !== undefined) {
      dispatch({ kind: "select-element", elementId: initialElement });
    }
  }, [initialElement]);
  return <WorldStation record={record} state={state} dispatch={dispatch} />;
}

/** The world screen: the committed station, or the LIVE served station. */
export function WorldScreen({ query }: { readonly query: WorldQuery }): ReactNode {
  const [live, setLive] = useState<LiveStationState>({ status: "idle", record: null, unavailableReason: null });

  useEffect(() => {
    if (query.project === undefined) {
      return;
    }
    let cancelled = false;
    setLive({ status: "loading", record: null, unavailableReason: null });
    void fetchLiveStationRecord(query.project, query.case).then((result) => {
      if (!cancelled) {
        setLive(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query.project, query.case]);

  if (query.project !== undefined) {
    if (live.status === "served" && live.record !== null) {
      return (
        <section aria-label="Live engineering world">
          <LiveWorldStation record={live.record} initialElement={query.element} />
        </section>
      );
    }
    return (
      <section aria-label="Live engineering world (unavailable)">
        {live.status === "loading" ? (
          <p className="world-live-note" data-testid="world-live-loading">
            opening the live world station for {query.project}…
          </p>
        ) : (
          <p className="world-live-note" data-testid="world-live-unavailable" role="status">
            {live.unavailableReason ?? "the live station is unavailable"} — the committed
            station renders below (the honest fallback, never a fabricated live station).
          </p>
        )}
        <StandaloneWorldStation record={COMMITTED_RECORD} />
      </section>
    );
  }
  return <StandaloneWorldStation record={COMMITTED_RECORD} />;
}

/** The canonical world route link (the nav affordance helper). */
export function worldRouteHref(query: WorldQuery = {}): string {
  return formatRoute({ name: "world", query });
}
