import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import html2canvas from "html2canvas";
import {
  normalizePageModule,
  type ConsentRecord,
  type LandingRecord,
  type PageModuleGameType,
  type PageModuleRecord,
} from "@rngames/shared";
import { apiDelete, apiGet, apiSend, uploadFile } from "../api";
import { BgUploadRow } from "../components/BgUploadRow";
import { CertificateEditorFields } from "../components/CertificateEditorFields";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { ComponentMetadataFields } from "../components/ComponentMetadataFields";
import { FormFieldsEditor } from "../components/FormFieldsEditor";
import { HexField } from "../components/HexField";
import { LandingBlocksEditor } from "../components/LandingBlocksEditor";

const META: Record<
  Exclude<PageModuleGameType, "mini-quiz">,
  { label: string; playSegment: string; html: string; listPath: string; editTitle: string }
> = {
  landing: { label: "Landing page", playSegment: "landing", html: "landing.html", listPath: "landing", editTitle: "Edit landing page" },
  form: { label: "Form", playSegment: "form", html: "form.html", listPath: "form", editTitle: "Edit form" },
  certificate: { label: "Certificate", playSegment: "certificate", html: "certificate.html", listPath: "certificate", editTitle: "Edit certificate" },
  badge: { label: "Badge", playSegment: "badge", html: "badge.html", listPath: "badge", editTitle: "Edit badge" },
  consent: { label: "Consent", playSegment: "consent", html: "consent.html", listPath: "consent", editTitle: "Edit consent" },
  "email-signup": {
    label: "Email signup",
    playSegment: "email-signup",
    html: "email-signup.html",
    listPath: "email-signup",
    editTitle: "Edit email signup",
  },
  redemption: { label: "Redemption", playSegment: "redemption", html: "redemption.html", listPath: "redemption", editTitle: "Edit redemption" },
};

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

type Props = { gameType: Exclude<PageModuleGameType, "mini-quiz"> };

function publicUrl(segment: string, slug: string) {
  return `${siteUrl}/${segment}/${encodeURIComponent(slug)}`;
}

function getPageThumbnailOptions(iframe: HTMLIFrameElement) {
  const idoc = iframe.contentDocument;
  const idwin = iframe.contentWindow;
  if (!idoc || !idwin) return { useCORS: true, allowTaint: false, logging: false };
  const html = idoc.documentElement;
  const bgSolid = idwin.getComputedStyle(html).getPropertyValue("--page-bg").trim() || "#0a1628";
  const bgImage = idwin.getComputedStyle(html).getPropertyValue("--page-bg-image").trim();
  return {
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: bgSolid,
    onclone: (doc: Document) => {
      const app = doc.getElementById("page-app");
      const cloneHtml = doc.documentElement;
      if (app) {
        (app as HTMLElement).style.backgroundColor = bgSolid;
        if (bgImage && bgImage !== "none") {
          (app as HTMLElement).style.backgroundImage = bgImage;
          (app as HTMLElement).style.backgroundSize = "cover";
          (app as HTMLElement).style.backgroundPosition = "center";
          (app as HTMLElement).style.backgroundRepeat = "no-repeat";
        }
      }
      cloneHtml.style.background = bgSolid;
    },
  };
}

