import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../api";

type Item = {
  id: string;
  gameType?: string;
  slug: string;
  title: string;
  clientName: string;
  updatedAt: string;
  reportingEnabled: boolean;
  thumbnailUrl?: string;
};

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");

function isSpinningWheel(w: Item) {
  return w.gameType === "spinning-wheel" || w.gameType === undefined || w.gameType === "";
}

function isScratcher(w: Item) {
  return w.gameType === "scratcher";
}

function isQuiz(w: Item) {
  return w.gameType === "quiz";
}

function isFlipCards(w: Item) {
  return w.gameType === "flip-cards";
}

function isPinboard(w: Item) {
  return w.gameType === "pinboard";
}

function isLeaderboard(w: Item) {
  return w.gameType === "leaderboard";
}

function isCatch(w: Item) {
  return w.gameType === "catch";
}

function isRunner(w: Item) {
  return w.gameType === "runner";
}

function editorPath(w: Item) {
  if (isQuiz(w)) return `/quizzes/${w.id}`;
  if (isScratcher(w)) return `/scratchers/${w.id}`;
  if (isFlipCards(w)) return `/flip-cards/${w.id}`;
  if (isPinboard(w)) return `/pinboards/${w.id}`;
  if (isLeaderboard(w)) return `/leaderboards/${w.id}`;
  if (isCatch(w)) return `/catch/${w.id}`;
  if (isRunner(w)) return `/runner/${w.id}`;
  return `/wheels/${w.id}`;
}

