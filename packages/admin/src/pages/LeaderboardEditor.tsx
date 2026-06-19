import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import html2canvas from "html2canvas";
import { isLeaderboardLinkableGameType, normalizeLeaderboard } from "@rngames/shared";
import { apiDelete, apiGet, apiSend, uploadFile } from "../api";
import { HexField } from "../components/HexField";

type LeaderboardGame = {
  id: string;
  gameType: "leaderboard";
  title: string;
  clientName: string;
  slug: string;
  updatedAt: string;
  reportingEnabled: boolean;
  thumbnailUrl?: string;
  faviconUrl?: string;
  showPoweredBy?: boolean;
  mode: "linked" | "manual";
  linkedGameId: string;
  linkedGameSlug: string;
  linkedGameTitle: string;
  moderatorPin: string;
  board: {
    header: string;
    subhead: string;
    headerHex: string;
    subheadHex: string;
    useBackgroundImage: boolean;
    backgroundHex: string;
    backgroundImage: string;
    brandLogoUrl: string;
    brandLogoCorner: "bl" | "br" | "tl" | "tr";
  };
  moderator: {
    headline: string;
    backgroundHex: string;
    textHex: string;
    buttonHex: string;
    buttonTextHex: string;
    buttonDangerHex: string;
    buttonDangerTextHex: string;
  };
};

type IndexItem = {
  id: string;
  gameType?: string;
  slug: string;
  title: string;
};

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

function liveUrl(slug: string) {
  return `${siteUrl}/leaderboard/${encodeURIComponent(slug)}`;
}

function moderateUrl(slug: string) {
  return `${siteUrl}/leaderboard/${encodeURIComponent(slug)}/moderator`;
}

function publicConfig(g: LeaderboardGame) {
  return {
    gameType: "leaderboard" as const,
    id: g.id,
    title: g.title,
    slug: g.slug,
    faviconUrl: g.faviconUrl || "",
    showPoweredBy: g.showPoweredBy !== false,
    mode: g.mode,
    linkedGameId: g.linkedGameId,
    linkedGameSlug: g.linkedGameSlug,
    board: g.board,
    moderator: g.moderator,
  };
}

function getLeaderboardHtml2CanvasOptions(iframe: HTMLIFrameElement) {
  const idoc = iframe.contentDocument;
  const idwin = iframe.contentWindow;
  const bgSolid =
    idoc && idwin
      ? idwin.getComputedStyle(idoc.documentElement).getPropertyValue("--lb-bg-solid").trim()
      : "";
  return {
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: bgSolid || "#0f1a24",
  };
}

