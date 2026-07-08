import type { CertificateMergeField } from "@rngames/shared";
import { CERTIFICATE_MERGE_HINTS } from "@rngames/shared";
import { CollapsibleSection } from "./CollapsibleSection";
import { HexField } from "./HexField";
import { BgUploadRow } from "./BgUploadRow";

type Props = {
  mergeFields: CertificateMergeField[];
  onChange: (fields: CertificateMergeField[]) => void;
  backgroundUrl: string;
  onBackground: (url: string) => void;
  canvasWidth: number;
  canvasHeight: number;
  onCanvas: (w: number, h: number) => void;
  downloadLabel: string;
  onDownloadLabel: (v: string) => void;
};

function newMergeId() {
  return `mf${Date.now().toString(36)}`;
}

export function CertificateEditorFields({
  mergeFields,
  onChange,
  backgroundUrl,
  onBackground,
  canvasWidth,
  canvasHeight,
  onCanvas,
  downloadLabel,
  onDownloadLabel,
}: Props) {
  function update(i: number, patch: Partial<CertificateMergeField>) {
    const next = [...mergeFields];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  return (
    <div>
      <BgUploadRow
        label="Certificate background"
        hint="Upload the certificate artwork (PNG/JPG). Merge fields are positioned as percentages over this image."
        value={backgroundUrl}
        onUploaded={onBackground}
      />
      <div className="grid2" style={{ marginTop: 12 }}>
        <label className="field">
          Canvas width (px)
          <input
            type="number"
            min={320}
            value={canvasWidth}
            onChange={(e) => onCanvas(Number(e.target.value) || 1200, canvasHeight)}
          />
        </label>
        <label className="field">
          Canvas height (px)
          <input
            type="number"
            min={240}
            value={canvasHeight}
            onChange={(e) => onCanvas(canvasWidth, Number(e.target.value) || 848)}
          />
        </label>
        <label className="field">
          Download / continue button label
          <input value={downloadLabel} onChange={(e) => onDownloadLabel(e.target.value)} />
        </label>
      </div>

      <h4 style={{ marginTop: 20 }}>Merge fields</h4>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Session keys pull values from earlier steps. Common keys:
      </p>
      <ul className="muted" style={{ fontSize: "0.85rem", marginTop: 4, paddingLeft: 20 }}>
        {CERTIFICATE_MERGE_HINTS.map((h) => (
          <li key={h.key}>
            <code>{h.key}</code> — {h.label}
          </li>
        ))}
      </ul>

      {mergeFields.map((mf, i) => (
        <CollapsibleSection key={mf.id} title={mf.label || `Field ${i + 1}`} summary={mf.sourceKey}>
          <div className="grid2">
            <label className="field">
              Label (fallback)
              <input value={mf.label} onChange={(e) => update(i, { label: e.target.value })} />
            </label>
            <label className="field">
              Session source key
              <input value={mf.sourceKey} onChange={(e) => update(i, { sourceKey: e.target.value })} />
            </label>
            <label className="field">
              X position (%)
              <input
                type="number"
                min={0}
                max={100}
                value={mf.xPercent}
                onChange={(e) => update(i, { xPercent: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Y position (%)
              <input
                type="number"
                min={0}
                max={100}
                value={mf.yPercent}
                onChange={(e) => update(i, { yPercent: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Font size (px)
              <input
                type="number"
                min={8}
                value={mf.fontSizePx}
                onChange={(e) => update(i, { fontSizePx: Number(e.target.value) })}
              />
            </label>
            <HexField label="Colour" value={mf.colorHex} onChange={(v) => update(i, { colorHex: v })} />
            <label className="field">
              Text alignment
              <select
                value={mf.textAlign || "center"}
                onChange={(e) => update(i, { textAlign: e.target.value as "left" | "center" | "right" })}
              >
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <input
              type="checkbox"
              checked={mf.fontWeight === "bold"}
              onChange={(e) => update(i, { fontWeight: e.target.checked ? "bold" : "normal" })}
            />
            Bold
          </label>
          <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => onChange(mergeFields.filter((_, j) => j !== i))}>
            Remove field
          </button>
        </CollapsibleSection>
      ))}

      <button
        type="button"
        className="btn"
        style={{ marginTop: 8 }}
        onClick={() =>
          onChange([
            ...mergeFields,
            {
              id: newMergeId(),
              label: "New field",
              sourceKey: "form.fieldValues.name",
              xPercent: 50,
              yPercent: 50,
              fontSizePx: 32,
              colorHex: "#1a1a1a",
              fontWeight: "bold",
              textAlign: "center",
            },
          ])
        }
      >
        Add merge field
      </button>
    </div>
  );
}
