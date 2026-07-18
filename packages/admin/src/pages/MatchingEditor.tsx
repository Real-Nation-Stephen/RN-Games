import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

function publicUrl(slug: string) {
  return `${siteUrl}/matching/${encodeURIComponent(slug)}`;
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
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
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
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const patch = (fn: (d: MatchingRecord) => MatchingRecord) => setDoc((d) => (d ? fn(d) : d));

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
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, [id, navigate]);

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
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={doc.showPoweredBy !== false}
            onChange={(e) => patch((d) => ({ ...d, showPoweredBy: e.target.checked }))}
          />
          Show “Powered by Real Nation”
        </label>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Play mode</h3>
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
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Pairs</h3>
        {pairWarn ? (
          <p style={{ color: "var(--rn-warning, #c9a227)", fontSize: "0.9rem" }}>
            You have {doc.pairs.length} pairs (soft guide: ~{MATCHING_PAIR_SOFT_WARN}). Layouts can feel crowded — still allowed.
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
              <div style={{ marginTop: 10, maxWidth: 360 }}>
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
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Round deal</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
          Deck has {doc.pairs.length} pair{doc.pairs.length === 1 ? "" : "s"}. Each round deals a random subset; pairs
          are not repeated until every pair in the deck has been used.
        </p>
        <label className="field">
          Pairs dealt per round
          <input
            type="number"
            min={1}
            max={Math.max(1, doc.pairs.length)}
            value={doc.gameplay.pairsDealt}
            onChange={(e) =>
              patch((d) => ({
                ...d,
                gameplay: {
                  ...d.gameplay,
                  pairsDealt: Math.min(
                    d.pairs.length,
                    Math.max(1, Number(e.target.value) || 1),
                  ),
                },
              }))
            }
          />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input
            type="checkbox"
            checked={doc.gameplay.shuffle}
            onChange={(e) =>
              patch((d) => ({
                ...d,
                gameplay: { ...d.gameplay, shuffle: e.target.checked },
              }))
            }
          />
          Shuffle tile positions on the board
        </label>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Container chrome</h3>
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
          <div className="grid2" style={{ marginTop: 12 }}>
            <HexField
              label="Background"
              value={doc.cardChrome.backgroundHex}
              onChange={(v) => patch((d) => ({ ...d, cardChrome: { ...d.cardChrome, backgroundHex: v } }))}
            />
            <HexField
              label="Border"
              value={doc.cardChrome.borderHex}
              onChange={(v) => patch((d) => ({ ...d, cardChrome: { ...d.cardChrome, borderHex: v } }))}
            />
            <label className="field">
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
            <label className="field">
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
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={doc.cardChrome.shadow}
                onChange={(e) =>
                  patch((d) => ({ ...d, cardChrome: { ...d.cardChrome, shadow: e.target.checked } }))
                }
              />
              Drop shadow
            </label>
          </div>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Branding &amp; copy</h3>
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
        <label className="field">
          Logo
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
        </label>
        <label className="field">
          Intro headline
          <input value={doc.introHeadline} onChange={(e) => patch((d) => ({ ...d, introHeadline: e.target.value }))} />
        </label>
        <label className="field">
          Intro body
          <textarea rows={2} value={doc.introBody} onChange={(e) => patch((d) => ({ ...d, introBody: e.target.value }))} />
        </label>
        <label className="field">
          Start button
          <input value={doc.startLabel} onChange={(e) => patch((d) => ({ ...d, startLabel: e.target.value }))} />
        </label>
        <label className="field">
          End headline
          <input
            value={doc.endScreen.headline}
            onChange={(e) => patch((d) => ({ ...d, endScreen: { ...d.endScreen, headline: e.target.value } }))}
          />
        </label>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Live preview</h3>
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
          src={`/play/matching.html?preview=1`}
          style={{ width: "100%", height: 560, border: "1px solid var(--rn-border)", borderRadius: 8 }}
          onLoad={() => pushPreview()}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 40 }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </button>
        <a className="btn" href={publicUrl(doc.slug)} target="_blank" rel="noreferrer">
          Open public game
        </a>
        <button type="button" className="btn" onClick={() => void remove()}>
          Delete
        </button>
      </div>
    </div>
  );
}
