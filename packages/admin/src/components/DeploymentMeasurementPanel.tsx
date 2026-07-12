import { useCallback, useEffect, useState } from "react";
import type { DeploymentMeasurement, EffectiveMeasurementProfile } from "@rngames/shared";
import { defaultDeploymentMeasurement } from "@rngames/shared";
import { apiGet, apiSend } from "../api";

type DeploymentKind = "course" | "flow";

type InventoryRow = {
  componentType: string;
  instanceId: string;
  title?: string;
  reportingEnabled?: boolean;
  fieldCount?: number;
};

type Finding = {
  ruleId: string;
  severity: string;
  message: string;
  recommendation?: string;
  advisoryOnly?: boolean;
};

type MetricRow = {
  id: string;
  label: string;
  basis: string;
  value: number;
  unit: string;
};

type Tab = "measurement" | "reporting" | "compliance";

const TAB_LABELS: Record<Tab, string> = {
  measurement: "Measurement",
  reporting: "Reporting",
  compliance: "Compliance",
};

type Props = {
  kind: DeploymentKind;
  recordId: string;
  measurement: DeploymentMeasurement | undefined;
  onMeasurementChange: (m: DeploymentMeasurement) => void;
};

function ensureMeasurement(m?: DeploymentMeasurement): DeploymentMeasurement {
  return m ? { ...defaultDeploymentMeasurement(), ...m } : defaultDeploymentMeasurement();
}

function StatCard({ label, value, basis }: { label: string; value: string | number; basis: string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid var(--rn-border)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ fontSize: "0.75rem", color: "var(--rn-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: "0.72rem", color: "var(--rn-muted)", marginTop: 6 }} title={basis}>
        {basis}
      </div>
    </div>
  );
}

