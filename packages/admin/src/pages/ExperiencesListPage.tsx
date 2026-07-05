import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { ExperiencesTable, SearchBar, SectionHeader, type ExperienceItem } from "./homeShared";

export default function ExperiencesListPage() {
  const [items, setItems] = useState<ExperienceItem[]>([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiGet("/api/experiences");
        setItems(data.experiences || []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [...items];
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
  }, [items, search]);

  return (
    <div>
      <p style={{ margin: "0 0 16px" }}>
        <Link to="/">← Home</Link>
      </p>
      <h2 style={{ marginTop: 0 }}>All experiences</h2>
      <SearchBar value={search} onChange={setSearch} />
      {err ? <p className="muted">{err}</p> : null}
      {filtered.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0 }}>No experiences found.</p>
        </div>
      ) : (
        <ExperiencesTable items={filtered} />
      )}
    </div>
  );
}
