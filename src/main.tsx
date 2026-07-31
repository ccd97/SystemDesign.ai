import React from "react";
import ReactDOM from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";
import { App } from "./App";
import { ensureSharedCtx } from "./shared/lib/audio/pcmCapture";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Pre-warm AudioContext + worklet on first user interaction (avoids autoplay policy warning)
document.addEventListener("pointerdown", () => ensureSharedCtx(), { once: true });