export default function PageModuleEditor({ gameType }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const meta = META[gameType];
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<PageModuleRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const patch = (fn: (d: PageModuleRecord) => PageModuleRecord) => setDoc((d) => (d ? fn(d) : d));

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = await apiGet(`/api/wheels?id=${encodeURIComponent(id)}`);
      if (data.gameType !== gameType) {
        navigate("/");
        return;
      }
      setDoc(normalizePageModule(data as PageModuleRecord));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, [id, gameType, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const pushPreview = useCallback(() => {
    if (!doc || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: `rngames-${gameType}-config`, config: normalizePageModule(doc) },
      window.location.origin,
    );
  }, [doc, gameType]);

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
      if (res?.wheel) setDoc(normalizePageModule(res.wheel as PageModuleRecord));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveWithThumbnail() {
    if (!doc) return;
    await save();
    pushPreview();
    await new Promise((r) => setTimeout(r, 500));
    const iframe = iframeRef.current;
    const stage = iframe?.contentDocument?.getElementById("page-app");
    if (!stage || !doc) return;
    try {
      const canvas = await html2canvas(stage, { scale: 0.5, ...getPageThumbnailOptions(iframe) });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
      if (!blob) return;
      const file = new File([blob], `thumb-${doc.id}.jpg`, { type: "image/jpeg" });
      const { url } = await uploadFile(file);
      const res = await apiSend("/api/wheels", "PUT", { ...doc, thumbnailUrl: url });
      if (res?.wheel) setDoc(normalizePageModule(res.wheel as PageModuleRecord));
    } catch {
      /* optional */
    }
  }

  async function archive() {
    if (!doc || !confirm("Archive this component? It will be hidden from new experience steps.")) return;
    setArchiving(true);
    try {
      const res = await apiSend("/api/wheels", "PUT", { ...doc, archived: true });
      setDoc(normalizePageModule(res.wheel as PageModuleRecord));
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

  async function uploadFont(role: "heading" | "body" | "button", file: File) {
    const { url } = await uploadFile(file);
    const family = `Page${role}${Date.now().toString(36)}`;
    patch((d) => ({
      ...d,
      typography: {
        ...d.typography,
        fontUploads: { ...d.typography.fontUploads, [role]: { url, family } },
        fonts: { ...d.typography.fonts, [role]: `'${family}', system-ui, sans-serif` },
      },
    }));
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

  const embedCode = `<iframe src="${siteUrl}/play/${meta.html}?slug=${encodeURIComponent(doc.slug)}" title="${(doc.title || meta.label).replace(/"/g, "&quot;")}" style="border:0;width:100%;height:min(92dvh,720px);display:block;" loading="lazy"></iframe>`;

  return (
    <div>
      <p style={{ margin: "0 0 8px" }}>
        <Link to="/">← Studio</Link>
        {" · "}
        <Link to={`/library/${meta.listPath}`}>{meta.label}</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>{meta.editTitle}</h2>
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
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={doc.reportingEnabled}
            onChange={(e) => patch((d) => ({ ...d, reportingEnabled: e.target.checked }))}
          />
          Enable reporting
        </label>
        <p className="muted" style={{ marginTop: 8 }}>
          Public URL: <code>{publicUrl(meta.playSegment, doc.slug)}</code>
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
          <h3 style={{ marginTop: 0 }}>Page background</h3>
          <HexField label="Background colour" value={doc.backgroundHex} onChange={(v) => patch((d) => ({ ...d, backgroundHex: v }))} />
          <label className="field">
            Background behaviour
            <select
              value={doc.backgroundMode || "fixed"}
              onChange={(e) => patch((d) => ({ ...d, backgroundMode: e.target.value as "fixed" | "scroll" }))}
            >
              <option value="fixed">Fixed — background stays, content scrolls</option>
              <option value="scroll">Scroll — background moves with page</option>
            </select>
          </label>
          <label className="field">Logo</label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patch((d) => ({ ...d, logoUrl: url }));
            }}
          />
          {doc.logoUrl ? <span className="muted"> ✓</span> : null}
          <label className="field" style={{ marginTop: 8 }}>
            Logo alignment
            <select
              value={doc.logoAlign || "center"}
              onChange={(e) => patch((d) => ({ ...d, logoAlign: e.target.value as "left" | "center" | "right" }))}
            >
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </select>
          </label>
          <CollapsibleSection title="Breakpoint backgrounds" summary="Desktop / tablet / mobile">
            <BgUploadRow
              label="Desktop"
              hint="Shown at 1024px and wider."
              value={doc.backgrounds.desktop || ""}
              onUploaded={(url) => patch((d) => ({ ...d, backgrounds: { ...d.backgrounds, desktop: url } }))}
            />
            <BgUploadRow
              label="Tablet"
              hint="768px – 1023px."
              value={doc.backgrounds.tablet || ""}
              onUploaded={(url) => patch((d) => ({ ...d, backgrounds: { ...d.backgrounds, tablet: url } }))}
            />
            <BgUploadRow
              label="Mobile"
              hint="Below 768px."
              value={doc.backgrounds.mobile || ""}
              onUploaded={(url) => patch((d) => ({ ...d, backgrounds: { ...d.backgrounds, mobile: url } }))}
            />
          </CollapsibleSection>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Typography & colours</h3>
          <HexField
            label="Default headline colour"
            value={doc.typography.headlineHex}
            onChange={(v) => patch((d) => ({ ...d, typography: { ...d.typography, headlineHex: v } }))}
          />
          <HexField
            label="Default body colour"
            value={doc.typography.bodyHex}
            onChange={(v) => patch((d) => ({ ...d, typography: { ...d.typography, bodyHex: v } }))}
          />
          {gameType === "consent" ? (
            <>
              <HexField
                label="Intro / subhead colour"
                value={doc.typography.subheadHex || doc.typography.bodyHex}
                onChange={(v) => patch((d) => ({ ...d, typography: { ...d.typography, subheadHex: v } }))}
              />
              <HexField
                label="Checkbox label colour"
                value={doc.typography.labelHex || doc.typography.bodyHex}
                onChange={(v) => patch((d) => ({ ...d, typography: { ...d.typography, labelHex: v } }))}
              />
            </>
          ) : null}
          <CollapsibleSection title="Custom fonts" summary="Heading, body, button">
            {(["heading", "body", "button"] as const).map((role) => (
              <div key={role} style={{ marginTop: 10 }}>
                <label className="field">{role.charAt(0).toUpperCase() + role.slice(1)} font</label>
                <input
                  type="file"
                  accept=".woff,.woff2,.ttf,.otf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadFont(role, f);
                  }}
                />
                {doc.typography.fontUploads?.[role]?.url ? <span className="muted"> ✓</span> : null}
              </div>
            ))}
          </CollapsibleSection>
          <HexField
            label="Default button background"
            value={doc.primaryCta.backgroundHex}
            onChange={(v) => patch((d) => ({ ...d, primaryCta: { ...d.primaryCta, backgroundHex: v } }))}
          />
          <HexField
            label="Default button text"
            value={doc.primaryCta.textHex}
            onChange={(v) => patch((d) => ({ ...d, primaryCta: { ...d.primaryCta, textHex: v } }))}
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Experience flow</h3>
          {(gameType === "landing" || gameType === "certificate" || gameType === "badge") && (
            <>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={doc.experienceAutoContinue}
                  onChange={(e) => patch((d) => ({ ...d, experienceAutoContinue: e.target.checked }))}
                />
                Auto-continue in experience
              </label>
              <label className="field" style={{ marginTop: 12 }}>
                Auto-continue delay (ms)
                <input
                  type="number"
                  min={500}
                  value={doc.experienceAutoContinueDelayMs}
                  onChange={(e) => patch((d) => ({ ...d, experienceAutoContinueDelayMs: Number(e.target.value) || 0 }))}
                />
              </label>
            </>
          )}
          {gameType !== "landing" && gameType !== "certificate" && gameType !== "badge" && (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              User must complete this step (submit form, accept consent, etc.) before continuing.
            </p>
          )}
        </div>
      </div>

      {gameType === "landing" && doc.gameType === "landing" ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Page blocks</h3>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Build your landing page with blocks — text, images, galleries, video, buttons, and more. Reorder with ↑ ↓.
          </p>
          <LandingBlocksEditor
            doc={doc as LandingRecord}
            onChange={(blocks) => patch((d) => (d.gameType === "landing" ? { ...d, blocks } : d))}
            onPageSettings={(p) =>
              patch((d) => (d.gameType === "landing" ? { ...d, pageSettings: { ...d.pageSettings, ...p } } : d))
            }
          />
        </div>
      ) : null}

      {gameType !== "landing" ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Content</h3>
          <div className="grid2">
            <label className="field">
              Headline
              <input value={doc.headline} onChange={(e) => patch((d) => ({ ...d, headline: e.target.value }))} />
            </label>
            {gameType !== "consent" ? (
              <label className="field" style={{ gridColumn: gameType === "form" || gameType === "email-signup" ? "1 / -1" : undefined }}>
                {gameType === "redemption" ? "Instructions" : "Intro / body"}
                <textarea
                  rows={3}
                  value={gameType === "redemption" && "instructions" in doc ? doc.instructions : doc.body}
                  onChange={(e) =>
                    patch((d) =>
                      d.gameType === "redemption" ? { ...d, instructions: e.target.value } : { ...d, body: e.target.value },
                    )
                  }
                />
              </label>
            ) : null}
          </div>

          {gameType === "form" && doc.gameType === "form" ? (
            <>
              <label className="field" style={{ marginTop: 12 }}>
                Submit button label
                <input
                  value={doc.submitLabel}
                  onChange={(e) => patch((d) => (d.gameType === "form" ? { ...d, submitLabel: e.target.value } : d))}
                />
              </label>
              <h4 style={{ marginTop: 20 }}>Form fields</h4>
              <FormFieldsEditor
                fields={doc.fields}
                onChange={(fields) => patch((d) => (d.gameType === "form" ? { ...d, fields } : d))}
              />
              <CollapsibleSection title="Post-submit screen" summary={doc.postSubmit.enabled ? "Enabled" : "Off"}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={doc.postSubmit.enabled}
                    onChange={(e) =>
                      patch((d) =>
                        d.gameType === "form" ? { ...d, postSubmit: { ...d.postSubmit, enabled: e.target.checked } } : d,
                      )
                    }
                  />
                  Show thank-you screen after submit
                </label>
                <label className="field" style={{ marginTop: 8 }}>
                  Logo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f || doc.gameType !== "form") return;
                      const { url } = await uploadFile(f);
                      patch((d) => (d.gameType === "form" ? { ...d, postSubmit: { ...d.postSubmit, logoUrl: url } } : d));
                    }}
                  />
                  {doc.postSubmit.logoUrl ? <span className="muted"> ✓</span> : null}
                </label>
                <label className="field">
                  Headline
                  <input
                    value={doc.postSubmit.headline}
                    onChange={(e) =>
                      patch((d) => (d.gameType === "form" ? { ...d, postSubmit: { ...d.postSubmit, headline: e.target.value } } : d))
                    }
                  />
                </label>
                <label className="field">
                  Body
                  <textarea
                    rows={3}
                    value={doc.postSubmit.body}
                    onChange={(e) =>
                      patch((d) => (d.gameType === "form" ? { ...d, postSubmit: { ...d.postSubmit, body: e.target.value } } : d))
                    }
                  />
                </label>
                <label className="field">
                  Button label (blank = experience continue)
                  <input
                    value={doc.postSubmit.buttonLabel}
                    onChange={(e) =>
                      patch((d) =>
                        d.gameType === "form" ? { ...d, postSubmit: { ...d.postSubmit, buttonLabel: e.target.value } } : d,
                      )
                    }
                  />
                </label>
              </CollapsibleSection>
            </>
          ) : null}

          {gameType === "certificate" && doc.gameType === "certificate" ? (
            <CertificateEditorFields
              mergeFields={doc.mergeFields}
              onChange={(mergeFields) => patch((d) => (d.gameType === "certificate" ? { ...d, mergeFields } : d))}
              backgroundUrl={doc.certificateBackgroundUrl}
              onBackground={(url) => patch((d) => (d.gameType === "certificate" ? { ...d, certificateBackgroundUrl: url } : d))}
              canvasWidth={doc.canvasWidth}
              canvasHeight={doc.canvasHeight}
              onCanvas={(w, h) => patch((d) => (d.gameType === "certificate" ? { ...d, canvasWidth: w, canvasHeight: h } : d))}
              downloadLabel={doc.downloadLabel}
              onDownloadLabel={(v) => patch((d) => (d.gameType === "certificate" ? { ...d, downloadLabel: v } : d))}
            />
          ) : null}

          {gameType === "badge" && doc.gameType === "badge" ? (
            <CertificateEditorFields
              mergeFields={doc.mergeFields}
              onChange={(mergeFields) => patch((d) => (d.gameType === "badge" ? { ...d, mergeFields } : d))}
              backgroundUrl={doc.badgeBackgroundUrl}
              onBackground={(url) => patch((d) => (d.gameType === "badge" ? { ...d, badgeBackgroundUrl: url } : d))}
              canvasWidth={doc.canvasWidth}
              canvasHeight={doc.canvasHeight}
              onCanvas={(w, h) => patch((d) => (d.gameType === "badge" ? { ...d, canvasWidth: w, canvasHeight: h } : d))}
              downloadLabel={doc.downloadLabel}
              onDownloadLabel={(v) => patch((d) => (d.gameType === "badge" ? { ...d, downloadLabel: v } : d))}
              backgroundLabel="Badge artwork"
              backgroundHint="Upload the badge artwork (PNG). Merge fields are positioned as percentages over this image."
            />
          ) : null}

          {gameType === "consent" && doc.gameType === "consent" ? (
            <ConsentEditor doc={doc} patch={patch} />
          ) : null}

          {gameType === "email-signup" && doc.gameType === "email-signup" ? (
            <div className="grid2" style={{ marginTop: 12 }}>
              <label className="field">
                Name label
                <input value={doc.nameLabel} onChange={(e) => patch((d) => (d.gameType === "email-signup" ? { ...d, nameLabel: e.target.value } : d))} />
              </label>
              <label className="field">
                Email label
                <input value={doc.emailLabel} onChange={(e) => patch((d) => (d.gameType === "email-signup" ? { ...d, emailLabel: e.target.value } : d))} />
              </label>
              <label className="field">
                Submit label
                <input value={doc.submitLabel} onChange={(e) => patch((d) => (d.gameType === "email-signup" ? { ...d, submitLabel: e.target.value } : d))} />
              </label>
              <label className="field">
                Thank-you message
                <input value={doc.thankYouMessage} onChange={(e) => patch((d) => (d.gameType === "email-signup" ? { ...d, thankYouMessage: e.target.value } : d))} />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                Consent text (optional)
                <textarea
                  rows={2}
                  value={doc.consentText}
                  onChange={(e) => patch((d) => (d.gameType === "email-signup" ? { ...d, consentText: e.target.value } : d))}
                />
              </label>
              <label className="field">
                Privacy policy URL
                <input value={doc.consentGdprUrl} onChange={(e) => patch((d) => (d.gameType === "email-signup" ? { ...d, consentGdprUrl: e.target.value } : d))} />
              </label>
              <label className="field">
                Privacy link label
                <input
                  value={doc.consentGdprLinkLabel}
                  onChange={(e) => patch((d) => (d.gameType === "email-signup" ? { ...d, consentGdprLinkLabel: e.target.value } : d))}
                />
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", gridColumn: "1 / -1" }}>
                <input
                  type="checkbox"
                  checked={doc.consentRequired}
                  onChange={(e) => patch((d) => (d.gameType === "email-signup" ? { ...d, consentRequired: e.target.checked } : d))}
                />
                Consent checkbox required
              </label>
            </div>
          ) : null}

          {gameType === "redemption" && doc.gameType === "redemption" ? (
            <div className="grid2" style={{ marginTop: 12 }}>
              <label className="field">
                Code label
                <input value={doc.codeLabel} onChange={(e) => patch((d) => (d.gameType === "redemption" ? { ...d, codeLabel: e.target.value } : d))} />
              </label>
              <label className="field">
                Redemption code
                <input value={doc.redemptionCode} onChange={(e) => patch((d) => (d.gameType === "redemption" ? { ...d, redemptionCode: e.target.value } : d))} />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Live preview</h3>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Preview updates as you edit. Use Refresh if the iframe gets out of sync.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" onClick={pushPreview}>
            Refresh preview
          </button>
          <button type="button" className="btn" onClick={() => window.open(publicUrl(meta.playSegment, doc.slug), "_blank")}>
            Open public URL
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title="Preview"
          src={`/play/${meta.html}?preview=1`}
          onLoad={() => pushPreview()}
          style={{ width: "100%", minHeight: "min(520px, 70vh)", border: "1px solid var(--rn-border)", borderRadius: 8 }}
        />
        <label className="field" style={{ marginTop: 12 }}>
          Embed code
          <textarea readOnly rows={3} value={embedCode} onFocus={(e) => e.target.select()} />
        </label>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          Save
        </button>
        <button type="button" className="btn" disabled={saving} onClick={() => void saveWithThumbnail()}>
          Save + thumbnail
        </button>
        <button type="button" className="btn btn-danger" onClick={() => void remove()}>
          Delete
        </button>
      </div>
    </div>
  );
}

