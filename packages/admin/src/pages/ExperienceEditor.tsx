import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ExperienceLinearStep, ExperienceRecord } from "@rngames/shared";
import { apiDelete, apiGet, apiSend } from "../api";
import { experiencePublicUrl } from "./homeShared";

type ModuleOption = {
  id: string;
  gameType?: string;
  slug: string;
  title: string;
};

function newStepId() {
  return `step-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export default function ExperienceEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<ExperienceRecord | null>(null);
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    const [expRes, wheelsRes] = await Promise.all([
      apiGet(`/api/experiences?id=${encodeURIComponent(id)}`),
      apiGet("/api/wheels"),
    ]);
    setGame(expRes.experience as ExperienceRecord);
    setModules(
      (wheelsRes.wheels || []).filter((w: ModuleOption & { archived?: boolean }) => !w.archived),
    );
  }, [id]);

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : "Load failed"));
  }, [load]);

  const moduleLabel = useMemo(() => {
    const map = new Map(modules.map((m) => [m.id, m]));
    return (step: ExperienceLinearStep) => {
      const m = map.get(step.moduleInstanceId);
      if (!m) return step.label || "— select component —";
      return `${m.title} (${m.gameType || "wheel"}) — /${m.slug}`;
    };
  }, [modules]);

  function patch(fn: (g: ExperienceRecord) => ExperienceRecord) {
    setGame((g) => (g ? fn(g) : g));
  }

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

  function addStep() {
    patch((g) => ({
      ...g,
      linearSteps: [
        ...g.linearSteps,
        { id: newStepId(), moduleInstanceId: "", moduleType: "spinning-wheel", label: "" },
      ],
    }));
  }

  function moveStep(index: number, dir: -1 | 1) {
    patch((g) => {
      const steps = [...g.linearSteps];
      const j = index + dir;
      if (j < 0 || j >= steps.length) return g;
      [steps[index], steps[j]] = [steps[j], steps[index]];
      return { ...g, linearSteps: steps };
    });
  }

  function updateStep(index: number, moduleId: string) {
    const mod = modules.find((m) => m.id === moduleId);
    patch((g) => {
      const steps = [...g.linearSteps];
      steps[index] = {
        ...steps[index],
        moduleInstanceId: moduleId,
        moduleType: mod?.gameType || "spinning-wheel",
        label: mod?.title || steps[index].label,
      };
      return { ...g, linearSteps: steps };
    });
  }

  if (!game) {
    return <p className="muted">{err || "Loading…"}</p>;
  }

  const previewUrl = experiencePublicUrl(game.slug, game.previewToken);
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Flow steps (linear)</h3>
          <button type="button" className="btn btn-primary" onClick={addStep}>
            Add step
          </button>
        </div>
        {game.linearSteps.length === 0 ? (
          <p className="muted">Add components in order. Visual node editor arrives in Wave 3.</p>
        ) : (
          <ol style={{ paddingLeft: 20 }}>
            {game.linearSteps.map((step, i) => (
              <li key={step.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <span style={{ minWidth: 24 }}>{i + 1}.</span>
                  <select
                    value={step.moduleInstanceId}
                    onChange={(e) => updateStep(i, e.target.value)}
                    style={{ minWidth: 280, flex: 1 }}
                  >
                    <option value="">— Select component —</option>
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.gameType || "spinning-wheel"}) — /{m.slug}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={i === game.linearSteps.length - 1}
                    onClick={() => moveStep(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      patch((g) => ({
                        ...g,
                        linearSteps: g.linearSteps.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
                <div className="muted" style={{ fontSize: "0.8rem", marginTop: 4 }}>
                  {moduleLabel(step)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Preview</h3>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Save first, then open preview in a new tab (uses draft preview token when unpublished).
        </p>
        <a href={previewUrl} target="_blank" rel="noreferrer" className="btn">
          Open preview
        </a>
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
