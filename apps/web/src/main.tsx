/**
 * PROD-002 — the browser entrypoint bootstrap: mounts the product
 * application (the React shell) on the #app element. The placeholder
 * textContent output is gone — the entry renders the real UI.
 */

import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/app.css";

const container = document.getElementById("app");
if (container !== null) {
  createRoot(container).render(<App />);
}
