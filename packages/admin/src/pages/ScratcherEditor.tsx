import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { apiGet, apiSend, apiDelete, uploadFile } from "../api";

type ScratcherFormatId = "16x9" | "1x1" | "9x16" | "4x3";

type Scratcher = {
  id: string;
  gameType: "scratcher";
  title: string;
  clientName: string;
  slug: string;
  updatedAt: string;
  reportingEnabled: boolean;
  reportingLockedAt?: string | null;
  thumbnailUrl?: string;
  faviconUrl?: string;
  showPoweredBy?: boolean;
  scratcherFormat: ScratcherFormatId;
  assets: {
    top: string;
    bottomWin: string;
    bottomLose: string;
    button: string;
    backgroundImage: string;
  };
  backgroundColor: string;
  sounds: { win?: string | null; lose?: string | null };
  winButtonUrl: string;
  clearThreshold: number;
  winChancePercent: number;
};

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

const FORMAT_LABELS: { id: ScratcherFormatId; label: string }[] = [
  { id: "1x1", label: "1∶1 Square 1920×1920" },
  { id: "9x16", label: "9∶16 Mobile 1080×1920" },
  { id: "16x9", label: "16∶9 Landscape 1920×1080" },
  { id: "4x3", label: "4∶3 Landscape 1920×1440" },
];

/** CSS aspect-ratio for embed iframe (matches design canvas). */
const EMBED_ASPECT: Record<ScratcherFormatId, string> = {
  "1x1": "1 / 1",
  "9x16": "9 / 16",
  "16x9": "16 / 9",
  "4x3": "4 / 3",
};

function getFitHtml2CanvasOptions(iframe: HTMLIFrameElement) {
  const idoc = iframe.contentDocument;
  const idwin = iframe.contentWindow;
  const bgImage =
    idoc && idwin ? idwin.getComputedStyle(idoc.documentElement).getPropertyValue("--page-bg-image").trim() : "";
  const bgSolid =
    idoc && idwin ? idwin.getComputedStyle(idoc.documentElement).getPropertyValue("--page-bg-solid").trim() : "";
  return {
    useCORS: true,
    allowTaint: false,
    logging: false,
    scale: 2,
    backgroundColor: bgSolid || "#0a1628",
    onclone: (doc: Document) => {
      const f = doc.getElementById("fit");
      if (!f) return;
      if (bgSolid) (f as HTMLElement).style.backgroundColor = bgSolid;
      if (bgImage && bgImage !== "none") {
        (f as HTMLElement).style.backgroundImage = bgImage;
        (f as HTMLElement).style.backgroundSize = "cover";
        (f as HTMLElement).style.backgroundPosition = "center";
      }
    },
  };
}

function publicScratcherConfig(s: Scratcher) {
  const lose = (s.assets.bottomLose || "").trim();
  const p = Math.min(100, Math.max(0, s.winChancePercent));
  const winOnly = p >= 100 || !lose;
  return {
    gameType: "scratcher" as const,
    title: s.title,
    slug: s.slug,
    faviconUrl: s.faviconUrl || "",
    showPoweredBy: s.showPoweredBy !== false,
    scratcherFormat: s.scratcherFormat,
    assets: {
      top: s.assets.top || "",
      bottomWin: s.assets.bottomWin || "",
      bottomLose: winOnly ? "" : lose,
      button: s.assets.button || "",
      backgroundImage: s.assets.backgroundImage || "",
    },
    backgroundColor: s.backgroundColor || "#0a1628",
    sounds: { win: s.sounds.win || null, lose: s.sounds.lose || null },
    winButtonUrl: s.winButtonUrl || "",
    clearThreshold: s.clearThreshold,
    winChancePercent: winOnly ? 100 : p,
    reportingEnabled: s.reportingEnabled,
  };
}

