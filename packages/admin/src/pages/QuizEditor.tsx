import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import html2canvas from "html2canvas";
import type { QuizSequence, QuizSequenceStyle, QuizSurfaceTheme, QuizTextAnimationId } from "../../player/src/quiz/types";
import { apiGet, apiSend, apiDelete, uploadFile } from "../api";

type QuizMode = {
  presentation: "frame16x9" | "responsive";
  motion: "static" | "videoSequences";
};

type QuizWheel = {
  id: string;
  gameType: "quiz";
  title: string;
  clientName: string;
  slug: string;
  updatedAt: string;
  reportingEnabled: boolean;
  reportingLockedAt: string | null;
  thumbnailUrl?: string;
  faviconUrl?: string;
  reportingSheetTab?: string;
  showPoweredBy?: boolean;
  playMode?: "facilitated" | "playAlong" | "kiosk";
  mode: QuizMode;
  branding: {
    logoUrl?: string;
    backgroundColor?: string;
    backgroundImage?: string;
    backgroundVideo?: string;
    fonts?: { heading?: string; subheading?: string; body?: string; button?: string };
    fontUploads?: {
      heading?: { url: string; family: string; weight?: number | string; style?: "normal" | "italic" };
      subheading?: { url: string; family: string; weight?: number | string; style?: "normal" | "italic" };
      body?: { url: string; family: string; weight?: number | string; style?: "normal" | "italic" };
      button?: { url: string; family: string; weight?: number | string; style?: "normal" | "italic" };
    };
    layout?: { buttonBottomPadPx?: number };
    mobile?: QuizSurfaceTheme & { playerIconSetUrl?: string };
    host?: QuizSurfaceTheme;
    leaderboard?: QuizSurfaceTheme;
  };
  playAlong: {
    enabled: boolean;
    maxParticipants: number;
    retentionHours?: number;
    profanityBlock?: boolean;
    bonus?: { fastestCorrectSteal?: boolean; stealPoints?: number };
  };
  tracks: { id: string; name: string; sequences: QuizSequence[] }[];
};

const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

const TEXT_ANIMS: { id: QuizTextAnimationId; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fadeIn", label: "Fade in" },
  { id: "floatIn", label: "Float in" },
  { id: "slideUp", label: "Slide up" },
];

/** html2canvas cannot see `body::before`; apply the same page BG on the cloned `#fit` only (thumbnails). */
function getFitHtml2CanvasOptions(iframe: HTMLIFrameElement) {
  const idoc = iframe.contentDocument;
  const idwin = iframe.contentWindow;
  const bgImage =
    idoc && idwin ? idwin.getComputedStyle(idoc.documentElement).getPropertyValue("--page-bg-image").trim() : "";
  const bgSolid =
    idoc && idwin ? idwin.getComputedStyle(idoc.documentElement).getPropertyValue("--page-bg-solid").trim() : "";
  return {
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: bgSolid || "#0c1410",
    onclone: (doc: Document) => {
      const f = doc.getElementById("fit");
      if (!f) return;
      if (bgSolid) f.style.backgroundColor = bgSolid;
      if (bgImage && bgImage !== "none") {
        f.style.backgroundImage = bgImage;
        f.style.backgroundSize = "cover";
        f.style.backgroundPosition = "center";
        f.style.backgroundRepeat = "no-repeat";
      }
    },
  };
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function firstTrack(q: QuizWheel) {
  if (Array.isArray(q.tracks) && q.tracks.length > 0) return q.tracks[0];
  return { id: "main", name: "Main", sequences: [] as QuizSequence[] };
}

function emptyStyle(): QuizSequenceStyle {
  return {
    bgHex: "",
    bgImageUrl: "",
    textHex: "",
    buttonHex: "",
    soundUrl: "",
    soundLoop: false,
    textAnimation: "none",
  };
}

async function pickUpload(setUrl: (u: string) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const { url } = await uploadFile(f);
    setUrl(url);
  };
  input.click();
}

async function pickFontUpload(onPicked: (u: { url: string; filename?: string }) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".woff2,.woff,.ttf,.otf,font/*,application/font-woff,application/font-woff2";
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const { url, filename } = await uploadFile(f);
    onPicked({ url, filename });
  };
  input.click();
}

async function pickAudio(setUrl: (u: string) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "audio/*";
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const { url } = await uploadFile(f);
    setUrl(url);
  };
  input.click();
}

async function pickManyImages(onUrls: (urls: string[]) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.onchange = async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    files.sort((a, b) => a.name.localeCompare(b.name));
    const urls: string[] = [];
    for (const f of files) {
      const { url } = await uploadFile(f);
      urls.push(url);
    }
    onUrls(urls);
  };
  input.click();
}

