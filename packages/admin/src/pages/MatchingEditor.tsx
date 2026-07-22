import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import html2canvas from "html2canvas";
import {
  MATCHING_PAIR_SOFT_WARN,
  emptyMatchFace,
  emptyMatchPair,
  normalizeMatching,
  type MatchFace,
  type MatchMediaKind,
  type MatchPair,
  type MatchingRecord,
} from "@rngames/shared";
import { apiDelete, apiGet, apiSend, uploadFile } from "../api";
import { BgUploadRow } from "../components/BgUploadRow";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { ComponentMetadataFields } from "../components/ComponentMetadataFields";
import { HexField } from "../components/HexField";

type LeaderboardOption = { id: string; slug: string; title: string; gameType?: string };

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

/** Secondary settings only — pairs and preview stay full width. */
const SETTINGS_GRID: React.CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  marginBottom: 16,
  alignItems: "start",
};

function publicUrl(slug: string) {
  return `${siteUrl}/matching/${encodeURIComponent(slug)}`;
}

function getMatchingHtml2CanvasOptions(iframe: HTMLIFrameElement) {
  const idoc = iframe.contentDocument;
  const idwin = iframe.contentWindow;
  if (!idoc || !idwin) return { useCORS: true, allowTaint: false, logging: false };
  const root = idoc.documentElement;
  const bgSolid = idwin.getComputedStyle(root).getPropertyValue("--match-bg-solid").trim() || "#0f1a24";
  const bgImage = idwin.getComputedStyle(root).getPropertyValue("--match-bg-image").trim();
  return {
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: bgSolid,
    onclone: (doc: Document) => {
      const app = doc.getElementById("match-app");
      if (!app) return;
      const el = app as HTMLElement;
      el.style.backgroundColor = bgSolid;
      el.style.minHeight = "420px";
      if (bgImage && bgImage !== "none") {
        el.style.backgroundImage = bgImage;
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
        el.style.backgroundRepeat = "no-repeat";
      }
      // Keep intro visible for thumbs; force absolute positioning in the clone.
      for (const overlay of Array.from(doc.querySelectorAll<HTMLElement>(".match-overlay"))) {
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
      }
      const end = doc.getElementById("match-end");
      if (end) end.style.display = "none";
    },
  };
}

function FaceEditor({
  label,
  face,
  onChange,
}: {
  label: string;
  face: MatchFace;
  onChange: (f: MatchFace) => void;
}) {
  async function upload(kind: "image" | "icon" | "audio", file: File) {
    const { url } = await uploadFile(file);
    if (kind === "image") onChange({ ...face, kind: "image", imageUrl: url });
    else if (kind === "icon") onChange({ ...face, kind: "icon", iconUrl: url });
    else onChange({ ...face, kind: "audio", audioUrl: url });
  }

  return (
    <div style={{ border: "1px solid var(--rn-border)", borderRadius: 8, padding: 10 }}>
      <strong style={{ fontSize: "0.85rem" }}>{label}</strong>
      <label className="field" style={{ marginTop: 8 }}>
        Type
        <select
          value={face.kind}
          onChange={(e) => onChange({ ...face, kind: e.target.value as MatchMediaKind })}
        >
          <option value="text">Text</option>
          <option value="image">Image</option>
          <option value="icon">Icon / emoji</option>
          <option value="audio">Audio</option>
        </select>
      </label>
      {face.kind === "text" ? (
        <label className="field">
          Text
          <input value={face.text || ""} onChange={(e) => onChange({ ...face, text: e.target.value })} />
        </label>
      ) : null}
      {face.kind === "image" ? (
        <>
          <label className="field">Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload("image", f);
            }}
          />
          {face.imageUrl ? (
            <img src={face.imageUrl} alt="" style={{ maxWidth: 96, marginTop: 6, borderRadius: 6 }} />
          ) : null}
          <label className="field">
            Alt text
            <input value={face.alt || ""} onChange={(e) => onChange({ ...face, alt: e.target.value })} />
          </label>
        </>
      ) : null}
      {face.kind === "icon" ? (
        <>
          <label className="field">
            Emoji or upload
            <input
              value={face.iconUrl || ""}
              onChange={(e) => onChange({ ...face, iconUrl: e.target.value })}
              placeholder="🦊 or leave blank and upload"
            />
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload("icon", f);
            }}
          />
        </>
      ) : null}
      {face.kind === "audio" ? (
        <>
          <label className="field">Audio file</label>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload("audio", f);
            }}
          />
          {face.audioUrl ? <p className="muted" style={{ fontSize: "0.8rem" }}>Uploaded</p> : null}
          <label className="field">
            Label (accessibility)
            <input value={face.alt || face.text || ""} onChange={(e) => onChange({ ...face, alt: e.target.value, text: e.target.value })} />
          </label>
        </>
      ) : null}
    </div>
  );
}