export default function ScratcherEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<Scratcher | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = await apiGet(`/api/wheels?id=${encodeURIComponent(id)}`);
      if (data.gameType !== "scratcher") {
        navigate(`/wheels/${id}`, { replace: true });
        return;
      }
      setGame(data as Scratcher);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const pushPreview = useCallback(() => {
    if (!game || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "rngames-scratcher-config", config: publicScratcherConfig(game) },
      window.location.origin,
    );
  }, [game]);

  useEffect(() => {
    if (!game) return;
    const t = window.setTimeout(() => pushPreview(), 80);
    return () => window.clearTimeout(t);
  }, [game, pushPreview]);

  async function save() {
    if (!game) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiSend("/api/wheels", "PUT", game);
      if (res?.wheel) setGame(res.wheel as Scratcher);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGame() {
    if (!game) return;
    const ok = window.confirm(
      "Delete this scratcher and its public URL?\n\nThis cannot be undone.\n\nClick OK to delete, or Cancel to keep it.",
    );
    if (!ok) return;
    setSaving(true);
    setErr(null);
    try {
      await apiDelete(`/api/wheels?id=${encodeURIComponent(game.id)}`);
      navigate("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveWithThumbnail() {
    if (!game) return;
    await save();
    pushPreview();
    await new Promise((r) => setTimeout(r, 500));
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const fit = iframe.contentDocument.getElementById("fit");
    if (!fit) return;
    try {
      const canvas = await html2canvas(fit as HTMLElement, getFitHtml2CanvasOptions(iframe));
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
      if (!blob) return;
      const file = new File([blob], `thumb-${game.id}.jpg`, { type: "image/jpeg" });
      const { url } = await uploadFile(file);
      const res = await apiSend("/api/wheels", "PUT", { ...game, thumbnailUrl: url });
      if (res?.wheel) setGame(res.wheel as Scratcher);
    } catch {
      /* optional */
    }
  }

  async function downloadPdf() {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument || !game) return;
    pushPreview();
    await new Promise((r) => setTimeout(r, 200));
    const fit = iframe.contentDocument.getElementById("fit");
    if (!fit) return;
    const canvas = await html2canvas(fit as HTMLElement, {
      ...getFitHtml2CanvasOptions(iframe),
      scale: 2,
    });
    const img = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
    pdf.addImage(img, "JPEG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
    pdf.save(`${game.slug || "scratcher"}-preview.pdf`);
  }

  async function pickAsset(key: keyof Scratcher["assets"], file: File) {
    if (!game) return;
    const { url } = await uploadFile(file);
    setGame({
      ...game,
      assets: { ...game.assets, [key]: url },
    });
  }

  if (!game) {
    return err ? <p className="muted">{err}</p> : <p className="muted">Loading…</p>;
  }

  const iframeId = `rngames-scratcher-${game.slug.replace(/[^a-z0-9-]/gi, "x")}`;
  const embedCode = `<iframe id="${iframeId}" src="${siteUrl}/play/scratcher-embed.html?slug=${encodeURIComponent(game.slug)}" title="${(game.title || "Scratcher").replace(/"/g, "&quot;")}" style="border:0;width:100%;max-width:100%;aspect-ratio:${EMBED_ASPECT[game.scratcherFormat]};height:auto;display:block;" loading="lazy"></iframe><script>(function(){var id="${iframeId}";function onMsg(e){try{if(!e.data||e.data.type!=="rngames-scratcher-embed-size")return;var f=document.getElementById(id);if(!f||e.source!==f.contentWindow)return;f.style.height=e.data.height+"px";f.style.aspectRatio="unset"}catch(_){}}window.addEventListener("message",onMsg)})();<\/script>`;

  return (
    <div>
      <p>
        <Link to="/">← Studio</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>Edit scratcher</h2>
      {err && <p className="muted">{err}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Game details</h3>
        <div className="grid2">
          <div>
            <label className="field">Title</label>
            <input type="text" value={game.title} onChange={(e) => setGame({ ...game, title: e.target.value })} />
          </div>
          <div>
            <label className="field">Client</label>
            <input type="text" value={game.clientName} onChange={(e) => setGame({ ...game, clientName: e.target.value })} />
          </div>
          <div>
            <label className="field">Sub-URL (slug)</label>
            <input
              type="text"
              value={game.slug}
              onChange={(e) => setGame({ ...game, slug: e.target.value.trim().toLowerCase() })}
            />
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={game.reportingEnabled}
            onChange={(e) => setGame({ ...game, reportingEnabled: e.target.checked })}
          />
          Enable reporting (Sheets integration for scratchers can follow the same pattern as wheels.)
        </label>
        <p className="muted" style={{ marginTop: 8 }}>
          Public URL: <code>{`${siteUrl}/${game.slug}`}</code> (opens full scratcher page)
        </p>
        <label className="field" style={{ marginTop: 12 }}>
          Tab icon
        </label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon,.ico"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            setGame({ ...game, faviconUrl: url });
          }}
        />
        {game.faviconUrl ? <span className="muted"> ✓</span> : null}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={game.showPoweredBy !== false}
            onChange={(e) => setGame({ ...game, showPoweredBy: e.target.checked })}
          />
          Show “Powered by Real Nation” on the public game page
        </label>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Format & assets</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          One format per scratcher for now — create another game to ship a second aspect ratio.
        </p>
        <label className="field">Format</label>
        <select
          value={game.scratcherFormat}
          onChange={(e) => setGame({ ...game, scratcherFormat: e.target.value as ScratcherFormatId })}
        >
          {FORMAT_LABELS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>

        <label className="field" style={{ marginTop: 12 }}>
          Background colour (hex)
        </label>
        <input
          type="text"
          value={game.backgroundColor}
          onChange={(e) => setGame({ ...game, backgroundColor: e.target.value })}
          placeholder="#0a1628"
        />

        <AssetRow label="Top (scratch) image" onFile={(f) => void pickAsset("top", f)} />
        <AssetRow label="Bottom image — win" onFile={(f) => void pickAsset("bottomWin", f)} />
        <AssetRow label="Bottom image — lose (optional)" onFile={(f) => void pickAsset("bottomLose", f)} />
        <AssetRow label="Win button image" onFile={(f) => void pickAsset("button", f)} />
        <AssetRow label="Background image (full page behind stage)" onFile={(f) => void pickAsset("backgroundImage", f)} />

        <label className="field" style={{ marginTop: 12 }}>
          Win sound
        </label>
        <input
          type="file"
          accept="audio/*"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            setGame({ ...game, sounds: { ...game.sounds, win: url } });
          }}
        />
        {game.sounds.win ? <span className="muted"> ✓</span> : null}

        <label className="field" style={{ marginTop: 12 }}>
          Lose sound
        </label>
        <input
          type="file"
          accept="audio/*"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            setGame({ ...game, sounds: { ...game.sounds, lose: url } });
          }}
        />
        {game.sounds.lose ? <span className="muted"> ✓</span> : null}

        <label className="field" style={{ marginTop: 12 }}>
          Chance of winning (%)
        </label>
        <input
          type="number"
          min={0}
          max={100}
          value={game.winChancePercent}
          onChange={(e) => setGame({ ...game, winChancePercent: Number(e.target.value) })}
        />
        <p className="muted" style={{ marginTop: 6, fontSize: "0.85rem" }}>
          100% or no lose image ⇒ always the win bottom layer. Otherwise odds apply on each load.
        </p>

        <label className="field" style={{ marginTop: 12 }}>
          Scratch reveal threshold (0–1)
        </label>
        <input
          type="number"
          min={0.05}
          max={1}
          step={0.01}
          value={game.clearThreshold}
          onChange={(e) => setGame({ ...game, clearThreshold: Number(e.target.value) })}
        />
        <p className="muted" style={{ marginTop: 6, fontSize: "0.85rem" }}>
          Default 0.97 — fraction of the top layer that must be cleared before the button appears.
        </p>

        <label className="field" style={{ marginTop: 12 }}>
          Win button opens URL
        </label>
        <input
          type="url"
          value={game.winButtonUrl}
          onChange={(e) => setGame({ ...game, winButtonUrl: e.target.value })}
          placeholder="https://"
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Live preview</h3>
        <p className="muted">Updates from your current settings (save to persist on the server).</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" onClick={() => pushPreview()}>
            Refresh preview
          </button>
          <button type="button" className="btn" onClick={() => void downloadPdf()}>
            Download PDF
          </button>
          <button type="button" className="btn" onClick={() => window.open(`${siteUrl}/${game.slug}`, "_blank")}>
            Open public scratcher
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title="Scratcher preview"
          src="/play/scratcher-embed.html?preview=1"
          onLoad={() => pushPreview()}
          style={{
            width: "100%",
            aspectRatio: EMBED_ASPECT[game.scratcherFormat],
            height: "auto",
            minHeight: 200,
            border: "1px solid var(--rn-border)",
            borderRadius: 8,
            background: "#0a1628",
            display: "block",
          }}
        />
        <label className="field" style={{ marginTop: 16 }}>
          Embed code (stage-only iframe)
        </label>
        <textarea
          readOnly
          rows={4}
          value={embedCode}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
          onFocus={(e) => e.target.select()}
        />
        <p className="muted" style={{ marginTop: 8, fontSize: "0.85rem" }}>
          Preview matches the embed: stage only (no full-page background). Set the iframe width in your CMS; height follows
          the format aspect ratio.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn" disabled={saving} onClick={() => void saveWithThumbnail()}>
          Save + thumbnail
        </button>
        <button type="button" className="btn btn-danger" disabled={saving} onClick={() => void deleteGame()}>
          Delete game
        </button>
      </div>
    </div>
  );
}

function AssetRow({ label, onFile }: { label: string; onFile: (f: File) => void }) {
  return (
    <div style={{ marginTop: 12 }}>
      <label className="field">{label}</label>
      <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}