function SurfaceFields({
  title,
  theme,
  onChange,
}: {
  title: string;
  theme: QuizSurfaceTheme & { playerIconSetUrl?: string };
  onChange: (next: QuizSurfaceTheme & { playerIconSetUrl?: string }) => void;
}) {
  const t = theme || {};
  const set = (patch: Partial<typeof t>) => onChange({ ...t, ...patch });
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>{title}</summary>
      <div className="grid2" style={{ marginTop: 10 }}>
        <div>
          <label className="field">Background hex</label>
          <input value={t.backgroundHex || ""} onChange={(e) => set({ backgroundHex: e.target.value })} placeholder="#0a1628" />
        </div>
        <div>
          <label className="field">Text hex</label>
          <input value={t.textHex || ""} onChange={(e) => set({ textHex: e.target.value })} />
        </div>
        <div>
          <label className="field">Muted text hex</label>
          <input value={t.mutedHex || ""} onChange={(e) => set({ mutedHex: e.target.value })} />
        </div>
        <div>
          <label className="field">Button bg hex</label>
          <input value={t.buttonHex || ""} onChange={(e) => set({ buttonHex: e.target.value })} />
        </div>
        <div>
          <label className="field">Button text hex</label>
          <input value={t.buttonTextHex || ""} onChange={(e) => set({ buttonTextHex: e.target.value })} />
        </div>
        <div>
          <label className="field">Overlay hex</label>
          <input value={t.overlayHex || ""} onChange={(e) => set({ overlayHex: e.target.value })} />
        </div>
        <div>
          <label className="field">Heading font (CSS)</label>
          <input value={t.fontHeading || ""} onChange={(e) => set({ fontHeading: e.target.value })} placeholder="Georgia, serif" />
        </div>
        <div>
          <label className="field">Body font (CSS)</label>
          <input value={t.fontBody || ""} onChange={(e) => set({ fontBody: e.target.value })} />
        </div>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        <button type="button" className="btn" onClick={() => void pickUpload((url) => set({ backgroundImageUrl: url }))}>
          Upload background image
        </button>{" "}
        {t.backgroundImageUrl ? (
          <span>
            <code>{t.backgroundImageUrl.slice(0, 48)}…</code>
          </span>
        ) : null}
      </p>
      <p className="muted">
        <button type="button" className="btn" onClick={() => void pickUpload((url) => set({ headerImageUrl: url }))}>
          Upload header image
        </button>{" "}
        {t.headerImageUrl ? <code>{t.headerImageUrl.slice(0, 40)}…</code> : null}
      </p>
      {title.startsWith("Mobile") && (
        <p className="muted">
          <label className="field">Player icon sheet / asset URL (optional)</label>
          <input
            style={{ width: "100%", maxWidth: 480 }}
            value={t.playerIconSetUrl || ""}
            onChange={(e) => set({ playerIconSetUrl: e.target.value })}
            placeholder="https://…"
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {(() => {
              const raw = String(t.playerIconSetUrl || "").trim();
              if (!raw) return <>Current icons: <b>0</b></>;
              const items = raw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              return (
                <>
                  Current icons: <b>{items.length}</b> {items.length ? <>(e.g. <code>{items[0].slice(0, 44)}…</code>)</> : null}
                </>
              );
            })()}
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="field">Upload icon images (optional)</label>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void pickManyImages((urls) => {
                  set({ playerIconSetUrl: urls.join(",") } as any);
                })
              }
            >
              Upload icon images
            </button>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Uploading multiple images will store a comma-separated list of `/api/file?id=…` URLs.
            </div>
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-small" onClick={() => set({ playerIconSetUrl: "" } as any)}>
                Clear icons
              </button>
            </div>
          </div>
        </p>
      )}
    </details>
  );
}