function PairEditor({
  pair,
  index,
  playMode,
  sharedBackEnabled,
  onChange,
  onRemove,
}: {
  pair: MatchPair;
  index: number;
  playMode: MatchingRecord["playMode"];
  sharedBackEnabled: boolean;
  onChange: (p: MatchPair) => void;
  onRemove: () => void;
}) {
  return (
    <CollapsibleSection title={`Pair ${index + 1}`} summary={`${pair.faceA.kind} ↔ ${pair.faceB.kind}`} defaultOpen={index === 0}>
      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <FaceEditor label="Side A" face={pair.faceA} onChange={(faceA) => onChange({ ...pair, faceA })} />
        <FaceEditor label="Side B" face={pair.faceB} onChange={(faceB) => onChange({ ...pair, faceB })} />
      </div>
      {playMode === "memory" && !sharedBackEnabled ? (
        <div style={{ marginTop: 10 }}>
          <FaceEditor
            label="Face-down back (this pair)"
            face={pair.back || emptyMatchFace("image")}
            onChange={(back) => onChange({ ...pair, back })}
          />
        </div>
      ) : null}
      <button type="button" className="btn" style={{ marginTop: 10 }} onClick={onRemove}>
        Remove pair
      </button>
    </CollapsibleSection>
  );
}