export default function LeaderboardEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<LeaderboardGame | null>(null);
  const [linkableGames, setLinkableGames] = useState<IndexItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const patch = (fn: (g: LeaderboardGame) => LeaderboardGame) => {
    setGame((prev) => (prev ? fn(prev) : prev));
  };

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const [data, index] = await Promise.all([
        apiGet(`/api/wheels?id=${encodeURIComponent(id)}`),
        apiGet("/api/wheels"),
      ]);
      if (data.gameType !== "leaderboard") {
        navigate(`/wheels/${id}`, { replace: true });
        return;
      }
      let lb = normalizeLeaderboard(data as LeaderboardGame) as LeaderboardGame;
      if (
        lb.mode === "linked" &&
        lb.linkedGameId &&
        !isLeaderboardLinkableGameType(
          (index.wheels as IndexItem[]).find((w) => w.id === lb.linkedGameId)?.gameType,
        )
      ) {
        lb = {
          ...lb,
          linkedGameId: "",
          linkedGameSlug: "",
          linkedGameTitle: "",
        };
      }
      setGame(lb);
      setLinkableGames(
        (index.wheels || []).filter(
          (w: IndexItem) =>
            w.id !== id &&
            w.gameType !== "leaderboard" &&
            isLeaderboardLinkableGameType(w.gameType),
        ),
      );
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
      { type: "rngames-leaderboard-config", config: publicConfig(game) },
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
      if (res?.wheel) setGame(normalizeLeaderboard(res.wheel as LeaderboardGame) as LeaderboardGame);
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
    await new Promise((r) => setTimeout(r, 400));
    const iframe = iframeRef.current;
    const app = iframe?.contentDocument?.getElementById("app");
    if (!app || !game) return;
    try {
      const canvas = await html2canvas(app, { scale: 0.4, ...getLeaderboardHtml2CanvasOptions(iframe) });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
      if (!blob) return;
      const file = new File([blob], `thumb-${game.id}.jpg`, { type: "image/jpeg" });
      const { url } = await uploadFile(file);
      const res = await apiSend("/api/wheels", "PUT", { ...game, thumbnailUrl: url });
      if (res?.wheel) setGame(normalizeLeaderboard(res.wheel as LeaderboardGame) as LeaderboardGame);
    } catch {
      /* optional */
    }
  }

  async function deleteGame() {
    if (!game) return;
    const ok = window.confirm(
      "Delete this leaderboard and its public URLs?\n\nThis cannot be undone.\n\nClick OK to delete, or Cancel to keep it.",
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

  if (!game) {
    return err ? <p className="muted">{err}</p> : <p className="muted">Loading…</p>;
  }

  const b = game.board;
  const mod = game.moderator;

  return (
    <div>
      <p>
        <Link to="/">← Studio</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>Edit leaderboard</h2>
      {err && <p className="muted">{err}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Game details</h3>
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
          Live board: <code>{liveUrl(game.slug)}</code>
          <br />
          Moderator: <code>{moderateUrl(game.slug)}</code>
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
          <h3 style={{ marginTop: 0 }}>Data source</h3>
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            <strong>Manual</strong> — facilitator maintains scores on the moderator page.
            <strong> Linked</strong> — scores arrive from a score-based arcade game (catch, dino, etc.).
            Wheels, scratchers, flip cards, pin boards, and quizzes cannot be linked (quizzes use their own session
            leaderboard).
          </p>
          <label className="field">Mode</label>
          <select
            value={game.mode}
            onChange={(e) => {
              const mode = e.target.value as "linked" | "manual";
              patch((g) => ({
                ...g,
                mode,
                ...(mode === "manual" ? { linkedGameId: "", linkedGameSlug: "", linkedGameTitle: "" } : {}),
              }));
            }}
          >
            <option value="manual">Manual</option>
            <option value="linked">Linked to a game</option>
          </select>
          {game.mode === "linked" ? (
            <>
              <label className="field" style={{ marginTop: 12 }}>
                Linked game
              </label>
              <select
                value={game.linkedGameId}
                onChange={(e) => {
                  const item = linkableGames.find((x) => x.id === e.target.value);
                  patch((g) => ({
                    ...g,
                    linkedGameId: e.target.value,
                    linkedGameSlug: item?.slug || "",
                    linkedGameTitle: item?.title || "",
                  }));
                }}
              >
                <option value="">— Select —</option>
                {linkableGames.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title} ({g.gameType}) — /{g.slug}
                  </option>
                ))}
              </select>
              {linkableGames.length === 0 ? (
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: 8 }}>
                  No linkable games in this Studio yet. Arcade modules (catch, dino) will appear here when added. Use
                  Manual mode for in-person events.
                </p>
              ) : null}
            </>
          ) : null}
          <label className="field" style={{ marginTop: 12 }}>
            Moderator PIN
          </label>
          <input
            type="text"
            value={game.moderatorPin}
            onChange={(e) => patch((g) => ({ ...g, moderatorPin: e.target.value }))}
            placeholder="Required for moderator page"
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Live board</h3>
          <label className="field">Header</label>
          <input value={b.header} onChange={(e) => patch((g) => ({ ...g, board: { ...g.board, header: e.target.value } }))} />
          <label className="field">Subhead</label>
          <input value={b.subhead} onChange={(e) => patch((g) => ({ ...g, board: { ...g.board, subhead: e.target.value } }))} />
          <HexField label="Header hex" value={b.headerHex} onChange={(v) => patch((g) => ({ ...g, board: { ...g.board, headerHex: v } }))} />
          <HexField label="Subhead hex" value={b.subheadHex} onChange={(v) => patch((g) => ({ ...g, board: { ...g.board, subheadHex: v } }))} />
          <HexField label="Background hex" value={b.backgroundHex} onChange={(v) => patch((g) => ({ ...g, board: { ...g.board, backgroundHex: v } }))} />
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
          {b.brandLogoUrl ? <span className="muted"> ✓</span> : null}
          <label className="field" style={{ marginTop: 12 }}>
            Brand logo corner
          </label>
          <select
            value={b.brandLogoCorner}
            onChange={(e) =>
              patch((g) => ({
                ...g,
                board: { ...g.board, brandLogoCorner: e.target.value as LeaderboardGame["board"]["brandLogoCorner"] },
              }))
            }
          >
            <option value="bl">Bottom left</option>
            <option value="br">Bottom right</option>
            <option value="tl">Top left</option>
            <option value="tr">Top right</option>
          </select>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Moderator</h3>
          <label className="field">Headline</label>
          <input value={mod.headline} onChange={(e) => patch((g) => ({ ...g, moderator: { ...g.moderator, headline: e.target.value } }))} />
          <HexField label="Background hex" value={mod.backgroundHex} onChange={(v) => patch((g) => ({ ...g, moderator: { ...g.moderator, backgroundHex: v } }))} />
          <HexField label="Text hex" value={mod.textHex} onChange={(v) => patch((g) => ({ ...g, moderator: { ...g.moderator, textHex: v } }))} />
          <HexField label="Primary button hex" value={mod.buttonHex} onChange={(v) => patch((g) => ({ ...g, moderator: { ...g.moderator, buttonHex: v } }))} />
          <HexField label="Primary button text hex" value={mod.buttonTextHex} onChange={(v) => patch((g) => ({ ...g, moderator: { ...g.moderator, buttonTextHex: v } }))} />
          <HexField label="Secondary button hex" value={mod.buttonDangerHex} onChange={(v) => patch((g) => ({ ...g, moderator: { ...g.moderator, buttonDangerHex: v } }))} />
          <HexField label="Secondary button text hex" value={mod.buttonDangerTextHex} onChange={(v) => patch((g) => ({ ...g, moderator: { ...g.moderator, buttonDangerTextHex: v } }))} />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Live preview</h3>
        <p className="muted">Updates the iframe with your current settings (not saved to server until you Save).</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" onClick={() => pushPreview()}>
            Refresh preview
          </button>
          <button type="button" className="btn" onClick={() => window.open(liveUrl(game.slug), "_blank")}>
            Open live board
          </button>
          <button type="button" className="btn" onClick={() => window.open(moderateUrl(game.slug), "_blank")}>
            Open moderator view
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title="Leaderboard preview"
          src={`/play/leaderboard-board.html?preview=1&slug=${encodeURIComponent(game.slug)}`}
          onLoad={() => pushPreview()}
          style={{
            width: "100%",
            height: "min(420px, 52vh)",
            border: "1px solid var(--rn-border)",
            borderRadius: 8,
            background: b.backgroundHex || "#0f1a24",
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
