import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  newMiniQuizId,
  normalizeMiniQuiz,
  type MiniQuizChoice,
  type MiniQuizQuestion,
  type MiniQuizRecord,
} from "@rngames/shared";
import { apiDelete, apiGet, apiSend } from "../api";
import { ComponentMetadataFields } from "../components/ComponentMetadataFields";
import { HexField } from "../components/HexField";

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

function publicUrl(slug: string) {
  return `${siteUrl}/mini-quiz/${encodeURIComponent(slug)}`;
}

function newChoice(): MiniQuizChoice {
  return { id: newMiniQuizId(), label: "New option" };
}

function newQuestion(): MiniQuizQuestion {
  const choices = [newChoice(), newChoice()];
  return {
    id: newMiniQuizId(),
    prompt: "New question?",
    choices,
    correctChoiceId: choices[0].id,
  };
}

export default function MiniQuizEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<MiniQuizRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const patch = (fn: (d: MiniQuizRecord) => MiniQuizRecord) => setDoc((d) => (d ? fn(d) : d));

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = await apiGet(`/api/wheels?id=${encodeURIComponent(id)}`);
      if (data.gameType !== "mini-quiz") {
        navigate("/");
        return;
      }
      setDoc(normalizeMiniQuiz(data as MiniQuizRecord));
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
      { type: "rngames-mini-quiz-config", config: normalizeMiniQuiz(doc) },
      window.location.origin,
    );
  }, [doc]);

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
      if (res?.wheel) setDoc(normalizeMiniQuiz(res.wheel as MiniQuizRecord));
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
      setDoc(normalizeMiniQuiz(res.wheel as MiniQuizRecord));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  }

  async function remove() {
    if (!doc || !confirm("Delete permanently?")) return;
    await apiDelete(`/api/wheels?id=${encodeURIComponent(doc.id)}`);
    navigate("/library/mini-quiz");
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
        <Link to="/library/mini-quiz">Mini quizzes</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>Edit mini quiz</h2>
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
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Intro & results</h3>
          <label className="field">
            Headline
            <input value={doc.headline} onChange={(e) => patch((d) => ({ ...d, headline: e.target.value }))} />
          </label>
          <label className="field">
            Body
            <textarea value={doc.body} rows={3} onChange={(e) => patch((d) => ({ ...d, body: e.target.value }))} />
          </label>
          <label className="field">
            Start button
            <input value={doc.startLabel} onChange={(e) => patch((d) => ({ ...d, startLabel: e.target.value }))} />
          </label>
          <label className="field">
            Results headline
            <input
              value={doc.resultsHeadline}
              onChange={(e) => patch((d) => ({ ...d, resultsHeadline: e.target.value }))}
            />
          </label>
          <label className="field">
            Results body
            <textarea
              value={doc.resultsBody}
              rows={2}
              onChange={(e) => patch((d) => ({ ...d, resultsBody: e.target.value }))}
            />
          </label>
          <label className="field">
            Continue button
            <input
              value={doc.continueLabel}
              onChange={(e) => patch((d) => ({ ...d, continueLabel: e.target.value }))}
            />
          </label>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Branding</h3>
          <HexField
            label="Background colour"
            value={doc.backgroundHex}
            onChange={(v) => patch((d) => ({ ...d, backgroundHex: v }))}
          />
          <HexField
            label="Headline colour"
            value={doc.typography.headlineHex}
            onChange={(v) => patch((d) => ({ ...d, typography: { ...d.typography, headlineHex: v } }))}
          />
          <HexField
            label="Button background"
            value={doc.primaryCta.backgroundHex}
            onChange={(v) => patch((d) => ({ ...d, primaryCta: { ...d.primaryCta, backgroundHex: v } }))}
          />
          <HexField
            label="Button text"
            value={doc.primaryCta.textHex}
            onChange={(v) => patch((d) => ({ ...d, primaryCta: { ...d.primaryCta, textHex: v } }))}
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Questions</h3>
          <button type="button" className="btn" onClick={() => patch((d) => ({ ...d, questions: [...d.questions, newQuestion()] }))}>
            Add question
          </button>
        </div>
        {doc.questions.map((q, qi) => (
          <div
            key={q.id}
            style={{
              border: "1px solid var(--rn-border)",
              borderRadius: 8,
              padding: 12,
              marginTop: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <strong>Question {qi + 1}</strong>
              <button
                type="button"
                className="btn"
                disabled={doc.questions.length <= 1}
                onClick={() => patch((d) => ({ ...d, questions: d.questions.filter((x) => x.id !== q.id) }))}
              >
                Remove
              </button>
            </div>
            <label className="field" style={{ marginTop: 8 }}>
              Prompt
              <input
                value={q.prompt}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    questions: d.questions.map((x) => (x.id === q.id ? { ...x, prompt: e.target.value } : x)),
                  }))
                }
              />
            </label>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "8px 0 6px" }}>
              Choices (2–4)
            </p>
            {q.choices.map((c, ci) => (
              <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input
                  type="radio"
                  name={`correct-${q.id}`}
                  checked={q.correctChoiceId === c.id}
                  onChange={() =>
                    patch((d) => ({
                      ...d,
                      questions: d.questions.map((x) =>
                        x.id === q.id ? { ...x, correctChoiceId: c.id } : x,
                      ),
                    }))
                  }
                  title="Correct answer"
                />
                <input
                  value={c.label}
                  style={{ flex: 1 }}
                  onChange={(e) =>
                    patch((d) => ({
                      ...d,
                      questions: d.questions.map((x) =>
                        x.id === q.id
                          ? {
                              ...x,
                              choices: x.choices.map((y) => (y.id === c.id ? { ...y, label: e.target.value } : y)),
                            }
                          : x,
                      ),
                    }))
                  }
                />
                <button
                  type="button"
                  className="btn"
                  disabled={q.choices.length <= 2}
                  onClick={() =>
                    patch((d) => ({
                      ...d,
                      questions: d.questions.map((x) => {
                        if (x.id !== q.id) return x;
                        const choices = x.choices.filter((y) => y.id !== c.id);
                        const correctChoiceId = choices.some((y) => y.id === x.correctChoiceId)
                          ? x.correctChoiceId
                          : choices[0]?.id || "";
                        return { ...x, choices, correctChoiceId };
                      }),
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn"
              disabled={q.choices.length >= 4}
              onClick={() =>
                patch((d) => ({
                  ...d,
                  questions: d.questions.map((x) =>
                    x.id === q.id ? { ...x, choices: [...x.choices, newChoice()] } : x,
                  ),
                }))
              }
            >
              Add choice
            </button>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Preview</h3>
        <iframe
          ref={iframeRef}
          title="Mini quiz preview"
          src={`/play/mini-quiz.html?preview=1&slug=${encodeURIComponent(doc.slug)}`}
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
