import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiSend, apiDelete } from "../api";

type QuizMode = {
  presentation: "frame16x9" | "responsive";
  motion: "static" | "videoSequences";
};

type QuizSequence =
  | {
      id: string;
      type: "intro" | "outro" | "breaker" | "holding" | "leaderboard";
      title?: string;
      body?: string;
      media?: { videoUrl?: string; bgImageUrl?: string; bgColor?: string };
      advance?: { kind: "host" | "timer" };
      durationSeconds?: number;
    }
  | {
      id: string;
      type: "question";
      prompt: { text: string; body?: string; imageUrl?: string; audioUrl?: string };
      timerSeconds?: number;
      input: { mode: "none" | "local" | "playAlong"; type: "buttons"; choices: { id: string; label: string }[] };
      correct: { choiceId: string };
      scoring?: { pointsCorrect: number; pointsWrong: number };
      media?: { videoUrl?: string; bgImageUrl?: string; bgColor?: string };
      advance?: { kind: "host" | "timer" };
    };

type QuizTrack = { id: string; name: string; sequences: QuizSequence[] };

type Quiz = {
  id: string;
  gameType: "quiz";
  title: string;
  clientName: string;
  slug: string;
  updatedAt: string;
  reportingEnabled: boolean;
  thumbnailUrl?: string;
  faviconUrl?: string;
  showPoweredBy?: boolean;
  mode: QuizMode;
  branding: {
    logoUrl?: string;
    backgroundColor?: string;
    backgroundImage?: string;
    backgroundVideo?: string;
    fonts?: { heading?: string; body?: string; button?: string };
    layout?: { buttonBottomPadPx?: number };
  };
  playAlong: {
    enabled: boolean;
    maxParticipants: number;
    retentionHours?: number;
    profanityBlock?: boolean;
    bonus?: { fastestCorrectSteal?: boolean; stealPoints?: number };
  };
  tracks: QuizTrack[];
};

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function firstTrack(q: Quiz): QuizTrack {
  if (Array.isArray(q.tracks) && q.tracks.length > 0) return q.tracks[0];
  return { id: "main", name: "Main", sequences: [] };
}

