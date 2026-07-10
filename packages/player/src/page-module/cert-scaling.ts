export type ScaledMergeField = {
  xPercent: number;
  yPercent: number;
  fontSizePx: number;
  colorHex?: string;
  fontWeight?: string;
  textAlign?: string;
  sourceKey: string;
  label: string;
};

/** Scale merge-field font sizes to match responsive certificate/badge canvas width. */
export function mountScaledMergeOverlay(
  stage: HTMLElement,
  overlay: HTMLElement,
  canvasWidth: number,
  fields: ScaledMergeField[],
  resolveText: (field: ScaledMergeField) => string,
): void {
  overlay.replaceChildren();
  const entries: { el: HTMLElement; field: ScaledMergeField }[] = [];

  for (const mf of fields) {
    const el = document.createElement("div");
    el.className = `cert-field cert-field--${mf.textAlign || "center"}`;
    el.style.left = `${mf.xPercent}%`;
    el.style.top = `${mf.yPercent}%`;
    el.style.color = mf.colorHex || "";
    el.style.fontWeight = mf.fontWeight === "bold" ? "700" : "400";
    el.textContent = resolveText(mf);
    overlay.appendChild(el);
    entries.push({ el, field: mf });
  }

  const layout = () => {
    const w = stage.getBoundingClientRect().width;
    const scale = w > 0 ? w / canvasWidth : 1;
    for (const { el, field } of entries) {
      el.style.fontSize = `${field.fontSizePx * scale}px`;
    }
  };

  layout();
  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);
}
