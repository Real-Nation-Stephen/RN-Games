import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { apiGet, apiSend, uploadFile } from "../api";

type Wheel = {
  id: string;
  title: string;
  clientName: string;
  slug: string;
  updatedAt: string;
  reportingEnabled: boolean;
  reportingLockedAt?: string | null;
  prizeSchemaVersion: number;
  segmentCount: number;
  prizes: string[];
  segmentOutcome: boolean[];
  weights: number[] | null;
  useWeightedSpin: boolean;
  wheelRotationOffsetDeg: number;
  assets: Record<string, string | null | string[]>;
  sounds: {
    spin?: string | null;
    segmentReveal?: (string | null)[];
    music?: string | null;
    musicVolume?: number;
  };
  spin: Record<string, number | string>;
  landscape: { minAspectRatio: number };
  thumbnailUrl?: string;
  faviconUrl?: string;
};

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

export default function WheelEditor() {
  const { id } = useParams<{ id: string }>();
  const [wheel, setWheel] = useState<Wheel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = await apiGet(`/api/wheels?id=${encodeURIComponent(id)}`);
      setWheel(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pushPreview = useCallback(() => {
    if (!wheel || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "rngames-wheel-config", config: publicConfig(wheel) },
      window.location.origin,
    );
  }, [wheel]);

  /** Live-sync preview when wheel state changes (debounced). */
  useEffect(() => {
    if (!wheel) return;
    const t = window.setTimeout(() => pushPreview(), 80);
    return () => window.clearTimeout(t);
  }, [wheel, pushPreview]);

  async function save() {
    if (!wheel) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiSend("/api/wheels", "PUT", wheel);
      if (res?.wheel) setWheel(res.wheel);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveWithThumbnail() {
    if (!wheel) return;
    await save();
    pushPreview();
    await new Promise((r) => setTimeout(r, 400));
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const fit = iframe.contentDocument.getElementById("fit");
    if (!fit) return;
    try {
      const canvas = await html2canvas(fit, {
        scale: 0.35,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: "#000000",
      });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
      if (!blob) return;
      const file = new File([blob], `thumb-${wheel.id}.jpg`, { type: "image/jpeg" });
      const { url } = await uploadFile(file);
      const res = await apiSend("/api/wheels", "PUT", { ...wheel, thumbnailUrl: url });
      if (res?.wheel) setWheel(res.wheel);
    } catch {
      /* optional */
    }
  }

  async function downloadPdf() {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    pushPreview();
    await new Promise((r) => setTimeout(r, 150));
    const fit = iframe.contentDocument.getElementById("fit");
    if (!fit) return;
    const canvas = await html2canvas(fit, {
      scale: 0.5,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: "#000000",
    });
    const img = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
    pdf.addImage(img, "JPEG", 0, 0, canvas.width, canvas.height);
    pdf.save(`${wheel?.slug || "wheel"}-preview.pdf`);
  }

  function setSegmentCount(n: number) {
    if (!wheel || n < 2 || n > 64) return;
    setWheel({
      ...wheel,
      segmentCount: n,
      prizes: Array.from({ length: n }, (_, i) => wheel.prizes[i] ?? `Prize ${i + 1}`),
      segmentOutcome: Array.from({ length: n }, (_, i) =>
        wheel.segmentOutcome[i] !== undefined ? wheel.segmentOutcome[i] : i % 2 === 1,
      ),
      sounds: {
        ...wheel.sounds,
        segmentReveal: Array.from({ length: n }, (_, i) => wheel.sounds.segmentReveal?.[i] ?? null),
      },
      assets: {
        ...wheel.assets,
        segmentPanels: Array.from({ length: n }, (_, i) => wheel.assets.segmentPanels?.[i] ?? null),
      },
    });
  }

  async function pickAsset(key: string, file: File) {
    if (!wheel) return;
    const { url } = await uploadFile(file);
    setWheel({
      ...wheel,
      assets: { ...wheel.assets, [key]: url },
    });
  }

  if (!wheel) {
    return err ? <p className="muted">{err}</p> : <p className="muted">Loading…</p>;
  }

  return (
    <div>
      <p>
        <Link to="/">← Wheels</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>Edit wheel</h2>
      {err && <p className="muted">{err}</p>}

      <div className="card">
        <div className="grid2">
          <div>
            <label className="field">Title</label>
            <input
              type="text"
              value={wheel.title}
              onChange={(e) => setWheel({ ...wheel, title: e.target.value })}
            />
          </div>
          <div>
            <label className="field">Client</label>
            <input
              type="text"
              value={wheel.clientName}
              onChange={(e) => setWheel({ ...wheel, clientName: e.target.value })}
            />
          </div>
          <div>
            <label className="field">Sub-URL (slug)</label>
            <input
              type="text"
              value={wheel.slug}
              onChange={(e) => setWheel({ ...wheel, slug: e.target.value.trim().toLowerCase() })}
            />
          </div>
          <div>
            <label className="field">Wheel rotation offset (deg)</label>
            <input
              type="number"
              value={wheel.wheelRotationOffsetDeg}
              onChange={(e) => setWheel({ ...wheel, wheelRotationOffsetDeg: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={wheel.reportingEnabled}
            onChange={(e) => setWheel({ ...wheel, reportingEnabled: e.target.checked })}
          />
          Enable reporting (locks prize/segment schema while on)
        </label>
        <p className="muted" style={{ marginTop: 8 }}>
          Public URL: <code>{`${siteUrl}/${wheel.slug}`}</code>
          {wheel.reportingEnabled && (
            <>
              {" "}
              · Report: <code>{`${siteUrl}/${wheel.slug}_Report`}</code>
            </>
          )}
        </p>
        <label className="field" style={{ marginTop: 12 }}>
          Tab icon (wheel pages only)
        </label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon,.ico"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            setWheel({ ...wheel, faviconUrl: url });
          }}
        />
        {wheel.faviconUrl ? <span className="muted"> ✓</span> : null}
      </div>

      <div className="card">
        <label className="field">Segments</label>
        <input
          type="number"
          min={2}
          max={64}
          value={wheel.segmentCount}
          onChange={(e) => setSegmentCount(Number(e.target.value))}
        />
        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Prize label</th>
              <th>Win (confetti)</th>
              <th>Headline / copy (result)</th>
              <th>Reveal sound</th>
            </tr>
          </thead>
          <tbody>
            {wheel.prizes.map((p, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <input
                    type="text"
                    value={p}
                    onChange={(e) => {
                      const prizes = [...wheel.prizes];
                      prizes[i] = e.target.value;
                      setWheel({ ...wheel, prizes });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={wheel.segmentOutcome[i]}
                    onChange={(e) => {
                      const segmentOutcome = [...wheel.segmentOutcome];
                      segmentOutcome[i] = e.target.checked;
                      setWheel({ ...wheel, segmentOutcome });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const { url } = await uploadFile(f);
                      const segmentPanels = [
                        ...(wheel.assets.segmentPanels || Array.from({ length: wheel.segmentCount }, () => null)),
                      ];
                      segmentPanels[i] = url;
                      setWheel({
                        ...wheel,
                        assets: { ...wheel.assets, segmentPanels },
                      });
                    }}
                  />
                  {wheel.assets.segmentPanels?.[i] && <span className="muted"> ✓</span>}
                </td>
                <td>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const { url } = await uploadFile(f);
                      const segmentReveal = [...(wheel.sounds.segmentReveal || [])];
                      segmentReveal[i] = url;
                      setWheel({ ...wheel, sounds: { ...wheel.sounds, segmentReveal } });
                    }}
                  />
                  {wheel.sounds.segmentReveal?.[i] && <span className="muted"> ✓</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Stage assets</h3>
        <AssetRow label="Logo" onFile={(f) => void pickAsset("logo", f)} />
        <AssetRow label="Headline / copy" onFile={(f) => void pickAsset("headline", f)} />
        <AssetRow label="Spin button" onFile={(f) => void pickAsset("button", f)} />
        <AssetRow label="Restart button" onFile={(f) => void pickAsset("restart", f)} />
        <AssetRow label="Background" onFile={(f) => void pickAsset("background", f)} />
        <AssetRow label="Wheel" onFile={(f) => void pickAsset("wheel", f)} />
        <AssetRow label="Frame" onFile={(f) => void pickAsset("frame", f)} />
        <AssetRow label="Win panel (fallback)" onFile={(f) => void pickAsset("winPanel", f)} />
        <AssetRow label="Lose panel (fallback)" onFile={(f) => void pickAsset("losePanel", f)} />
        <p className="muted" style={{ marginTop: 8 }}>
          Per-segment headline/copy images are set in the segments table. Win/lose panels above are used only when a
          segment has no result image.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Music (optional)</h3>
        <input
          type="file"
          accept="audio/*"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            setWheel({ ...wheel, sounds: { ...wheel.sounds, music: url } });
          }}
        />
        <label className="field" style={{ marginTop: 8 }}>
          Volume
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={wheel.sounds.musicVolume ?? 0.35}
          onChange={(e) =>
            setWheel({
              ...wheel,
              sounds: { ...wheel.sounds, musicVolume: Number(e.target.value) },
            })
          }
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Live preview</h3>
        <p className="muted">Updates the iframe with your current settings (not saved to server until you Save).</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" onClick={() => pushPreview()}>
            Refresh preview
          </button>
          <button type="button" className="btn" onClick={() => void downloadPdf()}>
            Download PDF
          </button>
          <button type="button" className="btn" onClick={() => window.open(`${siteUrl}/${wheel.slug}`, "_blank")}>
            Open public wheel
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title="Preview"
          src={`/play/index.html?preview=1`}
          onLoad={() => pushPreview()}
          style={{ width: "100%", height: 420, border: "1px solid var(--rn-border)", borderRadius: 8, background: "#000" }}
        />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn" disabled={saving} onClick={() => void saveWithThumbnail()}>
          Save + thumbnail
        </button>
      </div>
    </div>
  );
}

function AssetRow({ label, onFile }: { label: string; onFile: (f: File) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="field">{label}</label>
      <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}

function publicConfig(w: Wheel) {
  return {
    id: w.id,
    title: w.title,
    slug: w.slug,
    faviconUrl: w.faviconUrl,
    segmentCount: w.segmentCount,
    prizes: w.prizes,
    segmentOutcome: w.segmentOutcome,
    weights: w.weights,
    useWeightedSpin: w.useWeightedSpin,
    wheelRotationOffsetDeg: w.wheelRotationOffsetDeg,
    assets: w.assets,
    sounds: w.sounds,
    spin: w.spin,
    landscape: w.landscape,
    reportingEnabled: w.reportingEnabled,
    prizeSchemaVersion: w.prizeSchemaVersion,
  };
}