export function DeploymentMeasurementPanel({ kind, recordId, measurement, onMeasurementChange }: Props) {
  const [tab, setTab] = useState<Tab>("measurement");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [effective, setEffective] = useState<EffectiveMeasurementProfile | null>(null);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [metrics, setMetrics] = useState<{
    available: boolean;
    reason?: string;
    metrics: MetricRow[];
    dataFreshness?: string | null;
    participationOverTime?: { day: string; count: number }[];
    perComponent?: { component_type: string; count: number }[];
  } | null>(null);
  const [compliance, setCompliance] = useState<{
    complianceStatus: { status: string; label: string };
    findings: Finding[];
    advisoryNotice?: string;
  } | null>(null);
  const [docs, setDocs] = useState<{ privacyPage?: string; checklist?: string; websiteSnippet?: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  const m = ensureMeasurement(measurement);

  const base = `/api/deployment-measurement?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(recordId)}`;

  const loadEffective = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiGet(base);
      setEffective(res.effective as EffectiveMeasurementProfile);
      setInventory((res.inventory as InventoryRow[]) || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load measurement profile");
    } finally {
      setLoading(false);
    }
  }, [base]);

  const loadMetrics = useCallback(async () => {
    try {
      const res = await apiGet(`${base}&view=metrics`);
      setMetrics(res as typeof metrics);
    } catch (e) {
      setMetrics({ available: false, reason: e instanceof Error ? e.message : "Failed", metrics: [] });
    }
  }, [base]);

  const loadCompliance = useCallback(async () => {
    try {
      const res = await apiGet(`${base}&view=compliance`);
      setCompliance({
        complianceStatus: res.complianceStatus,
        findings: res.findings || [],
        advisoryNotice: res.advisoryNotice,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Compliance scan failed");
    }
  }, [base]);

  useEffect(() => {
    void loadEffective();
  }, [loadEffective]);

  useEffect(() => {
    if (tab === "reporting") void loadMetrics();
    if (tab === "compliance") void loadCompliance();
  }, [tab, loadMetrics, loadCompliance]);

  function patchMeasurement(fn: (prev: DeploymentMeasurement) => DeploymentMeasurement) {
    onMeasurementChange(fn(ensureMeasurement(measurement)));
  }

  async function generateDocs() {
    setGenerating(true);
    setErr(null);
    try {
      const res = await apiSend(`${base}&view=documents`, "POST", {});
      setDocs(res.documents);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Document generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const visibleMetrics =
    metrics?.metrics?.filter((row) => {
      if (kind === "course") {
        return !row.id.startsWith("flow") || row.id === "uniqueCourseSessions";
      }
      return !row.id.startsWith("course");
    }) || [];

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Measurement &amp; Reporting</h3>
      <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
        One deployment-level configuration. Component settings feed the computed profile below — they are not edited here.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "btn btn-primary" : "btn"}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {err && <p style={{ color: "var(--rn-danger)" }}>{err}</p>}
      {loading && tab === "measurement" && <p className="muted">Loading scan…</p>}

      {tab === "measurement" && (
        <>
          <h4>Deployment defaults</h4>
          <div className="grid2">
            <label className="field">
              Collection mode
              <select
                value={m.collectionMode}
                onChange={(e) =>
                  patchMeasurement((prev) => ({
                    ...prev,
                    collectionMode: e.target.value as DeploymentMeasurement["collectionMode"],
                  }))
                }
              >
                <option value="minimal">Minimal</option>
                <option value="standard">Standard</option>
                <option value="diagnostic">Diagnostic</option>
              </select>
            </label>
            <label className="field">
              Retention (days)
              <input
                type="number"
                min={1}
                value={m.retention?.defaultDays ?? 365}
                onChange={(e) =>
                  patchMeasurement((prev) => ({
                    ...prev,
                    retention: { ...prev.retention, defaultDays: Number(e.target.value) || 365 },
                  }))
                }
              />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={m.trackingEnabled !== false}
                onChange={(e) => patchMeasurement((prev) => ({ ...prev, trackingEnabled: e.target.checked }))}
              />
              Tracking enabled
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={m.excludePreviewTraffic !== false}
                onChange={(e) =>
                  patchMeasurement((prev) => ({ ...prev, excludePreviewTraffic: e.target.checked }))
                }
              />
              Exclude preview traffic from reports
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!m.reporting?.enabled}
                onChange={(e) =>
                  patchMeasurement((prev) => ({
                    ...prev,
                    reporting: { ...prev.reporting, enabled: e.target.checked },
                  }))
                }
              />
              Reporting enabled
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={m.reporting?.publicAggregateOnly !== false}
                onChange={(e) =>
                  patchMeasurement((prev) => ({
                    ...prev,
                    reporting: { ...prev.reporting, publicAggregateOnly: e.target.checked },
                  }))
                }
              />
              Public reports: aggregate only
            </label>
          </div>

          <h4 style={{ marginTop: 20 }}>Detected inventory</h4>
          {!inventory.length ? (
            <p className="muted">No nested components detected yet.</p>
          ) : (
            <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 6 }}>Component</th>
                  <th style={{ textAlign: "left", padding: 6 }}>Type</th>
                  <th style={{ textAlign: "right", padding: 6 }}>Fields</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((row) => (
                  <tr key={`${row.componentType}:${row.instanceId}`}>
                    <td style={{ padding: 6 }}>{row.title || row.instanceId}</td>
                    <td style={{ padding: 6 }}>{row.componentType}</td>
                    <td style={{ padding: 6, textAlign: "right" }}>{row.fieldCount ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h4 style={{ marginTop: 20 }}>Effective result</h4>
          {effective?.legacyExceptions?.length ? (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, border: "1px solid var(--rn-border)" }}>
              <strong>Legacy exceptions</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {effective.legacyExceptions.map((ex) => (
                  <li key={ex.instanceId}>
                    {ex.title || ex.instanceId}: {ex.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!effective?.fields?.length ? (
            <p className="muted">Save and refresh to compute effective field states from component configuration.</p>
          ) : (
            <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 6 }}>Field</th>
                  <th style={{ textAlign: "left", padding: 6 }}>Class</th>
                  <th style={{ textAlign: "center", padding: 6 }}>Collect</th>
                  <th style={{ textAlign: "center", padding: 6 }}>Report</th>
                  <th style={{ textAlign: "left", padding: 6 }}>Why</th>
                </tr>
              </thead>
              <tbody>
                {effective.fields.map((f) => (
                  <tr key={`${f.instanceId}:${f.fieldId}`}>
                    <td style={{ padding: 6 }}>
                      {f.fieldId} <span className="muted">({f.componentType})</span>
                    </td>
                    <td style={{ padding: 6 }}>{f.dataClass}</td>
                    <td style={{ padding: 6, textAlign: "center" }}>{f.collect ? "✓" : "—"}</td>
                    <td style={{ padding: 6, textAlign: "center" }}>{f.report ? "✓" : "—"}</td>
                    <td style={{ padding: 6 }} className="muted">
                      {f.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => void loadEffective()}>
              Refresh scan
            </button>
          </p>
        </>
      )}

      {tab === "reporting" && (
        <>
          {!metrics?.available ? (
            <p className="muted">{metrics?.reason || "Metrics unavailable — enable Netlify Database ingest or wait for events."}</p>
          ) : (
            <>
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                Data freshness: {metrics.dataFreshness ? new Date(metrics.dataFreshness).toLocaleString() : "—"}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {visibleMetrics.map((row) => (
                  <StatCard
                    key={row.id}
                    label={row.label}
                    value={row.unit === "percent" ? `${row.value}%` : row.value}
                    basis={row.basis}
                  />
                ))}
              </div>
              {metrics.perComponent?.length ? (
                <>
                  <h4>Per-component activity</h4>
                  <ul style={{ fontSize: "0.85rem" }}>
                    {metrics.perComponent.map((r) => (
                      <li key={r.component_type}>
                        {r.component_type}: {r.count} events
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
          <button type="button" className="btn" onClick={() => void loadMetrics()}>
            Refresh metrics
          </button>
        </>
      )}

      {tab === "compliance" && (
        <>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid var(--rn-border)",
              marginBottom: 16,
              background: "rgba(255,200,80,0.06)",
            }}
          >
            <strong>Indicative Assessment (Advisory Pilot)</strong>
            <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>
              {compliance?.advisoryNotice ||
                "This scan is advisory only. Publish blocking, override audit and purge enforcement are not active."}
            </p>
            {compliance?.complianceStatus && (
              <p style={{ margin: "8px 0 0" }}>
                Status: <strong>{compliance.complianceStatus.label}</strong>
              </p>
            )}
          </div>

          {!compliance?.findings?.length ? (
            <p className="muted">No findings yet — open this tab after saving configuration.</p>
          ) : (
            <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 6 }}>Rule</th>
                  <th style={{ textAlign: "left", padding: 6 }}>Severity</th>
                  <th style={{ textAlign: "left", padding: 6 }}>Message</th>
                </tr>
              </thead>
              <tbody>
                {compliance.findings
                  .filter((f) => f.severity !== "expected")
                  .map((f) => (
                    <tr key={f.ruleId}>
                      <td style={{ padding: 6 }}>{f.ruleId}</td>
                      <td style={{ padding: 6 }}>{f.severity}</td>
                      <td style={{ padding: 6 }}>
                        {f.message}
                        {f.recommendation ? (
                          <div className="muted" style={{ fontSize: "0.8rem" }}>
                            {f.recommendation}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={() => void loadCompliance()}>
              Re-scan
            </button>
            <button type="button" className="btn btn-primary" disabled={generating} onClick={() => void generateDocs()}>
              {generating ? "Generating…" : "Generate privacy docs"}
            </button>
          </div>

          {docs?.websiteSnippet && (
            <div style={{ marginTop: 16 }}>
              <h4>Website snippet</h4>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: "0.8rem",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid var(--rn-border)",
                }}
              >
                {docs.websiteSnippet}
              </pre>
            </div>
          )}
          {docs?.privacyPage && (
            <div style={{ marginTop: 16 }}>
              <h4>Privacy page (draft)</h4>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: "0.78rem",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid var(--rn-border)",
                  maxHeight: 280,
                  overflow: "auto",
                }}
              >
                {docs.privacyPage}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
