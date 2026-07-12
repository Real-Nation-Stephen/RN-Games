import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ExperienceGraph, ExperienceRecord } from "@rngames/shared";
import { defaultDeploymentMeasurement, graphToLinearSteps } from "@rngames/shared";
import { apiDelete, apiGet, apiSend } from "../api";
import { DeploymentMeasurementPanel } from "../components/DeploymentMeasurementPanel";
import { ExperienceFlowCanvas } from "../components/ExperienceFlowCanvas";
import { ExperienceNodeOverridesPanel } from "../components/ExperienceNodeOverridesPanel";
import type { PickerModule } from "../components/ItemPicker";
import { experiencePublicUrl } from "./homeShared";

export default function ExperienceEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<ExperienceRecord | null>(null);
  const [modules, setModules] = useState<PickerModule[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<{ stepId: string; message: string }[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    const [expRes, wheelsRes] = await Promise.all([
      apiGet(`/api/experiences?id=${encodeURIComponent(id)}`),
      apiGet("/api/wheels"),
    ]);
    setGame({
      ...(expRes.experience as ExperienceRecord),
      measurement:
        (expRes.experience as ExperienceRecord).measurement || defaultDeploymentMeasurement(),
    });
    setModules(
      (wheelsRes.wheels || []).filter((w: PickerModule & { archived?: boolean }) => !w.archived),
    );
  }, [id]);

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : "Load failed"));
  }, [load]);

  function patch(fn: (g: ExperienceRecord) => ExperienceRecord) {
    setGame((g) => (g ? fn(g) : g));
  }

  function handleGraphChange(graph: ExperienceGraph) {
    patch((g) => ({
      ...g,
      graph,
      linearSteps: graphToLinearSteps(graph),
    }));
  }

  function patchNodeOverrides(nodeId: string, overrides: ExperienceRecord["linearSteps"][0]["overrides"]) {
    patch((g) => {
      const graph = {
        ...g.graph,
        nodes: g.graph.nodes.map((n) =>
          n.kind === "module" && n.id === nodeId ? { ...n, overrides } : n,
        ),
      };
      return {
        ...g,
        graph,
        linearSteps: graphToLinearSteps(graph),
      };
    });
  }

  const selectedModuleNode = useMemo(() => {
    if (!game || !selectedNodeId) return null;
    const n = game.graph.nodes.find((x) => x.kind === "module" && x.id === selectedNodeId);
    return n?.kind === "module" ? n : null;
  }, [game, selectedNodeId]);

  async function save(publish = false) {
    if (!game) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await apiSend("/api/experiences", "PUT", {
        ...game,
        publish,
      });
      setGame(res.experience as ExperienceRecord);
      setWarnings(Array.isArray(res.warnings) ? res.warnings : []);
      setMsg(publish ? "Published." : "Saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!game || !confirm("Delete this experience?")) return;
    await apiDelete(`/api/experiences?id=${encodeURIComponent(game.id)}`);
    navigate("/");
  }

  const previewUrl = game ? experiencePublicUrl(game.slug, game.previewToken) : "";

  useEffect(() => {
    if (!previewUrl) return;
    let cancelled = false;
    void import("qrcode")
      .then((QR) => QR.toDataURL(previewUrl, { margin: 1, width: 160 }))
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => setQrDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  if (!game) {
    return <p className="muted">{err || "Loading…"}</p>;
  }

  const liveUrl = experiencePublicUrl(game.slug);

  return (
    <div>
      <p style={{ margin: "0 0 16px" }}>
        <Link to="/">← Home</Link>
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Experience details</h2>
        <div className="grid2">
          <label className="field">
            Title
            <input value={game.title} onChange={(e) => patch((g) => ({ ...g, title: e.target.value }))} />
          </label>
          <label className="field">
            Client
            <input
              value={game.clientName}
              onChange={(e) => patch((g) => ({ ...g, clientName: e.target.value }))}
            />
          </label>
          <label className="field">
            Sub-URL (slug)
            <input
              value={game.slug}
              onChange={(e) => patch((g) => ({ ...g, slug: e.target.value.toLowerCase() }))}
            />
          </label>
          <label className="field">
            Status
            <input value={game.status} readOnly disabled />
          </label>
          <label className="field">
            Project code
            <input
              value={game.projectCode}
              onChange={(e) => patch((g) => ({ ...g, projectCode: e.target.value }))}
            />
          </label>
          <label className="field">
            Design code
            <input
              value={game.designCode}
              onChange={(e) => patch((g) => ({ ...g, designCode: e.target.value }))}
            />
          </label>
          <label className="field">
            Next step button label
            <input
              value={game.foundation.navigation.nextStepButtonLabel ?? "Next Activity"}
              onChange={(e) =>
                patch((g) => ({
                  ...g,
                  foundation: {
                    ...g.foundation,
                    navigation: {
                      ...g.foundation.navigation,
                      nextStepButtonLabel: e.target.value,
                    },
                  },
                }))
              }
            />
          </label>
        </div>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Tracking and reporting settings are configured in Measurement &amp; Reporting below.
        </p>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Live: <code>{liveUrl}</code>
          {game.status !== "published" ? (
            <>
              <br />
              Draft preview: <code>{previewUrl}</code>
            </>
          ) : null}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Flow canvas</h3>
        <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
          Drag nodes to arrange. Logic nodes are passthrough stubs until Wave 4 branching ships.
        </p>
        <ExperienceFlowCanvas
          graph={game.graph}
          modules={modules}
          warnings={warnings}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onChange={handleGraphChange}
        />
        {selectedModuleNode ? (
          <ExperienceNodeOverridesPanel
            overrides={selectedModuleNode.overrides}
            onChange={(overrides) => patchNodeOverrides(selectedModuleNode.id, overrides)}
          />
        ) : null}
      </div>

      <DeploymentMeasurementPanel
        kind="flow"
        recordId={game.id}
        measurement={game.measurement}
        onMeasurementChange={(measurement) =>
          patch((g) => ({
            ...g,
            measurement,
            foundation: {
              ...g.foundation,
              trackingEnabled: measurement.trackingEnabled !== false,
              reportingEnabled: !!measurement.reporting?.enabled,
              requireConsentBeforeTrack: !!measurement.requireConsentBeforeTrack,
            },
          }))
        }
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Preview</h3>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Save first, then open preview in a new tab (uses draft preview token when unpublished).
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <a href={previewUrl} target="_blank" rel="noreferrer" className="btn">
            Open preview
          </a>
          {qrDataUrl ? (
            <div>
              <img src={qrDataUrl} alt="Preview QR code" width={160} height={160} />
              <p className="muted" style={{ fontSize: "0.75rem", margin: "4px 0 0" }}>
                Scan for mobile preview
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {err ? <p className="muted">{err}</p> : null}
      {msg ? <p className="muted">{msg}</p> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save(false)}>
          Save
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save(true)}>
          Save + Publish
        </button>
        <button type="button" className="btn" disabled={saving} onClick={() => void remove()}>
          Delete experience
        </button>
      </div>
    </div>
  );
}
