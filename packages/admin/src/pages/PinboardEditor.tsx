import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiSend, uploadFile } from "../api";
import { HexField } from "../components/HexField";

type PinboardGame = {
  id: string;
  gameType: "pinboard";
  title: string;
  clientName: string;
  slug: string;
  updatedAt: string;
  reportingEnabled: boolean;
  faviconUrl?: string;
  permissions: {
    enabled: boolean;
    headline: string;
    introText: string;
    gdprUrl: string;
    gdprLinkLabel: string;
    items: { id: string; label: string; required: boolean }[];
    acceptButtonLabel: string;
  };
  board: Record<string, unknown>;
  mobile: Record<string, unknown>;
  moderator: Record<string, unknown>;
  stickies: { id: string; label: string; imageUrl: string }[];
};

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

function boardUrl(slug: string) {
  return `${siteUrl}/pinboard/${encodeURIComponent(slug)}`;
}

function submitUrl(slug: string) {
  return `${siteUrl}/pinboard/${encodeURIComponent(slug)}/submit`;
}

function moderateUrl(slug: string) {
  return `${siteUrl}/pinboard/${encodeURIComponent(slug)}/moderate`;
}

export default function PinboardEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<PinboardGame | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = await apiGet(`/api/wheels?id=${encodeURIComponent(id)}`);
      if (data.gameType !== "pinboard") {
        if (data.gameType === "flip-cards") navigate(`/flip-cards/${id}`, { replace: true });
        else if (data.gameType === "scratcher") navigate(`/scratchers/${id}`, { replace: true });
        else if (data.gameType === "quiz") navigate(`/quizzes/${id}`, { replace: true });
        else navigate(`/wheels/${id}`, { replace: true });
        return;
      }
      setGame(data as PinboardGame);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (fn: (g: PinboardGame) => PinboardGame) => {
    setGame((prev) => (prev ? fn(prev) : prev));
  };

  const save = async () => {
    if (!game) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiSend("/api/wheels", "PUT", { ...game, updatedAt: new Date().toISOString() });
      if (res?.wheel) setGame(res.wheel as PinboardGame);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File, onUrl: (url: string) => void) => {
    const url = await uploadFile(file, game?.slug || "pinboard");
    onUrl(url);
    await save();
  };

  if (!game) {
    return <p className="muted">{err || "Loading…"}</p>;
  }

  const b = game.board as {
    header: string;
    subhead: string;
    headerHex: string;
    subheadHex: string;
    backgroundHex: string;
    backgroundImage: string;
    useBackgroundImage: boolean;
    brandLogoUrl: string;
    brandLogoCorner: string;
    polaroidFrames: boolean;
  };
  const m = game.mobile as Record<string, unknown> & {
    headline: string;
    subheadline: string;
    submitLabel: string;
    thankYouMessage: string;
    backgroundHex: string;
    textHex: string;
    buttonHex: string;
    buttonTextHex: string;
    photoPublishMode: string;
    uniformFrameId: string;
    photoFrames: { id: string; label: string; imageUrl: string }[];
    photoStickers: { id: string; label: string; imageUrl: string }[];
    stickyAssets: { id: string; label: string; imageUrl: string }[];
  };
  const mod = game.moderator as {
    headline: string;
    approveLabel: string;
    rejectLabel: string;
    backgroundHex: string;
    textHex: string;
    buttonHex: string;
    buttonTextHex: string;
  };

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <Link to="/">← All games</Link>
      </p>
      {err && <p style={{ color: "var(--rn-warn, #e8a838)" }}>{err}</p>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Game details</h2>
        <label className="field">Title</label>
        <input value={game.title} onChange={(e) => patch((g) => ({ ...g, title: e.target.value }))} />
        <label className="field">Client</label>
        <input value={game.clientName} onChange={(e) => patch((g) => ({ ...g, clientName: e.target.value }))} />
        <label className="field">Slug</label>
        <input value={game.slug} onChange={(e) => patch((g) => ({ ...g, slug: e.target.value }))} />
        <label className="field">Favicon URL</label>
        <input value={game.faviconUrl || ""} onChange={(e) => patch((g) => ({ ...g, faviconUrl: e.target.value }))} />
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void apiDelete(`/api/wheels?id=${game.id}`).then(() => navigate("/"))}
          >
            Delete game
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Public URLs</h2>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          Board: <a href={boardUrl(game.slug)} target="_blank" rel="noreferrer">{boardUrl(game.slug)}</a>
          <br />
          Submit (QR):{" "}
          <a href={submitUrl(game.slug)} target="_blank" rel="noreferrer">{submitUrl(game.slug)}</a>
          <br />
          Moderator:{" "}
          <a href={moderateUrl(game.slug)} target="_blank" rel="noreferrer">{moderateUrl(game.slug)}</a>
        </p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Permissions (optional)</h2>
        <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={game.permissions.enabled}
            onChange={(e) =>
              patch((g) => ({ ...g, permissions: { ...g.permissions, enabled: e.target.checked } }))
            }
          />
          Show consent screen before guests can submit
        </label>
        {game.permissions.enabled && (
          <>
            <label className="field">Headline</label>
            <input
              value={game.permissions.headline}
              onChange={(e) =>
                patch((g) => ({ ...g, permissions: { ...g.permissions, headline: e.target.value } }))
              }
            />
            <label className="field">Intro text</label>
            <textarea
              value={game.permissions.introText}
              onChange={(e) =>
                patch((g) => ({ ...g, permissions: { ...g.permissions, introText: e.target.value } }))
              }
              rows={3}
            />
            <label className="field">GDPR / privacy policy URL</label>
            <input
              value={game.permissions.gdprUrl}
              onChange={(e) =>
                patch((g) => ({ ...g, permissions: { ...g.permissions, gdprUrl: e.target.value } }))
              }
              placeholder="https://…"
            />
            <label className="field">GDPR link label</label>
            <input
              value={game.permissions.gdprLinkLabel}
              onChange={(e) =>
                patch((g) => ({ ...g, permissions: { ...g.permissions, gdprLinkLabel: e.target.value } }))
              }
            />
            <label className="field">Accept button label</label>
            <input
              value={game.permissions.acceptButtonLabel}
              onChange={(e) =>
                patch((g) => ({ ...g, permissions: { ...g.permissions, acceptButtonLabel: e.target.value } }))
              }
            />
            <p className="muted" style={{ fontSize: "0.85rem" }}>Consent checkboxes</p>
            {game.permissions.items.map((item, i) => (
              <div key={item.id} style={{ marginBottom: 10, padding: 10, background: "rgba(0,0,0,0.04)", borderRadius: 8 }}>
                <input
                  value={item.label}
                  onChange={(e) => {
                    const items = [...game.permissions.items];
                    items[i] = { ...items[i], label: e.target.value };
                    patch((g) => ({ ...g, permissions: { ...g.permissions, items } }));
                  }}
                  style={{ width: "100%", marginBottom: 6 }}
                />
                <label style={{ fontSize: "0.85rem" }}>
                  <input
                    type="checkbox"
                    checked={item.required}
                    onChange={(e) => {
                      const items = [...game.permissions.items];
                      items[i] = { ...items[i], required: e.target.checked };
                      patch((g) => ({ ...g, permissions: { ...g.permissions, items } }));
                    }}
                  />{" "}
                  Required
                </label>
              </div>
            ))}
            <button
              type="button"
              className="btn"
              onClick={() =>
                patch((g) => ({
                  ...g,
                  permissions: {
                    ...g.permissions,
                    items: [
                      ...g.permissions.items,
                      { id: crypto.randomUUID(), label: "I have read and accept …", required: true },
                    ],
                  },
                }))
              }
            >
              Add checkbox
            </button>
          </>
        )}
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Live board</h2>
          <label className="field">Header</label>
          <input value={b.header || ""} onChange={(e) => patch((g) => ({ ...g, board: { ...g.board, header: e.target.value } }))} />
          <label className="field">Subhead</label>
          <input value={b.subhead || ""} onChange={(e) => patch((g) => ({ ...g, board: { ...g.board, subhead: e.target.value } }))} />
          <HexField label="Header hex" value={b.headerHex || "#ffffff"} onChange={(v) => patch((g) => ({ ...g, board: { ...g.board, headerHex: v } }))} />
          <HexField label="Subhead hex" value={b.subheadHex || "#dce8e4"} onChange={(v) => patch((g) => ({ ...g, board: { ...g.board, subheadHex: v } }))} />
          <HexField label="Background hex" value={b.backgroundHex || "#3d5a4c"} onChange={(v) => patch((g) => ({ ...g, board: { ...g.board, backgroundHex: v } }))} />
          <label className="field">
            <input
              type="checkbox"
              checked={!!b.useBackgroundImage}
              onChange={(e) => patch((g) => ({ ...g, board: { ...g.board, useBackgroundImage: e.target.checked } }))}
            />{" "}
            Use background image
          </label>
          <label className="field">Background image URL</label>
          <input
            value={b.backgroundImage || ""}
            onChange={(e) => patch((g) => ({ ...g, board: { ...g.board, backgroundImage: e.target.value } }))}
          />
          <label className="field">Brand logo URL</label>
          <input
            value={b.brandLogoUrl || ""}
            onChange={(e) => patch((g) => ({ ...g, board: { ...g.board, brandLogoUrl: e.target.value } }))}
          />
          <label className="field">
            <input
              type="checkbox"
              checked={b.polaroidFrames !== false}
              onChange={(e) => patch((g) => ({ ...g, board: { ...g.board, polaroidFrames: e.target.checked } }))}
            />{" "}
            Polaroid frames (uniform mode)
          </label>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Mobile submit</h2>
          <label className="field">Headline</label>
          <input value={m.headline || ""} onChange={(e) => patch((g) => ({ ...g, mobile: { ...g.mobile, headline: e.target.value } }))} />
          <HexField label="Background hex" value={String(m.backgroundHex || "#1a2332")} onChange={(v) => patch((g) => ({ ...g, mobile: { ...g.mobile, backgroundHex: v } }))} />
          <HexField label="Text hex" value={String(m.textHex || "#f5f5f5")} onChange={(v) => patch((g) => ({ ...g, mobile: { ...g.mobile, textHex: v } }))} />
          <HexField label="Button hex" value={String(m.buttonHex || "#d93ddb")} onChange={(v) => patch((g) => ({ ...g, mobile: { ...g.mobile, buttonHex: v } }))} />
          <label className="field">Photo on board</label>
          <select
            value={String(m.photoPublishMode || "user_choice")}
            onChange={(e) => patch((g) => ({ ...g, mobile: { ...g.mobile, photoPublishMode: e.target.value } }))}
          >
            <option value="user_choice">Guest frame &amp; stickers (flattened)</option>
            <option value="raw">Photo only</option>
            <option value="uniform_frame">Uniform frame for all</option>
          </select>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Moderator</h2>
          <label className="field">Headline</label>
          <input value={mod.headline || ""} onChange={(e) => patch((g) => ({ ...g, moderator: { ...g.moderator, headline: e.target.value } }))} />
          <HexField label="Background hex" value={mod.backgroundHex || "#121820"} onChange={(v) => patch((g) => ({ ...g, moderator: { ...g.moderator, backgroundHex: v } }))} />
          <HexField label="Button hex" value={mod.buttonHex || "#2d6a4f"} onChange={(v) => patch((g) => ({ ...g, moderator: { ...g.moderator, buttonHex: v } }))} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Preview — live board</h2>
        <iframe
          ref={iframeRef}
          title="Pin board preview"
          src={`${siteUrl}/play/pinboard-board.html?slug=${encodeURIComponent(game.slug)}`}
          style={{ width: "100%", height: "min(70vh, 640px)", border: "1px solid #ccc", borderRadius: 8 }}
        />
      </div>
    </div>
  );
}
