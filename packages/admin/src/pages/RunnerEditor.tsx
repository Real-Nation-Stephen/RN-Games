import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import html2canvas from "html2canvas";
import {
  RUNNER_BG_SIZE_HINTS,
  RUNNER_MAX_PARALLAX_LAYERS,
  RUNNER_MAX_SPRITE_CELL,
  RUNNER_MAX_SHEET_FRAMES,
  normalizeRunner,
  emptyRunnerItemEffects,
  type RunnerRecord,
  type RunnerItemVariant,
  type RunnerHudSlotKind,
  type RunnerParallaxLayer,
  type RunnerSpriteSheet,
} from "@rngames/shared";
import { apiDelete, apiGet, apiSend, uploadFile } from "../api";
import { HexField } from "../components/HexField";

type RunnerGame = RunnerRecord;

type IndexItem = { id: string; gameType?: string; slug: string; title: string };

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

const HUD_SLOT_OPTIONS: { value: RunnerHudSlotKind; label: string }[] = [
  { value: "none", label: "None" },
  { value: "timer", label: "Timer" },
  { value: "health", label: "Health" },
  { value: "score", label: "Score" },
];

function publicUrl(slug: string) {
  return `${siteUrl}/runner/${encodeURIComponent(slug)}`;
}

function publicConfig(g: RunnerGame) {
  return {
    gameType: "runner" as const,
    id: g.id,
    title: g.title,
    slug: g.slug,
    faviconUrl: g.faviconUrl || "",
    showPoweredBy: g.showPoweredBy !== false,
    backgroundHex: g.backgroundHex,
    backgrounds: g.backgrounds,
    banner: g.banner,
    character: g.character,
    items: g.items,
    parallax: g.parallax,
    ground: g.ground,
    sounds: g.sounds,
    fonts: g.fonts,
    fontUploads: g.fontUploads,
    hud: g.hud,
    feedback: g.feedback,
    gameplay: g.gameplay,
    intro: g.intro,
    endScreen: g.endScreen,
    highScore: g.highScore,
    linkedLeaderboardSlug: g.linkedLeaderboardSlug,
  };
}