export default function MatchingEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<MatchingRecord | null>(null);
  const [leaderboards, setLeaderboards] = useState<LeaderboardOption[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const patch = (fn: (d: MatchingRecord) => MatchingRecord) => setDoc((d) => (d ? fn(d) : d));

  const loadLeaderboards = useCallback(async () => {
    try {
      const data = await apiGet("/api/wheels");
      const list = Array.isArray(data) ? data : data?.wheels || [];
      setLeaderboards(list.filter((w: LeaderboardOption) => w.gameType === "leaderboard"));
    } catch {
      /* optional — editor still works without the dropdown list */
    }
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = await apiGet(`/api/wheels?id=${encodeURIComponent(id)}`);
      if (data.gameType !== "matching") {
        navigate("/");
        return;
      }
      setDoc(normalizeMatching(data as MatchingRecord));
      void loadLeaderboards();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, [id, navigate, loadLeaderboards]);

  useEffect(() => {
    void load();
  }, [load]);

  const pushPreview = useCallback(() => {
    if (!doc || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "rngames-matching-config", config: normalizeMatching(doc) },
      window.location.origin,
    );
  }, [doc]);

  useEffect(() => {
    if (!doc) return;
    const t = window.setTimeout(() => pushPreview(), 80);
    return () => window.clearTimeout(t);
  }, [doc, pushPreview]);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === "rngames-matching-preview-ready") pushPreview();
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [pushPreview]);

  async function save() {
    if (!doc) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiSend("/api/wheels", "PUT", { ...doc, updatedAt: new Date().toISOString() });
      if (res?.wheel) setDoc(normalizeMatching(res.wheel as MatchingRecord));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveWithThumbnail() {
    if (!doc) return;
    await save();
    pushPreview();
    await new Promise((r) => setTimeout(r, 700));
    const iframe = iframeRef.current;
    const stage = iframe?.contentDocument?.getElementById("match-app");
    if (!stage || !doc || !iframe) return;
    try {
      const canvas = await html2canvas(stage, { scale: 0.5, ...getMatchingHtml2CanvasOptions(iframe) });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
      if (!blob) return;
      const file = new File([blob], `thumb-${doc.id}.jpg`, { type: "image/jpeg" });
      const { url } = await uploadFile(file);
      const latest = doc;
      const res = await apiSend("/api/wheels", "PUT", { ...latest, thumbnailUrl: url });
      if (res?.wheel) setDoc(normalizeMatching(res.wheel as MatchingRecord));
    } catch {
      /* optional */
    }
  }

  async function uploadFont(role: "heading" | "body" | "hud", file: File) {
    const { url } = await uploadFile(file);
    const family = `Matching${role}${Date.now().toString(36)}`;
    patch((d) => ({
      ...d,
      fontUploads: { ...d.fontUploads, [role]: { url, family } },
      fonts: { ...d.fonts, [role]: `'${family}', system-ui, sans-serif` },
    }));
  }

  async function archive() {
    if (!doc || !confirm("Archive this component?")) return;
    setArchiving(true);
    try {
      const res = await apiSend("/api/wheels", "PUT", { ...doc, archived: true });
      setDoc(normalizeMatching(res.wheel as MatchingRecord));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  }

  async function remove() {
    if (!doc || !confirm("Delete permanently?")) return;
    await apiDelete(`/api/wheels?id=${encodeURIComponent(doc.id)}`);
    navigate("/library/matching");
  }

  if (!doc) {
    return (
      <div>
        {err ? <p className="muted">{err}</p> : <p className="muted">Loading…</p>}
      </div>
    );
  }

  const pairWarn = doc.pairs.length > MATCHING_PAIR_SOFT_WARN;
  const maxPairs = Math.max(1, doc.pairs.length);
  const embedCode = `<iframe src="${siteUrl}/play/matching.html?slug=${encodeURIComponent(doc.slug)}" title="${(doc.title || "Matching game").replace(/"/g, "&quot;")}" style="border:0;width:100%;height:min(92dvh,720px);display:block;" loading="lazy"></iframe>`;

  const fontsConfigured = (["heading", "body", "hud"] as const).filter((r) => doc.fontUploads[r]?.url).length;
  const soundsConfigured = [doc.sounds.pairMatch, doc.sounds.mismatch, doc.sounds.roundComplete].filter(Boolean).length;
  const backgroundsConfigured = [doc.backgrounds.desktop, doc.backgrounds.tablet, doc.backgrounds.mobile].filter(
    Boolean,
  ).length;

  return (
    <div>
      <p style={{ margin: "0 0 8px" }}>
        <Link to="/">← Studio</Link>
        {" · "}
        <Link to="/library/matching">Matching games</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>Edit matching game</h2>
      {err ? <p style={{ color: "var(--rn-danger)" }}>{err}</p> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Component details</h3>
        <div className="grid2">
          <label className="field">
            Title
            <input value={doc.title} onChange={(e) => patch((d) => ({ ...d, title: e.target.value }))} />
          </label>
          <label className="field">
            Client
            <input value={doc.clientName} onChange={(e) => patch((d) => ({ ...d, clientName: e.target.value }))} />
          </label>
          <label className="field">
            Sub-URL (slug)
            <input
              value={doc.slug}
              onChange={(e) => patch((d) => ({ ...d, slug: e.target.value.trim().toLowerCase() }))}
            />
          </label>
          <ComponentMetadataFields
            record={doc}
            onChange={(p) => patch((d) => ({ ...d, ...p }))}
            onArchive={() => void archive()}
            archiving={archiving}
          />
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Public URL: <code>{publicUrl(doc.slug)}</code>
        </p>
        <label className="field" style={{ marginTop: 12 }}>
          Tab icon (favicon)
        </label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon,.ico"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            patch((d) => ({ ...d, faviconUrl: url }));
          }}
        />
        {doc.faviconUrl ? (
          <>
            <span className="muted"> ✓</span>
            <img
              src={doc.faviconUrl}
              alt=""
              style={{ width: 24, height: 24, marginLeft: 8, verticalAlign: "middle", objectFit: "contain" }}
            />
          </>
        ) : null}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={doc.showPoweredBy !== false}
            onChange={(e) => patch((d) => ({ ...d, showPoweredBy: e.target.checked }))}
          />
          Show “Powered by Real Nation”
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <CollapsibleSection
            title="Play mode"
            summary={doc.playMode === "memory" ? "Memory (face-down flip)" : "Match (A → B)"}
            defaultOpen
          >
            <label className="field">
              Mode
              <select
                value={doc.playMode}
                onChange={(e) =>
                  patch((d) => ({ ...d, playMode: e.target.value === "memory" ? "memory" : "match" }))
                }
              >
                <option value="match">Match (A → B, faces visible)</option>
                <option value="memory">Memory (face-down flip)</option>
              </select>
            </label>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Same pairing model for both. Match shows faces up; Memory hides them until flipped.
            </p>
          </CollapsibleSection>
      </div>

      <div style={{ marginBottom: 16 }}>
        <CollapsibleSection
            title="Pairs"
            summary={`${doc.pairs.length} pair${doc.pairs.length === 1 ? "" : "s"}${pairWarn ? " · large deck" : ""}`}
            defaultOpen
          >
            {pairWarn ? (
              <p style={{ color: "var(--rn-warning, #c9a227)", fontSize: "0.9rem" }}>
                You have {doc.pairs.length} pairs (soft guide: ~{MATCHING_PAIR_SOFT_WARN}). Layouts can feel crowded
                — still allowed.
              </p>
            ) : null}
            {doc.pairs.map((pair, i) => (
              <PairEditor
                key={pair.id}
                pair={pair}
                index={i}
                playMode={doc.playMode}
                sharedBackEnabled={doc.sharedBack.enabled}
                onChange={(next) =>
                  patch((d) => ({
                    ...d,
                    pairs: d.pairs.map((p, j) => (j === i ? next : p)),
                  }))
                }
                onRemove={() =>
                  patch((d) => ({
                    ...d,
                    pairs: d.pairs.length <= 1 ? d.pairs : d.pairs.filter((_, j) => j !== i),
                  }))
                }
              />
            ))}
            <button
              type="button"
              className="btn"
              style={{ marginTop: 8 }}
              onClick={() => patch((d) => ({ ...d, pairs: [...d.pairs, emptyMatchPair()] }))}
            >
              Add pair
            </button>

            {doc.playMode === "memory" ? (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--rn-border)" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={doc.sharedBack.enabled}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        sharedBack: { ...d.sharedBack, enabled: e.target.checked },
                      }))
                    }
                  />
                  Use one shared back for all pairs
                </label>
                {doc.sharedBack.enabled ? (
                  <div style={{ marginTop: 10 }}>
                    <FaceEditor
                      label="Shared back"
                      face={doc.sharedBack.face}
                      onChange={(face) => patch((d) => ({ ...d, sharedBack: { ...d.sharedBack, face } }))}
                    />
                  </div>
                ) : (
                  <p className="muted" style={{ fontSize: "0.85rem" }}>
                    Set a back on each pair above.
                  </p>
                )}
              </div>
            ) : null}
          </CollapsibleSection>
      </div>

      <div style={SETTINGS_GRID}>
        <div>
