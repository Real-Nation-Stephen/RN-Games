import { randomUUID } from "node:crypto";
import { connectLambda } from "@netlify/blobs";
import { flipCardSharedRearUrl, normalizeFlipCardFace } from "./lib/flip-cards.mjs";
import { emptyPinboardRecord, normalizePinboardRecord } from "./lib/pinboard.mjs";
import { emptyLeaderboardRecord, normalizeLeaderboardRecord } from "./lib/leaderboard.mjs";
import { emptyCatchRecord, normalizeCatchRecord } from "./lib/catch.mjs";
import { emptyRunnerRecord, normalizeRunnerRecord } from "./lib/runner.mjs";
import {
  emptyPageModuleRecord,
  isPageModuleType,
  normalizePageModule,
  toPublicPageModule,
} from "./lib/page-modules.mjs";
import { requireAuth } from "./lib/auth.mjs";
import {
  readIndex,
  writeIndex,
  getWheelJson,
  setWheelJson,
  deleteWheelBlob,
  deletePinboardStateBlob,
  deleteLeaderboardStateBlob,
} from "./lib/blobs.mjs";
import { validateSlug } from "./lib/validate.mjs";
import { validateUniqueSlug } from "./lib/slug-uniqueness.mjs";
import { ensureWheelReportingTab, sanitizeSheetTabName } from "./lib/sheets.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function emptyScratcherRecord(id, slug) {
  return {
    id,
    gameType: "scratcher",
    title: "Untitled scratcher",
    clientName: "",
    slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
    scratcherFormat: "16x9",
    assets: {
      top: "",
      bottomWin: "",
      bottomLose: "",
      button: "",
      backgroundImage: "",
    },
    backgroundColor: "#0a1628",
    sounds: { win: null, lose: null },
    winButtonUrl: "",
    clearThreshold: 0.97,
    winChancePercent: 50,
  };
}

function emptyFlipCardRecord(id, slug) {
  const n = 7;
  return {
    id,
    gameType: "flip-cards",
    title: "Untitled flip cards",
    clientName: "",
    slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
    selectionHeading: "Tap a card to learn more",
    deckSize: n,
    cardsDealt: 2,
    maxColumns: 4,
    brandLogoCorner: "bl",
    sharedFrontImage: "",
    sharedBackImage: "",
    sharedRearImage: "",
    backgroundImage: "",
    backgroundColor: "#ffffff",
    brandLogoUrl: "",
    sounds: { music: null, musicVolume: 0.35 },
    fonts: { heading: "", body: "", button: "" },
    shuffle: {
      enabled: true,
      showMuteButton: true,
      showFullscreenButton: true,
      label: "Shuffle",
      buttonBg: "rgba(255,255,255,0.15)",
      textColor: "#ffffff",
      textSizePx: 16,
      buttonFontSizePx: 15,
    },
    cards: Array.from({ length: n }, (_, i) => ({
      frontImage: "",
      rearImage: "",
      backImage: "",
      header: `Card ${i + 1}`,
      body: "Placeholder copy for this card.",
      overlayButtonText: "Back",
      soundUrl: "",
    })),
  };
}

function emptyQuizRecord(id, slug) {
  return {
    id,
    gameType: "quiz",
    title: "Untitled quiz",
    clientName: "",
    slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
    playMode: "facilitated",
    mode: {
      presentation: "frame16x9",
      motion: "static",
    },
    branding: {
      logoUrl: "",
      backgroundColor: "#0a1628",
      backgroundImage: "",
      backgroundVideo: "",
      fonts: { heading: "", subheading: "", body: "", button: "" },
      fontUploads: {},
      layout: { buttonBottomPadPx: 12 },
      mobile: {},
      host: {},
      leaderboard: {},
    },
    playAlong: {
      enabled: false,
      maxParticipants: 150,
      retentionHours: 24,
      profanityBlock: true,
      bonus: { fastestCorrectSteal: false, stealPoints: 100 },
    },
    tracks: [
      {
        id: "main",
        name: "Main",
        sequences: [
          {
            id: "intro-1",
            type: "intro",
            advance: { kind: "host" },
            title: "Welcome",
            body: "Get ready to play.",
            media: { videoUrl: "", bgImageUrl: "", bgColor: "" },
          },
          {
            id: "q1",
            type: "question",
            advance: { kind: "host" },
            timerSeconds: 20,
            prompt: { text: "Question 1", body: "Replace this prompt." },
            input: {
              mode: "none",
              type: "buttons",
              choices: [
                { id: "a", label: "Answer A" },
                { id: "b", label: "Answer B" },
              ],
            },
            correct: { choiceId: "a" },
            scoring: { pointsCorrect: 100, pointsWrong: 0 },
          },
          {
            id: "outro-1",
            type: "outro",
            advance: { kind: "host" },
            title: "Thanks for playing",
            body: "",
            media: { videoUrl: "", bgImageUrl: "", bgColor: "" },
          },
        ],
      },
    ],
  };
}

