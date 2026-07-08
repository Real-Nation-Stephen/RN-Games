import { useMemo, useState } from "react";

export type PickerModule = {
  id: string;
  gameType?: string;
  slug: string;
  title: string;
  clientName?: string;
};

export type PickerExperience = {
  id: string;
  slug: string;
  title: string;
  clientName?: string;
  status?: string;
};

type PickerCategory = "pages" | "games" | "data" | "outcomes" | "experiences" | "video";

const PAGE_TYPES = new Set(["landing", "consent", "email-signup"]);
const GAME_TYPES = new Set(["spinning-wheel", "scratcher", "flip-cards", "catch", "runner", "quiz"]);
const DATA_TYPES = new Set(["form", "pinboard"]);
const OUTCOME_TYPES = new Set(["certificate", "redemption", "leaderboard"]);

function moduleCategory(gameType?: string): PickerCategory {
  const t = gameType || "spinning-wheel";
  if (PAGE_TYPES.has(t)) return "pages";
  if (GAME_TYPES.has(t)) return "games";
  if (DATA_TYPES.has(t)) return "data";
  if (OUTCOME_TYPES.has(t)) return "outcomes";
  return "games";
}

const CATEGORY_LABELS: Record<PickerCategory, string> = {
  pages: "Intro & pages",
  games: "Games & experiences",
  data: "Forms & data",
  outcomes: "Outcomes & rewards",
  experiences: "Experiences",
  video: "Video lesson",
};

type Props = {
  mode?: "course" | "module";
  heading?: string;
  modules: PickerModule[];
  experiences?: PickerExperience[];
  onPickModule: (mod: PickerModule) => void;
  onPickExperience?: (exp: PickerExperience) => void;
  onPickVideo?: (url: string, title: string) => void;
};

export function ItemPicker({
  mode = "course",
  heading,
  modules,
  experiences = [],
  onPickModule,
  onPickExperience,
  onPickVideo,
}: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PickerCategory | "all">("all");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");

  const moduleOnly = mode === "module";
  const title = heading || (moduleOnly ? "Select component" : "Add course item");
  const showExperiences = !moduleOnly && !!onPickExperience;
  const showVideo = !moduleOnly && !!onPickVideo;

  const q = query.trim().toLowerCase();

  const filteredModules = useMemo(() => {
    let list = modules;
    if (category !== "all" && category !== "experiences" && category !== "video") {
      list = list.filter((m) => moduleCategory(m.gameType) === category);
    } else if (category === "experiences" || category === "video") {
      list = [];
    }
    if (q) {
      list = list.filter(
        (m) =>
          (m.title || "").toLowerCase().includes(q) ||
          (m.slug || "").toLowerCase().includes(q) ||
          (m.clientName || "").toLowerCase().includes(q) ||
          (m.gameType || "").toLowerCase().includes(q),
      );
    }
    return list.slice(0, 40);
  }, [modules, category, q]);

  const filteredExperiences = useMemo(() => {
    if (!showExperiences || (category !== "all" && category !== "experiences")) return [];
    let list = experiences;
    if (q) {
      list = list.filter(
        (e) =>
          (e.title || "").toLowerCase().includes(q) ||
          (e.slug || "").toLowerCase().includes(q) ||
          (e.clientName || "").toLowerCase().includes(q),
      );
    }
    return list.slice(0, 40);
  }, [experiences, category, q, showExperiences]);

  const categories = moduleOnly
    ? (["pages", "games", "data", "outcomes"] as PickerCategory[])
    : (Object.keys(CATEGORY_LABELS) as PickerCategory[]);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h4 style={{ marginTop: 0 }}>{title}</h4>
      <div className="grid2">
        <label className="field">
          Search
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, slug, client, type…"
          />
        </label>
        <label className="field">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showVideo && (category === "video" || category === "all") ? (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 8px" }}>
            Video lesson (YouTube, Vimeo, or MP4 URL)
          </p>
          <div className="grid2">
            <label className="field">
              Video URL
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" />
            </label>
            <label className="field">
              Title
              <input value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder="Lesson title" />
            </label>
          </div>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 8 }}
            disabled={!videoUrl.trim()}
            onClick={() => {
              onPickVideo!(videoUrl.trim(), videoTitle.trim() || "Video lesson");
              setVideoUrl("");
              setVideoTitle("");
            }}
          >
            Add video lesson
          </button>
        </div>
      ) : null}

      {showExperiences && (category === "all" || category === "experiences") && filteredExperiences.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 6px" }}>
            Experiences
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredExperiences.map((e) => (
              <button
                key={e.id}
                type="button"
                className="btn"
                style={{ textAlign: "left", justifyContent: "flex-start" }}
                onClick={() => onPickExperience!(e)}
              >
                {e.title} <span className="muted">— /x/{e.slug}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {category !== "experiences" && category !== "video" ? (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 6px" }}>
            Components {filteredModules.length === 40 ? "(showing first 40)" : ""}
          </p>
          {filteredModules.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              No matching components.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflow: "auto" }}>
              {filteredModules.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="btn"
                  style={{ textAlign: "left", justifyContent: "flex-start" }}
                  onClick={() => onPickModule(m)}
                >
                  {m.title}{" "}
                  <span className="muted">
                    — {m.gameType || "spinning-wheel"} /{m.slug}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
