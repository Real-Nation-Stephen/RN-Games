import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import html2canvas from "html2canvas";
import {
  CATCH_BG_SIZE_HINTS,
  normalizeCatch,
  type CatchRecord,
} from "@rngames/shared";
import { apiDelete, apiGet, apiSend, uploadFile } from "../api";
import { HexField } from "../components/HexField";

type CatchGame = CatchRecord;

type IndexItem = { id: string; gameType?: string; slug: string; title: string };

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

function publicUrl(slug: string) {
  return `${siteUrl}/catch/${encodeURIComponent(slug)}`;
}

function publicConfig(g: CatchGame) {
  return {
    gameType: "catch" as const,
    id: g.id,
    title: g.title,
    slug: g.slug,
    faviconUrl: g.faviconUrl || "",
    showPoweredBy: g.showPoweredBy !== false,
    backgroundHex: g.backgroundHex,
    backgrounds: g.backgrounds,
    banner: g.banner,
    sprites: g.sprites,
    catcherSpriteUrl: g.catcherSpriteUrl,
    sounds: g.sounds,
    fonts: g.fonts,
    fontUploads: g.fontUploads,
    hud: g.hud,
    gameplay: g.gameplay,
    endScreen: g.endScreen,
    highScore: g.highScore,
    linkedLeaderboardSlug: g.linkedLeaderboardSlug,
  };
}

function getCatchHtml2CanvasOptions(iframe: HTMLIFrameElement) {
  const idoc = iframe.contentDocument;
  const idwin = iframe.contentWindow;
  if (!idoc || !idwin) return { useCORS: true, allowTaint: false, logging: false };
  const root = idoc.documentElement;
  const bgSolid = idwin.getComputedStyle(root).getPropertyValue("--catch-bg-solid").trim() || "#1a2a3a";
  const bgImage = idwin.getComputedStyle(root).getPropertyValue("--catch-bg-image").trim();
  return {
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: bgSolid,
    onclone: (doc: Document) => {
      const stage = doc.getElementById("stage");
      if (!stage) return;
      (stage as HTMLElement).style.backgroundColor = bgSolid;
      if (bgImage && bgImage !== "none") {
        (stage as HTMLElement).style.backgroundImage = bgImage;
        (stage as HTMLElement).style.backgroundSize = "auto 100%";
        (stage as HTMLElement).style.backgroundPosition = "center";
        (stage as HTMLElement).style.backgroundRepeat = "no-repeat";
      }
    },
  };
}

function BgUploadRow({
  label,
  hint,
  value,
  onUploaded,
}: {
  label: string;
  hint: string;
  value: string;
  onUploaded: (url: string) => void;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <label className="field">{label}</label>
      <p className="muted" style={{ fontSize: "0.82rem", margin: "4px 0 8px" }}>
        {hint}
      </p>
      <input
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const { url } = await uploadFile(f);
          onUploaded(url);
        }}
      />
      {value ? <span className="muted"> ✓</span> : null}
    </div>
  );
}