function syncFlipCards(f) {
  const n = Math.min(15, Math.max(1, Number(f.deckSize) || 7));
  f.deckSize = n;
  f.cardsDealt = Math.min(Math.max(1, Number(f.cardsDealt) || 1), n);
  f.maxColumns = Math.min(6, Math.max(1, Number(f.maxColumns) || 4));
  const prev = Array.isArray(f.cards) ? f.cards : [];
  f.cards = Array.from({ length: n }, (_, i) => normalizeFlipCardFace(prev[i], i));
  const sharedRear = flipCardSharedRearUrl(f);
  f.sharedRearImage = sharedRear;
  f.sharedBackImage = sharedRear;
}

function emptyWheelRecord(id, slug) {
  const n = 12;
  return {
    id,
    gameType: "spinning-wheel",
    title: "Untitled wheel",
    clientName: "",
    slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    prizeSchemaVersion: 1,
    segmentCount: n,
    prizes: Array.from({ length: n }, (_, i) => `Prize ${i + 1}`),
    segmentOutcome: Array.from({ length: n }, (_, i) => i % 2 === 1),
    weights: null,
    useWeightedSpin: false,
    wheelRotationOffsetDeg: 0,
    assets: {
      logo: "",
      headline: "",
      button: "",
      restart: "",
      background: "",
      wheel: "",
      frame: "",
      winPanel: "",
      losePanel: "",
      segmentPanels: null,
    },
    sounds: {
      spin: null,
      segmentReveal: Array.from({ length: n }, () => null),
      music: null,
      musicVolume: 0.35,
    },
    spin: {
      minFullRotations: 5,
      maxFullRotations: 8,
      durationMs: 4500,
      easing: "cubic-bezier(0.15, 0.85, 0.2, 1)",
    },
    landscape: { minAspectRatio: 1.25 },
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
  };
}

function syncSegmentArrays(w) {
  const n = Math.min(20, Math.max(2, Number(w.segmentCount) || 10));
  w.segmentCount = n;
  const prizes = Array.isArray(w.prizes) ? w.prizes : [];
  const outcomes = Array.isArray(w.segmentOutcome) ? w.segmentOutcome : [];
  w.prizes = Array.from({ length: n }, (__, i) => prizes[i] ?? `Prize ${i + 1}`);
  w.segmentOutcome = Array.from({ length: n }, (__, i) =>
    outcomes[i] !== undefined ? outcomes[i] : i % 2 === 1,
  );
  if (w.weights && w.weights.length !== n) w.weights = null;
  w.sounds = w.sounds || {};
  w.sounds.segmentReveal = Array.from({ length: n }, (__, i) => w.sounds.segmentReveal?.[i] ?? null);
  const a = w.assets || (w.assets = {});
  if (Array.isArray(a.segmentPanels)) {
    a.segmentPanels = Array.from({ length: n }, (__, i) => a.segmentPanels[i] ?? null);
  }
}

