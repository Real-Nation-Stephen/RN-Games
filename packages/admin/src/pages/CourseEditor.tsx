import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CourseItem, CourseRecord, CourseSection } from "@rngames/shared";
import { defaultCoursePresentation, defaultCourseSettings, newCourseId } from "@rngames/shared";
import { apiDelete, apiGet, apiSend, uploadFile } from "../api";
import { BgUploadRow } from "../components/BgUploadRow";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { HexField } from "../components/HexField";
import { ItemPicker, type PickerExperience, type PickerModule } from "../components/ItemPicker";
import { coursePublicUrl } from "./homeShared";

function newSection(): CourseSection {
  return { id: newCourseId("sec-"), title: "New section", items: [] };
}

function ensureCourseDefaults(doc: CourseRecord): CourseRecord {
  return {
    ...doc,
    presentation: doc.presentation || defaultCoursePresentation(),
    settings: doc.settings || defaultCourseSettings(),
  };
}

export default function CourseEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [modules, setModules] = useState<PickerModule[]>([]);
  const [experiences, setExperiences] = useState<PickerExperience[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<{ itemId: string; message: string }[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    const [courseRes, wheelsRes, expRes] = await Promise.all([
      apiGet(`/api/courses?id=${encodeURIComponent(id)}`),
      apiGet("/api/wheels"),
      apiGet("/api/experiences"),
    ]);
    const doc = ensureCourseDefaults(courseRes.course as CourseRecord);
    setCourse(doc);
    setModules((wheelsRes.wheels || []).filter((w: PickerModule & { archived?: boolean }) => !w.archived));
    setExperiences((expRes.experiences || []).filter((e: PickerExperience & { archived?: boolean }) => !e.archived));
    setActiveSectionId((prev) => prev || doc.sections[0]?.id || null);
  }, [id]);

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : "Load failed"));
  }, [load]);

  function patch(fn: (c: CourseRecord) => CourseRecord) {
    setCourse((c) => (c ? fn(c) : c));
  }

  async function save(publish = false) {
    if (!course) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await apiSend("/api/courses", "PUT", { ...course, publish });
      setCourse(ensureCourseDefaults(res.course as CourseRecord));
      setWarnings(Array.isArray(res.warnings) ? res.warnings : []);
      setMsg(publish ? "Published." : "Saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!course || !confirm("Delete this course?")) return;
    await apiDelete(`/api/courses?id=${encodeURIComponent(course.id)}`);
    navigate("/");
  }

  function addSection() {
    const section = newSection();
    patch((c) => ({ ...c, sections: [...c.sections, section] }));
    setActiveSectionId(section.id);
  }

  function addItem(sectionId: string, item: CourseItem) {
    patch((c) => ({
      ...c,
      sections: c.sections.map((s) => (s.id === sectionId ? { ...s, items: [...s.items, item] } : s)),
    }));
  }

  function moveItem(sectionId: string, index: number, dir: -1 | 1) {
    patch((c) => ({
      ...c,
      sections: c.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const items = [...s.items];
        const j = index + dir;
        if (j < 0 || j >= items.length) return s;
        [items[index], items[j]] = [items[j], items[index]];
        return { ...s, items };
      }),
    }));
  }

  function sourceLabel(item: CourseItem): string {
    if (item.kind === "module") {
      return modules.find((m) => m.id === item.moduleInstanceId)?.title || item.moduleType || "module";
    }
    if (item.kind === "experience") {
      return experiences.find((e) => e.id === item.experienceId)?.title || "Experience";
    }
    return item.videoTitle || "Video";
  }

  if (!course) {
    return <p className="muted">{err || "Loading…"}</p>;
  }

  const previewUrl = coursePublicUrl(course.slug, course.previewToken);
  const liveUrl = coursePublicUrl(course.slug);
  const activeSection = course.sections.find((s) => s.id === activeSectionId) || course.sections[0];
  const p = course.presentation;
  const s = course.settings;

  return (
    <div>
      <p style={{ margin: "0 0 16px" }}>
        <Link to="/">← Home</Link>
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Course details</h2>
        <div className="grid2">
          <label className="field">
            Title
            <input value={course.title} onChange={(e) => patch((c) => ({ ...c, title: e.target.value }))} />
          </label>
          <label className="field">
            Client
            <input value={course.clientName} onChange={(e) => patch((c) => ({ ...c, clientName: e.target.value }))} />
          </label>
          <label className="field">
            Sub-URL (slug)
            <input
              value={course.slug}
              onChange={(e) => patch((c) => ({ ...c, slug: e.target.value.toLowerCase() }))}
            />
          </label>
          <label className="field">
            Status
            <input value={course.status} readOnly disabled />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            Description
            <textarea
              rows={3}
              value={course.description}
              onChange={(e) => patch((c) => ({ ...c, description: e.target.value }))}
            />
          </label>
          <label className="field">
            Project code
            <input value={course.projectCode} onChange={(e) => patch((c) => ({ ...c, projectCode: e.target.value }))} />
          </label>
          <label className="field">
            Design code
            <input value={course.designCode} onChange={(e) => patch((c) => ({ ...c, designCode: e.target.value }))} />
          </label>
        </div>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Live: <code>{liveUrl}</code>
          {course.status !== "published" ? (
            <>
              <br />
              Draft preview: <code>{previewUrl}</code>
            </>
          ) : null}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Course settings</h3>
        <div className="grid2">
          <label className="field">
            Navigation
            <select
              value={s.navigationMode}
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  settings: { ...c.settings, navigationMode: e.target.value as "sequential" | "free" },
                }))
              }
            >
              <option value="sequential">Sequential — complete items in order</option>
              <option value="free">Free — learners choose any unlocked item</option>
            </select>
          </label>
          <label className="field">
            Home layout
            <select
              value={s.layout}
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  settings: { ...c.settings, layout: e.target.value as "rows" | "cards" | "bento" },
                }))
              }
            >
              <option value="rows">Rows — compact list</option>
              <option value="cards">Cards — responsive grid</option>
              <option value="bento">Bento — mixed-size showcase grid</option>
            </select>
          </label>
        </div>
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Course appearance</h3>
          <HexField
            label="Background colour"
            value={p.backgroundHex}
            onChange={(v) => patch((c) => ({ ...c, presentation: { ...c.presentation, backgroundHex: v } }))}
          />
          <label className="field">
            Background behaviour
            <select
              value={p.backgroundMode}
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  presentation: { ...c.presentation, backgroundMode: e.target.value as "fixed" | "scroll" },
                }))
              }
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
              patch((c) => ({ ...c, presentation: { ...c.presentation, logoUrl: url } }));
            }}
          />
          {p.logoUrl ? <span className="muted"> ✓</span> : null}
          <label className="field" style={{ marginTop: 8 }}>
            Logo alignment
            <select
              value={p.logoAlign}
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  presentation: { ...c.presentation, logoAlign: e.target.value as "left" | "center" | "right" },
                }))
              }
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
              value={p.backgrounds.desktop || ""}
              onUploaded={(url) =>
                patch((c) => ({
                  ...c,
                  presentation: { ...c.presentation, backgrounds: { ...c.presentation.backgrounds, desktop: url } },
                }))
              }
            />
            <BgUploadRow
              label="Tablet"
              hint="768px – 1023px."
              value={p.backgrounds.tablet || ""}
              onUploaded={(url) =>
                patch((c) => ({
                  ...c,
                  presentation: { ...c.presentation, backgrounds: { ...c.presentation.backgrounds, tablet: url } },
                }))
              }
            />
            <BgUploadRow
              label="Mobile"
              hint="Below 768px."
              value={p.backgrounds.mobile || ""}
              onUploaded={(url) =>
                patch((c) => ({
                  ...c,
                  presentation: { ...c.presentation, backgrounds: { ...c.presentation.backgrounds, mobile: url } },
                }))
              }
            />
          </CollapsibleSection>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Colours & branding</h3>
          <HexField
            label="Headline colour"
            value={p.headlineHex}
            onChange={(v) => patch((c) => ({ ...c, presentation: { ...c.presentation, headlineHex: v } }))}
          />
          <HexField
            label="Body text colour"
            value={p.bodyHex}
            onChange={(v) => patch((c) => ({ ...c, presentation: { ...c.presentation, bodyHex: v } }))}
          />
          <HexField
            label="Accent colour"
            value={p.accentHex}
            onChange={(v) => patch((c) => ({ ...c, presentation: { ...c.presentation, accentHex: v } }))}
          />
          <HexField
            label="Card background"
            value={p.cardHex}
            onChange={(v) => patch((c) => ({ ...c, presentation: { ...c.presentation, cardHex: v } }))}
          />
          <label className="field">Favicon</label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const { url } = await uploadFile(f);
              patch((c) => ({ ...c, presentation: { ...c.presentation, faviconUrl: url } }));
            }}
          />
          {p.faviconUrl ? <span className="muted"> ✓</span> : null}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input
              type="checkbox"
              checked={p.showPoweredBy !== false}
              onChange={(e) =>
                patch((c) => ({ ...c, presentation: { ...c.presentation, showPoweredBy: e.target.checked } }))
              }
            />
            Show “Powered by Real Nation” on the course page
          </label>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Curriculum</h3>
          <button type="button" className="btn btn-primary" onClick={addSection}>
            Add section
          </button>
        </div>

        {course.sections.length === 0 ? (
          <p className="muted">Add sections to organise your course content. Items can be components, experiences, or videos.</p>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {course.sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className="btn"
                  style={{
                    fontWeight: activeSection?.id === section.id ? 700 : 400,
                    borderColor: activeSection?.id === section.id ? "var(--accent, #6cf)" : undefined,
                  }}
                  onClick={() => setActiveSectionId(section.id)}
                >
                  {section.title} ({section.items.length})
                </button>
              ))}
            </div>

            {activeSection ? (
              <div>
                <div className="grid2">
                  <label className="field">
                    Section title
                    <input
                      value={activeSection.title}
                      onChange={(e) =>
                        patch((c) => ({
                          ...c,
                          sections: c.sections.map((s) =>
                            s.id === activeSection.id ? { ...s, title: e.target.value } : s,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    Section icon (emoji)
                    <input
                      placeholder="e.g. 🎯"
                      value={activeSection.iconEmoji || ""}
                      onChange={(e) =>
                        patch((c) => ({
                          ...c,
                          sections: c.sections.map((s) =>
                            s.id === activeSection.id ? { ...s, iconEmoji: e.target.value || undefined } : s,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    Unlock on date
                    <input
                      type="date"
                      value={activeSection.unlockDate?.slice(0, 10) || ""}
                      onChange={(e) =>
                        patch((c) => ({
                          ...c,
                          sections: c.sections.map((s) =>
                            s.id === activeSection.id
                              ? { ...s, unlockDate: e.target.value ? e.target.value : null }
                              : s,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    Unlock days after start
                    <input
                      type="number"
                      min={0}
                      placeholder="0 = no delay"
                      value={activeSection.unlockDaysAfterStart ?? ""}
                      onChange={(e) =>
                        patch((c) => ({
                          ...c,
                          sections: c.sections.map((s) =>
                            s.id === activeSection.id
                              ? {
                                  ...s,
                                  unlockDaysAfterStart: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
                                }
                              : s,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="field">Section icon image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const { url } = await uploadFile(f);
                    patch((c) => ({
                      ...c,
                      sections: c.sections.map((s) => (s.id === activeSection.id ? { ...s, iconUrl: url } : s)),
                    }));
                  }}
                />
                {activeSection.iconUrl ? <span className="muted"> ✓</span> : null}

                {activeSection.items.length === 0 ? (
                  <p className="muted" style={{ fontSize: "0.85rem" }}>
                    No items in this section yet.
                  </p>
                ) : (
                  <ol style={{ paddingLeft: 20, margin: "12px 0" }}>
                    {activeSection.items.map((item, i) => {
                      const itemWarnings = warnings.filter((w) => w.itemId === item.id);
                      return (
                        <li key={item.id} style={{ marginBottom: 16 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
                            <span className="muted" style={{ fontSize: "0.85rem" }}>
                              {sourceLabel(item)} ({item.kind})
                            </span>
                            <button type="button" className="btn" disabled={i === 0} onClick={() => moveItem(activeSection.id, i, -1)}>
                              ↑
                            </button>
                            <button
                              type="button"
                              className="btn"
                              disabled={i === activeSection.items.length - 1}
                              onClick={() => moveItem(activeSection.id, i, 1)}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={() =>
                                patch((c) => ({
                                  ...c,
                                  sections: c.sections.map((s) =>
                                    s.id === activeSection.id
                                      ? { ...s, items: s.items.filter((_, j) => j !== i) }
                                      : s,
                                  ),
                                }))
                              }
                            >
                              Remove
                            </button>
                          </div>
                          <div className="grid2">
                            <label className="field">
                              Display title
                              <input
                                placeholder={sourceLabel(item)}
                                value={item.displayTitle || ""}
                                onChange={(e) =>
                                  patch((c) => ({
                                    ...c,
                                    sections: c.sections.map((s) =>
                                      s.id === activeSection.id
                                        ? {
                                            ...s,
                                            items: s.items.map((it, j) =>
                                              j === i ? { ...it, displayTitle: e.target.value || undefined } : it,
                                            ),
                                          }
                                        : s,
                                    ),
                                  }))
                                }
                              />
                            </label>
                            <label className="field">
                              Item icon (emoji)
                              <input
                                placeholder="e.g. 🍀"
                                value={item.iconEmoji || ""}
                                onChange={(e) =>
                                  patch((c) => ({
                                    ...c,
                                    sections: c.sections.map((s) =>
                                      s.id === activeSection.id
                                        ? {
                                            ...s,
                                            items: s.items.map((it, j) =>
                                              j === i ? { ...it, iconEmoji: e.target.value || undefined } : it,
                                            ),
                                          }
                                        : s,
                                    ),
                                  }))
                                }
                              />
                            </label>
                          </div>
                          <label className="field">Item icon image</label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const { url } = await uploadFile(f);
                              patch((c) => ({
                                ...c,
                                sections: c.sections.map((s) =>
                                  s.id === activeSection.id
                                    ? {
                                        ...s,
                                        items: s.items.map((it, j) => (j === i ? { ...it, iconUrl: url } : it)),
                                      }
                                    : s,
                                ),
                              }));
                            }}
                          />
                          {item.iconUrl ? <span className="muted"> ✓</span> : null}
                          {itemWarnings.length > 0 ? (
                            <ul className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0", paddingLeft: 18, color: "#ffb4b4" }}>
                              {itemWarnings.map((w) => (
                                <li key={w.message}>{w.message}</li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                )}

                <button
                  type="button"
                  className="btn"
                  style={{ marginBottom: 8 }}
                  onClick={() =>
                    patch((c) => ({
                      ...c,
                      sections: c.sections.filter((s) => s.id !== activeSection.id),
                    }))
                  }
                >
                  Remove section
                </button>

                <ItemPicker
                  mode="course"
                  modules={modules}
                  experiences={experiences}
                  onPickModule={(m) =>
                    addItem(activeSection.id, {
                      id: newCourseId("item-"),
                      kind: "module",
                      moduleInstanceId: m.id,
                      moduleType: m.gameType || "spinning-wheel",
                      label: m.title,
                    })
                  }
                  onPickExperience={(e) =>
                    addItem(activeSection.id, {
                      id: newCourseId("item-"),
                      kind: "experience",
                      experienceId: e.id,
                      label: e.title,
                    })
                  }
                  onPickVideo={(url, title) =>
                    addItem(activeSection.id, {
                      id: newCourseId("item-"),
                      kind: "video",
                      videoUrl: url,
                      videoTitle: title,
                      label: title,
                    })
                  }
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Preview</h3>
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
          Delete course
        </button>
      </div>
    </div>
  );
}