function ConsentEditor({
  doc,
  patch,
}: {
  doc: ConsentRecord;
  patch: (fn: (d: PageModuleRecord) => PageModuleRecord) => void;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <label className="field">
        Headline
        <input value={doc.headline} onChange={(e) => patch((d) => (d.gameType === "consent" ? { ...d, headline: e.target.value } : d))} />
      </label>
      <label className="field" style={{ marginTop: 12 }}>
        Intro text
        <textarea
          rows={3}
          value={doc.introText}
          onChange={(e) => patch((d) => (d.gameType === "consent" ? { ...d, introText: e.target.value } : d))}
        />
      </label>
      <div className="grid2" style={{ marginTop: 12 }}>
        <label className="field">
          Privacy policy URL
          <input value={doc.gdprUrl} onChange={(e) => patch((d) => (d.gameType === "consent" ? { ...d, gdprUrl: e.target.value } : d))} />
        </label>
        <label className="field">
          Privacy link label
          <input value={doc.gdprLinkLabel} onChange={(e) => patch((d) => (d.gameType === "consent" ? { ...d, gdprLinkLabel: e.target.value } : d))} />
        </label>
      <label className="field">
        Accept button label
        <input value={doc.acceptLabel} onChange={(e) => patch((d) => (d.gameType === "consent" ? { ...d, acceptLabel: e.target.value } : d))} />
      </label>
      <label className="field">
        Checkbox column width (px)
        <input
          type="number"
          min={20}
          max={80}
          value={doc.checkboxColumnWidthPx}
          onChange={(e) => patch((d) => (d.gameType === "consent" ? { ...d, checkboxColumnWidthPx: Number(e.target.value) || 28 } : d))}
        />
      </label>
    </div>
      <h4 style={{ marginTop: 16 }}>Consent items</h4>
      {doc.items.map((item, i) => (
        <div key={item.id} style={{ border: "1px solid var(--rn-border)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <label className="field">
            Label
            <input
              value={item.label}
              onChange={(e) => {
                const items = [...doc.items];
                items[i] = { ...items[i], label: e.target.value };
                patch((d) => (d.gameType === "consent" ? { ...d, items } : d));
              }}
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <input
              type="checkbox"
              checked={!!item.required}
              onChange={(e) => {
                const items = [...doc.items];
                items[i] = { ...items[i], required: e.target.checked };
                patch((d) => (d.gameType === "consent" ? { ...d, items } : d));
              }}
            />
            Required
          </label>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 8 }}
            onClick={() => patch((d) => (d.gameType === "consent" ? { ...d, items: doc.items.filter((_, j) => j !== i) } : d))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() =>
          patch((d) =>
            d.gameType === "consent"
              ? {
                  ...d,
                  items: [...d.items, { id: `item-${Date.now().toString(36)}`, label: "New consent item", required: true }],
                }
              : d,
          )
        }
      >
        Add consent item
      </button>
    </div>
  );
}
