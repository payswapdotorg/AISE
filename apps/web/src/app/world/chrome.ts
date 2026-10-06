/**
 * WORLD-P5 Mount 3 — the chrome's AUDIO HOOKS (typed, capability-honest,
 * presentation-only).
 *
 * THE LAWS this module holds:
 *
 *  - BROWSER-SAFE, ZERO-RUNTIME-IMPORTS: no import statement anywhere —
 *    the module composes into a plain-browser bundle beside the
 *    crypto-free station interaction layer (the WebAudio types come
 *    from the ambient DOM lib, erased at runtime);
 *  - A CLOSED CUE VOCABULARY: exactly six cues (`AUDIO_CUE_KINDS`) —
 *    nothing else can ever be requested;
 *  - A PURE COMMAND→CUE MAPPING: `audioCueOf` is a total function of
 *    the typed command outcome (same input → same cue; refusals answer
 *    the refusal cue fail-closed; an unknown command kind answers null
 *    — never a fabricated cue);
 *  - A SYNTHESIZED SINK (NO AUDIO ASSETS): every cue is a short
 *    oscillator envelope scheduled on a lazily-constructed WebAudio
 *    context — zero audio files, zero network;
 *  - CAPABILITY-HONEST: where the environment has no AudioContext
 *    (Node/bun) the sink answers the typed `unavailable` state and
 *    `play` answers `{ ok: false, reason }` — it never throws and
 *    never fabricates; in a browser the sink only becomes audible
 *    after a real user gesture (the autoplay policy) — the gesture
 *    gate is notified through `notifyUserGesture`;
 *  - PRESENTATION-ONLY: audio never affects rendered markup or typed
 *    state — a cue that fails to play is swallowed by the mount as
 *    an honest, invisible-as-data degradation.
 */

/* ------------------------------------------------------------------ */
/* The closed cue vocabulary                                            */
/* ------------------------------------------------------------------ */

/** The chrome's whole audio cue vocabulary — a CLOSED set. */
export const AUDIO_CUE_KINDS = [
  "select",
  "ghost-select",
  "camera",
  "layer",
  "refusal",
  "clear",
] as const;

/** One cue kind (exactly the members of `AUDIO_CUE_KINDS`). */
export type AudioCueKind = (typeof AUDIO_CUE_KINDS)[number];

/**
 * The input of the pure command→cue mapping: the dispatched command
 * (any typed shape with a `kind`), the reducer's outcome, and — for
 * selections — the resolved hit status (the selected element's
 * governed status), which is what distinguishes a ghost selection.
 */
export interface AudioCueInput {
  readonly command: { readonly kind: string } & Record<string, unknown>;
  readonly ok: boolean;
  readonly hitStatus?: string | null;
}

/* ------------------------------------------------------------------ */
/* The pure command→cue mapping                                         */
/* ------------------------------------------------------------------ */

/**
 * Map one typed command outcome to its audio cue. PURE and fail-closed:
 *
 *   - any refusal (`ok: false`) answers the refusal cue;
 *   - `select-element` answers `select` (a plain hit) or `ghost-select`
 *     (a hit onto a proposed-ghost / proposed-removed element);
 *   - `camera-operation` answers `camera`; `toggle-layer` answers
 *     `layer`; `clear-selection` answers `clear`;
 *   - an unknown command kind with `ok: true` answers null — the
 *     closed vocabulary is never stretched, never fabricated.
 */
