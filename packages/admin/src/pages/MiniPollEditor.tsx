import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { normalizeMiniPoll, type MiniPollRecord } from "@rngames/shared";
import { apiDelete, apiGet, apiSend, uploadFile } from "../api";
import { BgUploadRow } from "../components/BgUploadRow";
import { ComponentMetadataFields } from "../components/ComponentMetadataFields";
import { LiveSurfaceBrandingFields } from "../components/LiveSurfaceBrandingFields";

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

function publicUrl(slug: string) {
  return `${siteUrl}/mini-poll/${encodeURIComponent(slug)}`;
}

const POLL_PHASES = [
  { id: "idle", label: "Ready" },
  { id: "open", label: "Voting open" },
  { id: "tallying", label: "Results incoming" },
  { id: "revealed", label: "Revealed" },
] as const;

export default function MiniPollEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<MiniPollRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [previewSurface, setPreviewSurface] = useState<"presenter" | "phone">("presenter");
  const [previewPhase, setPreviewPhase] = useState<(typeof POLL_PHASES)[number]["id"]>("open");

  const patch = (fn: (d: MiniPollRecord) => MiniPollRecord) => setDoc((d) => (d ? fn(d) : d));

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
      if (data.gameType !== "mini-poll") {
        navigate("/");
        return;
      }
      setDoc(normalizeMiniPoll(data as MiniPollRecord));
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
        kind: "mini-poll",
        config: normalizeMiniPoll(doc),
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
      if (res?.wheel) setDoc(normalizeMiniPoll(res.wheel as MiniPollRecord));
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
      setDoc(normalizeMiniPoll(res.wheel as MiniPollRecord));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  }

  async function remove() {
    if (!doc || !confirm("Delete permanently?")) return;
    await apiDelete(`/api/wheels?id=${encodeURIComponent(doc.id)}`);
    navigate("/library/mini-poll");
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
        <Link to="/library/mini-poll">Mini polls</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>Edit mini poll</h2>
      <p className="muted">Two options. Use text, image, or both — including mixed. Designed for interactive Flows.</p>
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
          <h3 style={{ marginTop: 0 }}>Question</h3>
          <label className="field">
            Question text
            <input value={doc.question} onChange={(e) => patch((d) => ({ ...d, question: e.target.value }))} />
          </label>
          <label className="field">
            Reveal duration (ms)
            <input
              type="number"
              value={doc.revealDurationMs}
              onChange={(e) => patch((d) => ({ ...d, revealDurationMs: Number(e.target.value) }))}
            />
          </label>
          {doc.options.map((opt, i) => (
            <div key={opt.id} className="card" style={{ marginTop: 12 }}>
              <strong>Option {i === 0 ? "A" : "B"}</strong>
              <label className="field">
                Label
                <input
                  value={opt.label}
                  onChange={(e) =>
                    patch((d) => {
                      const options = [...d.options] as MiniPollRecord["options"];
                      options[i] = { ...options[i], label: e.target.value };
                      return { ...d, options };
                    })
                  }
                />
              </label>
              <label className="field">
                Accessible label (required for image-only)
                <input
                  value={opt.accessibleLabel}
                  onChange={(e) =>
                    patch((d) => {
                      const options = [...d.options] as MiniPollRecord["options"];
                      options[i] = { ...options[i], accessibleLabel: e.target.value };
                      return { ...d, options };
                    })
                  }
                />
              </label>
              <BgUploadRow
                label="Optional image"
                hint="Leave empty for text-only. Image without label uses the accessible label."
                value={opt.imageUrl}
                onUploaded={(url) =>
                  patch((d) => {
                    const options = [...d.options] as MiniPollRecord["options"];
                    options[i] = { ...options[i], imageUrl: url };
                    return { ...d, options };
                  })
                }
              />
            </div>
          ))}
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
                onChange={(e) => setPreviewPhase(e.target.value as (typeof POLL_PHASES)[number]["id"])}
              >
                {POLL_PHASES.map((p) => (
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
          Unsaved changes stay in this iframe. Preview never starts a live run, records votes, or changes an event.
        </p>
        <iframe
          ref={iframeRef}
          title="Mini poll preview"
          src={`/play/live-preview.html?preview=1&kind=mini-poll`}
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
