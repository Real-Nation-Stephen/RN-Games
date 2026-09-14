import { randomUUID } from "node:crypto";
import { connectLambda } from "@netlify/blobs";
import { hostedRemoteContext } from "./lib/blob-runtime.mjs";
import { requireOperatorAuth } from "./lib/auth.mjs";
import {
  readIndex,
  writeIndex,
  setWheelJson,
  readExperiencesIndex,
  writeExperiencesIndex,
  getExperienceJson,
  setExperienceJson,
} from "./lib/blobs.mjs";
import { emptyLiveModuleRecord, normalizeFillGameRecord } from "./lib/live-modules.mjs";
import { emptyPageModuleRecord, normalizePageModule } from "./lib/page-modules.mjs";
import { emptyPinboardRecord } from "./lib/pinboard.mjs";
import {
  emptyExperienceRecord,
  linearStepsToGraph,
  normalizeExperienceRecord,
  toExperienceIndexEntry,
} from "./lib/experience.mjs";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function indexEntry(wheel) {
  return {
    id: wheel.id,
    slug: wheel.slug,
    gameType: wheel.gameType,
    title: wheel.title,
    clientName: wheel.clientName || "",
    projectCode: wheel.projectCode || "",
    designCode: wheel.designCode || "",
    updatedAt: wheel.updatedAt,
    reportingEnabled: !!wheel.reportingEnabled,
    thumbnailUrl: wheel.thumbnailUrl || "",
    archived: false,
  };
}

