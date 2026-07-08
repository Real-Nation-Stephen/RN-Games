import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CourseItem, CourseRecord, CourseSection } from "@rngames/shared";
import { newCourseId } from "@rngames/shared";
import { apiDelete, apiGet, apiSend } from "../api";
import { ItemPicker, type PickerExperience, type PickerModule } from "../components/ItemPicker";
import { coursePublicUrl } from "./homeShared";

function newSection(): CourseSection {
  return { id: newCourseId("sec-"), title: "New section", items: [] };
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
    const doc = courseRes.course as CourseRecord;
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
      setCourse(res.course as CourseRecord);
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

  if (!course) {
    return <p className="muted">{err || "Loading…"}</p>;
  }

  const previewUrl = coursePublicUrl(course.slug, course.previewToken);
  const liveUrl = coursePublicUrl(course.slug);
  const activeSection = course.sections.find((s) => s.id === activeSectionId) || course.sections[0];

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

                {activeSection.items.length === 0 ? (
                  <p className="muted" style={{ fontSize: "0.85rem" }}>
                    No items in this section yet.
                  </p>
                ) : (
                  <ol style={{ paddingLeft: 20, margin: "12px 0" }}>
                    {activeSection.items.map((item, i) => {
                      const itemWarnings = warnings.filter((w) => w.itemId === item.id);
                      const label =
                        item.label ||
                        (item.kind === "module"
                          ? modules.find((m) => m.id === item.moduleInstanceId)?.title
                          : item.kind === "experience"
                            ? experiences.find((e) => e.id === item.experienceId)?.title
                            : item.videoTitle) ||
                        item.kind;
                      return (
                        <li key={item.id} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                            <span>
                              {label}{" "}
                              <span className="muted" style={{ fontSize: "0.8rem" }}>
                                ({item.kind})
                              </span>
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