function newVariantId() {
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function newParallaxId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function defaultItemVariant(negative = false): RunnerItemVariant {
  return {
    id: newVariantId(),
    url: "",
    width: 72,
    height: 72,
    y: 0,
    effects: emptyRunnerItemEffects(negative),
  };
}

function ItemVariantEditor({
  label,
  variants,
  onChange,
  uploadFile,
  negative = false,
}: {
  label: string;
  variants: RunnerItemVariant[];
  onChange: (next: RunnerItemVariant[]) => void;
  uploadFile: (f: File) => Promise<{ url: string }>;
  negative?: boolean;
}) {
  const rows = variants.length ? variants : [defaultItemVariant(negative)];
  const effectKeys = negative
    ? (["removeHealth", "removePoints", "removeTime"] as const)
    : (["addHealth", "addPoints", "addTime"] as const);
  const effectLabels = negative
    ? ({ removeHealth: "Remove health", removePoints: "Remove points", removeTime: "Remove time" } as const)
    : ({ addHealth: "Add health", addPoints: "Add points", addTime: "Add time" } as const);
  const amountKey = (key: (typeof effectKeys)[number]) => {
    if (key.includes("Health")) return "healthAmount" as const;
    if (key.includes("Points")) return "pointsAmount" as const;
    return "timeAmount" as const;
  };

  return (
    <div style={{ marginTop: 12 }}>
      <label className="field">{label}</label>
      {rows.map((v, i) => (
        <div
          key={v.id || i}
          style={{
            border: "1px solid var(--rn-border)",
            borderRadius: 8,
            padding: 10,
            marginBottom: 10,
            background: negative ? "rgba(224, 93, 93, 0.06)" : "rgba(62, 207, 142, 0.06)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
            {v.url ? (
              <img
                src={v.url}
                alt=""
                width={52}
                height={52}
                style={{
                  objectFit: "contain",
                  borderRadius: 6,
                  background: negative ? "rgba(224, 93, 93, 0.25)" : "rgba(62, 207, 142, 0.25)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <span
                aria-hidden="true"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 6,
                  background: negative ? "rgba(224, 93, 93, 0.35)" : "rgba(62, 207, 142, 0.35)",
                  flexShrink: 0,
                }}
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const { url } = await uploadFile(f);
                const next = [...rows];
                next[i] = { ...next[i], url };
                onChange(next);
              }}
            />
            <label className="muted" style={{ fontSize: "0.82rem" }}>
              W
              <input
                type="number"
                min={24}
                max={320}
                value={v.width}
                style={{ width: 64, marginLeft: 4 }}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], width: Number(e.target.value) || 72 };
                  onChange(next);
                }}
              />
            </label>
            <label className="muted" style={{ fontSize: "0.82rem" }}>
              H
              <input
                type="number"
                min={24}
                max={320}
                value={v.height}
                style={{ width: 64, marginLeft: 4 }}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], height: Number(e.target.value) || 72 };
                  onChange(next);
                }}
              />
            </label>
            <label className="muted" style={{ fontSize: "0.82rem" }}>
              Y
              <input
                type="number"
                min={0}
                max={2000}
                value={v.y}
                style={{ width: 72, marginLeft: 4 }}
                title="Vertical position in design space"
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], y: Number(e.target.value) || 0 };
                  onChange(next);
                }}
              />
            </label>
            {rows.length > 1 ? (
              <button type="button" className="btn" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                Remove
              </button>
            ) : null}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {effectKeys.map((key) => {
              const amt = amountKey(key);
              const checked = v.effects[key];
              return (
                <div key={key} style={{ minWidth: 140 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = [...rows];
                        next[i] = {
                          ...next[i],
                          effects: { ...next[i].effects, [key]: e.target.checked },
                        };
                        onChange(next);
                      }}
                    />
                    {effectLabels[key]}
                  </label>
                  {checked ? (
                    <input
                      type="number"
                      min={1}
                      max={amt === "timeAmount" ? 60 : amt === "pointsAmount" ? 99 : 10}
                      value={v.effects[amt]}
                      style={{ width: 72, marginTop: 4 }}
                      onChange={(e) => {
                        const next = [...rows];
                        next[i] = {
                          ...next[i],
                          effects: { ...next[i].effects, [amt]: Number(e.target.value) || 1 },
                        };
                        onChange(next);
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => onChange([...rows, defaultItemVariant(negative)])}
      >
        Add {negative ? "negative" : "positive"} item
      </button>
    </div>
  );
}

function ParallaxLayerEditor({
  layers,
  onChange,
}: {
  layers: RunnerParallaxLayer[];
  onChange: (next: RunnerParallaxLayer[]) => void;
}) {
  const rows = layers;
  return (
    <div style={{ marginTop: 12 }}>
      <label className="field">Parallax layers (up to {RUNNER_MAX_PARALLAX_LAYERS})</label>
      <p className="muted" style={{ fontSize: "0.82rem", margin: "4px 0 8px" }}>
        Back-to-front order. Speed 0.1–2 (higher = faster scroll).
      </p>
      {rows.map((layer, i) => (
        <div
          key={layer.id || i}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            marginBottom: 8,
            padding: 8,
            border: "1px solid var(--rn-border)",
            borderRadius: 8,
          }}
        >
          <span className="muted" style={{ fontSize: "0.82rem", minWidth: 48 }}>
            Layer {i + 1}
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              const next = [...rows];
              next[i] = { ...next[i], url };
              onChange(next);
            }}
          />
          {layer.url ? <span className="muted"> ✓</span> : null}
          <label className="muted" style={{ fontSize: "0.82rem" }}>
            Speed
            <input
              type="number"
              min={0.1}
              max={2}
              step={0.1}
              value={layer.speed}
              style={{ width: 64, marginLeft: 4 }}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], speed: Number(e.target.value) || 0.5 };
                onChange(next);
              }}
            />
          </label>
          <label className="muted" style={{ fontSize: "0.82rem" }}>
            Y
            <input
              type="number"
              min={0}
              max={2000}
              value={layer.y}
              style={{ width: 72, marginLeft: 4 }}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], y: Number(e.target.value) || 0 };
                onChange(next);
              }}
            />
          </label>
          <label className="muted" style={{ fontSize: "0.82rem" }}>
            Height
            <input
              type="number"
              min={-100}
              max={800}
              value={layer.height ?? 0}
              style={{ width: 72, marginLeft: 4 }}
              title="0 = auto; positive = px; negative = % of image (e.g. -50 = half size)"
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], height: Number(e.target.value) || 0 };
                onChange(next);
              }}
            />
          </label>
          <button type="button" className="btn" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      {rows.length < RUNNER_MAX_PARALLAX_LAYERS ? (
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange([...rows, { id: newParallaxId(), url: "", speed: 0.5, y: 0, height: 0 }])
          }
        >
          Add parallax layer
        </button>
      ) : null}
    </div>
  );
}

