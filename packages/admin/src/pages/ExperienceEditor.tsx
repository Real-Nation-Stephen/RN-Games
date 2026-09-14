import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ExperienceGraph, ExperienceRecord, LiveJoinScreen } from "@rngames/shared";
import { defaultDeploymentMeasurement, graphToLinearSteps, isLiveCapableType, normalizeLiveJoinScreen } from "@rngames/shared";
import { apiDelete, apiGet, apiSend, uploadFile } from "../api";
import { BgUploadRow } from "../components/BgUploadRow";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { HexField } from "../components/HexField";
import { LiveSurfaceLayoutFields } from "../components/LiveSurfaceLayoutFields";
import { DeploymentMeasurementPanel } from "../components/DeploymentMeasurementPanel";
import { ExperienceFlowCanvas } from "../components/ExperienceFlowCanvas";
import { ExperienceNodeOverridesPanel } from "../components/ExperienceNodeOverridesPanel";
import type { PickerModule } from "../components/ItemPicker";
import { assignWindowLocation, openBlankWindow, POPUP_BLOCKED_MESSAGE } from "../openLiveWindow";
import { experiencePresenterUrl, experiencePublicUrl } from "./homeShared";

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
  const [masterFallbackUrl, setMasterFallbackUrl] = useState<string | null>(null);

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

  const previewUrl = game
    ? game.foundation.interactive
      ? experiencePresenterUrl(game.slug, game.previewToken)
      : experiencePublicUrl(game.slug, game.previewToken)
    : "";

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
  const origin = window.location.origin;

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
          {!game.foundation.interactive ? (
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
          ) : (
            <p className="muted" style={{ gridColumn: "1 / -1", fontSize: "0.85rem" }}>
              Interactive flows have no Next Activity shell. Navigation belongs only on Flow Master.
            </p>
          )}
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <input
              type="checkbox"
              checked={!!game.foundation.interactive}
              onChange={(e) =>
                patch((g) => ({
                  ...g,
                  foundation: { ...g.foundation, interactive: e.target.checked },
                }))
              }
            />{" "}
            Interactive experience (one shared live run: Presenter, Flow Master, phones)
          </label>
        </div>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Tracking and reporting settings are configured in Measurement &amp; Reporting below.
        </p>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          {game.foundation.interactive ? (
            <>
              Presenter: <code>{`${origin}/x/${game.slug}/present`}</code>
              <br />
              Join: <code>{`${origin}/x/${game.slug}/join`}</code>
              <br />
              Flow Master: <code>{`${origin}/x/${game.slug}/master`}</code>{" "}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const popup = openBlankWindow();
                  void (async () => {
                    try {
                      const res = (await apiSend("/api/live-run", "POST", { slug: game.slug })) as {
                        hostKey?: string;
                      };
                      const url = `${origin}/x/${game.slug}/master#hk=${encodeURIComponent(String(res.hostKey || ""))}`;
                      if (!assignWindowLocation(popup, url)) {
                        setMasterFallbackUrl(url);
                        setErr(POPUP_BLOCKED_MESSAGE);
                      } else {
                        setMasterFallbackUrl(null);
                      }
                    } catch (e) {
                      try {
                        popup?.close();
                      } catch {
                        /* ignore */
                      }
                      setErr(e instanceof Error ? e.message : String(e));
                    }
                  })();
                }}
              >
                Open Flow Master
              </button>{" "}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (!confirm("Start a new run? This resets prizes, numbers, and event state.")) return;
                  const popup = openBlankWindow();
                  void (async () => {
                    try {
                      const res = (await apiSend("/api/live-run", "POST", { slug: game.slug, forceNew: true })) as {
                        hostKey?: string;
                      };
                      const url = `${origin}/x/${game.slug}/master#hk=${encodeURIComponent(String(res.hostKey || ""))}`;
                      if (!assignWindowLocation(popup, url)) {
                        setMasterFallbackUrl(url);
                        setErr(POPUP_BLOCKED_MESSAGE);
                      } else {
                        setMasterFallbackUrl(null);
                      }
                    } catch (e) {
                      try {
                        popup?.close();
                      } catch {
                        /* ignore */
                      }
                      setErr(e instanceof Error ? e.message : String(e));
                    }
                  })();
                }}
              >
                Start new run
              </button>
              {masterFallbackUrl ? (
                <>
                  <br />
                  <a href={masterFallbackUrl} target="_blank" rel="noreferrer">
                    Open Flow Master link
                  </a>
                </>
              ) : null}
            </>
          ) : (
            <>
              Self-directed: <code>{liveUrl}</code>
            </>
          )}
          {game.status !== "published" ? (
            <>
              <br />
              Draft preview: <code>{previewUrl}</code>
            </>
          ) : null}
        </p>
      </div>

      {game.foundation.interactive ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Join / opening screen</h3>
          <p className="muted">These fields skin Presenter, phones, and closing — any brand, not a fixed client.</p>
          {(() => {
            const js = normalizeLiveJoinScreen(game.foundation.joinScreen);
            const setJs = (partial: Partial<LiveJoinScreen>) =>
              patch((g) => ({
                ...g,
                foundation: { ...g.foundation, joinScreen: { ...js, ...partial } },
              }));
            const liveSteps = game.linearSteps.filter((s) => !isLiveCapableType(s.moduleType));
            return (
              <>
                {liveSteps.length ? (
                  <p className="muted">
                    Not live-capable (skipped at runtime): {liveSteps.map((s) => s.moduleType || s.label).join(", ")}
                  </p>
                ) : null}
                <label className="field">
                  Headline
                  <input value={js.headline} onChange={(e) => setJs({ headline: e.target.value })} />
                </label>
                <label className="field">
                  Instructions
                  <textarea value={js.instructions} rows={3} onChange={(e) => setJs({ instructions: e.target.value })} />
                </label>
                <label className="field">
                  Closing headline
                  <input value={js.closingHeadline} onChange={(e) => setJs({ closingHeadline: e.target.value })} />
                </label>
                <label className="field">
                  Closing body
                  <textarea value={js.closingBody} rows={2} onChange={(e) => setJs({ closingBody: e.target.value })} />
                </label>
                <div className="grid2">
                  <HexField label="Background" value={js.backgroundHex} onChange={(v) => setJs({ backgroundHex: v })} />
                  <HexField label="Headline colour" value={js.headlineHex} onChange={(v) => setJs({ headlineHex: v })} />
                  <HexField label="Body colour" value={js.bodyHex} onChange={(v) => setJs({ bodyHex: v })} />
                  <HexField label="Accent" value={js.accentHex} onChange={(v) => setJs({ accentHex: v })} />
                  <HexField label="Button" value={js.buttonHex} onChange={(v) => setJs({ buttonHex: v })} />
                  <HexField label="Button text" value={js.buttonTextHex} onChange={(v) => setJs({ buttonTextHex: v })} />
                </div>
                <BgUploadRow label="Logo" hint="Any brand mark" value={js.logoUrl} onUploaded={(url) => setJs({ logoUrl: url })} />
                <BgUploadRow label="Phone / join background" hint="Optional" value={js.backgroundImageUrl} onUploaded={(url) => setJs({ backgroundImageUrl: url })} />
                <BgUploadRow label="Presenter background" hint="Optional 16:9 art" value={js.presenterBackgroundImageUrl} onUploaded={(url) => setJs({ presenterBackgroundImageUrl: url })} />
                <LiveSurfaceLayoutFields
                  layout={js.layout}
                  onChange={({ layout }) => setJs({ layout })}
                />
                <CollapsibleSection title="Custom fonts" summary="Heading, body, button">
                  {(["heading", "body", "button"] as const).map((role) => (
                    <div key={role} style={{ marginTop: 10 }}>
                      <label className="field">{role.charAt(0).toUpperCase() + role.slice(1)} font</label>
                      <input
                        type="file"
                        accept=".woff,.woff2,.ttf,.otf"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const { url } = await uploadFile(f);
                          const family = f.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-") || "CustomFont";
                          const stack = `'${family}', system-ui, sans-serif`;
                          setJs({
                            fontUploads: { ...js.fontUploads, [role]: { url, family } },
                            headingFont: role === "heading" ? stack : js.headingFont,
                            bodyFont: role === "body" ? stack : js.bodyFont,
                            buttonFont: role === "button" ? stack : js.buttonFont,
                          });
                        }}
                      />
                      {js.fontUploads?.[role]?.url ? <span className="muted"> ✓</span> : null}
                    </div>
                  ))}
                </CollapsibleSection>
              </>
            );
          })()}
        </div>
      ) : null}

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
          {game.foundation.interactive
            ? "Save first, then open the shared Presenter. Navigation belongs only on Flow Master."
            : "Save first, then open preview in a new tab (uses draft preview token when unpublished)."}
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

      {err ? (
        <p role="alert" style={{ color: "#f3c14e", fontWeight: 600 }}>
          {err}
        </p>
      ) : null}
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
