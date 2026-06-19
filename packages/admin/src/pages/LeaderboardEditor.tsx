import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

export default function LeaderboardEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<LeaderboardGame | null>(null);
  const [games, setGames] = useState<IndexItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
      setGame(data as LeaderboardGame);
      setGames((index.wheels || []).filter((w: IndexItem) => w.id !== id && w.gameType !== "leaderboard"));
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
    const t = window.setTimeout(pushPreview, 80);
    return () => window.clearTimeout(t);
  }, [game, pushPreview]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => pushPreview();
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [pushPreview]);

  async function save() {
    if (!game) return;
    setSaving(true);
    setErr(null);
    try {
      await apiSend("/api/wheels", "PUT", game);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!game || !confirm("Delete this leaderboard?")) return;
    await apiDelete(`/api/wheels?id=${encodeURIComponent(game.id)}`);
    navigate("/");
  }

  function patch(p: Partial<LeaderboardGame>) {
    setGame((g) => (g ? { ...g, ...p } : g));
  }

  function patchBoard(p: Partial<LeaderboardGame["board"]>) {
    setGame((g) => (g ? { ...g, board: { ...g.board, ...p } } : g));
  }

  function patchMod(p: Partial<LeaderboardGame["moderator"]>) {
    setGame((g) => (g ? { ...g, moderator: { ...g.moderator, ...p } } : g));
  }

  function linkGame(gameId: string) {
    const item = games.find((g) => g.id === gameId);
    patch({
      linkedGameId: gameId,
      linkedGameSlug: item?.slug || "",
      linkedGameTitle: item?.title || "",
      mode: "linked",
    });
  }

  if (!game) {
    return <p className="muted">{err || "Loading…"}</p>;
  }

  const b = game.board;

  return (
    <div>
      <p>
        <Link to="/">← All games</Link>
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(liveUrl(game.slug))}>
          Copy live URL
        </button>
        <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(moderateUrl(game.slug))}>
          Copy moderator URL
        </button>
        <button type="button" className="btn" onClick={() => void remove()}>
          Delete
        </button>
      </div>
      {err ? <p className="muted">{err}</p> : null}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Game info</h3>
        <label className="field">Title
          <input value={game.title} onChange={(e) => patch({ title: e.target.value })} />
        </label>
        <label className="field">Client
          <input value={game.clientName} onChange={(e) => patch({ clientName: e.target.value })} />
        </label>
        <label className="field">Slug
          <input value={game.slug} onChange={(e) => patch({ slug: e.target.value })} />
        </label>
        <label className="field">Moderator PIN
          <input
            value={game.moderatorPin}
            onChange={(e) => patch({ moderatorPin: e.target.value })}
            placeholder="Set a PIN for the moderator page"
          />
        </label>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Data source</h3>
        <p className="muted" style={{ fontSize: "0.9rem", maxWidth: "52rem" }}>
          <strong>Linked</strong> — scores arrive from a connected game (catch, dino, quiz handoff, etc.).
          <strong> Manual</strong> — facilitator adds and edits rows on the moderator page (in-person events).
          A game can still show its own <em>high score</em> (single best + short name) while also submitting to a linked leaderboard.
        </p>
        <label className="field">Mode
          <select
            value={game.mode}
            onChange={(e) => patch({ mode: e.target.value as "linked" | "manual" })}
          >
            <option value="manual">Manual</option>
            <option value="linked">Linked to a game</option>
          </select>
        </label>
        {game.mode === "linked" ? (
          <label className="field">Linked game
            <select value={game.linkedGameId} onChange={(e) => linkGame(e.target.value)}>
              <option value="">— Select —</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title} ({g.gameType || "spinning-wheel"}) — /{g.slug}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Live board branding</h3>
        <label className="field">Header
          <input value={b.header} onChange={(e) => patchBoard({ header: e.target.value })} />
        </label>
        <label className="field">Subhead
          <input value={b.subhead} onChange={(e) => patchBoard({ subhead: e.target.value })} />
        </label>
        <div className="grid2">
          <HexField label="Header hex" value={b.headerHex} onChange={(v) => patchBoard({ headerHex: v })} />
          <HexField label="Subhead hex" value={b.subheadHex} onChange={(v) => patchBoard({ subheadHex: v })} />
          <HexField label="Background hex" value={b.backgroundHex} onChange={(v) => patchBoard({ backgroundHex: v })} />
        </div>
        <label className="field" style={{ marginTop: 12 }}>Brand logo
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patchBoard({ brandLogoUrl: url });
            }}
          />
        </label>
        <label className="field">Logo corner
          <select
            value={b.brandLogoCorner}
            onChange={(e) => patchBoard({ brandLogoCorner: e.target.value as LeaderboardGame["board"]["brandLogoCorner"] })}
          >
            <option value="bl">Bottom left</option>
            <option value="br">Bottom right</option>
            <option value="tl">Top left</option>
            <option value="tr">Top right</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={game.showPoweredBy !== false}
            onChange={(e) => patch({ showPoweredBy: e.target.checked })}
          />
          Show “Powered by Real Nation”
        </label>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Moderator page</h3>
        <label className="field">Headline
          <input value={game.moderator.headline} onChange={(e) => patchMod({ headline: e.target.value })} />
        </label>
        <HexField label="Background hex" value={game.moderator.backgroundHex} onChange={(v) => patchMod({ backgroundHex: v })} />
        <HexField label="Text hex" value={game.moderator.textHex} onChange={(v) => patchMod({ textHex: v })} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Live preview</h3>
        <iframe
          ref={iframeRef}
          title="Leaderboard preview"
          src="/play/leaderboard-board.html?preview=1"
          style={{ width: "100%", height: 420, border: "1px solid var(--rn-border)", borderRadius: 8, background: "#0f1a24" }}
        />
      </div>
    </div>
  );
}
