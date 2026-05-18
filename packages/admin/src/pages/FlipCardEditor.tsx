import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { apiGet, apiSend, apiDelete, uploadFile } from "../api";

type FlipCardFace = {
  frontImage: string;
  /** Canonical card back art URL (preferred over legacy `backImage`). */
  rearImage?: string;
  backImage?: string;
  header: string;
  body: string;
  overlayButtonText: string;
  soundUrl?: string;
};

function cardRearUrl(c: Pick<FlipCardFace, "rearImage" | "backImage">) {
  return (c.rearImage || c.backImage || "").trim();
}

function normalizeFlipGameForPut(g: FlipCardGame): FlipCardGame {
  const cards = g.cards.map((c, i) => {
    const rear = cardRearUrl(c);
    return {
      ...c,
      frontImage: (c.frontImage || "").trim(),
      rearImage: rear,
      backImage: rear,
      header: c.header || `Card ${i + 1}`,
      body: c.body || "",
      overlayButtonText: c.overlayButtonText || "Back",
      soundUrl: c.soundUrl || "",
    };
  });
  const sharedRear = (g.sharedRearImage || g.sharedBackImage || "").trim();
  return { ...g, cards, sharedRearImage: sharedRear, sharedBackImage: sharedRear };
}

function mergeFlipCardsMedia(sent: FlipCardGame, saved: FlipCardGame): FlipCardGame {
  const cards = saved.cards.map((c, i) => {
    const rear = cardRearUrl(c) || cardRearUrl(sent.cards[i] || {});
    return { ...c, rearImage: rear, backImage: rear };
  });
  const sharedRear = (
    saved.sharedRearImage ||
    saved.sharedBackImage ||
    sent.sharedRearImage ||
    sent.sharedBackImage ||
    ""
  ).trim();
  return { ...saved, cards, sharedRearImage: sharedRear, sharedBackImage: sharedRear };
}

type FlipShuffle = {
  enabled: boolean;
  showMuteButton: boolean;
  showFullscreenButton: boolean;
  label: string;
  buttonBg: string;
  textColor: string;
  textSizePx: number;
  buttonFontSizePx: number;
};

type FlipCardGame = {
  id: string;
  gameType: "flip-cards";
  title: string;
  clientName: string;
  slug: string;
  updatedAt: string;
  reportingEnabled: boolean;
  reportingLockedAt?: string | null;
  thumbnailUrl?: string;
  faviconUrl?: string;
  showPoweredBy?: boolean;
  selectionHeading: string;
  deckSize: number;
  cardsDealt: number;
  maxColumns: number;
  brandLogoCorner: "tl" | "tr" | "bl" | "br";
  sharedFrontImage: string;
  sharedBackImage: string;
  sharedRearImage?: string;
  backgroundImage: string;
  backgroundColor: string;
  brandLogoUrl: string;
  sounds: { music?: string | null; musicVolume?: number };
  fonts: { heading?: string; body?: string; button?: string };
  shuffle: FlipShuffle;
  cards: FlipCardFace[];
};

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

