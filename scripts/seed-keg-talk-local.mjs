/**
 * Isolated local Ahhh-cademy / Keg Talk example records.
 * Talks to the running QA server over HTTP. Does not write production Blobs.
 * Heineken / Ahhh-cademy stay in configuration. content.json is editorial, not a Studio import.
 *
 *   node scripts/seed-keg-talk-local.mjs
 *   KEG_TALK_BASE=http://127.0.0.1:53771 node scripts/seed-keg-talk-local.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK = process.env.KEG_TALK_PACK || "/Users/realnation/Downloads/Heineken_Keg_Talk_Polish";
const BASE = (process.env.KEG_TALK_BASE || "http://127.0.0.1:53771").replace(/\/$/, "");
const AUTH = "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJkZXYtbG9jYWwiLCJlbWFpbCI6ImRldkBsb2NhbC5wcmV2aWV3In0.dev";

const THEME = {
  bg: "#073D2B",
  surface: "#0A5D3C",
  cream: "#F5F4EC",
  lime: "#D3F56A",
  sky: "#8CD6F1",
};

/** Liquid window of the 600×800 keg art (x=140..460, y=191..674). Generic percent bounds, not engine keg logic. */
const KEG_FILL_WINDOW = {
  xPercent: (140 / 600) * 100,
  yPercent: (191 / 800) * 100,
  widthPercent: (320 / 600) * 100,
  heightPercent: (483 / 800) * 100,
};

const MIME = {
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff2": "font/woff2",
};

async function api(pathname, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      Authorization: AUTH,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 240) };
  }
  if (res.status >= 400) {
    throw new Error(`${method} ${pathname} → ${res.status} ${data.error || text.slice(0, 200)}`);
  }
  return data;
}

async function uploadFile(absPath) {
  const buf = await fs.readFile(absPath);
  const ext = path.extname(absPath).toLowerCase();
  const data = await api("/api/upload", {
    method: "POST",
    body: {
      base64: buf.toString("base64"),
      contentType: MIME[ext] || "application/octet-stream",
      filename: path.basename(absPath),
    },
  });
  if (!data.url) throw new Error(`upload missing url for ${absPath}`);
  return data.url;
}

function branding(files, extra = {}) {
  return {
    logoUrl: files.logo,
    backgroundHex: THEME.bg,
    backgroundImageUrl: files.gamePhone,
    presenterBackgroundImageUrl: files.gamePresenter,
    headlineHex: THEME.cream,
    bodyHex: THEME.cream,
    accentHex: THEME.lime,
    buttonHex: THEME.lime,
    buttonTextHex: THEME.bg,
    headingFont: "'BarlowCondensed-Bold', system-ui, sans-serif",
    bodyFont: "'Inter-Variable', system-ui, sans-serif",
    buttonFont: "'BarlowCondensed-Bold', system-ui, sans-serif",
    fontUploads: {
      heading: { url: files.barlow, family: "BarlowCondensed-Bold" },
      body: { url: files.inter, family: "Inter-Variable" },
      button: { url: files.barlow, family: "BarlowCondensed-Bold" },
    },
    ...extra,
  };
}

async function upsertModule(slug, gameType, title, patch) {
  const list = await api(`/api/wheels?gameType=${encodeURIComponent(gameType)}`);
  const existing = (list.wheels || []).find((w) => w.slug === slug);
  let id = existing?.id;
  if (!id) {
    const created = await api("/api/wheels", {
      method: "POST",
      body: { slug, gameType, title, clientName: "Heineken Ahhh-cademy" },
    });
    id = created.wheel?.id;
    if (!id) throw new Error(`create ${slug} returned no id`);
  }
  const current = await api(`/api/wheels?id=${encodeURIComponent(id)}`);
  const next = patch({ ...current, id, slug, gameType, title, clientName: "Heineken Ahhh-cademy" });
  const saved = await api("/api/wheels", { method: "PUT", body: next });
  return saved.wheel || next;
}