async function upsertModule(list, slug, factory) {
  const existing = list.find((x) => x.slug === slug);
  const id = existing?.id || randomUUID();
  const doc = factory(id, slug);
  await setWheelJson(id, doc);
  const entry = indexEntry(doc);
  const idx = list.findIndex((x) => x.id === id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  return doc;
}

function manyFillQuestions(base) {
  const questions = [];
  for (let i = 0; i < 20; i++) {
    const a = randomUUID();
    const b = randomUUID();
    questions.push({
      id: randomUUID(),
      prompt: i === 0 ? "Sample: which is the live fill answer?" : `Fill question ${i + 1}?`,
      choices: [
        { id: a, label: "Correct" },
        { id: b, label: "Incorrect" },
      ],
      correctChoiceId: a,
    });
  }
  return { ...base, questions };
}

export const handler = async (event, context) => {
  try {
    connectLambda(event);
  } catch {
    /* local/test store */
  }
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (hostedRemoteContext() && process.env.LIVE_ALLOW_SEED !== "1") {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "Demo seed is disabled on hosted deploys" }) };
  }
  const operator = requireOperatorAuth(event, context);
  if (operator.error) return { ...operator.error, headers: { ...headers, ...(operator.error.headers || {}) } };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };
  }

  try {
    const list = await readIndex();
    const poll = await upsertModule(list, "live-demo-poll", (id, slug) => {
      const d = emptyLiveModuleRecord(id, slug, "mini-poll");
      d.title = "Demo mini poll";
      d.revealDurationMs = 1200;
      d.question = "Which side are you on?";
      d.options[0].label = "Left";
      d.options[1].label = "Right";
      return d;
    });
    const fill = await upsertModule(list, "live-demo-fill", (id, slug) => {
      const d = normalizeFillGameRecord(manyFillQuestions(emptyLiveModuleRecord(id, slug, "fill-game")));
      d.title = "Demo fill game";
      d.teams[0].name = "Team A";
      d.teams[1].name = "Team B";
      d.teams[0].target = 8;
      d.teams[1].target = 8;
      return d;
    });
    const quiz = await upsertModule(list, "live-demo-quiz", (id, slug) => {
      const d = normalizePageModule(emptyPageModuleRecord(id, slug, "mini-quiz"));
      d.title = "Demo mini quiz";
      d.headline = "Live quiz";
      return d;
    });
    const pin = await upsertModule(list, "live-demo-pinboard", (id, slug) => {
      const d = emptyPinboardRecord(id, slug);
      d.title = "Demo pinboard";
      return d;
    });
    const wheel = await upsertModule(list, "live-demo-wheel", (id, slug) => ({
      id,
      slug,
      gameType: "spinning-wheel",
      title: "Demo live wheel",
      clientName: "",
      updatedAt: new Date().toISOString(),
      reportingEnabled: false,
      segmentCount: 8,
      prizes: Array.from({ length: 8 }, (_, i) => `Prize ${i + 1}`),
      segmentOutcome: Array.from({ length: 8 }, () => true),
      weights: null,
      useWeightedSpin: false,
      wheelRotationOffsetDeg: 0,
      assets: {
        logo: PIXEL,
        headline: PIXEL,
        button: PIXEL,
        restart: PIXEL,
        background: PIXEL,
        wheel: PIXEL,
        frame: PIXEL,
        winPanel: PIXEL,
        losePanel: PIXEL,
        segmentPanels: null,
      },
      sounds: { spin: null, segmentReveal: [], music: null, musicVolume: 0.35 },
      spin: { minFullRotations: 4, maxFullRotations: 5, durationMs: 2500, easing: "cubic-bezier(0.15, 0.85, 0.2, 1)" },
      landscape: { minAspectRatio: 0.5 },
      showPoweredBy: false,
    }));
    const scratcher = await upsertModule(list, "live-demo-scratcher", (id, slug) => ({
      id,
      slug,
      gameType: "scratcher",
      title: "Demo live scratcher",
      clientName: "",
      updatedAt: new Date().toISOString(),
      reportingEnabled: false,
      scratcherFormat: "9x16",
      assets: { top: PIXEL, bottomWin: PIXEL, bottomLose: PIXEL, button: PIXEL, backgroundImage: PIXEL },
      backgroundColor: "#07131f",
      sounds: { win: null, lose: null },
      winButtonUrl: "",
      clearThreshold: 0.45,
      winChancePercent: 50,
      showPoweredBy: false,
    }));
    await writeIndex(list);

    const expList = await readExperiencesIndex();
    let expRow = expList.find((x) => x.slug === "live-demo");
    const modules = [
      { doc: poll, type: "mini-poll" },
      { doc: fill, type: "fill-game" },
      { doc: quiz, type: "mini-quiz" },
      { doc: pin, type: "pinboard" },
      { doc: wheel, type: "spinning-wheel" },
      { doc: scratcher, type: "scratcher" },
    ];
    const linearSteps = modules.map((m, i) => ({
      id: `step-${i + 1}`,
      moduleInstanceId: m.doc.id,
      moduleType: m.type,
      label: m.doc.title,
    }));
    let experience;
    if (expRow) {
      const raw = await getExperienceJson(expRow.id);
      experience = normalizeExperienceRecord({
        ...raw,
        title: "Live interactive demo",
        status: "published",
        publishedAt: new Date().toISOString(),
        linearSteps,
        graph: linearStepsToGraph(linearSteps),
        foundation: {
          ...(raw?.foundation || {}),
          interactive: true,
        },
      });
    } else {
      experience = emptyExperienceRecord(randomUUID(), "live-demo", randomUUID());
      experience.title = "Live interactive demo";
      experience.status = "published";
      experience.publishedAt = new Date().toISOString();
      experience.linearSteps = linearSteps;
      experience.graph = linearStepsToGraph(linearSteps);
      experience.foundation.interactive = true;
      expList.push(toExperienceIndexEntry(experience));
    }
    experience = normalizeExperienceRecord(experience);
    await setExperienceJson(experience.id, experience);
    const idx = expList.findIndex((x) => x.id === experience.id);
    const entry = toExperienceIndexEntry(experience);
    if (idx >= 0) expList[idx] = entry;
    else expList.push(entry);
    await writeExperiencesIndex(expList);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        experience,
        modules: modules.map((m) => ({ id: m.doc.id, slug: m.doc.slug, gameType: m.type })),
        master: `/x/live-demo/master`,
        present: `/x/live-demo/present`,
        join: `/x/live-demo/join`,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e instanceof Error ? e.message : "Seed failed" }) };
  }
};
