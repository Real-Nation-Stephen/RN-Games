import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormField, FormRecord } from "@rngames/shared";
import { apiGet } from "../api";

type Submission = {
  id: string;
  createdAt: string;
  values: Record<string, string>;
};

type Props = {
  doc: FormRecord;
};

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(filename: string, rows: string[][]) {
  const body = rows.map((r) => r.map((c) => csvEscape(String(c ?? ""))).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fieldSummary(fields: FormField[], submissions: Submission[]) {
  return fields.map((field) => {
    const counts = new Map<string, number>();
    for (const sub of submissions) {
      const raw = sub.values[field.id] ?? "";
      if (!raw) continue;
      if (field.type === "multiple_choice" || field.type === "dropdown") {
        counts.set(raw, (counts.get(raw) || 0) + 1);
      } else if (field.type === "checkbox") {
        const key = raw === "yes" ? "Checked" : "Unchecked";
        counts.set(key, (counts.get(key) || 0) + 1);
      } else {
        counts.set("(responses)", (counts.get("(responses)") || 0) + 1);
      }
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] || 1;
    return { field, entries, max, total: submissions.length };
  });
}

export function FormResultsPanel({ doc }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = (await apiGet(`/api/form-submissions?slug=${encodeURIComponent(doc.slug)}`)) as {
        state?: { submissions?: Submission[] };
      };
      setSubmissions(Array.isArray(data.state?.submissions) ? data.state!.submissions! : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load results");
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [doc.slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const summaries = useMemo(() => fieldSummary(doc.fields, submissions), [doc.fields, submissions]);

  function exportCsv() {
    const header = ["Submitted at", ...doc.fields.map((f) => f.label || f.id)];
    const rows = submissions.map((s) => [
      new Date(s.createdAt).toLocaleString(),
      ...doc.fields.map((f) => s.values[f.id] ?? ""),
    ]);
    downloadCsv(`${doc.slug || "form"}-results.csv`, [header, ...rows]);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Form results</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={loading} onClick={() => void load()}>
            Refresh
          </button>
          <button type="button" className="btn btn-primary" disabled={!submissions.length} onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        {loading ? "Loading…" : `${submissions.length} submission${submissions.length === 1 ? "" : "s"}`}
      </p>
      {err ? <p className="error">{err}</p> : null}

      {!loading && submissions.length > 0 ? (
        <>
          <div className="grid2" style={{ marginTop: 16 }}>
            {summaries.map(({ field, entries, max, total }) => (
              <div key={field.id} className="card" style={{ padding: 12, margin: 0 }}>
                <strong>{field.label || field.id}</strong>
                <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 10px" }}>
                  {total} response{total === 1 ? "" : "s"}
                </p>
                {entries.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {entries.map(([label, count]) => {
                      const pct = Math.round((count / Math.max(total, 1)) * 100);
                      return (
                        <div key={label}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                            <span>{label}</span>
                            <span>
                              {count} ({pct}%)
                            </span>
                          </div>
                          <div
                            style={{
                              height: 8,
                              background: "var(--rn-border)",
                              borderRadius: 4,
                              overflow: "hidden",
                              marginTop: 4,
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.round((count / max) * 100)}%`,
                                height: "100%",
                                background: "var(--rn-accent, #2d6cdf)",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted">No answers yet.</p>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, overflowX: "auto" }}>
            <h4>Individual responses</h4>
            <table className="data-table" style={{ width: "100%", fontSize: "0.85rem" }}>
              <thead>
                <tr>
                  <th>Submitted</th>
                  {doc.fields.map((f) => (
                    <th key={f.id}>{f.label || f.id}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.createdAt).toLocaleString()}</td>
                    {doc.fields.map((f) => (
                      <td key={f.id}>{s.values[f.id] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {!loading && !submissions.length && !err ? (
        <p className="muted" style={{ marginTop: 12 }}>
          No submissions yet. Responses appear here when someone completes this form.
        </p>
      ) : null}
    </div>
  );
}
