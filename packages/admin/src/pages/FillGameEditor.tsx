import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { newMiniQuizId, normalizeFillGame, type FillGameRecord } from "@rngames/shared";
import { apiDelete, apiGet, apiSend, uploadFile } from "../api";
import { BgUploadRow } from "../components/BgUploadRow";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { ComponentMetadataFields } from "../components/ComponentMetadataFields";
import { HexField } from "../components/HexField";
import { LiveSurfaceBrandingFields } from "../components/LiveSurfaceBrandingFields";

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

function publicUrl(slug: string) {
  return `${siteUrl}/fill-game/${encodeURIComponent(slug)}`;
}

const FILL_PHASES = [
  { id: "idle", label: "Ready" },
  { id: "racing", label: "In progress" },
  { id: "finished", label: "Winner" },
] as const;

export default function FillGameEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<FillGameRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [previewSurface, setPreviewSurface] = useState<"presenter" | "phone">("presenter");
  const [previewPhase, setPreviewPhase] = useState<(typeof FILL_PHASES)[number]["id"]>("racing");

  const patch = (fn: (d: FillGameRecord) => FillGameRecord) => setDoc((d) => (d ? fn(d) : d));

  async function uploadFont(role: "heading" | "body" | "button", file: File) {
    const { url } = await uploadFile(file);
    const family = file.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-") || "CustomFont";
    const stack = `'${family}', system-ui, sans-serif`;
    patch((d) => ({
      ...d,
      branding: {
        ...d.branding,
        fontUploads: { ...d.branding.fontUploads, [role]: { url, family } },
        headingFont: role === "heading" ? stack : d.branding.headingFont,
        bodyFont: role === "body" ? stack : d.branding.bodyFont,
        buttonFont: role === "button" ? stack : d.branding.buttonFont,
      },
    }));
  }

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = await apiGet(`/api/wheels?id=${encodeURIComponent(id)}`);
      if (data.gameType !== "fill-game") {
        navigate("/");
        return;
      }
      setDoc(normalizeFillGame(data as FillGameRecord));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const pushPreview = useCallback(() => {
    if (!doc || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      {
        type: "rngames-live-component-config",
        kind: "fill-game",
        config: normalizeFillGame(doc),
        surface: previewSurface,
        previewPhase,
      },
      window.location.origin,
    );
  }, [doc, previewSurface, previewPhase]);

  useEffect(() => {
    if (!doc) return;
    const t = window.setTimeout(() => pushPreview(), 80);
    return () => window.clearTimeout(t);
  }, [doc, pushPreview]);

  async function save() {
    if (!doc) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiSend("/api/wheels", "PUT", { ...doc, updatedAt: new Date().toISOString() });
      if (res?.wheel) setDoc(normalizeFillGame(res.wheel as FillGameRecord));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!doc || !confirm("Archive this component? It will be hidden from new experience steps.")) return;
    setArchiving(true);
    try {
      const res = await apiSend("/api/wheels", "PUT", { ...doc, archived: true });
      setDoc(normalizeFillGame(res.wheel as FillGameRecord));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  }

  async function remove() {
    if (!doc || !confirm("Delete permanently?")) return;
    await apiDelete(`/api/wheels?id=${encodeURIComponent(doc.id)}`);
    navigate("/library/fill-game");
  }

  if (!doc) {
    return (
      <div>
        {err ? (
          <>
            <p className="muted">{err}</p>
            <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => void load()}>
              Retry
            </button>
          </>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p style={{ margin: "0 0 8px" }}>
        <Link to="/">← Studio</Link>
        {" · "}
        <Link to="/library/fill-game">Fill games</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>Edit fill game</h2>
      <p className="muted">Two teams, a replaceable fill mask, and a question bank. Not tied to a brand silhouette.</p>
      {err ? <p className="muted">{err}</p> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Component details</h3>
        <div className="grid2">
          <label className="field">
            Title
            <input value={doc.title} onChange={(e) => patch((d) => ({ ...d, title: e.target.value }))} />
          </label>
          <label className="field">
            Client
            <input value={doc.clientName} onChange={(e) => patch((d) => ({ ...d, clientName: e.target.value }))} />
          </label>
          <label className="field">
            Sub-URL (slug)
            <input
              value={doc.slug}
              onChange={(e) => patch((d) => ({ ...d, slug: e.target.value.trim().toLowerCase() }))}
            />
          </label>
          <ComponentMetadataFields
            record={doc}
            onChange={(p) => patch((d) => ({ ...d, ...p }))}
            onArchive={() => void archive()}
            archiving={archiving}
          />
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Public URL: <code>{publicUrl(doc.slug)}</code>
        </p>
        <label className="field" style={{ marginTop: 12 }}>
          Tab icon (favicon)
        </label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon,.ico"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            patch((d) => ({ ...d, faviconUrl: url }));
          }}
        />
        {doc.faviconUrl ? <span className="muted"> ✓</span> : null}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={doc.showPoweredBy !== false}
            onChange={(e) => patch((d) => ({ ...d, showPoweredBy: e.target.checked }))}
          />
          Show “Powered by Real Nation” on the public page
        </label>
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Teams & meter</h3>
          <label className="field">
            Progress display
            <select
              value={doc.metric}
              onChange={(e) => patch((d) => ({ ...d, metric: e.target.value as FillGameRecord["metric"] }))}
            >
              <option value="count">Count (N/N)</option>
              <option value="percent">Percentage</option>
            </select>
          </label>
          {doc.teams.map((team, i) => (
            <div key={team.id} className="grid2" style={{ marginTop: 12 }}>
              <label className="field">
                Team {i + 1} name
                <input
                  value={team.name}
                  onChange={(e) =>
                    patch((d) => {
                      const teams = [...d.teams] as FillGameRecord["teams"];
                      teams[i] = { ...teams[i], name: e.target.value };
                      return { ...d, teams };
                    })
                  }
                />
              </label>
              <label className="field">
                Target
                <input
                  type="number"
                  value={team.target}
                  onChange={(e) =>
                    patch((d) => {
                      const teams = [...d.teams] as FillGameRecord["teams"];
                      teams[i] = { ...teams[i], target: Number(e.target.value) };
                      return { ...d, teams };
                    })
                  }
                />
              </label>
              <HexField
                label="Team colour"
                value={team.colorHex}
                onChange={(v) =>
                  patch((d) => {
                    const teams = [...d.teams] as FillGameRecord["teams"];
                    teams[i] = { ...teams[i], colorHex: v };
                    return { ...d, teams };
                  })
                }
              />
              <HexField
                label="Fill colour"
                value={team.fillHex}
                onChange={(v) =>
                  patch((d) => {
                    const teams = [...d.teams] as FillGameRecord["teams"];
                    teams[i] = { ...teams[i], fillHex: v };
                    return { ...d, teams };
                  })
                }
              />
            </div>
          ))}
          <BgUploadRow
            label="Fill mask / matte"
            hint="Silhouette used as a CSS mask on the same 3∶4 artboard as the overlay. Not a brand-specific keg."
            value={doc.maskUrl}
            onUploaded={(url) => patch((d) => ({ ...d, maskUrl: url }))}
          />
          <BgUploadRow
            label="Optional overlay"
            hint="Drawn over the masked liquid on the same canvas and transform. Leave empty for a plain meter."
            value={doc.foregroundUrl}
            onUploaded={(url) => patch((d) => ({ ...d, foregroundUrl: url }))}
          />
          <CollapsibleSection title="Fill window" summary="Liquid bounds as % of the artboard">
            <p className="muted" style={{ fontSize: "0.82rem", margin: "0 0 8px" }}>
              0, 0, 100, 100 fills the whole meter. Zero X/Y is valid and is stored. Use this window so 0–100%
              matches the usable silhouette, not the full artboard.
            </p>
            <div className="grid2">
              <label className="field">
                Window X %
                <input
                  type="number"
                  value={doc.maskPlacement.xPercent}
                  onChange={(e) =>
                    patch((d) => ({ ...d, maskPlacement: { ...d.maskPlacement, xPercent: Number(e.target.value) } }))
                  }
                />
              </label>
              <label className="field">
                Window Y %
                <input
                  type="number"
                  value={doc.maskPlacement.yPercent}
                  onChange={(e) =>
                    patch((d) => ({ ...d, maskPlacement: { ...d.maskPlacement, yPercent: Number(e.target.value) } }))
                  }
                />
              </label>
              <label className="field">
                Window W %
                <input
                  type="number"
                  value={doc.maskPlacement.widthPercent}
                  onChange={(e) =>
                    patch((d) => ({
                      ...d,
                      maskPlacement: { ...d.maskPlacement, widthPercent: Number(e.target.value) },
                    }))
                  }
                />
              </label>
              <label className="field">
                Window H %
                <input
                  type="number"
                  value={doc.maskPlacement.heightPercent}
                  onChange={(e) =>
                    patch((d) => ({
                      ...d,
                      maskPlacement: { ...d.maskPlacement, heightPercent: Number(e.target.value) },
                    }))
                  }
                />
              </label>
            </div>
          </CollapsibleSection>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Typography & colours</h3>
          <LiveSurfaceBrandingFields
            branding={doc.branding}
            onChange={(branding) => patch((d) => ({ ...d, branding }))}
            onUploadFont={(role, file) => void uploadFont(role, file)}
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Question bank</h3>
          <button
            type="button"
            className="btn"
            onClick={() =>
              patch((d) => {
                const a = newMiniQuizId();
                const b = newMiniQuizId();
                return {
                  ...d,
                  questions: d.questions.concat({
                    id: newMiniQuizId(),
                    prompt: "New question?",
                    choices: [
                      { id: a, label: "Correct" },
                      { id: b, label: "Incorrect" },
                    ],
                    correctChoiceId: a,
                  }),
                };
              })
            }
          >
            Add question
          </button>
        </div>
        {doc.questions.map((q, qi) => (
          <div key={q.id} className="card" style={{ marginTop: 8 }}>
            <label className="field">
              Prompt
              <input
                value={q.prompt}
                onChange={(e) =>
                  patch((d) => {
                    const questions = d.questions.map((x, i) => (i === qi ? { ...x, prompt: e.target.value } : x));
                    return { ...d, questions };
                  })
                }
              />
            </label>
            {q.choices.map((c, ci) => (
              <label key={c.id} className="field">
                <input
                  type="radio"
                  name={`correct-${q.id}`}
                  checked={q.correctChoiceId === c.id}
                  onChange={() =>
                    patch((d) => {
                      const questions = d.questions.map((x, i) => (i === qi ? { ...x, correctChoiceId: c.id } : x));
                      return { ...d, questions };
                    })
                  }
                />{" "}
                Correct
                <input
                  value={c.label}
                  onChange={(e) =>
                    patch((d) => {
                      const questions = d.questions.map((x, i) =>
                        i === qi
                          ? { ...x, choices: x.choices.map((ch, j) => (j === ci ? { ...ch, label: e.target.value } : ch)) }
                          : x,
                      );
                      return { ...d, questions };
                    })
                  }
                />
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Preview</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <label className="field" style={{ margin: 0 }}>
              Surface
              <select
                value={previewSurface}
                onChange={(e) => setPreviewSurface(e.target.value as "presenter" | "phone")}
              >
                <option value="presenter">Presenter</option>
                <option value="phone">Phone</option>
              </select>
            </label>
            <label className="field" style={{ margin: 0 }}>
              State
              <select
                value={previewPhase}
                onChange={(e) => setPreviewPhase(e.target.value as (typeof FILL_PHASES)[number]["id"])}
              >
                {FILL_PHASES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn" onClick={() => pushPreview()}>
              Refresh preview
            </button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          Unsaved changes stay in this iframe. Preview never starts a live run, scores answers, or changes an event.
        </p>
        <iframe
          ref={iframeRef}
          title="Fill game preview"
          src={`/play/live-preview.html?preview=1&kind=fill-game`}
          onLoad={() => pushPreview()}
          style={{ width: "100%", height: 520, border: "1px solid var(--rn-border)", borderRadius: 8 }}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn" onClick={() => void remove()}>
          Delete
        </button>
      </div>
    </div>
  );
}
