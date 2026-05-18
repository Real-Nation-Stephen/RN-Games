import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
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
  showPoweredBy?: boolean;
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

function boardPublicUrl(slug: string) {
  return `${siteUrl}/pinboard/${encodeURIComponent(slug)}`;
}

function submitPublicUrl(slug: string) {
  return `${siteUrl}/pinboard/${encodeURIComponent(slug)}/submit`;
}

function moderatePublicUrl(slug: string) {
  return `${siteUrl}/pinboard/${encodeURIComponent(slug)}/moderate`;
}

function publicPayload(g: PinboardGame) {
  return {
    gameType: "pinboard" as const,
    id: g.id,
    title: g.title,
    slug: g.slug,
    faviconUrl: g.faviconUrl || "",
    permissions: g.permissions,
    board: g.board,
    mobile: g.mobile,
    moderator: g.moderator,
    stickies: g.stickies,
  };
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
      if (data.gameType === "pinboard") {
        setGame(data as PinboardGame);
        return;
      }
      if (data.gameType === "flip-cards") navigate(`/flip-cards/${id}`, { replace: true });
      else if (data.gameType === "scratcher") navigate(`/scratchers/${id}`, { replace: true });
      else if (data.gameType === "quiz") navigate(`/quizzes/${id}`, { replace: true });
      else navigate(`/wheels/${id}`, { replace: true });
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

  const pushPreview = useCallback(() => {
    if (!game || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "rngames-pinboard-config", config: publicPayload(game) },
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
      if (res?.wheel) setGame(res.wheel as PinboardGame);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGame() {
    if (!game) return;
    const ok = window.confirm(
      "Delete this game and its public URLs?\n\nThis permanently removes the pin board and cannot be undone.\n\nClick OK to delete, or Cancel to keep it.",
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
    await new Promise((r) => setTimeout(r, 400));
    const iframe = iframeRef.current;
    const app = iframe?.contentDocument?.getElementById("app");
    if (!app) return;
    try {
      const canvas = await html2canvas(app, { scale: 0.4, useCORS: true, allowTaint: false, logging: false });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
      if (!blob) return;
      const file = new File([blob], `thumb-${game.id}.jpg`, { type: "image/jpeg" });
      const { url } = await uploadFile(file);
      const res = await apiSend("/api/wheels", "PUT", { ...game, thumbnailUrl: url });
      if (res?.wheel) setGame(res.wheel as PinboardGame);
    } catch {
      /* optional */
    }
  }

  async function downloadPdf() {
    const iframe = iframeRef.current;
    const app = iframe?.contentDocument?.getElementById("app");
    if (!app || !game) return;
    pushPreview();
    await new Promise((r) => setTimeout(r, 150));
    const canvas = await html2canvas(app, { scale: 2, useCORS: true, allowTaint: false, logging: false });
    const img = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
    pdf.addImage(img, "JPEG", 0, 0, canvas.width, canvas.height);
    pdf.save(`${game.slug || "pinboard"}-preview.pdf`);
  }

  if (!game) {
    return err ? <p className="muted">{err}</p> : <p className="muted">Loading…</p>;
  }

  const boardFontUploads = (game.board as { fontUploads?: Record<string, { url: string; family: string }> })
    .fontUploads;
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
    fontUploads?: Record<string, { url: string; family: string }>;
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
      <p>
        <Link to="/">← Studio</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>Edit pin board</h2>
      {err && <p className="muted">{err}</p>}

      <div className="card">
        <div className="grid2">
          <div>
            <label className="field">Title</label>
            <input type="text" value={game.title} onChange={(e) => patch((g) => ({ ...g, title: e.target.value }))} />
          </div>
          <div>
            <label className="field">Client</label>
            <input
              type="text"
              value={game.clientName}
              onChange={(e) => patch((g) => ({ ...g, clientName: e.target.value }))}
            />
          </div>
          <div>
            <label className="field">Sub-URL (slug)</label>
            <input
              type="text"
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
          Live board: <code>{boardPublicUrl(game.slug)}</code>
          <br />
          Guest submit (QR): <code>{submitPublicUrl(game.slug)}</code>
          <br />
          Moderator: <code>{moderatePublicUrl(game.slug)}</code>
          {game.reportingEnabled && (
            <>
              <br />
              Report: <code>{`${siteUrl}/${game.slug}_Report`}</code>
            </>
          )}
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
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Permissions (optional)</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            <label className="field" style={{ marginTop: 12 }}>
              Headline
            </label>
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
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 12 }}>
              Consent checkboxes
            </p>
            {game.permissions.items.map((item, i) => (
              <div
                key={item.id}
                style={{ marginBottom: 10, padding: 10, border: "1px solid var(--rn-border)", borderRadius: 8 }}
              >
                <input
                  value={item.label}
                  onChange={(e) => {
                    const items = [...game.permissions.items];
                    items[i] = { ...items[i], label: e.target.value };
                    patch((g) => ({ ...g, permissions: { ...g.permissions, items } }));
                  }}
                  style={{ width: "100%", marginBottom: 6 }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem" }}>
                  <input
                    type="checkbox"
                    checked={item.required}
                    onChange={(e) => {
                      const items = [...game.permissions.items];
                      items[i] = { ...items[i], required: e.target.checked };
                      patch((g) => ({ ...g, permissions: { ...g.permissions, items } }));
                    }}
                  />
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
          <h3 style={{ marginTop: 0 }}>Live board</h3>
          <label className="field">Header</label>
          <input value={b.header || ""} onChange={(e) => patch((g) => ({ ...g, board: { ...g.board, header: e.target.value } }))} />
          <label className="field">Subhead</label>
          <input value={b.subhead || ""} onChange={(e) => patch((g) => ({ ...g, board: { ...g.board, subhead: e.target.value } }))} />
          <HexField label="Header hex" value={b.headerHex || "#ffffff"} onChange={(v) => patch((g) => ({ ...g, board: { ...g.board, headerHex: v } }))} />
          <HexField label="Subhead hex" value={b.subheadHex || "#dce8e4"} onChange={(v) => patch((g) => ({ ...g, board: { ...g.board, subheadHex: v } }))} />
          <HexField label="Background hex" value={b.backgroundHex || "#3d5a4c"} onChange={(v) => patch((g) => ({ ...g, board: { ...g.board, backgroundHex: v } }))} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input
              type="checkbox"
              checked={!!b.useBackgroundImage}
              onChange={(e) => patch((g) => ({ ...g, board: { ...g.board, useBackgroundImage: e.target.checked } }))}
            />
            Use background image
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            Background image
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patch((g) => ({
                ...g,
                board: { ...g.board, backgroundImage: url, useBackgroundImage: true },
              }));
            }}
          />
          {b.backgroundImage ? <span className="muted"> ✓</span> : null}

          <label className="field" style={{ marginTop: 12 }}>
            Brand logo
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patch((g) => ({ ...g, board: { ...g.board, brandLogoUrl: url } }));
            }}
          />
          {b.brandLogoUrl ? (
            <span className="muted">
              {" "}
              ✓{" "}
              <img
                src={b.brandLogoUrl}
                alt=""
                width={48}
                height={48}
                style={{ borderRadius: 8, verticalAlign: "middle", marginLeft: 8 }}
              />
            </span>
          ) : null}

          <label className="field" style={{ marginTop: 12 }}>
            Header font (woff2 / ttf)
          </label>
          <input
            type="file"
            accept=".woff2,.woff,.ttf,font/woff2,font/woff,font/ttf"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patch((g) => ({
                ...g,
                board: {
                  ...g.board,
                  fontUploads: {
                    ...(g.board as { fontUploads?: Record<string, { url: string; family: string }> }).fontUploads,
                    heading: { url, family: "PinHeading" },
                  },
                },
              }));
            }}
          />
          {boardFontUploads?.heading?.url ? <span className="muted"> ✓</span> : null}

          <label className="field" style={{ marginTop: 12 }}>
            Subheader font (woff2 / ttf)
          </label>
          <input
            type="file"
            accept=".woff2,.woff,.ttf,font/woff2,font/woff,font/ttf"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patch((g) => ({
                ...g,
                board: {
                  ...g.board,
                  fontUploads: {
                    ...(g.board as { fontUploads?: Record<string, { url: string; family: string }> }).fontUploads,
                    subheading: { url, family: "PinSubhead" },
                  },
                },
              }));
            }}
          />
          {boardFontUploads?.subheading?.url ? <span className="muted"> ✓</span> : null}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input
              type="checkbox"
              checked={b.polaroidFrames !== false}
              onChange={(e) => patch((g) => ({ ...g, board: { ...g.board, polaroidFrames: e.target.checked } }))}
            />
            Polaroid frames (uniform mode)
          </label>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Mobile submit</h3>
          <label className="field">Headline</label>
          <input value={m.headline || ""} onChange={(e) => patch((g) => ({ ...g, mobile: { ...g.mobile, headline: e.target.value } }))} />
          <label className="field">Subheadline</label>
          <input
            value={m.subheadline || ""}
            onChange={(e) => patch((g) => ({ ...g, mobile: { ...g.mobile, subheadline: e.target.value } }))}
          />
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
          <h3 style={{ marginTop: 0 }}>Moderator</h3>
          <label className="field">Headline</label>
          <input value={mod.headline || ""} onChange={(e) => patch((g) => ({ ...g, moderator: { ...g.moderator, headline: e.target.value } }))} />
          <HexField label="Background hex" value={mod.backgroundHex || "#121820"} onChange={(v) => patch((g) => ({ ...g, moderator: { ...g.moderator, backgroundHex: v } }))} />
          <HexField label="Button hex" value={mod.buttonHex || "#2d6a4f"} onChange={(v) => patch((g) => ({ ...g, moderator: { ...g.moderator, buttonHex: v } }))} />
        </div>
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
          <button type="button" className="btn" onClick={() => window.open(boardPublicUrl(game.slug), "_blank")}>
            Open public board
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title="Pin board preview"
          src={`/play/pinboard-board.html?preview=1&slug=${encodeURIComponent(game.slug)}`}
          onLoad={() => pushPreview()}
          style={{
            width: "100%",
            height: "min(420px, 52vh)",
            border: "1px solid var(--rn-border)",
            borderRadius: 8,
            background: b.backgroundHex || "#3d5a4c",
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