export const handler = async (event, context) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" },
    };
  }

  const deny = requireAuth(event, context);
  if (deny) return { ...deny, headers: { ...headers, ...deny.headers } };

  try {
    if (event.httpMethod === "GET") {
      const id = event.queryStringParameters?.id;
      if (id) {
        const wheel = await getWheelJson(id);
        if (!wheel) {
          return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
        }
        if (wheel.gameType === "leaderboard") normalizeLeaderboardRecord(wheel);
        if (wheel.gameType === "catch") normalizeCatchRecord(wheel);
        if (wheel.gameType === "runner") normalizeRunnerRecord(wheel);
        return { statusCode: 200, body: JSON.stringify(wheel), headers };
      }
      let list = await readIndex();
      const gameType = String(event.queryStringParameters?.gameType || "").trim();
      if (gameType) {
        list = list.filter((x) => x.gameType === gameType);
      }
      return { statusCode: 200, body: JSON.stringify({ wheels: list }), headers };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const slugCheck = await validateUniqueSlug(body.slug || "wheel-" + randomUUID().slice(0, 8));
      if (!slugCheck.ok) {
        return { statusCode: 400, body: JSON.stringify({ error: slugCheck.error }), headers };
      }
      const list = await readIndex();
      if (list.some((x) => x.slug === slugCheck.slug)) {
        return { statusCode: 409, body: JSON.stringify({ error: "Slug already in use" }), headers };
      }
      const id = randomUUID();
      const sourceId = String(body.sourceId || "").trim();
      let wheel;
      if (sourceId) {
        const source = await getWheelJson(sourceId);
        if (!source) {
          return { statusCode: 404, body: JSON.stringify({ error: "Source game not found" }), headers };
        }
        wheel = JSON.parse(JSON.stringify(source));
        wheel.id = id;
        wheel.slug = slugCheck.slug;
        wheel.title = body.title || source.title || "Untitled";
        wheel.clientName = body.clientName ?? source.clientName ?? "";
        wheel.updatedAt = new Date().toISOString();
        if (wheel.gameType === "flip-cards") syncFlipCards(wheel);
        else if (wheel.gameType === "pinboard") normalizePinboardRecord(wheel);
        else if (wheel.gameType === "leaderboard") normalizeLeaderboardRecord(wheel);
        else if (wheel.gameType === "catch") normalizeCatchRecord(wheel);
        else if (wheel.gameType === "runner") normalizeRunnerRecord(wheel);
        else if (
          wheel.gameType !== "scratcher" &&
          wheel.gameType !== "flip-cards" &&
          wheel.gameType !== "quiz" &&
          wheel.gameType !== "pinboard" &&
          wheel.gameType !== "leaderboard" &&
          wheel.gameType !== "catch" &&
          wheel.gameType !== "runner"
        ) {
          syncSegmentArrays(wheel);
        }
      } else {
        const isScratcher = body.gameType === "scratcher";
        const isFlipCards = body.gameType === "flip-cards";
        const isQuiz = body.gameType === "quiz";
        const isPinboard = body.gameType === "pinboard";
        const isLeaderboard = body.gameType === "leaderboard";
        const isCatch = body.gameType === "catch";
        const isRunner = body.gameType === "runner";
        const isPageModule = isPageModuleType(body.gameType);
        wheel = isScratcher
          ? emptyScratcherRecord(id, slugCheck.slug)
          : isFlipCards
            ? emptyFlipCardRecord(id, slugCheck.slug)
            : isQuiz
              ? emptyQuizRecord(id, slugCheck.slug)
              : isPinboard
                ? emptyPinboardRecord(id, slugCheck.slug)
                : isLeaderboard
                  ? emptyLeaderboardRecord(id, slugCheck.slug)
                  : isCatch
                    ? emptyCatchRecord(id, slugCheck.slug)
                  : isRunner
                    ? emptyRunnerRecord(id, slugCheck.slug)
                    : isPageModule
                      ? emptyPageModuleRecord(id, slugCheck.slug, body.gameType)
                      : emptyWheelRecord(id, slugCheck.slug);
        wheel.title = body.title || wheel.title;
        wheel.clientName = body.clientName || "";
      }
      await setWheelJson(id, wheel);
      const entry = {
        id,
        slug: wheel.slug,
        gameType: wheel.gameType || "spinning-wheel",
        title: wheel.title,
        clientName: wheel.clientName,
        projectCode: wheel.projectCode || "",
        designCode: wheel.designCode || "",
        updatedAt: wheel.updatedAt,
        reportingEnabled: wheel.reportingEnabled,
        thumbnailUrl: wheel.thumbnailUrl,
        archived: !!wheel.archived,
      };
      list.push(entry);
      await writeIndex(list);
      return { statusCode: 201, body: JSON.stringify({ wheel }), headers };
    }

    if (event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}");
      const id = body.id;
      if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: "id required" }), headers };
      }
      const existing = await getWheelJson(id);
      if (!existing) {
        return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
      }

      if (body.slug && body.slug !== existing.slug) {
        const slugCheck = await validateUniqueSlug(body.slug, { excludeWheelId: id });
        if (!slugCheck.ok) {
          return { statusCode: 400, body: JSON.stringify({ error: slugCheck.error }), headers };
        }
        const list = await readIndex();
        if (list.some((x) => x.slug === slugCheck.slug && x.id !== id)) {
          return { statusCode: 409, body: JSON.stringify({ error: "Slug already in use" }), headers };
        }
        existing.slug = slugCheck.slug;
      }

      const isFlipCards = existing.gameType === "flip-cards";
      const isQuiz = existing.gameType === "quiz";
      const isPinboard = existing.gameType === "pinboard";
      const isLeaderboard = existing.gameType === "leaderboard";
      const isCatch = existing.gameType === "catch";
      const isRunner = existing.gameType === "runner";
      const isPageModule = isPageModuleType(existing.gameType);
      const isWheel =
        !isPageModule &&
        existing.gameType !== "scratcher" &&
        existing.gameType !== "flip-cards" &&
        existing.gameType !== "quiz" &&
        existing.gameType !== "pinboard" &&
        existing.gameType !== "leaderboard" &&
        existing.gameType !== "catch" &&
        existing.gameType !== "runner";

      if (isWheel && existing.reportingEnabled && existing.reportingLockedAt) {
        const schemaKeys = ["segmentCount", "prizes", "segmentOutcome"];
        for (const k of schemaKeys) {
          if (body[k] !== undefined && JSON.stringify(body[k]) !== JSON.stringify(existing[k])) {
            return {
              statusCode: 423,
              body: JSON.stringify({
                error:
                  "Prize/segment schema is locked while reporting is on. Turn off reporting to edit.",
              }),
              headers,
            };
          }
        }
      }

      const prevReporting = existing.reportingEnabled;

      if (isQuiz) {
        const assign = [
          "title",
          "clientName",
          "thumbnailUrl",
          "reportingEnabled",
          "faviconUrl",
          "showPoweredBy",
          "mode",
          "branding",
          "playAlong",
          "tracks",
        ];
        for (const k of assign) {
          if (body[k] !== undefined) existing[k] = body[k];
        }
      } else if (isFlipCards) {
        const assign = [
          "title",
          "clientName",
          "thumbnailUrl",
          "reportingEnabled",
          "faviconUrl",
          "showPoweredBy",
          "selectionHeading",
          "deckSize",
          "cardsDealt",
          "maxColumns",
          "brandLogoCorner",
          "sharedFrontImage",
          "sharedBackImage",
          "sharedRearImage",
          "backgroundImage",
          "backgroundColor",
          "brandLogoUrl",
          "sounds",
          "fonts",
          "shuffle",
          "cards",
        ];
        for (const k of assign) {
          if (body[k] !== undefined) existing[k] = body[k];
        }
        syncFlipCards(existing);
      } else if (isPinboard) {
        const assign = [
          "title",
          "clientName",
          "thumbnailUrl",
          "reportingEnabled",
          "faviconUrl",
          "showPoweredBy",
          "permissions",
          "board",
          "mobile",
          "moderator",
          "stickies",
        ];
        for (const k of assign) {
          if (body[k] !== undefined) existing[k] = body[k];
        }
        normalizePinboardRecord(existing);
      } else if (isLeaderboard) {
        const assign = [
          "title",
          "clientName",
          "thumbnailUrl",
          "reportingEnabled",
          "faviconUrl",
          "showPoweredBy",
          "mode",
          "linkedGameId",
          "linkedGameSlug",
          "linkedGameTitle",
          "moderatorPin",
          "board",
          "moderator",
        ];
        for (const k of assign) {
          if (body[k] !== undefined) existing[k] = body[k];
        }
        normalizeLeaderboardRecord(existing);
      } else if (isCatch) {
        const assign = [
          "title",
          "clientName",
          "thumbnailUrl",
          "reportingEnabled",
          "faviconUrl",
          "showPoweredBy",
          "backgroundHex",
          "backgrounds",
          "banner",
          "sprites",
          "catcherSpriteUrl",
          "sounds",
          "fonts",
          "fontUploads",
          "hud",
          "gameplay",
          "endScreen",
          "highScore",
          "linkedLeaderboardSlug",
        ];
        for (const k of assign) {
          if (body[k] !== undefined) existing[k] = body[k];
        }
        normalizeCatchRecord(existing);
      } else if (isRunner) {
        const assign = [
          "title",
          "clientName",
          "thumbnailUrl",
          "reportingEnabled",
          "faviconUrl",
          "showPoweredBy",
          "backgroundHex",
          "backgrounds",
          "banner",
          "character",
          "characters",
          "items",
          "parallax",
          "ground",
          "sounds",
          "fonts",
          "fontUploads",
          "hud",
          "feedback",
          "gameplay",
          "intro",
          "endScreen",
          "highScore",
          "linkedLeaderboardSlug",
        ];
        for (const k of assign) {
          if (body[k] !== undefined) existing[k] = body[k];
        }
        normalizeRunnerRecord(existing);
      } else if (isPageModule) {
        const skip = new Set(["id", "slug", "gameType"]);
        for (const [k, v] of Object.entries(body)) {
          if (!skip.has(k) && v !== undefined) existing[k] = v;
        }
        Object.assign(existing, normalizePageModule(existing));
      } else if (isWheel) {
        const assign = [
          "title",
          "clientName",
          "segmentCount",
          "prizes",
          "segmentOutcome",
          "weights",
          "useWeightedSpin",
          "wheelRotationOffsetDeg",
          "assets",
          "sounds",
          "spin",
          "landscape",
          "thumbnailUrl",
          "reportingEnabled",
          "faviconUrl",
          "showPoweredBy",
        ];
        for (const k of assign) {
          if (body[k] !== undefined) existing[k] = body[k];
        }
      } else {
        const assign = [
          "title",
          "clientName",
          "thumbnailUrl",
          "reportingEnabled",
          "faviconUrl",
          "showPoweredBy",
          "scratcherFormat",
          "assets",
          "backgroundColor",
          "sounds",
          "winButtonUrl",
          "clearThreshold",
          "winChancePercent",
        ];
        for (const k of assign) {
          if (body[k] !== undefined) existing[k] = body[k];
        }
      }

      if (body.reportingEnabled === true && !existing.reportingLockedAt) {
        existing.reportingLockedAt = new Date().toISOString();
      }
      if (body.reportingEnabled === false) {
        existing.reportingLockedAt = null;
      }

      if (body.archived !== undefined) existing.archived = !!body.archived;
      if (body.projectCode !== undefined) existing.projectCode = String(body.projectCode || "");
      if (body.designCode !== undefined) existing.designCode = String(body.designCode || "");

      existing.updatedAt = new Date().toISOString();
      if (isWheel) syncSegmentArrays(existing);

      if (isWheel && !isFlipCards && existing.reportingEnabled && !prevReporting && process.env.GOOGLE_SHEET_ID) {
        try {
          const tab = sanitizeSheetTabName(existing.slug, existing.id);
          await ensureWheelReportingTab(tab, { prizeLabels: existing.prizes || [] });
          existing.reportingSheetTab = tab;
        } catch (err) {
          console.error("ensureWheelReportingTab failed", err);
        }
      }

      await setWheelJson(id, existing);

      const list = await readIndex();
      const idx = list.findIndex((x) => x.id === id);
      const entry = {
        id,
        slug: existing.slug,
        gameType: existing.gameType || (isWheel ? "spinning-wheel" : "scratcher"),
        title: existing.title,
        clientName: existing.clientName,
        projectCode: existing.projectCode || "",
        designCode: existing.designCode || "",
        updatedAt: existing.updatedAt,
        reportingEnabled: existing.reportingEnabled,
        thumbnailUrl: existing.thumbnailUrl,
        archived: !!existing.archived,
      };
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      await writeIndex(list);

      return { statusCode: 200, body: JSON.stringify({ wheel: existing }), headers };
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: "id required" }), headers };
      }
      await deleteWheelBlob(id);
      await deletePinboardStateBlob(id);
      await deleteLeaderboardStateBlob(id);
      const list = (await readIndex()).filter((x) => x.id !== id);
      await writeIndex(list);
      return { statusCode: 204, body: "", headers };
    }

    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Server error" }),
    };
  }
};