<CollapsibleSection
            title="Round deal"
            summary={`D${doc.gameplay.pairsDealt} / T${doc.gameplay.pairsDealtTablet} / M${doc.gameplay.pairsDealtMobile}${doc.gameplay.globalShuffle ? " · shuffled" : ""}`}
          >
            <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
              Deck has {doc.pairs.length} pair{doc.pairs.length === 1 ? "" : "s"}. Each round deals a random subset;
              pairs are not repeated until every pair in the deck has been used.
            </p>
            <label className="field">
              Pairs dealt — desktop
              <input
                type="number"
                min={1}
                max={maxPairs}
                value={doc.gameplay.pairsDealt}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    gameplay: {
                      ...d.gameplay,
                      pairsDealt: Math.min(d.pairs.length, Math.max(1, Number(e.target.value) || 1)),
                    },
                  }))
                }
              />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              Pairs dealt — tablet
              <input
                type="number"
                min={1}
                max={maxPairs}
                value={doc.gameplay.pairsDealtTablet}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    gameplay: {
                      ...d.gameplay,
                      pairsDealtTablet: Math.min(d.pairs.length, Math.max(1, Number(e.target.value) || 1)),
                    },
                  }))
                }
              />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              Pairs dealt — mobile
              <input
                type="number"
                min={1}
                max={maxPairs}
                value={doc.gameplay.pairsDealtMobile}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    gameplay: {
                      ...d.gameplay,
                      pairsDealtMobile: Math.min(d.pairs.length, Math.max(1, Number(e.target.value) || 1)),
                    },
                  }))
                }
              />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
              <input
                type="checkbox"
                checked={doc.gameplay.globalShuffle}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    gameplay: { ...d.gameplay, globalShuffle: e.target.checked },
                  }))
                }
              />
              Global Shuffle (mix all tiles across the grid)
            </label>
            <p className="muted" style={{ fontSize: "0.82rem", margin: "4px 0 0" }}>
              Off = Side A tiles stay in the left column, Side B tiles in the right column. On = every tile is
              shuffled together.
            </p>
          </CollapsibleSection>

          <CollapsibleSection title="Card image fit" summary={doc.layout.imageFit || "cover"}>
            <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
              How uploaded card art fills each tile. Cover/Fill removes letterbox gaps.
            </p>
            <label className="field">
              Image fit
              <select
                value={doc.layout.imageFit || "cover"}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    layout: {
                      ...d.layout,
                      imageFit: e.target.value as "contain" | "cover" | "fill",
                    },
                  }))
                }
              >
                <option value="cover">Scale to fill (cover — may crop)</option>
                <option value="contain">Scale to fit (contain — may letterbox)</option>
                <option value="fill">Stretch to fill</option>
              </select>
            </label>
          </CollapsibleSection>

          <CollapsibleSection
            title="Container chrome"
            summary={doc.cardChrome.enabled ? "Card styling on" : "Flat (off)"}
          >
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={doc.cardChrome.enabled}
                onChange={(e) =>
                  patch((d) => ({ ...d, cardChrome: { ...d.cardChrome, enabled: e.target.checked } }))
                }
              />
              Card container (off = flat elements, no forced radius/shadow)
            </label>
            {doc.cardChrome.enabled ? (
              <>
                <div style={{ marginTop: 12 }}>
                  <HexField
                    label="Background"
                    value={doc.cardChrome.backgroundHex}
                    onChange={(v) => patch((d) => ({ ...d, cardChrome: { ...d.cardChrome, backgroundHex: v } }))}
                  />
                </div>
                <HexField
                  label="Border"
                  value={doc.cardChrome.borderHex}
                  onChange={(v) => patch((d) => ({ ...d, cardChrome: { ...d.cardChrome, borderHex: v } }))}
                />
                <label className="field" style={{ marginTop: 12 }}>
                  Radius (px)
                  <input
                    type="number"
                    min={0}
                    max={48}
                    value={doc.cardChrome.radiusPx}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        cardChrome: { ...d.cardChrome, radiusPx: Number(e.target.value) || 0 },
                      }))
                    }
                  />
                </label>
                <label className="field" style={{ marginTop: 12 }}>
                  Padding (px)
                  <input
                    type="number"
                    min={0}
                    max={40}
                    value={doc.cardChrome.paddingPx}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        cardChrome: { ...d.cardChrome, paddingPx: Number(e.target.value) || 0 },
                      }))
                    }
                  />
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                  <input
                    type="checkbox"
                    checked={doc.cardChrome.shadow}
                    onChange={(e) =>
                      patch((d) => ({ ...d, cardChrome: { ...d.cardChrome, shadow: e.target.checked } }))
                    }
                  />
                  Drop shadow
                </label>
              </>
            ) : null}
          </CollapsibleSection>


          <CollapsibleSection title="Intro screen" summary={doc.introHeadline.trim() || "Untitled"}>
            <label className="field">
              Headline
              <input
                value={doc.introHeadline}
                onChange={(e) => patch((d) => ({ ...d, introHeadline: e.target.value }))}
              />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              Body
              <textarea
                rows={2}
                value={doc.introBody}
                onChange={(e) => patch((d) => ({ ...d, introBody: e.target.value }))}
              />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              Start button label
              <input value={doc.startLabel} onChange={(e) => patch((d) => ({ ...d, startLabel: e.target.value }))} />
            </label>
            <div style={{ marginTop: 12 }}>
              <HexField
                label="Headline hex"
                value={doc.introHeadlineHex}
                onChange={(v) => patch((d) => ({ ...d, introHeadlineHex: v }))}
              />
              <HexField
                label="Body hex"
                value={doc.introBodyHex}
                onChange={(v) => patch((d) => ({ ...d, introBodyHex: v }))}
              />
              <HexField
                label="Button hex"
                value={doc.introButtonHex}
                onChange={(v) => patch((d) => ({ ...d, introButtonHex: v }))}
              />
              <HexField
                label="Button text hex"
                value={doc.introButtonTextHex}
                onChange={(v) => patch((d) => ({ ...d, introButtonTextHex: v }))}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="End screen" summary={doc.endScreen.headline.trim() || "Default headline"}>
            <label className="field">Logo</label>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const { url } = await uploadFile(f);
                patch((d) => ({ ...d, endScreen: { ...d.endScreen, logoUrl: url } }));
              }}
            />
            {doc.endScreen.logoUrl ? <span className="muted"> ✓</span> : null}
            <label className="field" style={{ marginTop: 12 }}>
              Headline
            </label>
            <input
              value={doc.endScreen.headline}
              onChange={(e) => patch((d) => ({ ...d, endScreen: { ...d.endScreen, headline: e.target.value } }))}
            />
            <label className="field" style={{ marginTop: 12 }}>
              Subhead
            </label>
            <input
              value={doc.endScreen.subhead}
              onChange={(e) => patch((d) => ({ ...d, endScreen: { ...d.endScreen, subhead: e.target.value } }))}
            />
            <label className="field" style={{ marginTop: 12 }}>
              Score prefix
            </label>
            <input
              value={doc.endScreen.scorePrefix}
              onChange={(e) => patch((d) => ({ ...d, endScreen: { ...d.endScreen, scorePrefix: e.target.value } }))}
            />
            <label className="field" style={{ marginTop: 12 }}>
              Play again label
            </label>
            <input
              value={doc.endScreen.playAgainLabel}
              onChange={(e) =>
                patch((d) => ({ ...d, endScreen: { ...d.endScreen, playAgainLabel: e.target.value } }))
              }
            />
            <div style={{ marginTop: 12 }}>
              <HexField
                label="Headline hex"
                value={doc.endScreen.headlineHex}
                onChange={(v) => patch((d) => ({ ...d, endScreen: { ...d.endScreen, headlineHex: v } }))}
              />
              <HexField
                label="Subhead hex"
                value={doc.endScreen.subheadHex}
                onChange={(v) => patch((d) => ({ ...d, endScreen: { ...d.endScreen, subheadHex: v } }))}
              />
              <HexField
                label="Text hex"
                value={doc.endScreen.textHex}
                onChange={(v) => patch((d) => ({ ...d, endScreen: { ...d.endScreen, textHex: v } }))}
              />
              <HexField
                label="Button hex"
                value={doc.endScreen.buttonHex}
                onChange={(v) => patch((d) => ({ ...d, endScreen: { ...d.endScreen, buttonHex: v } }))}
              />
              <HexField
                label="Button text hex"
                value={doc.endScreen.buttonTextHex}
                onChange={(v) => patch((d) => ({ ...d, endScreen: { ...d.endScreen, buttonTextHex: v } }))}
              />
            </div>
            <label className="field" style={{ marginTop: 12 }}>
              Overlay colour (CSS)
            </label>
            <input
              value={doc.endScreen.overlayHex}
              placeholder="rgba(8, 14, 22, 0.88)"
              onChange={(e) => patch((d) => ({ ...d, endScreen: { ...d.endScreen, overlayHex: e.target.value } }))}
            />
            <p className="muted" style={{ fontSize: "0.78rem", margin: "4px 0 0" }}>
              Scrim behind the end card — accepts hex or rgba().
            </p>
          </CollapsibleSection>