export default function CatchEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<CatchGame | null>(null);
  const [leaderboards, setLeaderboards] = useState<IndexItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const patch = (fn: (g: CatchGame) => CatchGame) => setGame((prev) => (prev ? fn(prev) : prev));

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const [data, index] = await Promise.all([
        apiGet(`/api/wheels?id=${encodeURIComponent(id)}`),
        apiGet("/api/wheels"),
      ]);
      if (data.gameType !== "catch") {
        navigate(`/wheels/${id}`, { replace: true });
        return;
      }
      setGame(normalizeCatch(data as CatchGame));
      setLeaderboards((index.wheels || []).filter((w: IndexItem) => w.gameType === "leaderboard"));
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
      { type: "rngames-catch-config", config: publicConfig(game) },
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
      const res = await apiSend("/api/wheels", "PUT", { ...game, updatedAt: new Date().toISOString() });
      if (res?.wheel) setGame(normalizeCatch(res.wheel as CatchGame));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
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
    const stage = iframe?.contentDocument?.getElementById("stage");
    if (!stage || !game || !iframe) return;
    try {
      const canvas = await html2canvas(stage, { scale: 0.5, ...getCatchHtml2CanvasOptions(iframe) });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
      if (!blob) return;
      const file = new File([blob], `thumb-${game.id}.jpg`, { type: "image/jpeg" });
      const { url } = await uploadFile(file);
      const res = await apiSend("/api/wheels", "PUT", { ...game, thumbnailUrl: url });
      if (res?.wheel) setGame(normalizeCatch(res.wheel as CatchGame));
    } catch {
      /* optional */
    }
  }

  async function deleteGame() {
    if (!game) return;
    const ok = window.confirm(
      "Delete this catch game and its public URL?\n\nThis cannot be undone.\n\nClick OK to delete, or Cancel to keep it.",
    );
    if (!ok) return;
    setSaving(true);
    try {
      await apiDelete(`/api/wheels?id=${encodeURIComponent(game.id)}`);
      navigate("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  async function uploadFont(role: string, file: File) {
    const { url } = await uploadFile(file);
    const family = `Catch${role}${Date.now().toString(36)}`;
    patch((g) => ({
      ...g,
      fontUploads: { ...g.fontUploads, [role]: { url, family } },
      fonts: { ...g.fonts, [role]: `'${family}', system-ui, sans-serif` },
    }));
  }

  if (!game) {
    return err ? <p className="muted">{err}</p> : <p className="muted">Loading…</p>;
  }

  return (
    <div>
      <p>
        <Link to="/">← Studio</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>Edit catch game</h2>
      {err && <p className="muted">{err}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Game details</h3>
        <div className="grid2">
          <div>
            <label className="field">Title</label>
            <input value={game.title} onChange={(e) => patch((g) => ({ ...g, title: e.target.value }))} />
          </div>
          <div>
            <label className="field">Client</label>
            <input value={game.clientName} onChange={(e) => patch((g) => ({ ...g, clientName: e.target.value }))} />
          </div>
          <div>
            <label className="field">Sub-URL (slug)</label>
            <input
              value={game.slug}
              onChange={(e) => patch((g) => ({ ...g, slug: e.target.value.trim().toLowerCase() }))}
            />
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={game.reportingEnabled}
            onChange={(e) => patch((g) => ({ ...g, reportingEnabled: e.target.checked }))}
          />
          Enable reporting
        </label>
        <p className="muted" style={{ marginTop: 8 }}>
          Public URL: <code>{publicUrl(game.slug)}</code>
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
            patch((g) => ({ ...g, faviconUrl: url }));
          }}
        />
        {game.faviconUrl ? <span className="muted"> ✓</span> : null}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={game.showPoweredBy !== false}
            onChange={(e) => patch((g) => ({ ...g, showPoweredBy: e.target.checked }))}
          />
          Show “Powered by Real Nation” on the public game page
        </label>
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Banner</h3>
          <HexField
            label="Banner colour"
            value={game.banner.backgroundHex}
            onChange={(v) => patch((g) => ({ ...g, banner: { ...g.banner, backgroundHex: v } }))}
          />
          <label className="field">Logo</label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patch((g) => ({ ...g, banner: { ...g.banner, logoUrl: url } }));
            }}
          />
          {game.banner.logoUrl ? <span className="muted"> ✓</span> : null}
          <label className="field" style={{ marginTop: 12 }}>
            Logo alignment
          </label>
          <select
            value={game.banner.logoAlign}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                banner: { ...g.banner, logoAlign: e.target.value as "left" | "center" | "right" },
              }))
            }
          >
            <option value="left">Left aligned</option>
            <option value="center">Centred</option>
            <option value="right">Right aligned</option>
          </select>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Gameplay</h3>
          <label className="field">Round duration (seconds)</label>
          <input
            type="number"
            min={10}
            max={300}
            value={game.gameplay.durationSec}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, durationSec: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Item size (px, square)
          </label>
          <input
            type="number"
            min={32}
            max={160}
            value={game.gameplay.itemSize}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, itemSize: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Fall speed start (px/s)
          </label>
          <input
            type="number"
            min={80}
            max={800}
            value={game.gameplay.fallSpeedStart}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, fallSpeedStart: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Fall speed end (px/s)
          </label>
          <input
            type="number"
            min={80}
            max={1200}
            value={game.gameplay.fallSpeedEnd}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, fallSpeedEnd: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Spawn interval min (ms)
          </label>
          <input
            type="number"
            min={200}
            max={2500}
            value={game.gameplay.spawnIntervalMinMs}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, spawnIntervalMinMs: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Spawn interval max (ms)
          </label>
          <input
            type="number"
            min={200}
            max={2500}
            value={game.gameplay.spawnIntervalMaxMs}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, spawnIntervalMaxMs: Number(e.target.value) },
              }))
            }
          />
          <label className="field">Swipe hint text</label>
          <input
            value={game.gameplay.swipeHintText}
            onChange={(e) => patch((g) => ({ ...g, gameplay: { ...g.gameplay, swipeHintText: e.target.value } }))}
          />
          <h4 style={{ margin: "20px 0 8px" }}>Intro screen</h4>
          <label className="field">Positive item line</label>
          <input
            value={game.intro.positiveLine}
            onChange={(e) => patch((g) => ({ ...g, intro: { ...g.intro, positiveLine: e.target.value } }))}
          />
          <label className="field" style={{ marginTop: 12 }}>
            Negative item line
          </label>
          <input
            value={game.intro.negativeLine}
            onChange={(e) => patch((g) => ({ ...g, intro: { ...g.intro, negativeLine: e.target.value } }))}
          />
          <label className="field" style={{ marginTop: 12 }}>
            Next button label
          </label>
          <input
            value={game.intro.nextLabel}
            onChange={(e) => patch((g) => ({ ...g, intro: { ...g.intro, nextLabel: e.target.value } }))}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input
              type="checkbox"
              checked={game.gameplay.positiveOnly}
              onChange={(e) => patch((g) => ({ ...g, gameplay: { ...g.gameplay, positiveOnly: e.target.checked } }))}
            />
            Positive items only (no penalties)
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            Linked leaderboard (slug)
          </label>
          <select
            value={game.linkedLeaderboardSlug}
            onChange={(e) => patch((g) => ({ ...g, linkedLeaderboardSlug: e.target.value }))}
          >
            <option value="">— None —</option>
            {leaderboards.map((lb) => (
              <option key={lb.id} value={lb.slug}>
                {lb.title} — /leaderboard/{lb.slug}
              </option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input
              type="checkbox"
              checked={game.highScore.enabled}
              onChange={(e) => patch((g) => ({ ...g, highScore: { ...g.highScore, enabled: e.target.checked } }))}
            />
            Prompt for initials on end screen (for leaderboard submit)
          </label>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Sprites</h3>
          <label className="field">Catcher sprite</label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patch((g) => ({ ...g, catcherSpriteUrl: url }));
            }}
          />
          {game.catcherSpriteUrl ? <span className="muted"> ✓</span> : null}
          <label className="field" style={{ marginTop: 12 }}>
            Positive item
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patch((g) => ({ ...g, sprites: { ...g.sprites, positiveUrl: url } }));
            }}
          />
          {game.sprites.positiveUrl ? <span className="muted"> ✓</span> : null}
          <label className="field" style={{ marginTop: 12 }}>
            Negative item
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patch((g) => ({ ...g, sprites: { ...g.sprites, negativeUrl: url } }));
            }}
          />
          {game.sprites.negativeUrl ? <span className="muted"> ✓</span> : null}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Game backgrounds</h3>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Images fit viewport <strong>height</strong> and centre horizontally. Upload separate art per device class;
            the player picks the best match automatically.
          </p>
          <HexField
            label="Fallback colour"
            value={game.backgroundHex}
            onChange={(v) => patch((g) => ({ ...g, backgroundHex: v }))}
          />
          <BgUploadRow
            label="Desktop"
            hint={CATCH_BG_SIZE_HINTS.desktop}
            value={game.backgrounds.desktop}
            onUploaded={(url) => patch((g) => ({ ...g, backgrounds: { ...g.backgrounds, desktop: url } }))}
          />
          <BgUploadRow
            label="Tablet"
            hint={CATCH_BG_SIZE_HINTS.tablet}
            value={game.backgrounds.tablet}
            onUploaded={(url) => patch((g) => ({ ...g, backgrounds: { ...g.backgrounds, tablet: url } }))}
          />
          <BgUploadRow
            label="Mobile"
            hint={CATCH_BG_SIZE_HINTS.mobile}
            value={game.backgrounds.mobile}
            onUploaded={(url) => patch((g) => ({ ...g, backgrounds: { ...g.backgrounds, mobile: url } }))}
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>HUD colours</h3>
          <HexField label="Score hex" value={game.hud.scoreHex} onChange={(v) => patch((g) => ({ ...g, hud: { ...g.hud, scoreHex: v } }))} />
          <HexField label="Timer hex" value={game.hud.timerHex} onChange={(v) => patch((g) => ({ ...g, hud: { ...g.hud, timerHex: v } }))} />
          <HexField label="Label hex" value={game.hud.labelHex} onChange={(v) => patch((g) => ({ ...g, hud: { ...g.hud, labelHex: v } }))} />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Audio</h3>
          {(
            [
              ["positiveCatch", "Positive catch SFX"],
              ["negativeCatch", "Negative catch SFX"],
              ["gameEnd", "End of round SFX"],
              ["music", "Background music"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} style={{ marginTop: key === "positiveCatch" ? 0 : 12 }}>
              <label className="field">{label}</label>
              <input
                type="file"
                accept="audio/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const { url } = await uploadFile(f);
                  patch((g) => ({ ...g, sounds: { ...g.sounds, [key]: url } }));
                }}
              />
              {game.sounds[key] ? <span className="muted"> ✓</span> : null}
            </div>
          ))}
          <label className="field" style={{ marginTop: 12 }}>
            Music volume (0–1)
          </label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={game.sounds.musicVolume}
            onChange={(e) =>
              patch((g) => ({ ...g, sounds: { ...g.sounds, musicVolume: Number(e.target.value) } }))
            }
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Fonts</h3>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Upload WOFF/WOFF2/TTF for heading, body, and score display.
          </p>
          {(["heading", "body", "score"] as const).map((role) => (
            <div key={role} style={{ marginTop: 12 }}>
              <label className="field">{role}</label>
              <input
                type="file"
                accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  await uploadFont(role, f);
                }}
              />
              {game.fontUploads[role]?.url ? <span className="muted"> ✓</span> : null}
            </div>
          ))}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>End screen</h3>
          <label className="field">Logo</label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patch((g) => ({ ...g, endScreen: { ...g.endScreen, logoUrl: url } }));
            }}
          />
          {game.endScreen.logoUrl ? <span className="muted"> ✓</span> : null}
          <label className="field" style={{ marginTop: 12 }}>
            Headline
          </label>
          <input
            value={game.endScreen.headline}
            onChange={(e) => patch((g) => ({ ...g, endScreen: { ...g.endScreen, headline: e.target.value } }))}
          />
          <label className="field">Subhead</label>
          <input
            value={game.endScreen.subhead}
            onChange={(e) => patch((g) => ({ ...g, endScreen: { ...g.endScreen, subhead: e.target.value } }))}
          />
          <label className="field">Score prefix</label>
          <input
            value={game.endScreen.scorePrefix}
            onChange={(e) => patch((g) => ({ ...g, endScreen: { ...g.endScreen, scorePrefix: e.target.value } }))}
          />
          <label className="field">Play again label</label>
          <input
            value={game.endScreen.playAgainLabel}
            onChange={(e) =>
              patch((g) => ({ ...g, endScreen: { ...g.endScreen, playAgainLabel: e.target.value } }))
            }
          />
          <HexField
            label="Headline hex"
            value={game.endScreen.headlineHex}
            onChange={(v) => patch((g) => ({ ...g, endScreen: { ...g.endScreen, headlineHex: v } }))}
          />
          <HexField
            label="Subhead hex"
            value={game.endScreen.subheadHex}
            onChange={(v) => patch((g) => ({ ...g, endScreen: { ...g.endScreen, subheadHex: v } }))}
          />
          <HexField
            label="Button hex"
            value={game.endScreen.buttonHex}
            onChange={(v) => patch((g) => ({ ...g, endScreen: { ...g.endScreen, buttonHex: v } }))}
          />
          <HexField
            label="Button text hex"
            value={game.endScreen.buttonTextHex}
            onChange={(v) => patch((g) => ({ ...g, endScreen: { ...g.endScreen, buttonTextHex: v } }))}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
            <input
              type="checkbox"
              checked={game.endScreen.linkEnabled}
              onChange={(e) =>
                patch((g) => ({ ...g, endScreen: { ...g.endScreen, linkEnabled: e.target.checked } }))
              }
            />
            Show optional link button
          </label>
          <label className="field">Link button label</label>
          <input
            value={game.endScreen.linkLabel}
            onChange={(e) => patch((g) => ({ ...g, endScreen: { ...g.endScreen, linkLabel: e.target.value } }))}
          />
          <label className="field">Link URL</label>
          <input
            value={game.endScreen.linkUrl}
            placeholder="https://"
            onChange={(e) => patch((g) => ({ ...g, endScreen: { ...g.endScreen, linkUrl: e.target.value } }))}
          />
          <HexField
            label="Link button hex"
            value={game.endScreen.linkButtonHex}
            onChange={(v) => patch((g) => ({ ...g, endScreen: { ...g.endScreen, linkButtonHex: v } }))}
          />
          <HexField
            label="Link button text hex"
            value={game.endScreen.linkButtonTextHex}
            onChange={(v) => patch((g) => ({ ...g, endScreen: { ...g.endScreen, linkButtonTextHex: v } }))}
          />
          <BgUploadRow
            label="End screen desktop BG"
            hint={CATCH_BG_SIZE_HINTS.desktop}
            value={game.endScreen.backgrounds.desktop}
            onUploaded={(url) =>
              patch((g) => ({
                ...g,
                endScreen: { ...g.endScreen, backgrounds: { ...g.endScreen.backgrounds, desktop: url } },
              }))
            }
          />
          <BgUploadRow
            label="End screen tablet BG"
            hint={CATCH_BG_SIZE_HINTS.tablet}
            value={game.endScreen.backgrounds.tablet}
            onUploaded={(url) =>
              patch((g) => ({
                ...g,
                endScreen: { ...g.endScreen, backgrounds: { ...g.endScreen.backgrounds, tablet: url } },
              }))
            }
          />
          <BgUploadRow
            label="End screen mobile BG"
            hint={CATCH_BG_SIZE_HINTS.mobile}
            value={game.endScreen.backgrounds.mobile}
            onUploaded={(url) =>
              patch((g) => ({
                ...g,
                endScreen: { ...g.endScreen, backgrounds: { ...g.endScreen.backgrounds, mobile: url } },
              }))
            }
          />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Live preview</h3>
        <p className="muted">Touch the preview to start the 3-2-1 countdown (not saved until you Save).</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" onClick={() => pushPreview()}>
            Refresh preview
          </button>
          <button type="button" className="btn" onClick={() => window.open(publicUrl(game.slug), "_blank")}>
            Open public game
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title="Catch preview"
          src="/play/catch.html?preview=1"
          onLoad={() => pushPreview()}
          style={{
            width: "100%",
            height: "min(520px, 70vh)",
            border: "1px solid var(--rn-border)",
            borderRadius: 8,
            background: game.backgroundHex || "#1a2a3a",
            display: "block",
          }}
        />
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