export default function QuizEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [quiz, setQuiz] = useState<QuizWheel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rawTracks, setRawTracks] = useState("");
  const [sel, setSel] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const thumbIframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = await apiGet(`/api/wheels?id=${encodeURIComponent(id)}`);
      if (data.gameType !== "quiz") {
        navigate(`/wheels/${id}`, { replace: true });
        return;
      }
      const q = data as QuizWheel;
      setQuiz(q);
      setRawTracks(JSON.stringify(q.tracks || [], null, 2));
      setSel(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const pushPreview = useCallback(
    (q?: QuizWheel | null) => {
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
            playMode: cfg.playMode || (cfg.playAlong?.enabled ? "playAlong" : "facilitated"),
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

  async function save(next?: QuizWheel) {
    const q = next || quiz;
    if (!q) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiSend("/api/wheels", "PUT", q);
      if (res?.wheel) {
        setQuiz(res.wheel as QuizWheel);
        setRawTracks(JSON.stringify((res.wheel as QuizWheel).tracks || [], null, 2));
        pushPreview(res.wheel as QuizWheel);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveWithThumbnail() {
    if (!quiz) return;
    await save();
    // Render first Present slide in a dedicated preview iframe and capture it.
    const iframe = thumbIframeRef.current;
    if (!iframe) return;
    const src = `/play/quiz-present.html?preview=1&thumb=1&slug=${encodeURIComponent(quiz.slug)}&cb=${Date.now()}`;
    iframe.src = src;
    await new Promise<void>((resolve) => {
      const onLoad = () => resolve();
      iframe.addEventListener("load", onLoad, { once: true });
    });
    // Push preview config (same payload as the host preview uses).
    iframe.contentWindow?.postMessage(
      {
        type: "rngames-quiz-config",
        config: {
          gameType: "quiz",
          id: quiz.id,
          title: quiz.title,
          slug: quiz.slug,
          faviconUrl: quiz.faviconUrl || "",
          showPoweredBy: quiz.showPoweredBy !== false,
          playMode: quiz.playMode || (quiz.playAlong?.enabled ? "playAlong" : "facilitated"),
          mode: quiz.mode,
          branding: quiz.branding,
          playAlong: quiz.playAlong,
          tracks: quiz.tracks,
        },
      },
      window.location.origin,
    );
    // Give renderSequence time to paint text (animations disabled for thumb).
    await new Promise((r) => setTimeout(r, 700));
    const fit = iframe.contentDocument?.getElementById("fit");
    if (!fit) return;
    try {
      const canvas = await html2canvas(fit as HTMLElement, { scale: 0.42, ...getFitHtml2CanvasOptions(iframe) });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
      if (!blob) return;
      const file = new File([blob], `thumb-${quiz.id}.jpg`, { type: "image/jpeg" });
      const { url } = await uploadFile(file);
      const res = await apiSend("/api/wheels", "PUT", { ...quiz, thumbnailUrl: url });
      if (res?.wheel) setQuiz(res.wheel as QuizWheel);
    } catch {
      /* optional */
    }
  }

  const setPlayMode = (mode: QuizWheel["playMode"]) => {
    if (!quiz) return;
    setQuiz({ ...quiz, playMode: mode || "facilitated" });
  };

  const setFontUpload = async (slot: "heading" | "subheading" | "body" | "button") => {
    if (!quiz) return;
    await pickFontUpload(({ url }) => {
      const family = window.prompt("Font family name to use (e.g. Acme Sans)", "") || "";
      const fam = family.trim();
      if (!fam) return;
      const fontUploads = { ...(quiz.branding.fontUploads || {}) };
      fontUploads[slot] = { url, family: fam };
      setQuiz({ ...quiz, branding: { ...quiz.branding, fontUploads } });
    });
  };

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

  const questionIds = useMemo(() => sequences.filter((s) => s.type === "question").map((s) => s.id), [sequences]);

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

  function patchMainTrack(fn: (seqs: QuizSequence[]) => QuizSequence[]) {
    if (!quiz) return;
    const base = firstTrack(quiz);
    const rest = (quiz.tracks || []).slice(1);
    const nextTrack = { ...base, sequences: fn([...(base.sequences || [])]) };
    setQuiz({ ...quiz, tracks: [nextTrack, ...rest] });
  }

  function addSequence(kind: QuizSequence["type"]) {
    if (!quiz) return;
    let nextSeq: QuizSequence;
    if (kind === "question") {
      nextSeq = {
        id: uid("q"),
        type: "question",
        prompt: { text: "New question", body: "" },
        timerSeconds: 20,
        input: { mode: quiz.playAlong.enabled ? "playAlong" : "none", type: "buttons", choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
        correct: { choiceId: "a" },
        scoring: { pointsCorrect: 100, pointsWrong: 0 },
        media: { videoUrl: "", bgImageUrl: "", bgColor: "" },
        style: emptyStyle(),
        bonusStealEligible: true,
        textAnimation: "fadeIn",
        advance: { kind: "host" },
      };
    } else if (kind === "reveal") {
      const firstQ = questionIds[0] || "";
      nextSeq = {
        id: uid("rev"),
        type: "reveal",
        referencesQuestionId: firstQ,
        title: "Answer",
        body: "",
        style: emptyStyle(),
        textAnimation: "fadeIn",
        advance: { kind: "host" },
      };
    } else {
      nextSeq = {
        id: uid(kind),
        type: kind as Exclude<QuizSequence["type"], "question" | "reveal">,
        title: kind === "leaderboard" ? "Leaderboard" : kind === "connection" ? "Connect your phone" : "Title",
        headline: kind === "intro" || kind === "connection" ? "Headline" : undefined,
        subhead: kind === "intro" || kind === "connection" ? "Subhead" : undefined,
        body: "",
        bonusReveal: kind === "leaderboard" ? false : undefined,
        media: { videoUrl: "", bgImageUrl: "", bgColor: "" },
        style: emptyStyle(),
        advance: { kind: "host" },
      };
    }
    patchMainTrack((seqs) => [...seqs, nextSeq]);
    setSel(sequences.length);
  }

  function duplicateSequence(at: number) {
    if (!quiz) return;
    const track = quiz.tracks?.[0];
    const seqs = track?.sequences || [];
    const src = seqs[at];
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src)) as QuizSequence;
    copy.id = uid(copy.type);
    const nextSeqs = [...seqs.slice(0, at + 1), copy, ...seqs.slice(at + 1)];
    const nextTrack = { ...track, sequences: nextSeqs };
    setQuiz({ ...quiz, tracks: [nextTrack, ...(quiz.tracks || []).slice(1)] });
    setSel(at + 1);
  }

  function updateSelected(fn: (s: QuizSequence) => QuizSequence) {
    patchMainTrack((seqs) => seqs.map((s, i) => (i === sel ? fn(s) : s)));
  }

  function deleteSelected() {
    if (!quiz || sequences.length === 0) return;
    patchMainTrack((seqs) => seqs.filter((_, i) => i !== sel));
    setSel((s) => Math.max(0, s - 1));
  }

  function moveSequence(from: number, to: number) {
    if (!quiz) return;
    if (from === to) return;
    const max = sequences.length - 1;
    if (from < 0 || from > max) return;
    if (to < 0 || to > max) return;
    patchMainTrack((seqs) => {
      const next = [...seqs];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setSel(to);
  }

  const selected = sequences[sel];

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
        <h3 style={{ marginTop: 0 }}>Brand & favicon</h3>
        <p className="muted">Uploaded files use same-origin URLs and apply to host, presentation, join, and leaderboard.</p>
        <div className="grid2">
          <div>
            <label className="field">Favicon</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={() => void pickUpload((url) => setQuiz({ ...quiz, faviconUrl: url }))}>
                Upload favicon
              </button>
              {quiz.faviconUrl ? <img src={quiz.faviconUrl} alt="" width={28} height={28} style={{ borderRadius: 6 }} /> : null}
            </div>
          </div>
          <div>
            <label className="field">Logo</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={() => void pickUpload((url) => setQuiz({ ...quiz, branding: { ...quiz.branding, logoUrl: url } }))}>
                Upload logo
              </button>
              {quiz.branding?.logoUrl ? <img src={quiz.branding.logoUrl} alt="" width={48} height={48} style={{ borderRadius: 8 }} /> : null}
            </div>
          </div>
          <div>
            <label className="field">Default stage background (hex)</label>
            <input
              value={quiz.branding?.backgroundColor || ""}
              onChange={(e) => setQuiz({ ...quiz, branding: { ...quiz.branding, backgroundColor: e.target.value } })}
            />
          </div>
          <div>
            <label className="field">Default background image</label>
            <button type="button" className="btn" onClick={() => void pickUpload((url) => setQuiz({ ...quiz, branding: { ...quiz.branding, backgroundImage: url } }))}>
              Upload
            </button>
            {quiz.branding?.backgroundImage ? <code className="muted"> {quiz.branding.backgroundImage.slice(0, 40)}…</code> : null}
          </div>
        </div>
        <h4 style={{ marginTop: 16 }}>Fonts (CSS stacks or family names)</h4>
        <div className="grid2">
          <div>
            <label className="field">Heading</label>
            <input
              value={quiz.branding?.fonts?.heading || ""}
              onChange={(e) =>
                setQuiz({ ...quiz, branding: { ...quiz.branding, fonts: { ...quiz.branding?.fonts, heading: e.target.value } } })
              }
            />
          </div>
          <div>
            <label className="field">Subheading</label>
            <input
              value={quiz.branding?.fonts?.subheading || ""}
              onChange={(e) =>
                setQuiz({ ...quiz, branding: { ...quiz.branding, fonts: { ...quiz.branding?.fonts, subheading: e.target.value } } })
              }
            />
          </div>
          <div>
            <label className="field">Body</label>
            <input
              value={quiz.branding?.fonts?.body || ""}
              onChange={(e) =>
                setQuiz({ ...quiz, branding: { ...quiz.branding, fonts: { ...quiz.branding?.fonts, body: e.target.value } } })
              }
            />
          </div>
          <div>
            <label className="field">Button</label>
            <input
              value={quiz.branding?.fonts?.button || ""}
              onChange={(e) =>
                setQuiz({ ...quiz, branding: { ...quiz.branding, fonts: { ...quiz.branding?.fonts, button: e.target.value } } })
              }
            />
          </div>
        </div>

        <h4 style={{ marginTop: 16 }}>Uploaded font files (optional)</h4>
        <p className="muted" style={{ marginTop: 6 }}>
          Upload a font file and provide a <b>family name</b>. Player UIs will load it via <code>@font-face</code>.
        </p>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))", maxWidth: 720 }}>
          {(["heading", "subheading", "body", "button"] as const).map((slot) => {
            const u = quiz.branding?.fontUploads?.[slot];
            return (
              <div key={slot} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{slot}</div>
                  <button type="button" className="btn btn-small" onClick={() => void setFontUpload(slot)}>
                    Upload font
                  </button>
                </div>
                <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                  {u?.family ? (
                    <div>
                      Family: <code>{u.family}</code>
                    </div>
                  ) : (
                    <div>Family: <span style={{ opacity: 0.65 }}>—</span></div>
                  )}
                  {u?.url ? (
                    <div>
                      URL: <code>{u.url.slice(0, 44)}…</code>
                    </div>
                  ) : (
                    <div>URL: <span style={{ opacity: 0.65 }}>—</span></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <SurfaceFields
          title="Mobile (join) theme"
          theme={quiz.branding?.mobile || {}}
          onChange={(mobile) => setQuiz({ ...quiz, branding: { ...quiz.branding, mobile } })}
        />
        <SurfaceFields
          title="Host controller theme"
          theme={quiz.branding?.host || {}}
          onChange={(host) => setQuiz({ ...quiz, branding: { ...quiz.branding, host } })}
        />
        <SurfaceFields
          title="Leaderboard (projector) theme"
          theme={quiz.branding?.leaderboard || {}}
          onChange={(leaderboard) => setQuiz({ ...quiz, branding: { ...quiz.branding, leaderboard } })}
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Mode</h3>
        <div style={{ marginBottom: 12, maxWidth: 320 }}>
          <label className="field">Play mode</label>
          <select value={quiz.playMode || (quiz.playAlong.enabled ? "playAlong" : "facilitated")} onChange={(e) => setPlayMode(e.target.value as QuizWheel["playMode"])}>
            <option value="facilitated">Facilitated (no player input)</option>
            <option value="playAlong">Play-along (phones + leaderboard)</option>
            <option value="kiosk">Kiosk (single-player)</option>
          </select>
        </div>
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
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={quiz.playAlong.bonus?.fastestCorrectSteal === true}
            onChange={(e) =>
              setQuiz({
                ...quiz,
                playAlong: {
                  ...quiz.playAlong,
                  bonus: { ...quiz.playAlong.bonus, fastestCorrectSteal: e.target.checked, stealPoints: quiz.playAlong.bonus?.stealPoints ?? 100 },
                },
              })
            }
          />
          Fastest correct — point steal bonus (global)
        </label>
        <div style={{ marginTop: 8, maxWidth: 200 }}>
          <label className="field">Steal points</label>
          <input
            type="number"
            min={10}
            max={1000}
            value={quiz.playAlong.bonus?.stealPoints ?? 100}
            onChange={(e) =>
              setQuiz({
                ...quiz,
                playAlong: { ...quiz.playAlong, bonus: { ...quiz.playAlong.bonus, stealPoints: Number(e.target.value) } },
              })
            }
          />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Sequences</h3>
        <p className="muted">Select a step to edit universal styling and type-specific content. Save to persist.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={() => addSequence("intro")}>
            + Intro
          </button>
          <button type="button" className="btn btn-primary" onClick={() => addSequence("connection")}>
            + Connection
          </button>
          <button type="button" className="btn btn-primary" onClick={() => addSequence("question")}>
            + Question
          </button>
          <button type="button" className="btn btn-primary" onClick={() => addSequence("reveal")}>
            + Answer reveal
          </button>
          <button type="button" className="btn btn-primary" onClick={() => addSequence("leaderboard")}>
            + Leaderboard
          </button>
          <button type="button" className="btn btn-primary" onClick={() => addSequence("outro")}>
            + Outro
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) 2fr", gap: 16, marginTop: 14, alignItems: "start" }}>
          <div>
            <label className="field">Order</label>
            <ol style={{ margin: 0, paddingLeft: 18, maxHeight: 360, overflow: "auto" }}>
              {sequences.map((s, i) => (
                <li key={s.id} style={{ margin: "6px 0", fontWeight: i === sel ? 700 : 400 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                    <button type="button" className="btn" style={{ textAlign: "left", width: "100%" }} onClick={() => setSel(i)}>
                      <code>{s.type}</code>{" "}
                      {s.type === "question" ? (s as { prompt?: { text?: string } }).prompt?.text?.slice(0, 28) : (s as { title?: string }).title}
                    </button>
                    <div style={{ display: "grid", gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-small"
                        title="Duplicate"
                        onClick={() => duplicateSequence(i)}
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        title="Move up"
                        disabled={i === 0}
                        onClick={() => moveSequence(i, i - 1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        title="Move down"
                        disabled={i === sequences.length - 1}
                        onClick={() => moveSequence(i, i + 1)}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {sequences.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn" onClick={() => duplicateSequence(sel)}>
                  Duplicate selected
                </button>
                <button type="button" className="btn btn-danger" onClick={() => deleteSelected()}>
                  Delete selected
                </button>
              </div>
            )}
          </div>
          <div>
            {!selected ? (
              <p className="muted">Add a sequence.</p>
            ) : (
              <SequenceForm
                seq={selected}
                questionIds={questionIds}
                onChange={updateSelected}
                patchStyle={(patch) => {
                  updateSelected((s) => {
                    const prev = ("style" in s && s.style) || emptyStyle();
                    return { ...s, style: { ...prev, ...patch } } as QuizSequence;
                  });
                }}
              />
            )}
          </div>
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
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Advanced: tracks JSON</summary>
          <p className="muted" style={{ marginTop: 8 }}>
            Full document — use for migration or edge cases. Prefer the form above for day-to-day editing.
          </p>
          <textarea
            value={rawTracks}
            onChange={(e) => setRawTracks(e.target.value)}
            rows={14}
            style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={() => setTracksFromRaw()}>
              Apply JSON locally
            </button>
          </div>
        </details>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn" disabled={saving} onClick={() => void saveWithThumbnail()}>
            Save + thumbnail
          </button>
          <button type="button" className="btn btn-danger" disabled={saving} onClick={() => void deleteQuiz()}>
            Delete quiz
          </button>
        </div>

        <iframe
          ref={thumbIframeRef}
          title="Quiz thumbnail renderer"
          style={{ width: 1920, height: 1080, border: 0, position: "absolute", left: -9999, top: -9999 }}
        />
      </div>
    </div>
  );
}

function SequenceForm({
  seq,
  questionIds,
  onChange,
  patchStyle,
}: {
  seq: QuizSequence;
  questionIds: string[];
  onChange: (next: QuizSequence | ((s: QuizSequence) => QuizSequence)) => void;
  patchStyle: (p: Partial<QuizSequenceStyle>) => void;
}) {
  const st = ("style" in seq && seq.style) || emptyStyle();
  const apply = (next: QuizSequence | ((s: QuizSequence) => QuizSequence)) => {
    if (typeof next === "function") onChange(next);
    else onChange(() => next);
  };

  // Keep a local draft for choices so Enter/newline doesn't get "eaten" by parsing.
  const [choicesDraft, setChoicesDraft] = useState("");
  useEffect(() => {
    if (seq.type !== "question") return;
    if (seq.input.type !== "buttons") return;
    const lines = (seq.input.choices || []).map((c) => `${c.id}|${c.label}`);
    setChoicesDraft(lines.join("\n") + "\n");
  }, [seq.id, seq.type, (seq as { input?: { type?: string } })?.input?.type]);

  return (
    <div>
      <h4 style={{ marginTop: 0 }}>
        Edit <code>{seq.type}</code>
      </h4>

      <h5>Universal</h5>
      <div className="grid2">
        <div>
          <label className="field">Slide BG hex (overrides default)</label>
          <input value={st.bgHex || ""} onChange={(e) => patchStyle({ bgHex: e.target.value })} placeholder="#0a1628" />
        </div>
        <div>
          <label className="field">Text hex</label>
          <input value={st.textHex || ""} onChange={(e) => patchStyle({ textHex: e.target.value })} />
        </div>
        <div>
          <label className="field">Button hex (questions)</label>
          <input value={st.buttonHex || ""} onChange={(e) => patchStyle({ buttonHex: e.target.value })} />
        </div>
        <div>
          <label className="field">Presentation V align</label>
          <select
            value={st.presentVAlign || ""}
            onChange={(e) => patchStyle({ presentVAlign: (e.target.value || undefined) as QuizSequenceStyle["presentVAlign"] })}
          >
            <option value="">Default</option>
            <option value="top">Top</option>
            <option value="middle">Middle</option>
          </select>
        </div>
        <div>
          <label className="field">Presentation H align</label>
          <select
            value={st.presentHAlign || ""}
            onChange={(e) => patchStyle({ presentHAlign: (e.target.value || undefined) as QuizSequenceStyle["presentHAlign"] })}
          >
            <option value="">Default</option>
            <option value="left">Left</option>
            <option value="center">Center</option>
          </select>
        </div>
        <div>
          <label className="field">Presentation tile padding (px)</label>
          <input
            type="number"
            min={0}
            max={120}
            value={Number.isFinite(Number(st.presentTilePadPx)) ? Number(st.presentTilePadPx) : 0}
            onChange={(e) => patchStyle({ presentTilePadPx: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="field">Presentation right padding (px)</label>
          <input
            type="number"
            min={0}
            max={120}
            value={Number.isFinite(Number(st.presentRightPadPx)) ? Number(st.presentRightPadPx) : 0}
            onChange={(e) => patchStyle({ presentRightPadPx: Number(e.target.value) })}
          />
        </div>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={st.presentShowLogo === true}
              onChange={(e) => patchStyle({ presentShowLogo: e.target.checked })}
            />
            Show brand logo above headline (presentation)
          </label>
        </div>
        <div>
          <label className="field">Presentation logo height (px)</label>
          <input
            type="number"
            min={0}
            max={140}
            value={Number.isFinite(Number(st.presentLogoHeightPx)) ? Number(st.presentLogoHeightPx) : 0}
            onChange={(e) => patchStyle({ presentLogoHeightPx: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="field">Presentation logo gap (px)</label>
          <input
            type="number"
            min={0}
            max={80}
            value={Number.isFinite(Number(st.presentLogoGapPx)) ? Number(st.presentLogoGapPx) : 0}
            onChange={(e) => patchStyle({ presentLogoGapPx: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="field">Presentation logo max width (px)</label>
          <input
            type="number"
            min={0}
            max={900}
            value={Number.isFinite(Number(st.presentLogoMaxWidthPx)) ? Number(st.presentLogoMaxWidthPx) : 0}
            onChange={(e) => patchStyle({ presentLogoMaxWidthPx: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="field">Presentation title size (px)</label>
          <input
            type="number"
            min={0}
            max={96}
            value={Number.isFinite(Number(st.presentTitleSizePx)) ? Number(st.presentTitleSizePx) : 0}
            onChange={(e) => patchStyle({ presentTitleSizePx: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="field">Presentation body size (px)</label>
          <input
            type="number"
            min={0}
            max={48}
            value={Number.isFinite(Number(st.presentBodySizePx)) ? Number(st.presentBodySizePx) : 0}
            onChange={(e) => patchStyle({ presentBodySizePx: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="field">Text animation</label>
          <select
            value={st.textAnimation || "none"}
            onChange={(e) => patchStyle({ textAnimation: e.target.value as QuizTextAnimationId })}
          >
            {TEXT_ANIMS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field">Question → answers gap (px)</label>
          <input
            type="number"
            min={0}
            max={160}
            value={Number.isFinite(Number(st.questionToAnswersGapPx)) ? Number(st.questionToAnswersGapPx) : 0}
            onChange={(e) => patchStyle({ questionToAnswersGapPx: Number(e.target.value) })}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Presentation/kiosk tuning. 0 = default spacing.
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="field">Background image</label>
          <button type="button" className="btn" onClick={() => void pickUpload((url) => patchStyle({ bgImageUrl: url }))}>
            Upload
          </button>{" "}
          {st.bgImageUrl ? <code>{st.bgImageUrl.slice(0, 56)}…</code> : null}
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="field">Custom sound</label>
          <button type="button" className="btn" onClick={() => void pickAudio((url) => patchStyle({ soundUrl: url }))}>
            Upload audio
          </button>{" "}
          <label style={{ marginLeft: 12 }}>
            <input
              type="checkbox"
              checked={st.soundLoop === true}
              onChange={(e) => patchStyle({ soundLoop: e.target.checked })}
            />{" "}
            Loop
          </label>
          {st.soundUrl ? <code className="muted"> {st.soundUrl.slice(0, 40)}…</code> : null}
        </div>
      </div>

      {seq.type === "intro" || seq.type === "connection" ? (
        <div style={{ marginTop: 14 }}>
          <h5>Copy</h5>
          <label className="field">Headline</label>
          <input
            value={(seq as { headline?: string }).headline || (seq as { title?: string }).title || ""}
            onChange={(e) => onChange((s) => ({ ...s, headline: e.target.value }) as QuizSequence)}
          />
          <label className="field">Subhead</label>
          <textarea
            rows={3}
            value={(seq as { subhead?: string }).subhead || (seq as { body?: string }).body || ""}
            onChange={(e) => onChange((s) => ({ ...s, subhead: e.target.value }) as QuizSequence)}
          />
        </div>
      ) : null}
      {seq.type === "holding" || seq.type === "outro" || seq.type === "breaker" ? (
        <div style={{ marginTop: 14 }}>
          <h5>Copy</h5>
          <label className="field">Title</label>
          <input
            value={(seq as { title?: string }).title || ""}
            onChange={(e) => apply((s) => ({ ...s, title: e.target.value }) as QuizSequence)}
          />
          <label className="field">Body</label>
          <textarea
            rows={3}
            value={(seq as { body?: string }).body || ""}
            onChange={(e) => apply((s) => ({ ...s, body: e.target.value }) as QuizSequence)}
          />
        </div>
      ) : null}

      {seq.type === "question" ? (
        <div style={{ marginTop: 14 }}>
          <h5>Question</h5>
          <label className="field">Prompt</label>
          <input
            value={seq.prompt.text || ""}
            onChange={(e) => apply({ ...seq, prompt: { ...seq.prompt, text: e.target.value } })}
          />
          <label className="field">Subtext</label>
          <textarea
            rows={2}
            value={seq.prompt.body || ""}
            onChange={(e) => apply({ ...seq, prompt: { ...seq.prompt, body: e.target.value } })}
          />
          <label className="field">Timer (seconds)</label>
          <input
            type="number"
            value={seq.timerSeconds ?? 0}
            onChange={(e) => apply({ ...seq, timerSeconds: Number(e.target.value) })}
          />
          <label className="field">Input format</label>
          <select
            value={seq.input.type}
            onChange={(e) => {
              const t = e.target.value;
              if (t === "buttons") apply({ ...seq, input: { mode: seq.input.mode, type: "buttons", choices: [{ id: "a", label: "A" }] } });
            }}
          >
            <option value="buttons">Multiple choice (buttons)</option>
          </select>
          <p className="muted">More input types (text, slider) can be wired to the same JSON schema later.</p>
          <label className="field">Choices (one per line: id|label)</label>
          <textarea
            rows={4}
            value={seq.input.type === "buttons" ? choicesDraft : ""}
            onChange={(e) => {
              const nextText = e.target.value;
              setChoicesDraft(nextText);
              const lines = nextText.split("\n");
              const choices = lines
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .map((line) => {
                const [id, ...rest] = line.split("|");
                return { id: id.trim(), label: rest.join("|").trim() || id.trim() };
              });
              if (seq.input.type === "buttons") apply({ ...seq, input: { ...seq.input, choices: choices.length ? choices : [{ id: "a", label: "A" }] } });
            }}
          />
          <label className="field">Correct choice id</label>
          <input
            value={seq.correct?.choiceId || ""}
            onChange={(e) => apply({ ...seq, correct: { ...seq.correct, choiceId: e.target.value } })}
          />
          <div className="grid2">
            <div>
              <label className="field">Points correct</label>
              <input
                type="number"
                value={seq.scoring?.pointsCorrect ?? 100}
                onChange={(e) => apply({ ...seq, scoring: { ...seq.scoring, pointsCorrect: Number(e.target.value) } })}
              />
            </div>
            <div>
              <label className="field">Points wrong</label>
              <input
                type="number"
                value={seq.scoring?.pointsWrong ?? 0}
                onChange={(e) => apply({ ...seq, scoring: { ...seq.scoring, pointsWrong: Number(e.target.value) } })}
              />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={seq.bonusStealEligible !== false}
              onChange={(e) => apply({ ...seq, bonusStealEligible: e.target.checked })}
            />
            Eligible for fastest-correct steal (when global bonus is on)
          </label>
          <label className="field">Question text animation</label>
          <select
            value={seq.textAnimation || "none"}
            onChange={(e) => apply({ ...seq, textAnimation: e.target.value as QuizTextAnimationId })}
          >
            {TEXT_ANIMS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {seq.type === "reveal" ? (
        <div style={{ marginTop: 14 }}>
          <h5>Answer reveal</h5>
          <label className="field">Which question</label>
          <select
            value={seq.referencesQuestionId || ""}
            onChange={(e) => apply({ ...seq, referencesQuestionId: e.target.value })}
          >
            <option value="">— pick a question —</option>
            {questionIds.map((qid) => (
              <option key={qid} value={qid}>
                {qid}
              </option>
            ))}
          </select>
          <label className="field">Title override</label>
          <input value={seq.title || ""} onChange={(e) => apply({ ...seq, title: e.target.value })} />
          <label className="field">Body override</label>
          <textarea rows={2} value={seq.body || ""} onChange={(e) => apply({ ...seq, body: e.target.value })} />
        </div>
      ) : null}

      {seq.type === "leaderboard" ? (
        <div style={{ marginTop: 14 }}>
          <h5>Leaderboard</h5>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={(seq as { bonusReveal?: boolean }).bonusReveal === true}
              onChange={(e) => onChange({ ...seq, bonusReveal: e.target.checked } as QuizSequence)}
            />
            Emphasise bonus steal storyline on this slide (copy / future motion)
          </label>
          <label className="field">Title</label>
          <input value={(seq as { title?: string }).title || ""} onChange={(e) => onChange({ ...seq, title: e.target.value } as QuizSequence)} />
        </div>
      ) : null}

    </div>
  );
}
