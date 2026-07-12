/** Opt-in flow/course coordination debug — add `rngDebug=1` to any frame URL. */

export function flowDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("rngDebug") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function flowDebug(scope: string, message: string, data?: Record<string, unknown>) {
  if (!flowDebugEnabled()) return;
  if (data) console.info(`[rng:${scope}] ${message}`, data);
  else console.info(`[rng:${scope}] ${message}`);
}

export function appendFlowDebugQuery(path: string): string {
  if (!flowDebugEnabled()) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}rngDebug=1`;
}

type DebugPanelState = {
  lines: string[];
};

const panelState: DebugPanelState = { lines: [] };

export function flowDebugPanel(scope: string, line: string) {
  if (!flowDebugEnabled()) return;
  const stamp = new Date().toISOString().slice(11, 19);
  panelState.lines.push(`${stamp} [${scope}] ${line}`);
  if (panelState.lines.length > 24) panelState.lines.shift();

  let el = document.getElementById("rng-flow-debug");
  if (!el) {
    el = document.createElement("pre");
    el.id = "rng-flow-debug";
    el.setAttribute("aria-live", "polite");
    Object.assign(el.style, {
      position: "fixed",
      left: "8px",
      bottom: "8px",
      zIndex: "99999",
      maxWidth: "min(96vw, 520px)",
      maxHeight: "40vh",
      overflow: "auto",
      margin: "0",
      padding: "8px 10px",
      font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
      color: "#e8eef5",
      background: "rgba(8, 16, 32, 0.92)",
      border: "1px solid rgba(255,255,255,0.2)",
      borderRadius: "8px",
      pointerEvents: "none",
      whiteSpace: "pre-wrap",
    });
    document.body.appendChild(el);
  }
  el.textContent = panelState.lines.join("\n");
}