function SpriteSheetRow({
  label,
  sheet,
  onChange,
}: {
  label: string;
  sheet: RunnerSpriteSheet;
  onChange: (next: RunnerSpriteSheet) => void;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <label className="field">{label}</label>
      <input
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const { url } = await uploadFile(f);
          onChange({ ...sheet, url });
        }}
      />
      {sheet.url ? <span className="muted"> ✓</span> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        <label className="muted" style={{ fontSize: "0.82rem" }}>
          Cell W
          <input
            type="number"
            min={8}
            max={RUNNER_MAX_SPRITE_CELL}
            value={sheet.cellWidth}
            style={{ width: 72, marginLeft: 4 }}
            onChange={(e) => onChange({ ...sheet, cellWidth: Number(e.target.value) || 64 })}
          />
        </label>
        <label className="muted" style={{ fontSize: "0.82rem" }}>
          Cell H
          <input
            type="number"
            min={8}
            max={RUNNER_MAX_SPRITE_CELL}
            value={sheet.cellHeight}
            style={{ width: 72, marginLeft: 4 }}
            onChange={(e) => onChange({ ...sheet, cellHeight: Number(e.target.value) || 64 })}
          />
        </label>
      </div>
      <p className="muted" style={{ fontSize: "0.78rem", margin: "4px 0 0" }}>
        Up to {RUNNER_MAX_SHEET_FRAMES} frames in a horizontal strip.
      </p>
    </div>
  );
}