/** Public payload for player / preview (matches `public-wheel` flip-cards branch). */
function publicFlipPayload(g: FlipCardGame) {
  const n = Math.min(15, Math.max(1, Number(g.deckSize) || 7));
  const dealt = Math.min(Math.max(1, Number(g.cardsDealt) || 1), n);
  const maxCol = Math.min(6, Math.max(1, Number(g.maxColumns) || 4));
  const src = Array.isArray(g.cards) ? g.cards : [];
  const cards = Array.from({ length: n }, (_, i) => {
    const c = src[i] || {};
    const rear = cardRearUrl(c);
    return {
      frontImage: c.frontImage || "",
      rearImage: rear,
      backImage: rear,
      header: c.header || `Card ${i + 1}`,
      body: c.body || "",
      overlayButtonText: c.overlayButtonText || "Back",
      soundUrl: c.soundUrl || "",
    };
  });
  return {
    gameType: "flip-cards" as const,
    id: g.id,
    title: g.title,
    slug: g.slug,
    faviconUrl: g.faviconUrl || "",
    showPoweredBy: g.showPoweredBy !== false,
    selectionHeading: g.selectionHeading || "",
    deckSize: n,
    cardsDealt: dealt,
    maxColumns: maxCol,
    brandLogoCorner: g.brandLogoCorner || "bl",
    sharedFrontImage: (g.sharedFrontImage || "").trim(),
    sharedBackImage: (g.sharedRearImage || g.sharedBackImage || "").trim(),
    sharedRearImage: (g.sharedRearImage || g.sharedBackImage || "").trim(),
    backgroundImage: g.backgroundImage || "",
    backgroundColor: g.backgroundColor || "#ffffff",
    brandLogoUrl: g.brandLogoUrl || "",
    sounds: {
      music: g.sounds?.music || null,
      musicVolume: typeof g.sounds?.musicVolume === "number" ? g.sounds.musicVolume : 0.35,
    },
    fonts: {
      heading: g.fonts?.heading || "",
      body: g.fonts?.body || "",
      button: g.fonts?.button || "",
    },
    shuffle: {
      enabled: g.shuffle?.enabled !== false,
      showMuteButton: g.shuffle?.showMuteButton !== false,
      showFullscreenButton: g.shuffle?.showFullscreenButton !== false,
      label: g.shuffle?.label || "Shuffle",
      buttonBg: g.shuffle?.buttonBg || "rgba(255,255,255,0.15)",
      textColor: g.shuffle?.textColor || "#ffffff",
      textSizePx: Number(g.shuffle?.textSizePx) || 16,
      buttonFontSizePx: Number(g.shuffle?.buttonFontSizePx) || 15,
    },
    cards,
    reportingEnabled: g.reportingEnabled,
  };
}

function resizeCards(prev: FlipCardFace[], n: number): FlipCardFace[] {
  const out = prev.slice(0, n);
  while (out.length < n) {
    const i = out.length;
    out.push({
      frontImage: "",
      rearImage: "",
      backImage: "",
      header: `Card ${i + 1}`,
      body: "",
      overlayButtonText: "Back",
      soundUrl: "",
    });
  }
  return out;
}