<div style={{ border: "1px solid var(--rn-border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={doc.showFullscreenButton !== false}
                onChange={(e) => patch((d) => ({ ...d, showFullscreenButton: e.target.checked }))}
              />
              Show fullscreen button
            </label>
          </div>
        </div>

        <div>

          <CollapsibleSection
            title="Logo"
            summary={doc.logoUrl ? `Uploaded · ${doc.logoAlign}` : `No logo · ${doc.logoAlign}`}
          >
            <label className="field">Logo</label>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const { url } = await uploadFile(f);
                patch((d) => ({ ...d, logoUrl: url }));
              }}
            />
            {doc.logoUrl ? (
              <img src={doc.logoUrl} alt="" style={{ maxWidth: 120, marginTop: 8, borderRadius: 6, display: "block" }} />
            ) : null}
            <label className="field" style={{ marginTop: 12 }}>
              Logo alignment
            </label>
            <select
              value={doc.logoAlign}
              onChange={(e) => patch((d) => ({ ...d, logoAlign: e.target.value as MatchingRecord["logoAlign"] }))}
            >
              <option value="left">Left aligned</option>
              <option value="center">Centred</option>
              <option value="right">Right aligned</option>
            </select>
          </CollapsibleSection>

          <CollapsibleSection
            title="Branding & backgrounds"
            summary={`${backgroundsConfigured} of 3 backgrounds set`}
          >
            <HexField
              label="Page background"
              value={doc.backgroundHex}
              onChange={(v) => patch((d) => ({ ...d, backgroundHex: v }))}
            />
            <BgUploadRow
              label="Desktop background"
              hint="Optional landscape image"
              value={doc.backgrounds.desktop}
              onUploaded={(url) => patch((d) => ({ ...d, backgrounds: { ...d.backgrounds, desktop: url } }))}
            />
            <BgUploadRow
              label="Tablet background"
              hint="Optional"
              value={doc.backgrounds.tablet}
              onUploaded={(url) => patch((d) => ({ ...d, backgrounds: { ...d.backgrounds, tablet: url } }))}
            />
            <BgUploadRow
              label="Mobile background"
              hint="Optional"
              value={doc.backgrounds.mobile}
              onUploaded={(url) => patch((d) => ({ ...d, backgrounds: { ...d.backgrounds, mobile: url } }))}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Fonts" summary={`${fontsConfigured} of 3 uploaded`}>
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
              Upload WOFF/WOFF2/TTF for heading, body, and HUD display.
            </p>
            {(["heading", "body", "hud"] as const).map((role) => (
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
                {doc.fontUploads[role]?.url ? <span className="muted"> ✓</span> : null}
              </div>
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Sounds" summary={`${soundsConfigured} of 3 uploaded`}>
            <label className="field">Pair matched</label>
            <input
              type="file"
              accept="audio/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const { url } = await uploadFile(f);
                patch((d) => ({ ...d, sounds: { ...d.sounds, pairMatch: url } }));
              }}
            />
            {doc.sounds.pairMatch ? <span className="muted"> ✓</span> : null}
            <label className="field" style={{ marginTop: 12 }}>
              Non-match
            </label>
            <input
              type="file"
              accept="audio/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const { url } = await uploadFile(f);
                patch((d) => ({ ...d, sounds: { ...d.sounds, mismatch: url } }));
              }}
            />
            {doc.sounds.mismatch ? <span className="muted"> ✓</span> : null}
            <label className="field" style={{ marginTop: 12 }}>
              Round complete
            </label>
            <input
              type="file"
              accept="audio/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const { url } = await uploadFile(f);
                patch((d) => ({ ...d, sounds: { ...d.sounds, roundComplete: url } }));
              }}
            />
            {doc.sounds.roundComplete ? <span className="muted"> ✓</span> : null}
          </CollapsibleSection>

          <CollapsibleSection
            title="HUD"
            summary={`${doc.hud.showMoves ? "Moves" : ""}${doc.hud.showMoves && doc.hud.showScore ? " · " : ""}${doc.hud.showScore ? "Score" : ""}`.trim() || "Hidden"}
          >
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={doc.hud.showMoves}
                onChange={(e) => patch((d) => ({ ...d, hud: { ...d.hud, showMoves: e.target.checked } }))}
              />
              Show moves counter
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <input
                type="checkbox"
                checked={doc.hud.showScore}
                onChange={(e) => patch((d) => ({ ...d, hud: { ...d.hud, showScore: e.target.checked } }))}
              />
              Show score
            </label>
            <div style={{ marginTop: 12 }}>
              <HexField
                label="Moves hex"
                value={doc.hud.movesHex}
                onChange={(v) => patch((d) => ({ ...d, hud: { ...d.hud, movesHex: v } }))}
              />
              <HexField
                label="Score hex"
                value={doc.hud.scoreHex}
                onChange={(v) => patch((d) => ({ ...d, hud: { ...d.hud, scoreHex: v } }))}
              />
              <HexField
                label="Timer hex"
                value={doc.hud.timerHex}
                onChange={(v) => patch((d) => ({ ...d, hud: { ...d.hud, timerHex: v } }))}
              />
              <HexField
                label="Label hex"
                value={doc.hud.labelHex}
                onChange={(v) => patch((d) => ({ ...d, hud: { ...d.hud, labelHex: v } }))}
              />
            </div>
            <label className="field" style={{ marginTop: 12 }}>
              Timer (seconds, empty = off)
              <input
                type="number"
                min={10}
                max={3600}
                value={doc.gameplay.timerSec ?? ""}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    gameplay: {
                      ...d.gameplay,
                      timerSec: e.target.value === "" ? null : Number(e.target.value),
                    },
                  }))
                }
              />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              Max attempts (empty = unlimited)
              <input
                type="number"
                min={1}
                max={999}
                value={doc.gameplay.maxAttempts ?? ""}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    gameplay: {
                      ...d.gameplay,
                      maxAttempts: e.target.value === "" ? null : Number(e.target.value),
                    },
                  }))
                }
              />
            </label>
          </CollapsibleSection>

          <CollapsibleSection
            title="Score & leaderboard"
            summary={doc.gameplay.scoreEnabled ? "Scoring on" : "Scoring off"}
          >
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={doc.gameplay.scoreEnabled}
                onChange={(e) =>
                  patch((d) => ({ ...d, gameplay: { ...d.gameplay, scoreEnabled: e.target.checked } }))
                }
              />
              Scoring enabled
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              Points per match
              <input
                type="number"
                min={0}
                max={9999}
                value={doc.gameplay.pointsPerMatch}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    gameplay: { ...d.gameplay, pointsPerMatch: Number(e.target.value) || 0 },
                  }))
                }
              />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              Mismatch penalty
              <input
                type="number"
                min={0}
                max={9999}
                value={doc.gameplay.mismatchPenalty}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    gameplay: { ...d.gameplay, mismatchPenalty: Number(e.target.value) || 0 },
                  }))
                }
              />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              Linked leaderboard
            </label>
            <select
              value={doc.linkedLeaderboardSlug}
              onChange={(e) => patch((d) => ({ ...d, linkedLeaderboardSlug: e.target.value }))}
            >
              <option value="">— None —</option>
              {leaderboards.map((lb) => (
                <option key={lb.id} value={lb.slug}>
                  {lb.title} — /leaderboard/{lb.slug}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
              <input
                type="checkbox"
                checked={doc.highScore.enabled}
                onChange={(e) => patch((d) => ({ ...d, highScore: { ...d.highScore, enabled: e.target.checked } }))}
              />
              Collect player name on end screen (for leaderboard)
            </label>
            <p className="muted" style={{ fontSize: "0.82rem", margin: "4px 0 0" }}>
              Only shown when scoring is on and a leaderboard is linked. Save after changing.
            </p>
            <label className="field" style={{ marginTop: 12 }}>
              Name character limit
            </label>
            <input
              type="number"
              min={2}
              max={32}
              value={doc.highScore.nameMaxLength}
              onChange={(e) =>
                patch((d) => ({
                  ...d,
                  highScore: { ...d.highScore, nameMaxLength: Number(e.target.value) || 16 },
                }))
              }
            />
          </CollapsibleSection>
        
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <CollapsibleSection title="Live preview" summary="Refresh to sync unsaved changes" defaultOpen>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button type="button" className="btn btn-primary" onClick={() => pushPreview()}>
                Refresh preview
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPreviewKey((k) => k + 1);
                }}
              >
                Reload iframe
              </button>
            </div>
            <iframe
              key={previewKey}
              ref={iframeRef}
              title="Matching preview"
              src="/play/matching.html?preview=1"
              style={{ width: "100%", height: 520, border: "1px solid var(--rn-border)", borderRadius: 8 }}
              onLoad={() => pushPreview()}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Embed code" summary="Copy the iframe snippet" defaultOpen>
            <p className="muted" style={{ marginTop: 0 }}>
              Public URL: <code>{publicUrl(doc.slug)}</code>
            </p>
            <textarea
              readOnly
              rows={4}
              value={embedCode}
              style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
              onFocus={(e) => e.target.select()}
            />
          </CollapsibleSection>
      </div>

      <div className="card" style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn" disabled={saving} onClick={() => void saveWithThumbnail()}>
            Save + thumbnail
          </button>
          <a className="btn" href={publicUrl(doc.slug)} target="_blank" rel="noreferrer">
            Open public game
          </a>
          <button type="button" className="btn" onClick={() => void remove()}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
