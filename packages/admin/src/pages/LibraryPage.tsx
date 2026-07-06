import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiGet } from "../api";
import { GamesTable, SectionHeader, type LibraryItem } from "./homeShared";

const RECENT = 3;

const LIBRARY_TYPES: {
  gameType: string;
  title: string;
  newLabel: string;
  editPrefix: string;
  publicUrl?: (w: LibraryItem) => string;
  copyLabel?: string;
}[] = [
  { gameType: "spinning-wheel", title: "Spinning wheels", newLabel: "New wheel", editPrefix: "/wheels" },
  { gameType: "scratcher", title: "Scratchers", newLabel: "New scratcher", editPrefix: "/scratchers" },
  { gameType: "flip-cards", title: "Flip cards", newLabel: "New flip cards", editPrefix: "/flip-cards" },
  { gameType: "quiz", title: "Quizzes", newLabel: "New quiz", editPrefix: "/quizzes", copyLabel: "Copy host URL" },
  {
    gameType: "pinboard",
    title: "Pin boards",
    newLabel: "New pin board",
    editPrefix: "/pinboards",
    copyLabel: "Copy board URL",
    publicUrl: (w) => `${window.location.origin}/pinboard/${w.slug}`,
  },
  {
    gameType: "leaderboard",
    title: "Leaderboards",
    newLabel: "New leaderboard",
    editPrefix: "/leaderboards",
    copyLabel: "Copy live URL",
    publicUrl: (w) => `${window.location.origin}/leaderboard/${w.slug}`,
  },
  {
    gameType: "catch",
    title: "Catch games",
    newLabel: "New catch game",
    editPrefix: "/catch",
    publicUrl: (w) => `${window.location.origin}/catch/${w.slug}`,
  },
  {
    gameType: "runner",
    title: "Runner games",
    newLabel: "New runner game",
    editPrefix: "/runner",
    publicUrl: (w) => `${window.location.origin}/runner/${w.slug}`,
  },
  {
    gameType: "landing",
    title: "Landing pages",
    newLabel: "New landing page",
    editPrefix: "/landing",
    publicUrl: (w) => `${window.location.origin}/landing/${w.slug}`,
  },
  {
    gameType: "form",
    title: "Forms",
    newLabel: "New form",
    editPrefix: "/forms",
    publicUrl: (w) => `${window.location.origin}/form/${w.slug}`,
  },
  {
    gameType: "certificate",
    title: "Certificates",
    newLabel: "New certificate",
    editPrefix: "/certificates",
    publicUrl: (w) => `${window.location.origin}/certificate/${w.slug}`,
  },
  {
    gameType: "consent",
    title: "Consent",
    newLabel: "New consent",
    editPrefix: "/consent",
    publicUrl: (w) => `${window.location.origin}/consent/${w.slug}`,
  },
  {
    gameType: "email-signup",
    title: "Email signups",
    newLabel: "New email signup",
    editPrefix: "/email-signups",
    publicUrl: (w) => `${window.location.origin}/email-signup/${w.slug}`,
  },
  {
    gameType: "redemption",
    title: "Redemptions",
    newLabel: "New redemption",
    editPrefix: "/redemptions",
    publicUrl: (w) => `${window.location.origin}/redemption/${w.slug}`,
  },
];

function matchesType(w: LibraryItem, gameType: string) {
  if (gameType === "spinning-wheel") {
    return w.gameType === "spinning-wheel" || !w.gameType;
  }
  return w.gameType === gameType;
}

export default function LibraryPage() {
  const { gameType = "" } = useParams<{ gameType: string }>();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const meta = LIBRARY_TYPES.find((t) => t.gameType === gameType);
  const q = searchParams.get("q")?.trim().toLowerCase() || "";

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await apiGet("/api/wheels");
        setItems((data.wheels || []).filter((w: LibraryItem) => !w.archived));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [gameType]);

  const filtered = useMemo(() => {
    let list = items.filter((w) => matchesType(w, gameType));
    if (q) {
      list = list.filter(
        (w) =>
          (w.title || "").toLowerCase().includes(q) ||
          (w.clientName || "").toLowerCase().includes(q) ||
          (w.slug || "").toLowerCase().includes(q) ||
          (w.projectCode || "").toLowerCase().includes(q) ||
          (w.designCode || "").toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }, [items, gameType, q]);

  if (!meta) {
    return (
      <div className="card">
        <p>Unknown library type.</p>
        <Link to="/">Back to home</Link>
      </div>
    );
  }

  return (
    <div>
      <p style={{ margin: "0 0 16px" }}>
        <Link to="/">← Home</Link>
      </p>
      <h2 style={{ marginTop: 0 }}>{meta.title}</h2>
      {q ? <p className="muted">Search: {q}</p> : null}
      {err ? <p className="muted">{err}</p> : null}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0 }}>No items found.</p>
        </div>
      ) : (
        <GamesTable
          items={filtered}
          editPath={(w) => `${meta.editPrefix}/${w.id}`}
          copyLabel={meta.copyLabel}
          getPublicUrl={meta.publicUrl}
        />
      )}
    </div>
  );
}

export { RECENT, LIBRARY_TYPES, matchesType };