async function upsertExperience(modules) {
  const list = await api("/api/experiences");
  const existing = (list.experiences || []).find((e) => e.slug === "keg-talk");
  let id = existing?.id;
  if (!id) {
    const created = await api("/api/experiences", {
      method: "POST",
      body: { slug: "keg-talk", title: "Keg Talk", clientName: "Heineken Ahhh-cademy" },
    });
    id = created.experience?.id;
    if (!id) throw new Error("create keg-talk experience returned no id");
  }
  const linearSteps = [
    { id: "step-poll", moduleInstanceId: modules.poll.id, moduleType: "mini-poll", label: modules.poll.title },
    { id: "step-fill", moduleInstanceId: modules.fill.id, moduleType: "fill-game", label: modules.fill.title },
    { id: "step-quiz", moduleInstanceId: modules.quiz.id, moduleType: "mini-quiz", label: modules.quiz.title },
    { id: "step-pinboard", moduleInstanceId: modules.pinboard.id, moduleType: "pinboard", label: modules.pinboard.title },
    { id: "step-wheel", moduleInstanceId: modules.wheel.id, moduleType: "spinning-wheel", label: modules.wheel.title },
    { id: "step-scratcher", moduleInstanceId: modules.scratcher.id, moduleType: "scratcher", label: modules.scratcher.title },
  ];
  const saved = await api("/api/experiences", {
    method: "PUT",
    body: {
      id,
      slug: "keg-talk",
      title: "Keg Talk",
      clientName: "Heineken Ahhh-cademy",
      publish: true,
      linearSteps,
      foundation: {
        trackingEnabled: true,
        reportingEnabled: false,
        interactive: true,
        joinScreen: {
          logoUrl: modules.files.logo,
          backgroundImageUrl: modules.files.welcomePhone,
          presenterBackgroundImageUrl: modules.files.welcomePresenter,
          backgroundHex: THEME.bg,
          headline: "KEG TALK",
          instructions: "Pick a side. Back your crew. Tell us your cellar stories.",
          headlineHex: THEME.cream,
          bodyHex: THEME.cream,
          accentHex: THEME.lime,
          buttonHex: THEME.lime,
          buttonTextHex: THEME.bg,
          headingFont: "'BarlowCondensed-Bold', system-ui, sans-serif",
          bodyFont: "'Inter-Variable', system-ui, sans-serif",
          buttonFont: "'BarlowCondensed-Bold', system-ui, sans-serif",
          headingFontUrl: "",
          bodyFontUrl: "",
          fontUploads: {
            heading: { url: modules.files.barlow, family: "BarlowCondensed-Bold" },
            body: { url: modules.files.inter, family: "Inter-Variable" },
            button: { url: modules.files.barlow, family: "BarlowCondensed-Bold" },
          },
          closingHeadline: "GOOD SHIFTS TAKE GOOD CREWS.",
          closingBody: "Take one good idea back behind the bar.",
        },
      },
    },
  });
  return saved.experience;
}

