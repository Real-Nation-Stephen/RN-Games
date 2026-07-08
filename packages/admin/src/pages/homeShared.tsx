import { Link } from "react-router-dom";

export type LibraryItem = {
  id: string;
  gameType?: string;
  slug: string;
  title: string;
  clientName: string;
  projectCode?: string;
  designCode?: string;
  updatedAt: string;
  reportingEnabled: boolean;
  thumbnailUrl?: string;
  archived?: boolean;
};

export type ExperienceItem = {
  id: string;
  slug: string;
  title: string;
  clientName: string;
  projectCode?: string;
  designCode?: string;
  updatedAt: string;
  status: string;
  thumbnailUrl?: string;
  stepCount?: number;
};

export type CourseItem = {
  id: string;
  slug: string;
  title: string;
  clientName: string;
  projectCode?: string;
  designCode?: string;
  updatedAt: string;
  status: string;
  thumbnailUrl?: string;
  itemCount?: number;
  sectionCount?: number;
};

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");

export function experiencePublicUrl(slug: string, previewToken?: string) {
  const base = `${siteUrl}/x/${encodeURIComponent(slug)}`;
  if (previewToken) return `${base}?previewToken=${encodeURIComponent(previewToken)}`;
  return base;
}

export function coursePublicUrl(slug: string, previewToken?: string) {
  const base = `${siteUrl}/course/${encodeURIComponent(slug)}`;
  if (previewToken) return `${base}?previewToken=${encodeURIComponent(previewToken)}`;
  return base;
}

export function GamesTable({
  items,
  editPath,
  copyLabel = "Copy public URL",
  getPublicUrl,
  onDuplicate,
}: {
  items: LibraryItem[];
  editPath: (w: LibraryItem) => string;
  copyLabel?: string;
  getPublicUrl?: (w: LibraryItem) => string;
  onDuplicate?: (w: LibraryItem) => void | Promise<void>;
}) {
  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  const isScratcher = (w: LibraryItem) => w.gameType === "scratcher";

  return (
    <table className="table">
      <thead>
        <tr>
          <th></th>
          <th>Title</th>
          <th>Client</th>
          <th>Codes</th>
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
            <td className="muted" style={{ fontSize: "0.8rem" }}>
              {[w.projectCode, w.designCode].filter(Boolean).join(" · ") || "—"}
            </td>
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
                {w.reportingEnabled && w.gameType !== "leaderboard" && w.gameType !== "catch" && w.gameType !== "runner" ? (
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                    onClick={() => copy(`${siteUrl}/${w.slug}_Report`)}
                  >
                    Copy report URL
                  </button>
                ) : null}
                {onDuplicate ? (
                  <button
                    type="button"
                    className="btn"
                    title="Duplicate"
                    aria-label={`Duplicate ${w.title || "item"}`}
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

export function ExperiencesTable({ items }: { items: ExperienceItem[] }) {
  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Client</th>
          <th>Status</th>
          <th>Steps</th>
          <th>Updated</th>
          <th>Links</th>
        </tr>
      </thead>
      <tbody>
        {items.map((x) => (
          <tr key={x.id}>
            <td>
              <Link to={`/experiences/${x.id}`}>{x.title || "Untitled"}</Link>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                /x/{x.slug}
              </div>
            </td>
            <td>{x.clientName || "—"}</td>
            <td>{x.status}</td>
            <td>{x.stepCount ?? 0}</td>
            <td className="muted">{new Date(x.updatedAt).toLocaleString()}</td>
            <td>
              <button
                type="button"
                className="btn"
                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                onClick={() => copy(experiencePublicUrl(x.slug))}
              >
                Copy URL
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CoursesTable({ items }: { items: CourseItem[] }) {
  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Client</th>
          <th>Status</th>
          <th>Items</th>
          <th>Updated</th>
          <th>Links</th>
        </tr>
      </thead>
      <tbody>
        {items.map((x) => (
          <tr key={x.id}>
            <td>
              <Link to={`/courses/${x.id}`}>{x.title || "Untitled"}</Link>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                /course/{x.slug}
              </div>
            </td>
            <td>{x.clientName || "—"}</td>
            <td>{x.status}</td>
            <td>{x.itemCount ?? 0}</td>
            <td className="muted">{new Date(x.updatedAt).toLocaleString()}</td>
            <td>
              <button
                type="button"
                className="btn"
                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                onClick={() => copy(coursePublicUrl(x.slug))}
              >
                Copy URL
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SectionHeader({
  title,
  onNew,
  newLabel,
  viewAllHref,
  newDisabled,
}: {
  title: string;
  onNew?: () => void | Promise<void>;
  newLabel?: string;
  viewAllHref?: string;
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
        {viewAllHref ? (
          <Link to={viewAllHref} className="btn" style={{ fontSize: "0.85rem" }}>
            View all
          </Link>
        ) : null}
        {onNew && newLabel ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: "0.85rem" }}
            disabled={newDisabled}
            onClick={() => void onNew()}
          >
            {newLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SearchBar({
  value,
  onChange,
  resultHint,
}: {
  value: string;
  onChange: (v: string) => void;
  resultHint?: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <input
        type="search"
        placeholder="Search title, client, slug, project or design code…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", maxWidth: 420, padding: "8px 12px" }}
        aria-label="Search studio"
      />
      {resultHint ? (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.85rem" }}>
          {resultHint}
        </p>
      ) : null}
    </div>
  );
}