export default function QuizEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rawTracks, setRawTracks] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = await apiGet(`/api/wheels?id=${encodeURIComponent(id)}`);
      if (data.gameType !== "quiz") {
        navigate(`/wheels/${id}`, { replace: true });
        return;
      }
      const q = data as Quiz;
      setQuiz(q);
      setRawTracks(JSON.stringify(q.tracks || [], null, 2));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const pushPreview = useCallback(
    (q?: Quiz | null) => {
      const cfg = q || quiz;
      if (!cfg || !iframeRef.current?.contentWindow) return;
      iframeRef.current.contentWindow.postMessage(
        {
          type: "rngames-quiz-config",
          config: {
            gameType: "quiz",
            id: cfg.id,
            title: cfg.title,
            slug: cfg.slug,
            faviconUrl: cfg.faviconUrl || "",
            showPoweredBy: cfg.showPoweredBy !== false,
            mode: cfg.mode,
            branding: cfg.branding,
            playAlong: cfg.playAlong,
            tracks: cfg.tracks,
          },
        },
        window.location.origin,
      );
    },
    [quiz],
  );

  useEffect(() => {
    if (!quiz) return;
    const t = window.setTimeout(() => pushPreview(), 80);
    return () => window.clearTimeout(t);
  }, [quiz, pushPreview]);

  async function save(next?: Quiz) {
    const q = next || quiz;
    if (!q) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiSend("/api/wheels", "PUT", q);
      if (res?.wheel) {
        setQuiz(res.wheel as Quiz);
        setRawTracks(JSON.stringify((res.wheel as Quiz).tracks || [], null, 2));
        pushPreview(res.wheel as Quiz);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuiz() {
    if (!quiz) return;
    const ok = window.confirm("Delete this quiz and its public URLs?\n\nThis cannot be undone.");
    if (!ok) return;
    setSaving(true);
    setErr(null);
    try {
      await apiDelete(`/api/wheels?id=${encodeURIComponent(quiz.id)}`);
      navigate("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  const hostUrl = useMemo(() => {
    if (!quiz) return "";
    return `${siteUrl}/quiz/${encodeURIComponent(quiz.slug)}/host`;
  }, [quiz]);

  const t0 = quiz ? firstTrack(quiz) : null;
  const sequences = t0?.sequences || [];

  const canUseResponsive = quiz?.mode.motion !== "videoSequences";

  function setTracksFromRaw() {
    if (!quiz) return;
    try {
      const parsed = JSON.parse(rawTracks);
      if (!Array.isArray(parsed)) throw new Error("tracks must be an array");
      const next = { ...quiz, tracks: parsed };
      setQuiz(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invalid tracks JSON");
    }
  }

  function addSequence(kind: QuizSequence["type"]) {
    if (!quiz) return;
    const baseTrack = firstTrack(quiz);
    const rest = (quiz.tracks || []).slice(1);
    const nextSeq: QuizSequence =
      kind === "question"
        ? {
            id: uid("q"),
            type: "question",
            prompt: { text: "New question", body: "" },
            timerSeconds: 20,
            input: { mode: quiz.playAlong.enabled ? "playAlong" : "none", type: "buttons", choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
            correct: { choiceId: "a" },
            scoring: { pointsCorrect: 100, pointsWrong: 0 },
            media: { videoUrl: "", bgImageUrl: "", bgColor: "" },
            advance: { kind: "host" },
          }
        : {
            id: uid(kind),
            type: kind as Exclude<QuizSequence["type"], "question">,
            title: kind === "leaderboard" ? "Leaderboard" : "Title",
            body: "",
            media: { videoUrl: "", bgImageUrl: "", bgColor: "" },
            advance: { kind: "host" },
          };
    const nextTrack: QuizTrack = { ...baseTrack, sequences: [...(baseTrack.sequences || []), nextSeq] };
    const next: Quiz = { ...quiz, tracks: [nextTrack, ...rest] };
    setQuiz(next);
    setRawTracks(JSON.stringify(next.tracks, null, 2));
  }

  if (!quiz) return err ? <p className="muted">{err}</p> : <p className="muted">Loading…</p>;

  return (
    <div>
      <p>
        <Link to="/">← Studio</Link>
      </p>
      <h2 style={{ marginTop: 8 }}>Edit quiz</h2>
      {err && <p className="muted">{err}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Game details</h3>
        <div className="grid2">
          <div>
            <label className="field">Title</label>
            <input value={quiz.title} onChange={(e) => setQuiz({ ...quiz, title: e.target.value })} />
          </div>
          <div>
            <label className="field">Client</label>
            <input value={quiz.clientName} onChange={(e) => setQuiz({ ...quiz, clientName: e.target.value })} />
          </div>
          <div>
            <label className="field">Sub-URL (slug)</label>
            <input value={quiz.slug} onChange={(e) => setQuiz({ ...quiz, slug: e.target.value.trim().toLowerCase() })} />
          </div>
        </div>

        <p className="muted" style={{ marginTop: 10 }}>
          Host URL: <code>{hostUrl}</code>
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={() => window.open(hostUrl, "_blank")}>
            Open host screen
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Mode</h3>
        <div className="grid2">
          <div>
            <label className="field">Presentation</label>
            <select
              value={quiz.mode.presentation}
              onChange={(e) => setQuiz({ ...quiz, mode: { ...quiz.mode, presentation: e.target.value as QuizMode["presentation"] } })}
              disabled={!canUseResponsive}
              title={!canUseResponsive ? "Responsive is static-only for now" : ""}
            >
              <option value="frame16x9">16:9 frame</option>
              <option value="responsive">Responsive (static only)</option>
            </select>
          </div>
          <div>
            <label className="field">Motion</label>
            <select
              value={quiz.mode.motion}
              onChange={(e) => {
                const motion = e.target.value as QuizMode["motion"];
                const presentation = motion === "videoSequences" ? "frame16x9" : quiz.mode.presentation;
                setQuiz({ ...quiz, mode: { ...quiz.mode, motion, presentation } });
              }}
            >
              <option value="static">Static (UI animation allowed)</option>
              <option value="videoSequences">Animated (one video per sequence)</option>
            </select>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={quiz.playAlong.enabled}
            onChange={(e) => setQuiz({ ...quiz, playAlong: { ...quiz.playAlong, enabled: e.target.checked } })}
          />
          Enable play-along (phone participants)
        </label>
        <div style={{ marginTop: 10, maxWidth: 240 }}>
          <label className="field">Max participants</label>
          <input
            type="number"
            min={10}
            max={500}
            value={quiz.playAlong.maxParticipants}
            onChange={(e) => setQuiz({ ...quiz, playAlong: { ...quiz.playAlong, maxParticipants: Number(e.target.value) } })}
          />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Sequences (MVP)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Quick builder: add basic sequences, then fine-tune via the JSON editor below. Host controls are per-sequence.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={() => addSequence("intro")}>
            Add intro
          </button>
          <button type="button" className="btn btn-primary" onClick={() => addSequence("question")}>
            Add question
          </button>
          <button type="button" className="btn btn-primary" onClick={() => addSequence("leaderboard")}>
            Add leaderboard
          </button>
          <button type="button" className="btn btn-primary" onClick={() => addSequence("outro")}>
            Add outro
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {sequences.length === 0 ? (
            <p className="muted">No sequences yet.</p>
          ) : (
            <ol className="muted" style={{ margin: 0, paddingLeft: 18 }}>
              {sequences.map((s) => (
                <li key={s.id}>
                  <code>{s.type}</code> <span style={{ opacity: 0.85 }}>{s.type === "question" ? s.prompt.text : (s.title || s.id)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Live preview</h3>
        <p className="muted">Updates from your current settings (save to persist on the server).</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" onClick={() => pushPreview()}>
            Refresh preview
          </button>
          <button type="button" className="btn" onClick={() => window.open(hostUrl, "_blank")}>
            Open host screen
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title="Quiz preview"
          src={`/play/quiz-host.html?preview=1&slug=${encodeURIComponent(quiz.slug)}`}
          onLoad={() => pushPreview()}
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            height: "auto",
            minHeight: 220,
            border: "1px solid var(--rn-border)",
            borderRadius: 8,
            background: "#0a1628",
            display: "block",
          }}
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tracks JSON (advanced)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          For the MVP, this JSON is the source of truth. You can add image/audio prompts, timers, and per-sequence video URLs here.
        </p>
        <textarea
          value={rawTracks}
          onChange={(e) => setRawTracks(e.target.value)}
          rows={18}
          style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={() => setTracksFromRaw()}>
            Apply JSON locally
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-danger" disabled={saving} onClick={() => void deleteQuiz()}>
            Delete quiz
          </button>
        </div>
      </div>
    </div>
  );
}