export function audioCueOf(input: AudioCueInput): AudioCueKind | null {
  if (!input.ok) {
    return "refusal";
  }
  switch (input.command.kind) {
    case "select-element":
      return input.hitStatus === "proposed-ghost" ||
        input.hitStatus === "proposed-removed"
        ? "ghost-select"
        : "select";
    case "camera-operation":
      return "camera";
    case "toggle-layer":
      return "layer";
    case "clear-selection":
      return "clear";
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* The user-gesture gate (the autoplay policy, honored)                 */
/* ------------------------------------------------------------------ */

/**
 * The user-gesture flag shared by the page's cue sinks: the chrome
 * calls this on the FIRST pointerdown/keydown so the sink may become
 * audible (presentation-only state — never rendered, never typed into
 * the station's view state).
 */
let userGestureObserved = false;

/** Notify the audio hooks that a real user gesture happened. */
export function notifyUserGesture(): void {
  userGestureObserved = true;
}

/* ------------------------------------------------------------------ */
/* The synthesized cue recipes (pure data — no audio assets)            */
/* ------------------------------------------------------------------ */

/** One synthesized tone: an oscillator envelope over [start, start+dur]. */
interface AudioToneStep {
  readonly type: "sine" | "square" | "triangle";
  readonly fromHz: number;
  readonly toHz: number;
  readonly durationSeconds: number;
  readonly gain: number;
  /** The step's offset from the cue's base time (two-tone sequences). */
  readonly startSeconds: number;
}

/**
 * The cue recipes: distinct short oscillator envelopes per kind —
 *   select       a single 660 Hz blip;
 *   ghost-select a two-tone 620→930 Hz answer (the proposal signal);
 *   camera       a soft 320→520 Hz triangle sweep;
 *   layer        a 980 Hz tick;
 *   refusal      a low 110–130 Hz double buzz;
 *   clear        a 720→300 Hz down-chirp.
 */
const AUDIO_CUE_RECIPES: Readonly<Record<AudioCueKind, readonly AudioToneStep[]>> = {
  select: [
    { type: "sine", fromHz: 660, toHz: 660, durationSeconds: 0.07, gain: 0.05, startSeconds: 0 },
  ],
  "ghost-select": [
    { type: "sine", fromHz: 620, toHz: 620, durationSeconds: 0.06, gain: 0.05, startSeconds: 0 },
    { type: "sine", fromHz: 930, toHz: 930, durationSeconds: 0.09, gain: 0.05, startSeconds: 0.07 },
  ],
  camera: [
    { type: "triangle", fromHz: 320, toHz: 520, durationSeconds: 0.22, gain: 0.035, startSeconds: 0 },
  ],
  layer: [
    { type: "square", fromHz: 980, toHz: 940, durationSeconds: 0.04, gain: 0.02, startSeconds: 0 },
  ],
  refusal: [
    { type: "square", fromHz: 130, toHz: 110, durationSeconds: 0.09, gain: 0.045, startSeconds: 0 },
    { type: "square", fromHz: 120, toHz: 100, durationSeconds: 0.1, gain: 0.045, startSeconds: 0.11 },
  ],
  clear: [
    { type: "sine", fromHz: 720, toHz: 300, durationSeconds: 0.16, gain: 0.045, startSeconds: 0 },
  ],
};

/** The envelope constants (click-free attack/release, muted floor). */
const ATTACK_SECONDS = 0.006;
const RELEASE_SECONDS = 0.03;
const MUTE_GAIN = 0.0001;

/** The typed honest reasons (fail-closed plain string codes). */
const AUDIO_ENV_REASON = "no AudioContext in this environment";
const AUDIO_GATE_REASON = "audio is gated on the first user gesture (autoplay policy)";

/** Does THIS environment carry a WebAudio AudioContext? (Safe in any
 *  runtime — a `typeof` probe, never a reference.) */
function audioEnvironmentReady(): boolean {
  return typeof AudioContext !== "undefined";
}

/** Schedule one tone step on the audio graph. ONLY reachable after the
 *  availability checks in `play` (the module stays import-safe where
 *  no AudioContext exists). */
function scheduleTone(context: AudioContext, step: AudioToneStep, baseTime: number): void {
  const startAt = baseTime + step.startSeconds;
  const endAt = startAt + step.durationSeconds;
  const holdUntil = Math.max(startAt + ATTACK_SECONDS + 0.001, endAt - RELEASE_SECONDS);
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = step.type;
  oscillator.frequency.setValueAtTime(step.fromHz, startAt);
  if (step.toHz !== step.fromHz) {
    oscillator.frequency.exponentialRampToValueAtTime(step.toHz, endAt);
  }
  gain.gain.setValueAtTime(MUTE_GAIN, startAt);
  gain.gain.linearRampToValueAtTime(step.gain, startAt + ATTACK_SECONDS);
  gain.gain.setValueAtTime(step.gain, holdUntil);
  gain.gain.exponentialRampToValueAtTime(MUTE_GAIN, endAt);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.02);
}

/* ------------------------------------------------------------------ */
/* The cue sink (capability-honest, lazily constructed)                 */
/* ------------------------------------------------------------------ */

/** The outcome of one cue attempt (typed, fail-closed — never throws). */
export interface AudioCuePlayOutcome {
  readonly ok: boolean;
  readonly reason: string | null;
}

/** The chrome's synthesized-cue sink. */
export interface AudioCueSink {
  /** May the sink become audible right now (env + gesture gate)? */
  readonly available: boolean;
  /** The typed honest reason when not available (else null). */
  readonly reason: string | null;
  /** Play one cue (best-effort synthesized; fail-closed, never throws). */
  play(cue: AudioCueKind): AudioCuePlayOutcome;
}

/**
 * Create the synthesized-cue sink. The WebAudio context is constructed
 * LAZILY on the first `play` that passes the availability checks —
 * importing this module (bun included) constructs no audio graph.
 */
export function createAudioCueSink(): AudioCueSink {
  let context: AudioContext | null = null;
  return {
    get available(): boolean {
      return audioEnvironmentReady() && userGestureObserved;
    },
    get reason(): string | null {
      if (!audioEnvironmentReady()) {
        return AUDIO_ENV_REASON;
      }
      if (!userGestureObserved) {
        return AUDIO_GATE_REASON;
      }
      return null;
    },
    play(cue: AudioCueKind): AudioCuePlayOutcome {
      if (!audioEnvironmentReady()) {
        return { ok: false, reason: AUDIO_ENV_REASON };
      }
      if (!userGestureObserved) {
        return { ok: false, reason: AUDIO_GATE_REASON };
      }
      try {
        if (context === null) {
          context = new AudioContext();
        }
        if (context.state === "suspended") {
          context.resume().catch((): void => undefined);
        }
        const baseTime = context.currentTime;
        for (const step of AUDIO_CUE_RECIPES[cue]) {
          scheduleTone(context, step, baseTime);
        }
        return { ok: true, reason: null };
      } catch (error) {
        /* Fail-closed: a failed cue never throws, never fabricates —
         * the typed reason is the whole honest answer. */
        context = null;
        return {
          ok: false,
          reason: `audio cue '${cue}' failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },
  };
}