async function main() {
  const ping = await fetch(`${BASE}/admin/`);
  if (!ping.ok) throw new Error(`QA server not reachable at ${BASE} (${ping.status})`);

  const content = JSON.parse(await fs.readFile(path.join(PACK, "content.json"), "utf8"));
  const assets = path.join(PACK, "assets");
  const fonts = path.join(PACK, "fonts");

  const files = {
    logo: await uploadFile(path.join(assets, "ahhh-cademy-logo.png")),
    welcomePresenter: await uploadFile(path.join(assets, "welcome-presenter.png")),
    welcomePhone: await uploadFile(path.join(assets, "welcome-phone.png")),
    gamePresenter: await uploadFile(path.join(assets, "game-presenter.png")),
    gamePhone: await uploadFile(path.join(assets, "game-phone.png")),
    gameTablet: await uploadFile(path.join(assets, "game-tablet.png")),
    celebrationPresenter: await uploadFile(path.join(assets, "celebration-presenter.png")),
    celebrationPhone: await uploadFile(path.join(assets, "celebration-phone.png")),
    pollLook: await uploadFile(path.join(assets, "poll-eye-contact.png")),
    pollBreath: await uploadFile(path.join(assets, "poll-deep-breath.png")),
    mask: await uploadFile(path.join(assets, "keg-fill-mask.png")),
    overlay: await uploadFile(path.join(assets, "keg-outline-overlay.png")),
    scratchCover: await uploadFile(path.join(assets, "scratch-cover.png")),
    medallion: await uploadFile(path.join(assets, "prize-medallion.png")),
    barlow: await uploadFile(path.join(fonts, "BarlowCondensed-Bold.ttf")),
    inter: await uploadFile(path.join(fonts, "Inter-Variable.ttf")),
  };

  const pollSrc = content.polls.find((p) => p.id === "poll-01");
  const poll = await upsertModule("keg-talk-poll", "mini-poll", pollSrc.title, (d) => ({
    ...d,
    question: pollSrc.question,
    revealDurationMs: 3000,
    options: [
      {
        id: d.options?.[0]?.id || "look",
        label: pollSrc.options[0].label,
        accessibleLabel: pollSrc.options[0].accessibleLabel,
        imageUrl: files.pollLook,
      },
      {
        id: d.options?.[1]?.id || "breath",
        label: pollSrc.options[1].label,
        accessibleLabel: pollSrc.options[1].accessibleLabel,
        imageUrl: files.pollBreath,
      },
    ],
    branding: branding(files),
    showPoweredBy: false,
  }));

  const fillSrc = content.fill;
  const fill = await upsertModule("keg-talk-fill", "fill-game", fillSrc.title, (d) => ({
    ...d,
    metric: "count",
    teams: [
      { id: "keg-crew", name: "Keg Crew", colorHex: THEME.lime, fillHex: THEME.lime, target: 24 },
      { id: "tap-team", name: "Tap Team", colorHex: THEME.sky, fillHex: THEME.sky, target: 24 },
    ],
    maskUrl: files.mask,
    foregroundUrl: files.overlay,
    maskPlacement: KEG_FILL_WINDOW,
    questions: fillSrc.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices.map((c) => ({ id: c.id, label: c.label })),
      correctChoiceId: q.correctChoiceId,
    })),
    branding: branding(files),
    showPoweredBy: false,
  }));

  const quizSrc = content.quiz;
  const quiz = await upsertModule("keg-talk-quiz", "mini-quiz", quizSrc.title, (d) => ({
    ...d,
    headline: quizSrc.title,
    body: "Three quick ones. Talk it out, then lock in your own answer.",
    logoUrl: files.logo,
    backgroundHex: THEME.bg,
    backgrounds: { desktop: files.gamePresenter, tablet: files.gameTablet, mobile: files.gamePhone },
    typography: {
      ...(d.typography || {}),
      headlineHex: THEME.cream,
      bodyHex: THEME.cream,
      fonts: {
        heading: "'BarlowCondensed-Bold', system-ui, sans-serif",
        body: "'Inter-Variable', system-ui, sans-serif",
        button: "'BarlowCondensed-Bold', system-ui, sans-serif",
      },
      fontUploads: {
        heading: { url: files.barlow, family: "BarlowCondensed-Bold" },
        body: { url: files.inter, family: "Inter-Variable" },
        button: { url: files.barlow, family: "BarlowCondensed-Bold" },
      },
    },
    primaryCta: { backgroundHex: THEME.lime, textHex: THEME.bg, label: d.primaryCta?.label || "Continue" },
    questions: quizSrc.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices.map((c) => ({ id: c.id, label: c.label })),
      correctChoiceId: q.correctChoiceId,
    })),
    showPoweredBy: false,
  }));

  const pinSrc = content.pinboard;
  const pinboard = await upsertModule("keg-talk-pinboard", "pinboard", pinSrc.title, (d) => ({
    ...d,
    board: {
      ...d.board,
      header: pinSrc.prompt,
      subhead: pinSrc.helper,
      headerHex: THEME.cream,
      subheadHex: THEME.cream,
      backgroundHex: THEME.bg,
      useBackgroundImage: true,
      backgroundImage: files.gamePresenter,
      brandLogoUrl: files.logo,
    },
    mobile: {
      ...d.mobile,
      headline: pinSrc.prompt,
      subheadline: pinSrc.helper,
      backgroundHex: THEME.bg,
      textHex: THEME.cream,
      buttonHex: THEME.lime,
      buttonTextHex: THEME.bg,
    },
    showPoweredBy: false,
  }));

  const wheelSrc = content.wheel;
  const wheel = await upsertModule("keg-talk-wheel", "spinning-wheel", wheelSrc.title, (d) => ({
    ...d,
    prizes: Array.from({ length: d.segmentCount || 8 }, () => wheelSrc.prize),
    assets: {
      ...(d.assets || {}),
      logo: files.logo,
      background: files.gamePresenter,
      winPanel: files.medallion,
      losePanel: files.gamePresenter,
    },
    showPoweredBy: false,
  }));

  const scratchSrc = content.scratcher;
  const scratcher = await upsertModule("keg-talk-scratcher", "scratcher", scratchSrc.title, (d) => ({
    ...d,
    scratcherFormat: "9x16",
    backgroundColor: THEME.bg,
    assets: {
      top: files.scratchCover,
      bottomWin: files.celebrationPhone,
      bottomLose: files.gamePhone,
      button: "",
      backgroundImage: files.gamePhone,
    },
    showPoweredBy: false,
  }));

  const experience = await upsertExperience({
    poll,
    fill,
    quiz,
    pinboard,
    wheel,
    scratcher,
    files,
  });

  const run = await api("/api/live-run", { method: "POST", body: { slug: "keg-talk" } });
  const code = run.code;
  const hostKey = run.hostKey;
  const hk = encodeURIComponent(hostKey);

  const urls = {
    studio: `${BASE}/admin/`,
    pollEditor: `${BASE}/admin/mini-polls/${poll.id}`,
    fillEditor: `${BASE}/admin/fill-games/${fill.id}`,
    quizEditor: `${BASE}/admin/mini-quizzes/${quiz.id}`,
    pinboardEditor: `${BASE}/admin/pinboards/${pinboard.id}`,
    wheelEditor: `${BASE}/admin/wheels/${wheel.id}`,
    scratcherEditor: `${BASE}/admin/scratchers/${scratcher.id}`,
    experienceEditor: `${BASE}/admin/experiences/${experience.id}`,
    master: `${BASE}/x/keg-talk/master#hk=${hk}`,
    present: `${BASE}/x/keg-talk/present/${code}`,
    join: `${BASE}/j/${code}`,
    standalonePoll: `${BASE}/mini-poll/${poll.slug}`,
    standaloneFill: `${BASE}/fill-game/${fill.slug}`,
    standaloneQuiz: `${BASE}/mini-quiz/${quiz.slug}`,
    standalonePinboard: `${BASE}/pinboard/${pinboard.slug}`,
    standaloneWheel: `${BASE}/${wheel.slug}`,
    standaloneScratcher: `${BASE}/scratcher/${scratcher.slug}`,
  };

  const unsupported = [
    "Fill overlay uses the existing generic foregroundUrl field (editor: Optional overlay). keg-hero.png is not used as the live meter.",
    "Wheel presenterReady / presenterSpinning / presenterWin / phoneWin / phoneLose / alreadyWon strings are not WheelRecord fields.",
    "Scratcher presenterReady / presenterRelease / presenterWin / phoneInstruction / phoneWin / phoneLose / alreadyWon strings are not ScratcherRecord fields. Cover PNG includes “Your next Ahhh moment”; live presenter still says “We have a winner!” until a generic copy field exists.",
    "Quiz reveal lines and host follow-ups are facilitator-only; not stored on Mini Quiz questions.",
    "Poll hostBefore / hostAfter are not Mini Poll fields.",
    "Fill hostOpen / hostMid / hostClose are not Fill Game fields.",
    "Join-screen phone waiting copy (“You’re in…”) has no separate phone-only field; phones share join instructions.",
    "D09 closing Figma frame / landing interstitial is not a live-capable node. Closing uses joinScreen.closingHeadline / closingBody.",
    "Tablet backgrounds exist on Mini Quiz only. Live Mini Poll / Fill are Presenter / phone.",
    "Standalone wheel has no disc artwork in the pack; live Flow Master wheel is the procedural number draw.",
    "Scratcher winnerCount is a host Release control, not a stored copy field.",
    "Optional polls 2–6 are not in this live flow (Poll 1 only).",
  ];

  console.log(
    JSON.stringify(
      {
        pack: PACK,
        base: BASE,
        reusedRun: !!run.reused,
        code,
        hostKey,
        fillWindow: KEG_FILL_WINDOW,
        modules: {
          poll: { id: poll.id, slug: poll.slug },
          fill: { id: fill.id, slug: fill.slug },
          quiz: { id: quiz.id, slug: quiz.slug },
          pinboard: { id: pinboard.id, slug: pinboard.slug },
          wheel: { id: wheel.id, slug: wheel.slug },
          scratcher: { id: scratcher.id, slug: scratcher.slug },
        },
        experience: { id: experience.id, slug: experience.slug },
        urls,
        unsupported,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
