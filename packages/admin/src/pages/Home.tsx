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

function GamesTable({
  items,
  editPath,
  copyLabel = "Copy public URL",
}: {
  items: Item[];
  editPath: (w: Item) => string;
  copyLabel?: string;
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
                <img className="thumb" src={w.thumbnailUrl} alt="" />
              ) : (
                <div className="thumb" />
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
              <button
                type="button"
                className="btn"
                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                onClick={() => copy(`${siteUrl}/${w.slug}`)}
              >
                {copyLabel}
              </button>
              {w.reportingEnabled && (
                <button
                  type="button"
                  className="btn"
                  style={{ padding: "6px 12px", fontSize: "0.8rem", marginLeft: 8 }}
                  onClick={() => copy(`${siteUrl}/${w.slug}_Report`)}
                >
                  Copy report URL
                </button>
              )}
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

  const spinningWheels = wheels.filter(isSpinningWheel);
  const scratchers = wheels.filter(isScratcher);
  const quizGames = wheels.filter(isQuiz);

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
              <GamesTable items={spinningWheels} editPath={(w) => `/wheels/${w.id}`} copyLabel="Copy public URL" />
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
              <GamesTable items={scratchers} editPath={(w) => `/scratchers/${w.id}`} copyLabel="Copy public URL" />
            )}
          </section>

          <section>
            <SectionHeader
              title="Your quizzes"
              newLabel="New quiz (soon)"
              onNew={() => undefined}
              newDisabled
              resourceHref={placeholderZip}
              resourceLabel="Download quiz templates (ZIP)"
            />
            {quizGames.length === 0 ? (
              <div className="card">
                <p style={{ margin: "0 0 12px" }}>No quizzes yet.</p>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  Placeholder:{" "}
                  <Link to="/quiz">Open quiz shell</Link>.
                </p>
              </div>
            ) : (
              <GamesTable items={quizGames} editPath={() => "/quiz"} copyLabel="Copy public URL" />
            )}
          </section>
        </>
      )}
    </div>
  );
}
