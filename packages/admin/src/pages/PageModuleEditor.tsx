import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PageModuleGameType, PageModuleRecord } from "@rngames/shared";
import { apiDelete, apiGet, apiSend } from "../api";
import { ComponentMetadataFields } from "../components/ComponentMetadataFields";

const META: Record<
  PageModuleGameType,
  { label: string; playSegment: string; html: string; listPath: string }
> = {
  landing: { label: "Landing page", playSegment: "landing", html: "landing.html", listPath: "landing" },
  form: { label: "Form", playSegment: "form", html: "form.html", listPath: "form" },
  certificate: { label: "Certificate", playSegment: "certificate", html: "certificate.html", listPath: "certificate" },
  consent: { label: "Consent", playSegment: "consent", html: "consent.html", listPath: "consent" },
  "email-signup": {
    label: "Email signup",
    playSegment: "email-signup",
    html: "email-signup.html",
    listPath: "email-signup",
  },
  redemption: { label: "Redemption", playSegment: "redemption", html: "redemption.html", listPath: "redemption" },
};

type Props = { gameType: PageModuleGameType };

export default function PageModuleEditor({ gameType }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const meta = META[gameType];
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<PageModuleRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const data = (await apiGet(`/api/wheels?id=${encodeURIComponent(id)}`)) as PageModuleRecord;
    if (data.gameType !== gameType) {
      navigate("/");
      return;
    }
    setDoc(data);
  }, [id, gameType, navigate]);

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : "Load failed"));
  }, [load]);

  useEffect(() => {
    if (!doc || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: `rngames-${gameType}-config`, config: doc },
      window.location.origin,
    );
  }, [doc, gameType]);

  function patch(fn: (d: PageModuleRecord) => PageModuleRecord) {
    setDoc((d) => (d ? fn(d) : d));
  }

  async function save() {
    if (!doc) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiSend("/api/wheels", "PUT", doc);
      setDoc(res.wheel as PageModuleRecord);
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
      setDoc(res.wheel as PageModuleRecord);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  }

  async function remove() {
    if (!doc || !confirm("Delete permanently?")) return;
    await apiDelete(`/api/wheels?id=${encodeURIComponent(doc.id)}`);
    navigate(`/library/${meta.listPath}`);
  }

  if (!doc) return <p className="muted">{err || "Loading…"}</p>;

  const publicUrl = `${window.location.origin}/${meta.playSegment}/${doc.slug}`;

  return (
    <div>
      <p style={{ margin: "0 0 16px" }}>
        <Link to="/">← Home</Link>
        {" · "}
        <Link to={`/library/${meta.listPath}`}>{meta.label}</Link>
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>{meta.label}</h2>
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
          <ComponentMetadataFields record={doc} onChange={(p) => patch((d) => ({ ...d, ...p }))} onArchive={() => void archive()} archiving={archiving} />
        </div>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Public: <code>{publicUrl}</code>
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Content</h3>
        <div className="grid2">
          <label className="field">
            Headline
            <input value={doc.headline} onChange={(e) => patch((d) => ({ ...d, headline: e.target.value }))} />
          </label>
          <label className="field">
            Background colour
            <input value={doc.backgroundHex} onChange={(e) => patch((d) => ({ ...d, backgroundHex: e.target.value }))} />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            Body
            <textarea
              rows={4}
              value={doc.body}
              onChange={(e) => patch((d) => ({ ...d, body: e.target.value }))}
            />
          </label>
          <label className="field">
            Primary button label
            <input
              value={doc.primaryCta.label}
              onChange={(e) =>
                patch((d) => ({ ...d, primaryCta: { ...d.primaryCta, label: e.target.value } }))
              }
            />
          </label>
          {(gameType === "landing" || gameType === "certificate") && (
            <label className="field">
              <span>
                <input
                  type="checkbox"
                  checked={doc.experienceAutoContinue}
                  onChange={(e) => patch((d) => ({ ...d, experienceAutoContinue: e.target.checked }))}
                />{" "}
                Auto-continue in experience (after delay)
              </span>
            </label>
          )}
        </div>

        {gameType === "form" && "fields" in doc ? (
          <div style={{ marginTop: 16 }}>
            <h4>Fields (v1 — edit JSON in blob for now)</h4>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Default: name + email. Full field editor arrives in Wave 2 refinement.
            </p>
            <p className="muted">{doc.fields.map((f) => f.label).join(", ")}</p>
          </div>
        ) : null}

        {gameType === "certificate" && "mergeFields" in doc ? (
          <div style={{ marginTop: 16 }}>
            <label className="field">
              Certificate background URL
              <input
                value={doc.certificateBackgroundUrl}
                onChange={(e) => patch((d) => ({ ...d, certificateBackgroundUrl: e.target.value }))}
              />
            </label>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Merge fields use session keys like <code>form.fieldValues.name</code>
            </p>
          </div>
        ) : null}

        {gameType === "redemption" && "redemptionCode" in doc ? (
          <label className="field" style={{ marginTop: 12 }}>
            Redemption code
            <input
              value={doc.redemptionCode}
              onChange={(e) => patch((d) => ({ ...d, redemptionCode: e.target.value }))}
            />
          </label>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Preview</h3>
        <iframe
          ref={iframeRef}
          title="Preview"
          src={`/play/${meta.html}?preview=1`}
          style={{ width: "100%", height: 480, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}
        />
      </div>

      {err ? <p className="muted">{err}</p> : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          Save
        </button>
        <button type="button" className="btn" onClick={() => window.open(publicUrl, "_blank")}>
          Open public URL
        </button>
        <button type="button" className="btn" onClick={() => void remove()}>
          Delete
        </button>
      </div>
    </div>
  );
}
