import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";

type Row = { label: string; count: number };

type Stats = {
  hours: number;
  eventCount: number;
  uniqueSessions: number;
  campaign: Row[];
  experience: Row[];
  component: Row[];
  user: Row[];
  byType: Row[];
};

type Tab = "campaign" | "experience" | "component" | "user";

const TAB_LABELS: Record<Tab, string> = {
  campaign: "Campaign",
  experience: "Experience",
  component: "Component",
  user: "Sessions",
};

function StatTable({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "8px 4px", borderBottom: "1px solid var(--rn-border)" }}>
            Label
          </th>
          <th style={{ textAlign: "right", padding: "8px 4px", borderBottom: "1px solid var(--rn-border)" }}>
            Events
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td style={{ padding: "6px 4px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>{r.label}</td>
            <td style={{ padding: "6px 4px", textAlign: "right", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              {r.count}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AnalyticsPage() {
  const [hours, setHours] = useState(48);
  const [tab, setTab] = useState<Tab>("campaign");
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiGet(`/api/track-stats?hours=${hours}`);
      setStats(data as Stats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load analytics");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows =
    tab === "campaign"
      ? stats?.campaign || []
      : tab === "experience"
        ? stats?.experience || []
        : tab === "component"
          ? stats?.component || []
          : stats?.user || [];

  return (
    <div>
      <p style={{ margin: "0 0 16px" }}>
        <Link to="/">← Home</Link>
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Analytics</h2>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          Pilot dashboards from <code>/api/track</code> ingest. League module deferred.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <label className="field" style={{ margin: 0 }}>
            Window (hours)
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={72}>72 hours</option>
              <option value={168}>7 days</option>
            </select>
          </label>
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
          <a
            className="btn btn-primary"
            href={`/api/track-stats?hours=${hours}&format=csv`}
            download="analytics-export.csv"
          >
            Export CSV
          </a>
        </div>

        {stats ? (
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            <strong>{stats.eventCount}</strong> events · <strong>{stats.uniqueSessions}</strong> unique sessions
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`btn${tab === t ? " btn-primary" : ""}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {loading ? <p className="muted">Loading…</p> : null}
        {err ? <p className="muted">{err}</p> : null}
        {!loading && stats ? <StatTable rows={rows} empty="No events in this window." /> : null}
      </div>

      {stats?.byType?.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Event types</h3>
          <StatTable rows={stats.byType} empty="No event types." />
        </div>
      ) : null}
    </div>
  );
}
