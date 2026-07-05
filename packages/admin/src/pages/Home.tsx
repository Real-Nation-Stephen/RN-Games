import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../api";
import { LIBRARY_TYPES, matchesType, RECENT } from "./LibraryPage";
import {
  ExperiencesTable,
  GamesTable,
  SearchBar,
  SectionHeader,
  type ExperienceItem,
  type LibraryItem,
} from "./homeShared";

export default function Home() {
  const [wheels, setWheels] = useState<LibraryItem[]>([]);
  const [experiences, setExperiences] = useState<ExperienceItem[]>([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    const problems: string[] = [];
    try {
      const w = await apiGet("/api/wheels");
      setWheels((w.wheels || []).filter((x: LibraryItem) => !x.archived));
    } catch (e) {
      problems.push(e instanceof Error ? e.message : "Failed to load components");
      setWheels([]);
    }
    try {
      const e = await apiGet("/api/experiences");
      setExperiences(e.experiences || []);
    } catch (e) {
      problems.push(e instanceof Error ? e.message : "Failed to load experiences");
      setExperiences([]);
    }
    if (problems.length) setErr(problems.join(" · "));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const q = search.trim().toLowerCase();

  const filteredExperiences = useMemo(() => {
    let list = [...experiences];
    if (q) {
      list = list.filter(
        (x) =>
          (x.title || "").toLowerCase().includes(q) ||
          (x.clientName || "").toLowerCase().includes(q) ||
          (x.slug || "").toLowerCase().includes(q) ||
          (x.projectCode || "").toLowerCase().includes(q) ||
          (x.designCode || "").toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }, [experiences, q]);

  function filterModules(gameType: string) {
    let list = wheels.filter((w) => matchesType(w, gameType));
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
  }

  const searchHint = useMemo(() => {
    if (!q) return undefined;
    let n = filteredExperiences.length;
    for (const meta of LIBRARY_TYPES) {
      n += filterModules(meta.gameType).length;
    }
    if (n === 0) return `No results for “${search.trim()}”.`;
    return `${n} matching item${n === 1 ? "" : "s"}.`;
  }, [q, search, filteredExperiences, wheels]);

  async function createExperience() {
    setErr(null);
    try {
      const slug = `experience-${Date.now().toString(36)}`;
      const res = await apiSend("/api/experiences", "POST", {
        slug,
        title: "New experience",
        clientName: "",
      });
      if (res?.experience?.id) {
        window.location.href = `/admin/experiences/${res.experience.id}`;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create experience");
    }
  }

  async function createModule(gameType: string) {
    const slug = `${gameType}-${Date.now().toString(36)}`.replace("spinning-wheel", "wheel");
    const body: Record<string, string> = { slug, title: `New ${gameType}`, clientName: "" };
    if (gameType !== "spinning-wheel") body.gameType = gameType;
    const res = await apiSend("/api/wheels", "POST", body);
    const w = res?.wheel as LibraryItem | undefined;
    if (!w?.id) return;
    const meta = LIBRARY_TYPES.find((t) => t.gameType === gameType);
    window.location.href = `/admin${meta?.editPrefix || "/wheels"}/${w.id}`;
  }

  async function duplicateGame(w: LibraryItem) {
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
          const created = res?.wheel as LibraryItem;
          if (created?.id) {
            const meta = LIBRARY_TYPES.find((t) => matchesType(w, t.gameType));
            window.location.href = `/admin${meta?.editPrefix || "/wheels"}/${created.id}`;
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

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px", fontSize: "0.9rem", maxWidth: 640, lineHeight: 1.5 }}>
        Build reusable components, then wire them into experiences. Recent items show below — use View all for full
        libraries.
      </p>

      <SearchBar value={search} onChange={setSearch} resultHint={searchHint} />
      {err ? <p className="muted">{err}</p> : null}

      <section className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "1.05rem" }}>Create</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button type="button" className="btn btn-primary" onClick={() => void createExperience()}>
            New experience
          </button>
          {LIBRARY_TYPES.map((t) => (
            <button
              key={t.gameType}
              type="button"
              className="btn"
              onClick={() => void createModule(t.gameType)}
            >
              {t.newLabel}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              title="Recent experiences"
              onNew={createExperience}
              newLabel="New experience"
              viewAllHref="/experiences"
            />
            {filteredExperiences.length === 0 ? (
              <div className="card">
                <p style={{ margin: 0 }}>No experiences yet.</p>
              </div>
            ) : (
              <ExperiencesTable items={filteredExperiences.slice(0, RECENT)} />
            )}
          </section>

          {LIBRARY_TYPES.map((meta) => {
            const items = filterModules(meta.gameType);
            const recent = items.slice(0, RECENT);
            return (
              <section key={meta.gameType} style={{ marginBottom: 32 }}>
                <SectionHeader
                  title={meta.title}
                  onNew={() => createModule(meta.gameType)}
                  newLabel={meta.newLabel}
                  viewAllHref={`/library/${meta.gameType}${q ? `?q=${encodeURIComponent(q)}` : ""}`}
                />
                {recent.length === 0 ? (
                  <div className="card">
                    <p style={{ margin: 0 }}>None yet.</p>
                  </div>
                ) : (
                  <GamesTable
                    items={recent}
                    editPath={(w) => `${meta.editPrefix}/${w.id}`}
                    copyLabel={meta.copyLabel}
                    getPublicUrl={meta.publicUrl}
                    onDuplicate={duplicateGame}
                  />
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