function GamesTable({
  items,
  editPath,
  copyLabel = "Copy public URL",
  getPublicUrl,
  onDuplicate,
}: {
  items: Item[];
  editPath: (w: Item) => string;
  copyLabel?: string;
  getPublicUrl?: (w: Item) => string;
  onDuplicate?: (w: Item) => void | Promise<void>;
}) {
  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th></th>
          <th>Title</th>
          <th>Client</th>
          <th>Updated</th>
          <th>Links</th>
        </tr>
      </thead>
      <tbody>
        {items.map((w) => (
          <tr key={w.id}>
            <td>
              {w.thumbnailUrl ? (
                <img className={`thumb ${isScratcher(w) ? "thumb--contain" : ""}`} src={w.thumbnailUrl} alt="" />
              ) : (
                <div className={`thumb ${isScratcher(w) ? "thumb--contain" : ""}`} />
              )}
            </td>
            <td>
              <Link to={editPath(w)}>{w.title || "Untitled"}</Link>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                /{w.slug}
              </div>
            </td>
            <td>{w.clientName || "—"}</td>
            <td className="muted">{new Date(w.updatedAt).toLocaleString()}</td>
            <td>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                  onClick={() => copy(getPublicUrl ? getPublicUrl(w) : `${siteUrl}/${w.slug}`)}
                >
                  {copyLabel}
                </button>
                {w.reportingEnabled && (
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                    onClick={() => copy(`${siteUrl}/${w.slug}_Report`)}
                  >
                    Copy report URL
                  </button>
                )}
                {onDuplicate ? (
                  <button
                    type="button"
                    className="btn"
                    title="Duplicate game"
                    aria-label={`Duplicate ${w.title || "game"}`}
                    style={{ padding: "6px 10px", fontSize: "0.85rem", lineHeight: 1 }}
                    onClick={() => void onDuplicate(w)}
                  >
                    ⧉
                  </button>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SectionHeader({
  title,
  onNew,
  newLabel,
  resourceHref,
  resourceLabel,
  newDisabled,
}: {
  title: string;
  onNew: () => void | Promise<void>;
  newLabel: string;
  resourceHref: string;
  resourceLabel: string;
  newDisabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 12,
      }}
    >
      <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{title}</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {resourceHref === "#" ? (
          <span className="btn" style={{ fontSize: "0.85rem", opacity: 0.65, cursor: "not-allowed" }} title="Link when ZIP is ready">
            {resourceLabel}
          </span>
        ) : (
          <a href={resourceHref} className="btn" style={{ fontSize: "0.85rem" }} download target="_blank" rel="noreferrer">
            {resourceLabel}
          </a>
        )}
        <button
          type="button"
          className="btn btn-primary"
          style={{ fontSize: "0.85rem" }}
          disabled={newDisabled}
          onClick={() => void onNew()}
        >
          {newLabel}
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [wheels, setWheels] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiGet("/api/wheels");
      setWheels(data.wheels || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createWheel() {
    const slug = `wheel-${Date.now().toString(36)}`;
    try {
      const res = await apiSend("/api/wheels", "POST", { slug, title: "New wheel", clientName: "" });
      await load();
      if (res?.wheel?.id) {
        window.location.href = `/admin/wheels/${res.wheel.id}`;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function createFlipCards() {
    const slug = `flip-${Date.now().toString(36)}`;
    try {
      const res = await apiSend("/api/wheels", "POST", {
        gameType: "flip-cards",
        slug,
        title: "New flip cards",
        clientName: "",
      });
      await load();
      if (res?.wheel?.id) {
        window.location.href = `/admin/flip-cards/${res.wheel.id}`;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function createScratcher() {
    const slug = `scratch-${Date.now().toString(36)}`;
    try {
      const res = await apiSend("/api/wheels", "POST", {
        gameType: "scratcher",
        slug,
        title: "New scratcher",
        clientName: "",
      });
      await load();
      if (res?.wheel?.id) {
        window.location.href = `/admin/scratchers/${res.wheel.id}`;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function createPinboard() {
    const slug = `pinboard-${Date.now().toString(36)}`;
    try {
      const res = await apiSend("/api/wheels", "POST", {
        gameType: "pinboard",
        slug,
        title: "New pin board",
        clientName: "",
      });
      await load();
      if (res?.wheel?.id) {
        window.location.href = `/admin/pinboards/${res.wheel.id}`;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function createLeaderboard() {
    const slug = `leaderboard-${Date.now().toString(36)}`;
    try {
      const res = await apiSend("/api/wheels", "POST", {
        gameType: "leaderboard",
        slug,
        title: "New leaderboard",
        clientName: "",
      });
      await load();
      if (res?.wheel?.id) {
        window.location.href = `/admin/leaderboards/${res.wheel.id}`;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function createCatch() {
    const slug = `catch-${Date.now().toString(36)}`;
    try {
      const res = await apiSend("/api/wheels", "POST", {
        gameType: "catch",
        slug,
        title: "New catch game",
        clientName: "",
      });
      await load();
      if (res?.wheel?.id) {
        window.location.href = `/admin/catch/${res.wheel.id}`;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function createRunner() {
    const slug = `runner-${Date.now().toString(36)}`;
    try {
      const res = await apiSend("/api/wheels", "POST", {
        gameType: "runner",
        slug,
        title: "New runner game",
        clientName: "",
      });
      await load();
      if (res?.wheel?.id) {
        window.location.href = `/admin/runner/${res.wheel.id}`;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function createQuiz() {
    setErr(null);
    try {
      const slug = `quiz-${Math.random().toString(16).slice(2, 8)}`;
      const res = await apiSend("/api/wheels", "POST", {
        gameType: "quiz",
        slug,
        title: "New quiz",
        clientName: "",
      });
      await load();
      if (res?.wheel?.id) {
        window.location.href = `/admin/quizzes/${res.wheel.id}`;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function duplicateGame(w: Item) {
    setErr(null);
    try {
      const full = await apiGet(`/api/wheels?id=${encodeURIComponent(w.id)}`);
      const baseSlug = String(full.slug || "game")
        .replace(/-copy\d*$/i, "")
        .toLowerCase();
      const baseTitle = String(full.title || "Untitled").replace(/\s*\(copy\)\d*$/i, "").trim();
      let n = 0;
      for (;;) {
        const suffix = n === 0 ? "-copy" : `-copy${n + 1}`;
        const titleSuffix = n === 0 ? " (copy)" : ` (copy ${n + 1})`;
        try {
          const res = await apiSend("/api/wheels", "POST", {
            sourceId: w.id,
            title: `${baseTitle}${titleSuffix}`,
            slug: `${baseSlug}${suffix}`,
            clientName: full.clientName || "",
          });
          await load();
          if (res?.wheel?.id) {
            window.location.href = `/admin${editorPath(res.wheel as Item)}`;
          }
          return;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (!msg.toLowerCase().includes("slug") || n > 15) throw e;
          n += 1;
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Duplicate failed");
    }
  }

  const spinningWheels = wheels.filter(isSpinningWheel);
  const scratchers = wheels.filter(isScratcher);
  const quizGames = wheels.filter(isQuiz);
  const flipCardGames = wheels.filter(isFlipCards);
  const pinboardGames = wheels.filter(isPinboard);
  const leaderboardGames = wheels.filter(isLeaderboard);
  const catchGames = wheels.filter(isCatch);
  const runnerGames = wheels.filter(isRunner);

  const placeholderZip = "#";

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 24px", fontSize: "0.9rem", maxWidth: 560, lineHeight: 1.5 }}>
        Games are grouped by type. Use design resource packs (ZIP) when you’re ready — links are placeholders until files
        are published.
      </p>

      {err && <p className="muted">{err}</p>}

      <section className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 6px", fontSize: "1.05rem" }}>Create a new game</h2>
        <p className="muted" style={{ margin: "0 0 16px", fontSize: "0.85rem", maxWidth: 520 }}>
          Start a campaign. Use the section shortcuts below for quick access when you already know the type.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button type="button" className="btn btn-primary" onClick={() => void createWheel()}>
            New spinning wheel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void createScratcher()}>
            New scratcher
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void createFlipCards()}>
            New flip cards
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void createQuiz()}>
            New quiz
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void createPinboard()}>
            New pin board
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void createLeaderboard()}>
            New leaderboard
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void createCatch()}>
            New catch game
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void createRunner()}>
            New runner game
          </button>
        </div>
      </section>

      {loading ? (
        <p className="muted">Loading your games…</p>
      ) : (
        <>
          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              title="Your spinning wheels"
              newLabel="New spinning wheel"
              onNew={createWheel}
              resourceHref={placeholderZip}
              resourceLabel="Download wheel templates (ZIP)"
            />
            {spinningWheels.length === 0 ? (
              <div className="card">
                <p style={{ margin: 0 }}>No spinning wheels yet.</p>
              </div>
            ) : (
              <GamesTable
                items={spinningWheels}
                editPath={(w) => `/wheels/${w.id}`}
                copyLabel="Copy public URL"
                onDuplicate={duplicateGame}
              />
            )}
          </section>

          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              title="Your scratchers"
              newLabel="New scratcher"
              onNew={createScratcher}
              resourceHref={placeholderZip}
              resourceLabel="Download scratcher templates (ZIP)"
            />
            {scratchers.length === 0 ? (
              <div className="card">
                <p style={{ margin: 0 }}>No scratchers yet.</p>
              </div>
            ) : (
              <GamesTable
                items={scratchers}
                editPath={(w) => `/scratchers/${w.id}`}
                copyLabel="Copy public URL"
                onDuplicate={duplicateGame}
              />
            )}
          </section>

          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              title="Your flip cards"
              newLabel="New flip cards"
              onNew={createFlipCards}
              resourceHref={placeholderZip}
              resourceLabel="Download flip card templates (ZIP)"
            />
            {flipCardGames.length === 0 ? (
              <div className="card">
                <p style={{ margin: 0 }}>No flip card games yet.</p>
              </div>
            ) : (
              <GamesTable
                items={flipCardGames}
                editPath={(w) => `/flip-cards/${w.id}`}
                copyLabel="Copy public URL"
                onDuplicate={duplicateGame}
              />
            )}
          </section>

          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              title="Your pin boards"
              newLabel="New pin board"
              onNew={createPinboard}
              resourceHref={placeholderZip}
              resourceLabel="Download pin board templates (ZIP)"
            />
            {pinboardGames.length === 0 ? (
              <div className="card">
                <p style={{ margin: 0 }}>No pin boards yet.</p>
              </div>
            ) : (
              <GamesTable
                items={pinboardGames}
                editPath={(w) => `/pinboards/${w.id}`}
                copyLabel="Copy board URL"
                getPublicUrl={(w) => `${siteUrl}/pinboard/${w.slug}`}
                onDuplicate={duplicateGame}
              />
            )}
          </section>

          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              title="Your leaderboards"
              newLabel="New leaderboard"
              onNew={createLeaderboard}
              resourceHref={placeholderZip}
              resourceLabel="Download leaderboard templates (ZIP)"
            />
            {leaderboardGames.length === 0 ? (
              <div className="card">
                <p style={{ margin: 0 }}>No leaderboards yet.</p>
              </div>
            ) : (
              <GamesTable
                items={leaderboardGames}
                editPath={(w) => `/leaderboards/${w.id}`}
                copyLabel="Copy live URL"
                getPublicUrl={(w) => `${siteUrl}/leaderboard/${w.slug}`}
                onDuplicate={duplicateGame}
              />
            )}
          </section>

          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              title="Your catch games"
              newLabel="New catch game"
              onNew={createCatch}
              resourceHref={placeholderZip}
              resourceLabel="Download catch templates (ZIP)"
            />
            {catchGames.length === 0 ? (
              <div className="card">
                <p style={{ margin: 0 }}>No catch games yet.</p>
              </div>
            ) : (
              <GamesTable
                items={catchGames}
                editPath={(w) => `/catch/${w.id}`}
                copyLabel="Copy public URL"
                getPublicUrl={(w) => `${siteUrl}/catch/${w.slug}`}
                onDuplicate={duplicateGame}
              />
            )}
          </section>

          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              title="Your runner games"
              newLabel="New runner game"
              onNew={createRunner}
              resourceHref={placeholderZip}
              resourceLabel="Download runner templates (ZIP)"
            />
            {runnerGames.length === 0 ? (
              <div className="card">
                <p style={{ margin: 0 }}>No runner games yet.</p>
              </div>
            ) : (
              <GamesTable
                items={runnerGames}
                editPath={(w) => `/runner/${w.id}`}
                copyLabel="Copy public URL"
                getPublicUrl={(w) => `${siteUrl}/runner/${w.slug}`}
                onDuplicate={duplicateGame}
              />
            )}
          </section>

          <section>
            <SectionHeader
              title="Your quizzes"
              newLabel="New quiz"
              onNew={createQuiz}
              resourceHref={placeholderZip}
              resourceLabel="Download quiz templates (ZIP)"
            />
            {quizGames.length === 0 ? (
              <div className="card">
                <p style={{ margin: 0 }}>No quizzes yet.</p>
              </div>
            ) : (
              <GamesTable
                items={quizGames}
                editPath={(w) => `/quizzes/${w.id}`}
                copyLabel="Copy host URL"
                onDuplicate={duplicateGame}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
