import type { CSSProperties } from "react";

/**
 * GBIM-003 — sandbox styles (CSS-in-JS, host-agnostic: no Tailwind/external
 * dependency — the spike must render identically inside any host bundler).
 *
 * Spike-only code (NOT production engine code).
 */

export interface SpikeTheme {
  readonly bg: string;
  readonly panel: string;
  readonly panelAlt: string;
  readonly border: string;
  readonly text: string;
  readonly textDim: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly good: string;
  readonly warn: string;
  readonly bad: string;
  readonly proposed: string;
  readonly mono: string;
}

export const THEME: SpikeTheme = {
  bg: "#f5f4f1",
  panel: "#ffffff",
  panelAlt: "#faf9f7",
  border: "#d8d4cc",
  text: "#2b2925",
  textDim: "#6f6a61",
  accent: "#8a6d3b",
  accentSoft: "#f0e9dd",
  good: "#2e7d4f",
  warn: "#a05a00",
  bad: "#b3362b",
  proposed: "#4a6fa5",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

export const layout: Record<string, CSSProperties> = {
  app: {
    display: "flex",
    flexDirection: "column" as const,
    minHeight: "100vh",
    background: THEME.bg,
    color: THEME.text,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    background: THEME.panel,
    borderBottom: `1px solid ${THEME.border}`,
    flexWrap: "wrap" as const,
  },
  title: { fontSize: 15, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 12, color: THEME.textDim, margin: 0 },
  main: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    flexWrap: "wrap" as const,
  },
  sidebar: {
    width: 292,
    minWidth: 260,
    borderRight: `1px solid ${THEME.border}`,
    background: THEME.panel,
    overflowY: "auto" as const,
    maxHeight: "calc(100vh - 96px)",
  },
  content: { flex: 1, minWidth: 320, display: "flex", flexDirection: "column" as const },
  pane: { padding: 12, overflowY: "auto" as const, maxHeight: "calc(100vh - 96px)" },
  section: {
    padding: "10px 12px",
    borderBottom: `1px solid ${THEME.border}`,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase" as const,
    color: THEME.textDim,
    margin: "0 0 8px",
  },
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  button: {
    fontSize: 12,
    padding: "6px 10px",
    border: `1px solid ${THEME.border}`,
    background: THEME.panel,
    color: THEME.text,
    borderRadius: 6,
    cursor: "pointer",
  },
  buttonPrimary: {
    fontSize: 12,
    padding: "6px 12px",
    border: "1px solid #77592c",
    background: THEME.accent,
    color: "#fff",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
  },
  buttonActive: {
    fontSize: 12,
    padding: "6px 10px",
    border: `1px solid ${THEME.accent}`,
    background: THEME.accentSoft,
    color: THEME.text,
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
  },
  input: {
    fontSize: 12,
    padding: "5px 7px",
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    width: 64,
    background: THEME.panel,
    color: THEME.text,
  },
  inputWide: {
    fontSize: 12,
    padding: "6px 8px",
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    flex: 1,
    background: THEME.panel,
    color: THEME.text,
  },
  select: {
    fontSize: 12,
    padding: "5px 7px",
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    background: THEME.panel,
    color: THEME.text,
  },
  card: {
    border: `1px solid ${THEME.border}`,
    borderRadius: 8,
    background: THEME.panel,
    padding: 10,
    marginBottom: 8,
  },
  badge: {
    display: "inline-block",
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 4,
    letterSpacing: 0.3,
    textTransform: "uppercase" as const,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 12,
  },
  th: {
    textAlign: "left" as const,
    padding: "5px 8px",
    borderBottom: `1px solid ${THEME.border}`,
    fontSize: 11,
    color: THEME.textDim,
    whiteSpace: "nowrap" as const,
  },
  td: {
    padding: "5px 8px",
    borderBottom: `1px solid ${THEME.border}`,
    verticalAlign: "top" as const,
  },
  mono: { fontFamily: THEME.mono, fontSize: 11 },
  dim: { color: THEME.textDim },
  small: { fontSize: 11 },
  viewportWrap: {
    position: "relative" as const,
    flex: 1,
    minHeight: 420,
    background: "#eceae6",
    borderTop: `1px solid ${THEME.border}`,
  },
  canvas: { width: "100%", height: "100%", display: "block" },
  overlayTop: {
    position: "absolute" as const,
    top: 8,
    left: 8,
    right: 8,
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    pointerEvents: "none" as const,
  },
  overlayChip: {
    background: "rgba(255,255,255,0.92)",
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    fontSize: 11,
    padding: "3px 8px",
    pointerEvents: "auto" as const,
  },
  hud: {
    border: `1px solid ${THEME.accent}`,
    background: THEME.accentSoft,
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
  },
  listScroll: { maxHeight: 320, overflowY: "auto" as const },
};

export function badgeStyle(kind: string): CSSProperties {
  if (kind === "applied" || kind === "pass" || kind === "PROVEN" || kind === "complete") {
    return { ...layout.badge, background: "#dcf0e3", color: THEME.good } as CSSProperties;
  }
  if (kind === "unsupported" || kind === "review-needed" || kind === "PARTIAL" || kind === "DEFERRED" || kind === "needs-input" || kind === "undone") {
    return { ...layout.badge, background: "#f7ecd9", color: THEME.warn } as CSSProperties;
  }
  if (kind === "invalid" || kind === "fail" || kind === "DIVERGENT" || kind === "REFUSED") {
    return { ...layout.badge, background: "#f8ddd9", color: THEME.bad } as CSSProperties;
  }
  return { ...layout.badge, background: "#e8e6e1", color: THEME.textDim } as CSSProperties;
}
