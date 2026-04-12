import { useEffect, useState } from "react";

function parseSlug(): string {
  const path = window.location.pathname.replace(/^\/+|\/$/g, "");
  const m = path.match(/^(.+)_Report$/);
  return m ? m[1] : path.replace(/_Report$/, "");
}

export default function Report() {
  const [slug] = useState(parseSlug);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<{ total: number; counts: Record<string, number> } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const q = new URLSearchParams();
    if (slug) q.set("slug", slug);
    if (from) q.set("from", new Date(from).toISOString());
    if (to) q.set("to", new Date(to).toISOString());
    try {
      const res = await fetch(`/api/report-data?${q.toString()}`);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      setData(await res.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setData(null);
    }
  }

  useEffect(() => {
    if (slug) void load();
    else setErr("Invalid report URL");
  }, [slug]);

  return (
    <div className="shell">
      <h1>Spin report</h1>
      <p className="muted">Wheel: {slug || "—"}</p>

      <div className="filters">
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button
          type="button"
          style={{
            padding: "10px 18px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "#f8f9fb",
            color: "#0a1628",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() => void load()}
        >
          Apply
        </button>
      </div>

      {err && <p className="err">{err}</p>}

      {data && (
        <>
          <p className="muted">Total spins (in range): {data.total}</p>
          <table>
            <thead>
              <tr>
                <th>Prize</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.counts)
                .sort((a, b) => b[1] - a[1])
                .map(([prize, count]) => (
                  <tr key={prize}>
                    <td>{prize}</td>
                    <td>{count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
