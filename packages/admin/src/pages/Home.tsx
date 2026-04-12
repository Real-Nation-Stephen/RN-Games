import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../api";

type Item = {
  id: string;
  slug: string;
  title: string;
  clientName: string;
  updatedAt: string;
  reportingEnabled: boolean;
  thumbnailUrl?: string;
};

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");

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

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Your wheels</h2>
        <button type="button" className="btn btn-primary" onClick={() => void createWheel()}>
          New wheel
        </button>
      </div>

      {err && <p className="muted">{err}</p>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && wheels.length === 0 && (
        <div className="card">
          <p>No wheels yet. Create one to get started.</p>
        </div>
      )}

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
          {wheels.map((w) => (
            <tr key={w.id}>
              <td>
                {w.thumbnailUrl ? (
                  <img className="thumb" src={w.thumbnailUrl} alt="" />
                ) : (
                  <div className="thumb" />
                )}
              </td>
              <td>
                <Link to={`/wheels/${w.id}`}>{w.title || "Untitled"}</Link>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  /{w.slug}
                </div>
              </td>
              <td>{w.clientName || "—"}</td>
              <td className="muted">{new Date(w.updatedAt).toLocaleString()}</td>
              <td>
                <button type="button" className="btn" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => copy(`${siteUrl}/${w.slug}`)}>
                  Copy wheel URL
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
    </div>
  );
}