export default function FlipCardEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<FlipCardGame | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** Latest game for uploads — avoids stale closures when many card images are saved in a row. */
  const gameRef = useRef<FlipCardGame | null>(null);
  const saveQueueRef = useRef(Promise.resolve());

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = await apiGet(`/api/wheels?id=${encodeURIComponent(id)}`);
      if (data.gameType === "pinboard") {
        navigate(`/pinboards/${id}`, { replace: true });
        return;
      }
      if (data.gameType !== "flip-cards") {
        navigate(`/wheels/${id}`, { replace: true });
        return;
      }
      const loaded = data as FlipCardGame;
      gameRef.current = loaded;
      setGame(loaded);
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
      { type: "rngames-flip-cards-config", config: publicFlipPayload(game) },
      window.location.origin,
    );
  }, [game]);

  useEffect(() => {
    if (!game) return;
    const t = window.setTimeout(() => pushPreview(), 80);
    return () => window.clearTimeout(t);
  }, [game, pushPreview]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const saveGame = useCallback(async (payloadIn: FlipCardGame) => {
    setSaving(true);
    setErr(null);
    const payload = normalizeFlipGameForPut(payloadIn);
    try {
      const res = await apiSend("/api/wheels", "PUT", payload);
      if (res?.wheel) {
        const saved = mergeFlipCardsMedia(payload, res.wheel as FlipCardGame);
        gameRef.current = saved;
        setGame(saved);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, []);

  /** Queue PUTs so rapid per-card uploads do not overwrite each other on the server. */
  const persistGame = useCallback(
    (next: FlipCardGame) => {
      gameRef.current = next;
      setGame(next);
      saveQueueRef.current = saveQueueRef.current.then(() => saveGame(next)).catch(() => undefined);
      return saveQueueRef.current;
    },
    [saveGame],
  );

  const patchGame = useCallback(
    (mutator: (g: FlipCardGame) => FlipCardGame, opts?: { persist?: boolean }) => {
      const prev = gameRef.current;
      if (!prev) return Promise.resolve();
      const next = mutator(prev);
      if (opts?.persist === false) {
        gameRef.current = next;
        setGame(next);
        return Promise.resolve();
      }
      return persistGame(next);
    },
    [persistGame],
  );

  async function save() {
    const g = gameRef.current;
    if (!g) return;
    await saveQueueRef.current;
    await saveGame(g);
  }

  async function deleteGame() {
    if (!game) return;
    const ok = window.confirm(
      "Delete this flip card game and its public URL?\n\nThis cannot be undone.\n\nClick OK to delete, or Cancel to keep it.",
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
    const appEl = iframe?.contentDocument?.getElementById("app");
    if (!appEl) return;
    try {
      const canvas = await html2canvas(appEl as HTMLElement, {
        useCORS: true,
        allowTaint: false,
        logging: false,
        scale: 2,
        backgroundColor: game.backgroundColor || "#9f2527",
      });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
      if (!blob) return;
      const file = new File([blob], `thumb-${game.id}.jpg`, { type: "image/jpeg" });
      const { url } = await uploadFile(file);
      const base = gameRef.current ?? game;
      const payload = normalizeFlipGameForPut({ ...base, thumbnailUrl: url });
      const res = await apiSend("/api/wheels", "PUT", payload);
      if (res?.wheel) {
        const saved = mergeFlipCardsMedia(payload, res.wheel as FlipCardGame);
        gameRef.current = saved;
        setGame(saved);
      }
    } catch {
      /* optional */
    }
  }

  async function downloadPdf() {
    if (!iframeRef.current?.contentDocument || !game) return;
    pushPreview();
    await new Promise((r) => setTimeout(r, 200));
    const appEl = iframeRef.current.contentDocument.getElementById("app");
    if (!appEl) return;
    try {
      const canvas = await html2canvas(appEl as HTMLElement, {
        useCORS: true,
        allowTaint: false,
        logging: false,
        scale: 2,
        backgroundColor: game.backgroundColor || "#9f2527",
      });
      const img = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
      pdf.addImage(img, "JPEG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
      pdf.save(`${game.slug || "flip-cards"}-preview.pdf`);
    } catch {
      /* ignore */
    }
  }

  function setDeckSize(n: number) {
    if (!game) return;
    const deckSize = Math.min(15, Math.max(1, n));
    setGame({
      ...game,
      deckSize,
      cardsDealt: Math.min(game.cardsDealt, deckSize),
      cards: resizeCards(game.cards, deckSize),
    });
  }

  if (!game) {
    return err ? <p className="muted">{err}</p> : <p className="muted">Loading…</p>;
  }

  const embedCode = `<iframe src="${siteUrl}/play/flip-cards.html?slug=${encodeURIComponent(game.slug)}" title="${(game.title || "Flip cards").replace(/"/g, "&quot;")}" style="border:0;width:100%;height:min(92dvh,720px);display:block;" loading="lazy"></iframe>`;

  const n = game.deckSize;

  return (
    <div>
      <p>
        <Link to="/">← Studio</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>Edit flip cards</h2>
      {err && (
        <p style={{ color: "var(--rn-warn, #e8a838)", marginBottom: 12, maxWidth: "52rem" }}>{err}</p>
      )}

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
          Enable reporting
        </label>
        <p className="muted" style={{ marginTop: 8 }}>
          Public URL: <code>{`${siteUrl}/${game.slug}`}</code>
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
            void patchGame((g) => ({ ...g, faviconUrl: url }));
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
        <h3 style={{ marginTop: 0 }}>Cards</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
          Deck size (max 15). “Cards dealt” is how many random cards appear each session. Max columns controls the grid on
          wide screens (responsive caps apply on smaller viewports).
        </p>
        <div className="grid2">
          <div>
            <label className="field">Cards in deck</label>
            <input
              type="number"
              min={1}
              max={15}
              value={game.deckSize}
              onChange={(e) => setDeckSize(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="field">Cards dealt per session</label>
            <input
              type="number"
              min={1}
              max={n}
              value={game.cardsDealt}
              onChange={(e) =>
                setGame({
                  ...game,
                  cardsDealt: Math.min(n, Math.max(1, Number(e.target.value) || 1)),
                })
              }
            />
          </div>
          <div>
            <label className="field">Max columns (full width)</label>
            <input
              type="number"
              min={1}
              max={6}
              value={game.maxColumns}
              onChange={(e) =>
                setGame({
                  ...game,
                  maxColumns: Math.min(6, Math.max(1, Number(e.target.value) || 4)),
                })
              }
            />
          </div>
        </div>

        <label className="field" style={{ marginTop: 12 }}>
          Selection screen heading
        </label>
        <input
          type="text"
          value={game.selectionHeading}
          onChange={(e) => setGame({ ...game, selectionHeading: e.target.value })}
        />

        <label className="field" style={{ marginTop: 12 }}>
          Brand logo corner (public page)
        </label>
        <select
          value={game.brandLogoCorner}
          onChange={(e) =>
            setGame({
              ...game,
              brandLogoCorner: e.target.value as FlipCardGame["brandLogoCorner"],
            })
          }
        >
          <option value="tl">Top left</option>
          <option value="tr">Top right</option>
          <option value="bl">Bottom left</option>
          <option value="br">Bottom right</option>
        </select>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={game.shuffle?.enabled !== false}
            onChange={(e) =>
              setGame({
                ...game,
                shuffle: { ...game.shuffle, enabled: e.target.checked },
              })
            }
          />
          Show shuffle button (re-deals random cards)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <input
            type="checkbox"
            checked={game.shuffle?.showMuteButton !== false}
            onChange={(e) =>
              setGame({
                ...game,
                shuffle: { ...game.shuffle, showMuteButton: e.target.checked },
              })
            }
          />
          Show mute button (next to shuffle — uses shuffle colours & button font)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <input
            type="checkbox"
            checked={game.shuffle?.showFullscreenButton !== false}
            onChange={(e) =>
              setGame({
                ...game,
                shuffle: { ...game.shuffle, showFullscreenButton: e.target.checked },
              })
            }
          />
          Show fullscreen button (icon only — same style as mute)
        </label>

        {(() => {
          const missing = game.cards.slice(0, n).filter((c) => !cardRearUrl(c)).length;
          if (missing === 0) return null;
          return (
            <p className="muted" style={{ marginTop: 12, color: "var(--rn-warn, #e8a838)" }}>
              {missing} card{missing === 1 ? "" : "s"} missing a back image on the server — upload each
              back below (thumbnails appear when saved). Shared front alone does not fill card backs.
            </p>
          );
        })()}

        <label className="field" style={{ marginTop: 16 }}>
          Shared front image (optional — used when a card’s front is empty)
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            void patchGame((g) => ({ ...g, sharedFrontImage: url }));
          }}
        />
        {game.sharedFrontImage ? <span className="muted"> ✓</span> : null}

        <label className="field" style={{ marginTop: 12 }}>
          Shared back image (optional — used when a card’s back is empty)
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            void patchGame((g) => ({ ...g, sharedRearImage: url, sharedBackImage: url }));
          }}
        />
        {game.sharedBackImage ? <span className="muted"> ✓</span> : null}

        {game.cards.slice(0, n).map((card, i) => (
          <div key={i} style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--rn-border, #333)" }}>
            <h4 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Card {i + 1}</h4>
            <div className="grid2">
              <div>
                <label className="field">Front image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const { url } = await uploadFile(f);
                    void patchGame((g) => {
                      const cards = [...g.cards];
                      cards[i] = { ...cards[i], frontImage: url };
                      return { ...g, cards };
                    });
                  }}
                />
                {card.frontImage ? (
                  <img
                    src={card.frontImage}
                    alt=""
                    style={{ display: "block", maxWidth: 120, marginTop: 8, borderRadius: 4 }}
                  />
                ) : null}
              </div>
              <div>
                <label className="field">Back image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      setErr(null);
                      const { url } = await uploadFile(f);
                      void patchGame((g) => {
                        const cards = [...g.cards];
                        cards[i] = { ...cards[i], rearImage: url, backImage: url };
                        return { ...g, cards };
                      });
                      e.target.value = "";
                    } catch (uploadErr) {
                      setErr(uploadErr instanceof Error ? uploadErr.message : "Back image upload failed");
                    }
                  }}
                />
                {cardRearUrl(card) ? (
                  <>
                    <img
                      src={cardRearUrl(card)}
                      alt=""
                      style={{ display: "block", maxWidth: 120, marginTop: 8, borderRadius: 4 }}
                    />
                    <button
                    type="button"
                    className="btn btn-small"
                    style={{ marginTop: 6 }}
                    onClick={() => {
                      const url = cardRearUrl(card);
                      void patchGame((g) => ({
                        ...g,
                        cards: g.cards.map((c) => ({ ...c, rearImage: url, backImage: url })),
                      }));
                    }}
                  >
                    Apply this back to all cards
                  </button>
                  </>
                ) : null}
              </div>
            </div>
            <label className="field">Header</label>
            <input
              type="text"
              value={card.header}
              onChange={(e) => {
                patchGame(
                  (g) => {
                    const cards = [...g.cards];
                    cards[i] = { ...cards[i], header: e.target.value };
                    return { ...g, cards };
                  },
                  { persist: false },
                );
              }}
            />
            <label className="field">Body copy</label>
            <textarea
              rows={3}
              value={card.body}
              onChange={(e) => {
                patchGame(
                  (g) => {
                    const cards = [...g.cards];
                    cards[i] = { ...cards[i], body: e.target.value };
                    return { ...g, cards };
                  },
                  { persist: false },
                );
              }}
            />
            <label className="field">Overlay button text (detail view)</label>
            <input
              type="text"
              value={card.overlayButtonText}
              onChange={(e) => {
                patchGame(
                  (g) => {
                    const cards = [...g.cards];
                    cards[i] = { ...cards[i], overlayButtonText: e.target.value };
                    return { ...g, cards };
                  },
                  { persist: false },
                );
              }}
            />
            <label className="field">Sound (optional)</label>
            <input
              type="file"
              accept="audio/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const { url } = await uploadFile(f);
                void patchGame((g) => {
                  const cards = [...g.cards];
                  cards[i] = { ...cards[i], soundUrl: url };
                  return { ...g, cards };
                });
              }}
            />
            {card.soundUrl ? <span className="muted"> ✓</span> : null}
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>General assets</h3>
        <label className="field">Background colour (hex)</label>
        <input
          type="text"
          value={game.backgroundColor}
          onChange={(e) => setGame({ ...game, backgroundColor: e.target.value })}
        />
        <label className="field" style={{ marginTop: 12 }}>
          Background image (scale to fill)
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            void patchGame((g) => ({ ...g, backgroundImage: url }));
          }}
        />
        {game.backgroundImage ? <span className="muted"> ✓</span> : null}

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
            void patchGame((g) => ({ ...g, brandLogoUrl: url }));
          }}
        />
        {game.brandLogoUrl ? <span className="muted"> ✓</span> : null}

        <label className="field" style={{ marginTop: 12 }}>
          Background music (loops; plays alongside card sounds)
        </label>
        <input
          type="file"
          accept="audio/*"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            void patchGame((g) => ({ ...g, sounds: { ...g.sounds, music: url } }));
          }}
        />
        {game.sounds?.music ? <span className="muted"> ✓</span> : null}
        <label className="field" style={{ marginTop: 8 }}>
          Music volume (0–1)
        </label>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={game.sounds?.musicVolume ?? 0.35}
          onChange={(e) =>
            setGame({
              ...game,
              sounds: { ...game.sounds, musicVolume: Number(e.target.value) },
            })
          }
        />

        <label className="field" style={{ marginTop: 12 }}>
          Heading font (woff2 / ttf)
        </label>
        <input
          type="file"
          accept=".woff2,.woff,.ttf,font/woff2,font/woff,font/ttf"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            void patchGame((g) => ({ ...g, fonts: { ...g.fonts, heading: url } }));
          }}
        />
        <label className="field" style={{ marginTop: 12 }}>
          Body font
        </label>
        <input
          type="file"
          accept=".woff2,.woff,.ttf,font/woff2,font/woff,font/ttf"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            void patchGame((g) => ({ ...g, fonts: { ...g.fonts, body: url } }));
          }}
        />
        <label className="field" style={{ marginTop: 12 }}>
          Button font (shuffle + overlay buttons)
        </label>
        <input
          type="file"
          accept=".woff2,.woff,.ttf,font/woff2,font/woff,font/ttf"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            void patchGame((g) => ({ ...g, fonts: { ...g.fonts, button: url } }));
          }}
        />

        <h4 style={{ margin: "20px 0 8px", fontSize: "1rem" }}>Shuffle button</h4>
        <div className="grid2">
          <div>
            <label className="field">Button label</label>
            <input
              type="text"
              value={game.shuffle?.label || ""}
              onChange={(e) =>
                setGame({
                  ...game,
                  shuffle: { ...game.shuffle, label: e.target.value },
                })
              }
            />
          </div>
          <div>
            <label className="field">Button background (CSS colour)</label>
            <input
              type="text"
              value={game.shuffle?.buttonBg || ""}
              onChange={(e) =>
                setGame({
                  ...game,
                  shuffle: { ...game.shuffle, buttonBg: e.target.value },
                })
              }
            />
          </div>
          <div>
            <label className="field">Text colour</label>
            <input
              type="text"
              value={game.shuffle?.textColor || ""}
              onChange={(e) =>
                setGame({
                  ...game,
                  shuffle: { ...game.shuffle, textColor: e.target.value },
                })
              }
            />
          </div>
          <div>
            <label className="field">Label / text size (px)</label>
            <input
              type="number"
              min={10}
              max={48}
              value={game.shuffle?.textSizePx ?? 16}
              onChange={(e) =>
                setGame({
                  ...game,
                  shuffle: { ...game.shuffle, textSizePx: Number(e.target.value) },
                })
              }
            />
          </div>
          <div>
            <label className="field">Button font size (px)</label>
            <input
              type="number"
              min={10}
              max={48}
              value={game.shuffle?.buttonFontSizePx ?? 15}
              onChange={(e) =>
                setGame({
                  ...game,
                  shuffle: { ...game.shuffle, buttonFontSizePx: Number(e.target.value) },
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Live preview</h3>
        <p className="muted">
          Preview updates as you edit. Image uploads save to the server automatically; use Save for copy,
          layout, and colours.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" onClick={() => pushPreview()}>
            Refresh preview
          </button>
          <button type="button" className="btn" onClick={() => void downloadPdf()}>
            Download PDF
          </button>
          <button type="button" className="btn" onClick={() => window.open(`${siteUrl}/${game.slug}`, "_blank")}>
            Open public flip cards
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title="Flip cards preview"
          src="/play/flip-cards.html?preview=1"
          onLoad={() => pushPreview()}
          style={{
            width: "100%",
            height: "min(520px, 70vh)",
            minHeight: 280,
            border: "1px solid var(--rn-border)",
            borderRadius: 8,
            background: game.backgroundColor || "#ffffff",
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

      <p className="muted" style={{ marginTop: 24, fontSize: "0.85rem" }}>
        <strong>Not in v1 (flagged for later):</strong> per-game reporting tab / Sheets for flip sessions, ZIP template
        downloads, and embed-only “chromeless” variant. Wheel-style prize schema locking when reporting is on does not
        apply to flip cards yet.
      </p>
    </div>
  );
}