function getRunnerHtml2CanvasOptions(iframe: HTMLIFrameElement) {
  const idoc = iframe.contentDocument;
  const idwin = iframe.contentWindow;
  if (!idoc || !idwin) return { useCORS: true, allowTaint: false, logging: false };
  const root = idoc.documentElement;
  const bgSolid = idwin.getComputedStyle(root).getPropertyValue("--runner-bg-solid").trim() || "#87c38f";
  const bgImage = idwin.getComputedStyle(root).getPropertyValue("--runner-bg-image").trim();
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

function HudSlotSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RunnerHudSlotKind;
  onChange: (v: RunnerHudSlotKind) => void;
}) {
  return (
    <label className="field" style={{ marginTop: 12 }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as RunnerHudSlotKind)} style={{ display: "block", marginTop: 4 }}>
        {HUD_SLOT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function RunnerEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<RunnerGame | null>(null);
  const [leaderboards, setLeaderboards] = useState<IndexItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const patch = (fn: (g: RunnerGame) => RunnerGame) => setGame((prev) => (prev ? fn(prev) : prev));

  const loadLeaderboards = useCallback(async () => {
    try {
      const index = await apiGet("/api/wheels?gameType=leaderboard");
      setLeaderboards(index.wheels || []);
    } catch {
      /* optional — editor still works without the dropdown list */
    }
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = await apiGet(`/api/wheels?id=${encodeURIComponent(id)}`);
      if (data.gameType !== "runner") {
        navigate(`/wheels/${id}`, { replace: true });
        return;
      }
      setGame(normalizeRunner(data as RunnerGame));
      void loadLeaderboards();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, [id, navigate, loadLeaderboards]);

  useEffect(() => {
    void load();
  }, [load]);

  const pushPreview = useCallback(() => {
    if (!game || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "rngames-runner-config", config: publicConfig(game) },
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
      if (res?.wheel) setGame(normalizeRunner(res.wheel as RunnerGame));
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
      const canvas = await html2canvas(stage, { scale: 0.5, ...getRunnerHtml2CanvasOptions(iframe) });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
      if (!blob) return;
      const file = new File([blob], `thumb-${game.id}.jpg`, { type: "image/jpeg" });
      const { url } = await uploadFile(file);
      const res = await apiSend("/api/wheels", "PUT", { ...game, thumbnailUrl: url });
      if (res?.wheel) setGame(normalizeRunner(res.wheel as RunnerGame));
    } catch {
      /* optional */
    }
  }

  async function deleteGame() {
    if (!game) return;
    const ok = window.confirm(
      "Delete this runner game and its public URL?\n\nThis cannot be undone.\n\nClick OK to delete, or Cancel to keep it.",
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
    const family = `Runner${role}${Date.now().toString(36)}`;
    patch((g) => ({
      ...g,
      fontUploads: { ...g.fontUploads, [role]: { url, family } },
      fonts: { ...g.fonts, [role]: `'${family}', system-ui, sans-serif` },
    }));
  }

  if (!game) {
    return (
      <div>
        {err ? (
          <>
            <p className="muted">{err}</p>
            <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => void load()}>
              Retry
            </button>
          </>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </div>
    );
  }

  const embedCode = `<iframe src="${siteUrl}/play/runner.html?slug=${encodeURIComponent(game.slug)}" title="${(game.title || "Runner game").replace(/"/g, "&quot;")}" style="border:0;width:100%;height:min(92dvh,720px);display:block;" loading="lazy"></iframe>`;

  return (
    <div>
      <p>
        <Link to="/">← Studio</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>Edit runner game</h2>
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
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={game.gameplay.timerEnabled}
              onChange={(e) =>
                patch((g) => ({ ...g, gameplay: { ...g.gameplay, timerEnabled: e.target.checked } }))
              }
            />
            Enable round timer
          </label>
          {game.gameplay.timerEnabled ? (
            <>
              <label className="field" style={{ marginTop: 12 }}>
                Round duration (seconds)
              </label>
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
            </>
          ) : null}
          <label className="field" style={{ marginTop: 12 }}>
            Max health
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={game.gameplay.maxHealth}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, maxHealth: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Scroll speed start (px/s)
          </label>
          <input
            type="number"
            min={80}
            max={1200}
            value={game.gameplay.scrollSpeedStart}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, scrollSpeedStart: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Scroll speed end (px/s)
          </label>
          <input
            type="number"
            min={80}
            max={1600}
            value={game.gameplay.scrollSpeedEnd}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, scrollSpeedEnd: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Spawn interval start (ms)
          </label>
          <input
            type="number"
            min={400}
            max={4000}
            value={game.gameplay.spawnIntervalStartMs}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, spawnIntervalStartMs: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Spawn interval end (ms)
          </label>
          <input
            type="number"
            min={400}
            max={4000}
            value={game.gameplay.spawnIntervalEndMs}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, spawnIntervalEndMs: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Positive item % start
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={game.gameplay.positivePercentStart}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, positivePercentStart: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Positive item % end
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={game.gameplay.positivePercentEnd}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, positivePercentEnd: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Respawn mode
          </label>
          <select
            value={game.gameplay.respawnMode}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: { ...g.gameplay, respawnMode: e.target.value as "respawn" | "endOnZero" },
              }))
            }
          >
            <option value="respawn">Respawn on death (uses extra attempts)</option>
            <option value="endOnZero">End run on zero health</option>
          </select>
          {game.gameplay.respawnMode === "respawn" ? (
            <>
              <label className="field" style={{ marginTop: 12 }}>
                Max respawns (extra attempts after first)
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={game.gameplay.maxRespawns}
                onChange={(e) =>
                  patch((g) => ({
                    ...g,
                    gameplay: { ...g.gameplay, maxRespawns: Number(e.target.value) },
                  }))
                }
              />
            </>
          ) : null}
          <label className="field" style={{ marginTop: 12 }}>
            Leaderboard metric
          </label>
          <select
            value={game.gameplay.leaderboardMetric}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                gameplay: {
                  ...g.gameplay,
                  leaderboardMetric: e.target.value as "points" | "time" | "distance",
                },
              }))
            }
          >
            <option value="points">Points (score)</option>
            <option value="time">Time survived</option>
            <option value="distance">Distance run</option>
          </select>
          <label className="field" style={{ marginTop: 12 }}>
            Jump hint text
          </label>
          <input
            value={game.gameplay.jumpHintText}
            onChange={(e) =>
              patch((g) => ({ ...g, gameplay: { ...g.gameplay, jumpHintText: e.target.value } }))
            }
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
          <label className="field" style={{ marginTop: 12 }}>
            Points label (intro)
          </label>
          <input
            value={game.intro.pointsLabel}
            placeholder="Pts"
            maxLength={16}
            onChange={(e) => patch((g) => ({ ...g, intro: { ...g.intro, pointsLabel: e.target.value } }))}
          />
          <p className="muted" style={{ fontSize: "0.78rem", margin: "4px 0 0" }}>
            Shown after positive item values, e.g. +1 Pts or +5 Coins.
          </p>
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
            Collect player name before play (for leaderboard)
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            Name character limit
          </label>
          <input
            type="number"
            min={1}
            max={32}
            value={game.highScore.nameMaxLength}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                highScore: { ...g.highScore, nameMaxLength: Number(e.target.value) || 3 },
              }))
            }
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Character</h3>
          <SpriteSheetRow
            label="Run sprite sheet"
            sheet={game.character.run}
            onChange={(run) => patch((g) => ({ ...g, character: { ...g.character, run } }))}
          />
          <SpriteSheetRow
            label="Jump sprite sheet"
            sheet={game.character.jump}
            onChange={(jump) => patch((g) => ({ ...g, character: { ...g.character, jump } }))}
          />
          <SpriteSheetRow
            label="Death sprite sheet"
            sheet={game.character.death}
            onChange={(death) => patch((g) => ({ ...g, character: { ...g.character, death } }))}
          />
          <label className="field" style={{ marginTop: 12 }}>
            Character width (px)
          </label>
          <input
            type="number"
            min={32}
            max={240}
            value={game.character.width}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                character: { ...g.character, width: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Character height (px)
          </label>
          <input
            type="number"
            min={32}
            max={240}
            value={game.character.height}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                character: { ...g.character, height: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Ground Y (design space)
          </label>
          <input
            type="number"
            min={100}
            max={1900}
            value={game.character.groundY}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                character: { ...g.character, groundY: Number(e.target.value) },
              }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Jump height (px)
          </label>
          <input
            type="number"
            min={40}
            max={600}
            value={game.character.jumpHeight}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                character: { ...g.character, jumpHeight: Number(e.target.value) },
              }))
            }
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Items</h3>
          <ItemVariantEditor
            label="Positive items"
            variants={game.items.positive}
            uploadFile={uploadFile}
            onChange={(positive) => patch((g) => ({ ...g, items: { ...g.items, positive } }))}
          />
          <ItemVariantEditor
            label="Negative items"
            variants={game.items.negative}
            uploadFile={uploadFile}
            negative
            onChange={(negative) => patch((g) => ({ ...g, items: { ...g.items, negative } }))}
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Parallax & ground</h3>
          <ParallaxLayerEditor
            layers={game.parallax}
            onChange={(parallax) => patch((g) => ({ ...g, parallax }))}
          />
          <h4 style={{ margin: "20px 0 8px" }}>Ground strip</h4>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={game.ground.enabled}
              onChange={(e) => patch((g) => ({ ...g, ground: { ...g.ground, enabled: e.target.checked } }))}
            />
            Draw ground image
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            Ground image
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patch((g) => ({ ...g, ground: { ...g.ground, url } }));
            }}
          />
          {game.ground.url ? <span className="muted"> ✓</span> : null}
          <label className="field" style={{ marginTop: 12 }}>
            Ground Y
          </label>
          <input
            type="number"
            min={0}
            max={2000}
            value={game.ground.y}
            onChange={(e) =>
              patch((g) => ({ ...g, ground: { ...g.ground, y: Number(e.target.value) } }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Ground height (px)
          </label>
          <input
            type="number"
            min={8}
            max={400}
            value={game.ground.height}
            onChange={(e) =>
              patch((g) => ({ ...g, ground: { ...g.ground, height: Number(e.target.value) } }))
            }
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Game backgrounds</h3>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Images cover the viewport; the player picks the best match per device class automatically.
          </p>
          <HexField
            label="Fallback colour"
            value={game.backgroundHex}
            onChange={(v) => patch((g) => ({ ...g, backgroundHex: v }))}
          />
          <BgUploadRow
            label="Desktop"
            hint={RUNNER_BG_SIZE_HINTS.desktop}
            value={game.backgrounds.desktop}
            onUploaded={(url) => patch((g) => ({ ...g, backgrounds: { ...g.backgrounds, desktop: url } }))}
          />
          <BgUploadRow
            label="Tablet"
            hint={RUNNER_BG_SIZE_HINTS.tablet}
            value={game.backgrounds.tablet}
            onUploaded={(url) => patch((g) => ({ ...g, backgrounds: { ...g.backgrounds, tablet: url } }))}
          />
          <BgUploadRow
            label="Mobile"
            hint={RUNNER_BG_SIZE_HINTS.mobile}
            value={game.backgrounds.mobile}
            onUploaded={(url) => patch((g) => ({ ...g, backgrounds: { ...g.backgrounds, mobile: url } }))}
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>HUD</h3>
          <HudSlotSelect
            label="Left slot"
            value={game.hud.slots.left}
            onChange={(left) =>
              patch((g) => ({ ...g, hud: { ...g.hud, slots: { ...g.hud.slots, left } } }))
            }
          />
          <HudSlotSelect
            label="Centre slot"
            value={game.hud.slots.center}
            onChange={(center) =>
              patch((g) => ({ ...g, hud: { ...g.hud, slots: { ...g.hud.slots, center } } }))
            }
          />
          <HudSlotSelect
            label="Right slot"
            value={game.hud.slots.right}
            onChange={(right) =>
              patch((g) => ({ ...g, hud: { ...g.hud, slots: { ...g.hud.slots, right } } }))
            }
          />
          <label className="field" style={{ marginTop: 12 }}>
            Health display
          </label>
          <select
            value={game.hud.healthDisplay}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                hud: { ...g.hud, healthDisplay: e.target.value as "hearts" | "bar" },
              }))
            }
          >
            <option value="hearts">Hearts</option>
            <option value="bar">Bar</option>
          </select>
          <HexField
            label="Score hex"
            value={game.hud.scoreHex}
            onChange={(v) => patch((g) => ({ ...g, hud: { ...g.hud, scoreHex: v } }))}
          />
          <HexField
            label="Timer hex"
            value={game.hud.timerHex}
            onChange={(v) => patch((g) => ({ ...g, hud: { ...g.hud, timerHex: v } }))}
          />
          <HexField
            label="Health hex"
            value={game.hud.healthHex}
            onChange={(v) => patch((g) => ({ ...g, hud: { ...g.hud, healthHex: v } }))}
          />
          <HexField
            label="Health empty hex"
            value={game.hud.healthEmptyHex}
            onChange={(v) => patch((g) => ({ ...g, hud: { ...g.hud, healthEmptyHex: v } }))}
          />
          <HexField
            label="Label hex"
            value={game.hud.labelHex}
            onChange={(v) => patch((g) => ({ ...g, hud: { ...g.hud, labelHex: v } }))}
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Feedback</h3>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={game.feedback.damageFlashEnabled !== false}
              onChange={(e) =>
                patch((g) => ({
                  ...g,
                  feedback: { ...g.feedback, damageFlashEnabled: e.target.checked },
                }))
              }
            />
            Damage flash on hit
          </label>
          <HexField
            label="Damage flash hex"
            value={game.feedback.damageFlashHex}
            onChange={(v) => patch((g) => ({ ...g, feedback: { ...g.feedback, damageFlashHex: v } }))}
          />
          <HexField
            label="Pickup glow hex"
            value={game.feedback.pickupGlowHex}
            onChange={(v) => patch((g) => ({ ...g, feedback: { ...g.feedback, pickupGlowHex: v } }))}
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Audio</h3>
          {(
            [
              ["positiveItem", "Positive item SFX"],
              ["negativeItem", "Negative item SFX"],
              ["gameEnd", "End of run SFX"],
              ["music", "Background music"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} style={{ marginTop: key === "positiveItem" ? 0 : 12 }}>
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
          <label className="field" style={{ marginTop: 12 }}>
            Overlay colour (CSS)
          </label>
          <input
            value={game.endScreen.overlayHex}
            placeholder="rgba(8, 14, 22, 0.88)"
            onChange={(e) =>
              patch((g) => ({ ...g, endScreen: { ...g.endScreen, overlayHex: e.target.value } }))
            }
          />
          <p className="muted" style={{ fontSize: "0.78rem", margin: "4px 0 0" }}>
            Fades in over the frozen game; starts from damage flash if enabled.
          </p>
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
            hint={RUNNER_BG_SIZE_HINTS.desktop}
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
            hint={RUNNER_BG_SIZE_HINTS.tablet}
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
            hint={RUNNER_BG_SIZE_HINTS.mobile}
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
          title="Runner preview"
          src="/play/runner.html?preview=1"
          onLoad={() => pushPreview()}
          style={{
            width: "100%",
            height: "min(520px, 70vh)",
            border: "1px solid var(--rn-border)",
            borderRadius: 8,
            background: game.backgroundHex || "#87c38f",
            display: "block",
          }}
        />
        <label className="field" style={{ marginTop: 16 }}>
          Embed code
        </label>
        <textarea
          readOnly
          rows={4}
          value={embedCode}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
          onFocus={(e) => e.target.select()}
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
