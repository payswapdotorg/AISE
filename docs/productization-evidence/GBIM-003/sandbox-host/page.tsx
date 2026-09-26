"use client";

/**
 * GBIM-003 — the sandbox host page: mounts the Spatial Studio spike
 * (sourced from the AISE clone at ./AISE/apps/spatial-studio-spike) as a
 * client-only component (Three.js requires the browser).
 */

import dynamic from "next/dynamic";

const SandboxApp = dynamic(() => import("@spike/client/components/SandboxApp").then((mod) => mod.SandboxApp), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", background: "#f5f4f1", minHeight: "100vh" }}>
      <p style={{ fontWeight: 700 }}>AISE Spatial Studio — GBIM-003 spike sandbox</p>
      <p style={{ color: "#6f6a61", fontSize: 13 }}>loading the sandbox (Three.js + AISE engine projection)…</p>
    </div>
  ),
});

export default function Home() {
  return <SandboxApp />;
}
