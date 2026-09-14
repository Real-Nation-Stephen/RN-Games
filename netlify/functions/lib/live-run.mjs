/**
 * Authoritative live-run engine: cursor, phases, answers, prize ledger.
 * Component branding is config on the snapshot — never Heineken-specific.
 */

import { getWheelJson, readIndex } from "./blobs.mjs";
import { getExperienceJson } from "./blobs.mjs";
import { normalizeExperienceRecord, resolvePublishedSteps, toPublicExperience } from "./experience.mjs";
import {
  normalizeFillGameRecord,
  normalizeMiniPollRecord,
  toPublicFillGame,
  toPublicMiniPoll,
  toPublicMiniQuizLive,
} from "./live-modules.mjs";
import { makeId, makeRoomCode, makeSecret, nowIso, secretsEqual } from "./live-store.mjs";
import { normalizePageModule } from "./page-modules.mjs";

export const LIVE_CAPABLE = new Set([
  "mini-poll",
  "fill-game",
  "mini-quiz",
  "pinboard",
  "spinning-wheel",
  "scratcher",
]);

export const PRESENCE_MS = 60_000;

function defaultJoinScreen() {
  return {
    logoUrl: "",
    backgroundImageUrl: "",
    presenterBackgroundImageUrl: "",
    backgroundHex: "#07131f",
    headline: "Join the live experience",
    instructions: "Scan the QR code or enter the room code on your phone.",
    headlineHex: "#ffffff",
    bodyHex: "#d7e0ea",
    accentHex: "#3ecf8e",
    buttonHex: "#3ecf8e",
    buttonTextHex: "#07131f",
    headingFont: '"Barlow Condensed", Impact, sans-serif',
    bodyFont: "Inter, system-ui, sans-serif",
    buttonFont: '"Barlow Condensed", Impact, sans-serif',
    headingFontUrl:
      "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;600&display=swap",
    bodyFontUrl: "",
    fontUploads: {},
    closingHeadline: "Thanks for playing",
    closingBody: "That's the end of this live run.",
  };
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function participantList(run) {
  return Object.values(run.participants || {});
}

export function isConnected(p, now = Date.now()) {
  const seen = Date.parse(p?.lastSeen || 0);
  return Number.isFinite(seen) && now - seen <= PRESENCE_MS;
}

export function hasPrize(run, participantId) {
  return !!(run.prizeLedger?.awards || {})[participantId];
}

export function eligibleEntrants(run, now = Date.now()) {
  return participantList(run)
    .filter((p) => isConnected(p, now) && !hasPrize(run, p.id))
    .sort((a, b) => a.number - b.number);
}

function mod360(x) {
  return ((x % 360) + 360) % 360;
}

function computeSpinDelta(opts) {
  const { accumulatedDeg, segmentCount, winnerIndex, offsetDeg = 0, minFullRotations, maxFullRotations } = opts;
  const seg = 360 / Math.max(1, segmentCount);
  const centerAngle = seg * (winnerIndex + 0.5);
  const desiredRem = mod360(360 - mod360(centerAngle + offsetDeg));
  const curRem = mod360(accumulatedDeg);
  let addMod = (desiredRem - curRem + 360) % 360;
  const spins = minFullRotations + Math.floor(Math.random() * (maxFullRotations - minFullRotations + 1));
  if (addMod < 0.0001 && spins === 0) addMod = 360;
  return 360 * spins + addMod;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function currentStep(run) {
  const steps = run.snapshot?.steps || [];
  const i = Number(run.currentStepIndex);
  if (i < 0) return null;
  if (i >= steps.length) return null;
  return steps[i];
}

function nodeKind(run) {
  if (run.status === "ended") return "closing";
  const i = Number(run.currentStepIndex);
  if (i < 0) return "lobby";
  const step = currentStep(run);
  if (!step) return "closing";
  if (!LIVE_CAPABLE.has(step.moduleType)) return "unsupported";
  return step.moduleType;
}

function emptyNodeState(kind, step, configs, attemptId) {
  const cfg = step ? configs[step.id] : null;
  const base = { kind, nodeId: step?.id || null, attemptId, phase: "idle" };
  if (kind === "mini-poll") {
    return { ...base, phase: "idle", votes: {}, tally: null, tallyStartedAt: null, revealDurationMs: cfg?.revealDurationMs || 3000 };
  }
  if (kind === "fill-game") {
    const teams = cfg?.teams || [];
    const scores = {};
    for (const t of teams) scores[t.id] = 0;
    return {
      ...base,
      phase: "idle",
      scores,
      events: [],
      cursors: {},
      answered: {},
      finishedTeamId: null,
    };
  }
  if (kind === "mini-quiz") {
    return { ...base, phase: "idle", questionIndex: 0, answers: {}, revealed: false };
  }
  if (kind === "pinboard") {
    return { ...base, phase: "open", submissions: [] };
  }
  if (kind === "spinning-wheel") {
    return {
      ...base,
      phase: "idle",
      pool: [],
      winnerNumber: null,
      winnerParticipantId: null,
      spinStartedAt: null,
      durationMs: 6000,
      pointerOffsetDeg: 0,
      startAngle: 0,
      spinDelta: 0,
    };
  }
  if (kind === "scratcher") {
    return { ...base, phase: "idle", winnerCount: 1, tickets: {}, celebrationQueue: [] };
  }
  return { ...base, phase: "idle" };
}

function publicComponent(step, configs, secrets, node, role) {
  if (!step) return null;
  const cfg = configs[step.id];
  const kind = step.moduleType;
  if (kind === "mini-poll") return toPublicMiniPoll(cfg);
  if (kind === "fill-game") return toPublicFillGame(cfg);
  if (kind === "mini-quiz") {
    const pub = toPublicMiniQuizLive(cfg);
    const qIndex = Number(node?.questionIndex || 0);
    const q = pub.questions[qIndex];
    const revealed = node?.phase === "revealed";
    const secretQ = (secrets[step.id]?.questions || [])[qIndex];
    return {
      ...pub,
      currentQuestion: q
        ? {
            ...q,
            correctChoiceId: revealed && role !== "participant" ? secretQ?.correctChoiceId : undefined,
          }
        : null,
      questionCount: pub.questions.length,
      questionIndex: qIndex,
    };
  }
  if (kind === "pinboard") {
    return {
      gameType: "pinboard",
      id: cfg.id,
      title: cfg.title,
      slug: cfg.slug,
      permissions: cfg.permissions,
      board: cfg.board,
      mobile: {
        ...cfg.mobile,
        stickyAssets: cfg.mobile?.stickyAssets || [],
      },
      moderator: cfg.moderator,
    };
  }
  if (kind === "spinning-wheel") {
    return {
      gameType: "spinning-wheel",
      id: cfg.id,
      title: cfg.title,
      slug: cfg.slug,
      assets: cfg.assets || {},
      sounds: cfg.sounds || {},
      spin: cfg.spin || { durationMs: 6000, minFullRotations: 5, maxFullRotations: 8, easing: "cubic-bezier(0.15, 0.85, 0.2, 1)" },
      wheelRotationOffsetDeg: Number(cfg.wheelRotationOffsetDeg || 0),
    };
  }
  if (kind === "scratcher") {
    return {
      gameType: "scratcher",
      id: cfg.id,
      title: cfg.title,
      slug: cfg.slug,
      assets: cfg.assets || {},
      sounds: cfg.sounds || {},
      backgroundColor: cfg.backgroundColor || "#07131f",
      scratcherFormat: cfg.scratcherFormat || "9x16",
      clearThreshold: Number(cfg.clearThreshold || 0.97),
    };
  }
  return { gameType: kind, id: cfg?.id, title: cfg?.title, slug: cfg?.slug };
}

function pollPublic(node, role) {
  const votes = node.votes || {};
  const total = Object.keys(votes).length;
  const phase = node.phase;
  const showTally = phase === "revealed" || (phase === "tallying" && role === "moderator");
  let tally = null;
  if (showTally && node.tally) tally = node.tally;
  return {
    phase,
    responseCount: total,
    tally: phase === "revealed" ? node.tally : role === "moderator" && phase === "tallying" ? node.tally : null,
    tallyStartedAt: node.tallyStartedAt || null,
    revealDurationMs: node.revealDurationMs || 3000,
  };
}

function fillPublic(node, cfg) {
  const teams = (cfg?.teams || []).map((t) => ({
    ...t,
    score: Number(node.scores?.[t.id] || 0),
  }));
  return {
    phase: node.phase,
    teams,
    metric: cfg?.metric || "count",
    maskUrl: cfg?.maskUrl || "",
    maskPlacement: cfg?.maskPlacement,
    foregroundUrl: cfg?.foregroundUrl || "",
    events: (node.events || []).slice(-40),
    finishedTeamId: node.finishedTeamId || null,
  };
}

function quizPublic(node, cfg, role) {
  const qIndex = Number(node.questionIndex || 0);
  const answers = node.answers || {};
  const accepted = Object.keys(answers).length;
  const secretQ = (cfg?.questions || [])[qIndex];
  let percentCorrect = null;
  if (node.phase === "revealed") {
    if (!accepted) percentCorrect = null;
    else {
      const correct = Object.values(answers).filter((id) => id === secretQ?.correctChoiceId).length;
      percentCorrect = Math.round((correct / accepted) * 100);
    }
  }
  return {
    phase: node.phase,
    questionIndex: qIndex,
    questionCount: Array.isArray(cfg?.questions) ? cfg.questions.length : 0,
    responseCount: accepted,
    percentCorrect: node.phase === "revealed" ? percentCorrect : null,
    noAnswers: node.phase === "revealed" && accepted === 0,
    correctChoiceId: node.phase === "revealed" && role !== "participant" ? secretQ?.correctChoiceId : undefined,
  };
}

function pinboardPublic(node, runId, role, code) {
  const subs = node.submissions || [];
  const mapSub = (s) => ({
    id: s.id,
    participantNumber: s.participantNumber,
    kind: s.kind,
    text: s.text || "",
    status: s.status,
    createdAt: s.createdAt,
    imagePath: s.mediaId
      ? `/api/live-media?runId=${encodeURIComponent(runId)}&id=${encodeURIComponent(s.mediaId)}&code=${encodeURIComponent(code || "")}`
      : null,
  });
  if (role === "moderator") return { phase: node.phase, submissions: subs.map(mapSub) };
  return {
    phase: node.phase,
    submissions: subs.filter((s) => s.status === "approved").map(mapSub),
  };
}

function wheelPublic(node) {
  return {
    phase: node.phase,
    pool: node.pool || [],
    winnerNumber: node.phase === "idle" ? null : node.winnerNumber,
    spinStartedAt: node.spinStartedAt,
    durationMs: node.durationMs || 6000,
    pointerOffsetDeg: node.pointerOffsetDeg || 0,
    startAngle: node.startAngle || 0,
    spinDelta: node.spinDelta || 0,
  };
}

function scratcherPublic(node, role, participantId) {
  const tickets = node.tickets || {};
  const list = Object.values(tickets);
  const revealedWins = list.filter((t) => t.isWin && t.revealed).map((t) => ({
    participantNumber: t.participantNumber,
    revealedAt: t.revealedAt,
  }));
  const base = {
    phase: node.phase,
    winnerCount: node.winnerCount,
    recipientCount: list.length,
    revealedCount: list.filter((t) => t.revealed).length,
    celebrationQueue: node.celebrationQueue || [],
    winners: role === "moderator" ? list.filter((t) => t.isWin).map((t) => ({
      participantNumber: t.participantNumber,
      revealed: !!t.revealed,
    })) : revealedWins,
  };
  if (participantId && tickets[participantId]) {
    base.myTicket = {
      isWin: !!tickets[participantId].isWin,
      revealed: !!tickets[participantId].revealed,
      alreadyWon: false,
    };
  }
  return base;
}

export function makeViewToken(state) {
  const a = state.activity || {};
  const subs = Array.isArray(a.submissions) ? a.submissions : [];
  return [
    state.revision,
    a.kind,
    a.phase,
    state.connectedCount,
    state.eligibleCount,
    state.held ? 1 : 0,
    state.currentStepIndex,
    state.roundAttemptId,
    state.prizeCount,
    a.responseCount ?? "",
    a.revealedCount ?? "",
    a.winnerNumber ?? "",
    a.finishedTeamId ?? "",
    subs.length,
    subs.map((s) => `${s.id}:${s.status}`).join(","),
    a.celebrationQueue?.length ?? "",
  ].join("|");
}

export function projectRun(run, role, participantId) {
  const working = clone(run);
  tickRun(working);
  run = working;
  const kind = nodeKind(run);
  const step = currentStep(run);
  const node = run.node || {};
  const configs = run.snapshot?.configs || {};
  const secrets = run.snapshot?.secrets || {};
  const cfg = step ? configs[step.id] : null;
  const joinScreen = { ...defaultJoinScreen(), ...(run.snapshot?.joinScreen || {}) };
  const me = participantId ? run.participants?.[participantId] : null;

  let activity = { kind, phase: node.phase || "idle" };
  if (kind === "mini-poll") activity = { kind, ...pollPublic(node, role) };
  else if (kind === "fill-game") activity = { kind, ...fillPublic(node, cfg) };
  else if (kind === "mini-quiz") activity = { kind, ...quizPublic(node, cfg, role) };
  else if (kind === "pinboard") activity = { kind, ...pinboardPublic(node, run.runId, role, run.code) };
  else if (kind === "spinning-wheel") activity = { kind, ...wheelPublic(node) };
  else if (kind === "scratcher") activity = { kind, ...scratcherPublic(node, role, participantId) };
  else if (kind === "lobby") activity = { kind, phase: "lobby" };
  else if (kind === "closing") activity = { kind, phase: "ended" };
  else if (kind === "unsupported") activity = { kind, phase: "idle", moduleType: step?.moduleType };

  const connected = participantList(run).filter((p) => isConnected(p)).length;
  const eligible = eligibleEntrants(run);

  const out = {
    revision: run.revision,
    runId: run.runId,
    code: run.code,
    experienceId: run.experienceId,
    experienceSlug: run.experienceSlug,
    title: run.snapshot?.title || "",
    status: run.status,
    held: !!run.held,
    currentStepIndex: run.currentStepIndex,
    roundAttemptId: run.roundAttemptId,
    cue: run.cue || null,
    joinScreen,
    steps: (run.snapshot?.steps || []).map((s, i) => ({
      id: s.id,
      label: s.label,
      moduleType: s.moduleType,
      liveCapable: !!s.liveCapable,
      current: i === run.currentStepIndex,
    })),
    participantCount: participantList(run).length,
    connectedCount: connected,
    eligibleCount: eligible.length,
    activity,
    component: publicComponent(step, configs, secrets, node, role),
    prizeCount: Object.keys(run.prizeLedger?.awards || {}).length,
    now: Date.now(),
  };
  out.viewToken = makeViewToken(out);

  if (role === "moderator") {
    out.controllerId = run.controllerId || null;
    out.lastCommandId = run.lastCommandId || null;
    out.participants = participantList(run).map((p) => ({
      id: p.id,
      number: p.number,
      teamId: p.teamId || null,
      lastSeen: p.lastSeen,
      connected: isConnected(p),
      awarded: hasPrize(run, p.id),
    }));
    out.eligible = eligible.map((p) => ({ number: p.number, id: p.id }));
    out.awards = Object.values(run.prizeLedger?.awards || {});
  }

  if (me) {
    out.me = {
      participantId: me.id,
      participantNumber: me.number,
      teamId: me.teamId || null,
      awarded: hasPrize(run, me.id),
      award: (run.prizeLedger?.awards || {})[me.id] || null,
    };
    if (kind === "mini-poll") {
      out.me.votedOptionId = (node.votes || {})[me.id] || null;
    }
    if (kind === "fill-game") {
      const qid = (node.cursors || {})[me.id];
      const questions = cfg?.questions || [];
      const idx = Number.isInteger(qid) ? qid : 0;
      out.me.questionIndex = idx;
      out.me.waitingForBank = idx >= questions.length;
      out.me.lastFeedback = (node.lastFeedback || {})[me.id] || null;
      const q = questions[idx];
      out.me.question = q
        ? { id: q.id, prompt: q.prompt, choices: q.choices }
        : null;
    }
    if (kind === "mini-quiz") {
      const answers = node.answers || {};
      out.me.answered = Object.prototype.hasOwnProperty.call(answers, me.id);
      out.me.choiceId = answers[me.id] || null;
      if (node.phase === "revealed") {
        const secretQ = (cfg?.questions || [])[Number(node.questionIndex || 0)];
        out.me.correct = answers[me.id] === secretQ?.correctChoiceId;
        out.me.correctChoiceId = secretQ?.correctChoiceId;
      }
    }
    if (kind === "scratcher") {
      const tickets = node.tickets || {};
      if (hasPrize(run, me.id) && !tickets[me.id]) {
        out.me.alreadyWon = true;
      }
      if (tickets[me.id]) {
        out.me.ticket = {
          ticketId: tickets[me.id].ticketId,
          isWin: !!tickets[me.id].isWin,
          revealed: !!tickets[me.id].revealed,
        };
      } else if (node.phase === "released") {
        out.me.waitingNextRelease = true;
      }
    }
    if (kind === "spinning-wheel") {
      out.me.inPool = (node.pool || []).some((n) => n === me.number);
      out.me.isWinner = node.winnerParticipantId === me.id && node.phase !== "idle";
    }
  }

  return out;
}

export async function buildSnapshot(experience) {
  const testHooks = globalThis.__RN_LIVE_TEST__ || {};
  if (typeof testHooks.buildSnapshot === "function") {
    return testHooks.buildSnapshot(experience);
  }
  const moduleIndex = await readIndex();
  const moduleById = new Map(moduleIndex.map((m) => [m.id, m]));
  const steps = resolvePublishedSteps(experience, moduleById).filter((s) => !s.missing && !s.archived);
  const configs = {};
  const secrets = {};
  const liveSteps = [];
  for (const step of steps) {
    const row = moduleById.get(step.moduleInstanceId);
    const raw = row ? await getWheelJson(row.id) : null;
    const liveCapable = LIVE_CAPABLE.has(step.moduleType);
    liveSteps.push({
      id: step.id,
      moduleInstanceId: step.moduleInstanceId,
      moduleType: step.moduleType,
      label: step.label || step.moduleTitle || step.moduleType,
      moduleSlug: step.moduleSlug,
      liveCapable,
    });
    if (!raw) continue;
    if (step.moduleType === "mini-poll") {
      configs[step.id] = normalizeMiniPollRecord(raw);
    } else if (step.moduleType === "fill-game") {
      const full = normalizeFillGameRecord(raw);
      configs[step.id] = full;
      secrets[step.id] = { questions: full.questions };
    } else if (step.moduleType === "mini-quiz") {
      const full = normalizePageModule(raw);
      configs[step.id] = full;
      secrets[step.id] = { questions: full.questions || [] };
    } else {
      configs[step.id] = raw;
    }
  }
  return {
    title: experience.title,
    joinScreen: { ...defaultJoinScreen(), ...(experience.foundation?.joinScreen || {}) },
    steps: liveSteps,
    configs,
    secrets,
    publicExperience: toPublicExperience(experience, steps),
  };
}

export function createRunDocument({ experience, snapshot, hostKey, code }) {
  const runId = makeId();
  return {
    revision: 1,
    runId,
    code,
    hostKey,
    experienceId: experience.id,
    experienceSlug: experience.slug,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
    status: "lobby",
    held: false,
    controllerId: null,
    lastCommandId: null,
    commandLog: {},
    currentStepIndex: -1,
    roundAttemptId: makeId(),
    cue: null,
    snapshot,
    nextParticipantNumber: 1,
    participants: {},
    prizeLedger: { awards: {} },
    node: emptyNodeState("lobby", null, snapshot.configs, makeId()),
  };
}

export function activateStep(run, index) {
  const steps = run.snapshot?.steps || [];
  if (index < 0) {
    run.currentStepIndex = -1;
    run.status = "lobby";
    run.roundAttemptId = makeId();
    run.node = emptyNodeState("lobby", null, run.snapshot.configs, run.roundAttemptId);
    run.cue = null;
    return;
  }
  if (index >= steps.length) {
    run.currentStepIndex = steps.length;
    run.status = "ended";
    run.node = emptyNodeState("closing", null, run.snapshot.configs, makeId());
    run.cue = null;
    return;
  }
  const step = steps[index];
  run.currentStepIndex = index;
  run.status = "running";
  run.roundAttemptId = makeId();
  const kind = LIVE_CAPABLE.has(step.moduleType) ? step.moduleType : "unsupported";
  run.node = emptyNodeState(kind, step, run.snapshot.configs, run.roundAttemptId);
  run.cue = null;
  if (kind === "fill-game") {
    const cfg = run.snapshot.configs[step.id];
    for (const p of participantList(run)) {
      if (!p.teamId) p.teamId = assignTeam(run, cfg);
    }
  }
}

function assignTeam(run, cfg) {
  const teams = cfg?.teams || [];
  if (teams.length < 2) return teams[0]?.id || null;
  const counts = { [teams[0].id]: 0, [teams[1].id]: 0 };
  for (const p of participantList(run)) {
    if (p.teamId && counts[p.teamId] != null) counts[p.teamId] += 1;
  }
  if (counts[teams[0].id] < counts[teams[1].id]) return teams[0].id;
  if (counts[teams[1].id] < counts[teams[0].id]) return teams[1].id;
  return pickRandom(teams).id;
}

export function joinParticipant(run, existingId, secret) {
  if (existingId) {
    const p = run.participants[existingId];
    if (!p || !secret || !secretsEqual(String(p.secret || ""), String(secret))) {
      throw Object.assign(new Error("Invalid participant"), { statusCode: 403 });
    }
    p.lastSeen = nowIso();
    return p;
  }
  if (run.status === "superseded") {
    throw Object.assign(new Error("Run ended"), { statusCode: 410 });
  }
  const id = makeId();
  const participantSecret = makeSecret();
  const number = run.nextParticipantNumber++;
  const kind = nodeKind(run);
  let teamId = null;
  if (kind === "fill-game") {
    const step = currentStep(run);
    teamId = assignTeam(run, run.snapshot.configs[step.id]);
  }
  const p = {
    id,
    secret: participantSecret,
    number,
    lastSeen: nowIso(),
    joinedAt: nowIso(),
    teamId,
  };
  run.participants[id] = p;
  return p;
}

export function heartbeat(run, participantId) {
  const p = run.participants[participantId];
  if (!p) return false;
  p.lastSeen = nowIso();
  if (!p.teamId && nodeKind(run) === "fill-game") {
    const step = currentStep(run);
    p.teamId = assignTeam(run, run.snapshot.configs[step.id]);
  }
  return true;
}

const COMMAND_LOG_MAX = 48;

function getCommandLog(run) {
  if (!run.commandLog || typeof run.commandLog !== "object") run.commandLog = {};
  return run.commandLog;
}

function recallCommand(run, commandId) {
  if (!commandId) return null;
  const row = getCommandLog(run)[commandId];
  return row || null;
}

function storeCommand(run, commandId, action, result) {
  const id = commandId || makeId();
  run.lastCommandId = id;
  const log = getCommandLog(run);
  log[id] = { action, result: clone(result || {}), at: nowIso() };
  const ids = Object.keys(log);
  if (ids.length > COMMAND_LOG_MAX) {
    ids.sort((a, b) => Date.parse(log[a].at || 0) - Date.parse(log[b].at || 0));
    for (const extra of ids.slice(0, ids.length - COMMAND_LOG_MAX)) delete log[extra];
  }
  return id;
}

function expectedNodeId(run) {
  const kind = nodeKind(run);
  if (kind === "lobby") return "lobby";
  if (kind === "closing") return "closing";
  return currentStep(run)?.id || "";
}

export function assertAttempt(run, payload = {}, { requireQuestion = false, requireTicket = false } = {}) {
  const runId = String(payload.runId || "");
  if (runId && runId !== String(run.runId || "")) {
    throw Object.assign(new Error("Stale run"), { statusCode: 409, code: "stale_run" });
  }
  const nodeId = String(payload.nodeId || "");
  const expected = expectedNodeId(run);
  if (!nodeId || nodeId !== expected) {
    throw Object.assign(new Error("Stale node"), { statusCode: 409, code: "stale_node" });
  }
  const roundAttemptId = String(payload.roundAttemptId || "");
  if (!roundAttemptId || roundAttemptId !== String(run.roundAttemptId || "")) {
    throw Object.assign(new Error("Stale round"), { statusCode: 409, code: "stale_round" });
  }
  if (requireQuestion && !String(payload.questionId || "").trim()) {
    throw Object.assign(new Error("questionId required"), { statusCode: 400, code: "missing_question" });
  }
  if (requireTicket && !String(payload.ticketId || "").trim()) {
    throw Object.assign(new Error("ticketId required"), { statusCode: 400, code: "missing_ticket" });
  }
}

export function applyControl(run, action, payload = {}) {
  const { commandId, controllerId, takeover } = payload;
  const recalled = recallCommand(run, commandId);
  if (recalled) {
    return { duplicate: true, commandId, ...(recalled.result || {}) };
  }
  if (payload.expectedRevision != null && Number(payload.expectedRevision) !== Number(run.revision || 0)) {
    throw Object.assign(new Error("Stale console revision"), { statusCode: 409, code: "stale_revision" });
  }
  if (run.controllerId && controllerId && run.controllerId !== controllerId && !takeover) {
    throw Object.assign(new Error("Another console is in control. Take over to continue."), {
      statusCode: 409,
      code: "controller_taken",
    });
  }
  if (controllerId) run.controllerId = controllerId;
  const finish = (result) => {
    storeCommand(run, commandId, action, result);
    return result;
  };

  if (action === "takeover") {
    run.controllerId = controllerId || makeId();
    return finish({ controllerId: run.controllerId });
  }
  if (action === "hold") {
    run.held = true;
    if (nodeKind(run) === "fill-game" && run.node.phase === "racing") run.node.phase = "held";
    return finish({});
  }
  if (action === "resume") {
    run.held = false;
    if (nodeKind(run) === "fill-game" && run.node.phase === "held" && !run.node.finishedTeamId) {
      run.node.phase = "racing";
    }
    return finish({});
  }
  if (action === "end") {
    run.status = "ended";
    run.currentStepIndex = (run.snapshot.steps || []).length;
    run.node = emptyNodeState("closing", null, run.snapshot.configs, makeId());
    run.cue = null;
    return finish({});
  }
  if (action === "next") {
    const steps = run.snapshot.steps || [];
    let i = Number(run.currentStepIndex) + 1;
    while (i < steps.length && !steps[i].liveCapable) i += 1;
    activateStep(run, i);
    return finish({ currentStepIndex: run.currentStepIndex, roundAttemptId: run.roundAttemptId });
  }
  if (action === "prev") {
    const steps = run.snapshot.steps || [];
    let i = Number(run.currentStepIndex) - 1;
    while (i >= 0 && steps[i] && !steps[i].liveCapable) i -= 1;
    activateStep(run, i);
    return finish({ currentStepIndex: run.currentStepIndex, roundAttemptId: run.roundAttemptId });
  }
  if (action === "replay") {
    const i = Number(run.currentStepIndex);
    activateStep(run, i);
    return finish({ currentStepIndex: run.currentStepIndex, roundAttemptId: run.roundAttemptId });
  }

  const kind = nodeKind(run);
  const node = run.node;
  const step = currentStep(run);
  const cfg = step ? run.snapshot.configs[step.id] : null;

  if (kind === "mini-poll") return finish(controlPoll(run, node, cfg, action, payload));
  if (kind === "fill-game") return finish(controlFill(run, node, action));
  if (kind === "mini-quiz") return finish(controlQuiz(run, node, cfg, action));
  if (kind === "pinboard") return finish(controlPinboard(run, node, action, payload));
  if (kind === "spinning-wheel") return finish(controlWheel(run, node, cfg, action));
  if (kind === "scratcher") return finish(controlScratcher(run, node, cfg, action, payload));
  throw Object.assign(new Error(`Unknown action ${action}`), { statusCode: 400 });
}

function controlPoll(run, node, cfg, action) {
  if (action === "open") {
    node.phase = "open";
    node.votes = {};
    node.tally = null;
    node.tallyStartedAt = null;
    return {};
  }
  if (action === "close") {
    if (node.phase === "open") node.phase = "closed";
    return {};
  }
  if (action === "tally") {
    if (node.tally && node.phase === "revealed") return { alreadyTallied: true };
    if (node.tally && node.phase === "tallying") return { alreadyTallied: true };
    const opts = cfg?.options || [];
    const counts = { [opts[0]?.id]: 0, [opts[1]?.id]: 0 };
    for (const optId of Object.values(node.votes || {})) {
      if (counts[optId] != null) counts[optId] += 1;
    }
    const total = Object.keys(node.votes || {}).length;
    const a = counts[opts[0]?.id] || 0;
    const b = counts[opts[1]?.id] || 0;
    let result = "split";
    if (total === 0) result = "zero";
    else if (a === b) result = "tie";
    else result = a > b ? "a" : "b";
    node.tally = {
      counts,
      total,
      percents: {
        [opts[0]?.id]: total ? Math.round((a / total) * 100) : 0,
        [opts[1]?.id]: total ? Math.round((b / total) * 100) : 0,
      },
      result,
    };
    node.phase = "tallying";
    node.tallyStartedAt = Date.now();
    node.revealDurationMs = cfg?.revealDurationMs || 3000;
    run.cue = { kind: "tally", startedAt: node.tallyStartedAt, durationMs: node.revealDurationMs };
    return {};
  }
  if (action === "complete-tally") {
    if (node.phase === "tallying") node.phase = "revealed";
    return {};
  }
  throw Object.assign(new Error(`Unknown poll action ${action}`), { statusCode: 400 });
}

function controlFill(run, node, action) {
  if (action === "open") {
    if (node.finishedTeamId) return {};
    node.phase = "racing";
    run.held = false;
    return {};
  }
  if (action === "close" || action === "finish") {
    node.phase = "finished";
    return {};
  }
  throw Object.assign(new Error(`Unknown fill action ${action}`), { statusCode: 400 });
}

function controlQuiz(run, node, cfg, action) {
  const questions = cfg?.questions || [];
  if (action === "open") {
    node.phase = "open";
    node.answers = {};
    node.revealed = false;
    return {};
  }
  if (action === "close") {
    if (node.phase === "open") node.phase = "closed";
    return {};
  }
  if (action === "reveal") {
    node.phase = "revealed";
    node.revealed = true;
    return {};
  }
  if (action === "next-question") {
    const next = Number(node.questionIndex || 0) + 1;
    if (next >= questions.length) {
      node.phase = "done";
      return {};
    }
    node.questionIndex = next;
    node.phase = "idle";
    node.answers = {};
    node.revealed = false;
    return {};
  }
  throw Object.assign(new Error(`Unknown quiz action ${action}`), { statusCode: 400 });
}

function controlPinboard(run, node, action, payload) {
  const id = String(payload.submissionId || "");
  const sub = (node.submissions || []).find((s) => s.id === id);
  if (action === "approve") {
    if (!sub) throw Object.assign(new Error("Submission not found"), { statusCode: 404 });
    sub.status = "approved";
    return {};
  }
  if (action === "reject") {
    if (!sub) throw Object.assign(new Error("Submission not found"), { statusCode: 404 });
    sub.status = "rejected";
    return {};
  }
  if (action === "remove") {
    node.submissions = (node.submissions || []).filter((s) => s.id !== id);
    return {};
  }
  throw Object.assign(new Error(`Unknown pinboard action ${action}`), { statusCode: 400 });
}

function reservePrize(run, participant, source) {
  if (hasPrize(run, participant.id)) {
    throw Object.assign(new Error("Participant already awarded"), { statusCode: 409, code: "already_awarded" });
  }
  run.prizeLedger = run.prizeLedger || { awards: {} };
  run.prizeLedger.awards[participant.id] = {
    participantId: participant.id,
    participantNumber: participant.number,
    source,
    nodeId: currentStep(run)?.id || null,
    roundAttemptId: run.roundAttemptId,
    reservedAt: nowIso(),
    revealedAt: null,
    claimedAt: null,
    ticketId: null,
  };
  return run.prizeLedger.awards[participant.id];
}

function controlWheel(run, node, cfg, action) {
  if (action === "spin") {
    if (node.phase === "spinning" || node.phase === "revealed") {
      return { alreadySpun: true };
    }
    const eligible = eligibleEntrants(run);
    if (!eligible.length) {
      throw Object.assign(new Error("No eligible participants"), { statusCode: 409, code: "no_eligible" });
    }
    const winner = pickRandom(eligible);
    const pool = shuffle(eligible).map((p) => p.number);
    const award = reservePrize(run, winner, "wheel");
    const spin = cfg?.spin || {};
    const durationMs = Math.max(2500, Number(spin.durationMs) || 6000);
    const winnerIndex = Math.max(0, pool.indexOf(winner.number));
    const startAngle = 0;
    const spinDelta = computeSpinDelta({
      accumulatedDeg: startAngle,
      segmentCount: pool.length,
      winnerIndex,
      offsetDeg: Number(cfg?.wheelRotationOffsetDeg || 0),
      minFullRotations: Math.max(4, Number(spin.minFullRotations) || 5),
      maxFullRotations: Math.max(5, Number(spin.maxFullRotations) || 6),
    });
    node.phase = "spinning";
    node.pool = pool;
    node.winnerNumber = winner.number;
    node.winnerParticipantId = winner.id;
    node.spinStartedAt = Date.now();
    node.durationMs = durationMs;
    node.pointerOffsetDeg = Number(cfg?.wheelRotationOffsetDeg || 0);
    node.startAngle = startAngle;
    node.spinDelta = spinDelta;
    node.award = award;
    run.cue = { kind: "spin", startedAt: node.spinStartedAt, durationMs };
    return { winnerNumber: winner.number };
  }
  if (action === "complete-spin") {
    if (node.phase === "spinning") node.phase = "revealed";
    return {};
  }
  throw Object.assign(new Error(`Unknown wheel action ${action}`), { statusCode: 400 });
}

function controlScratcher(run, node, cfg, action, payload) {
  if (action === "release") {
    if (node.phase === "released" || node.phase === "celebrating") {
      return { alreadyReleased: true };
    }
    const eligible = eligibleEntrants(run);
    if (!eligible.length) {
      throw Object.assign(new Error("No eligible participants"), { statusCode: 409, code: "no_eligible" });
    }
    const requested = Math.max(1, Math.floor(Number(payload.winnerCount) || 1));
    if (requested > eligible.length) {
      throw Object.assign(new Error(`Only ${eligible.length} eligible`), {
        statusCode: 409,
        code: "too_many_winners",
        eligibleCount: eligible.length,
      });
    }
    const winners = shuffle(eligible).slice(0, requested);
    const winnerIds = new Set(winners.map((w) => w.id));
    node.tickets = {};
    for (const p of eligible) {
      const isWin = winnerIds.has(p.id);
      const ticketId = makeId();
      node.tickets[p.id] = {
        ticketId,
        participantId: p.id,
        participantNumber: p.number,
        isWin,
        revealed: false,
        revealedAt: null,
      };
      if (isWin) {
        const award = reservePrize(run, p, "scratcher");
        award.ticketId = ticketId;
      }
    }
    node.winnerCount = requested;
    node.phase = "released";
    node.celebrationQueue = [];
    run.cue = { kind: "scratch-release", startedAt: Date.now(), durationMs: 1500 };
    return { recipientCount: eligible.length, winnerCount: requested };
  }
  throw Object.assign(new Error(`Unknown scratcher action ${action}`), { statusCode: 400 });
}

export function applyParticipantAction(run, participantId, action, payload = {}) {
  const p = run.participants[participantId];
  if (!p) throw Object.assign(new Error("Not a participant"), { statusCode: 403 });
  p.lastSeen = nowIso();
  const kind = nodeKind(run);
  const node = run.node;
  const step = currentStep(run);
  const cfg = step ? run.snapshot.configs[step.id] : null;

  if (action === "heartbeat") return { ok: true };

  const recalled = recallCommand(run, payload.commandId);
  if (recalled) {
    return { duplicate: true, commandId: payload.commandId, ...(recalled.result || {}) };
  }

  if (run.held && (action === "vote" || action === "answer" || action === "submit" || action === "reveal-ticket")) {
    throw Object.assign(new Error("Run is on hold"), { statusCode: 423, code: "held" });
  }

  const finish = (result) => {
    if (payload.commandId) storeCommand(run, payload.commandId, action, result);
    return result;
  };

  if (kind === "mini-poll" && action === "vote") {
    assertAttempt(run, payload);
    if (node.phase !== "open") {
      throw Object.assign(new Error("Voting closed"), { statusCode: 423 });
    }
    if (node.votes[p.id]) {
      throw Object.assign(new Error("Already voted"), { statusCode: 409, code: "already_voted" });
    }
    const optionId = String(payload.optionId || "");
    const ok = (cfg?.options || []).some((o) => o.id === optionId);
    if (!ok) throw Object.assign(new Error("Invalid option"), { statusCode: 400 });
    node.votes[p.id] = optionId;
    return finish({ optionId });
  }

  if (kind === "fill-game" && action === "answer") {
    assertAttempt(run, payload, { requireQuestion: true });
    if (run.held || node.phase !== "racing" || node.finishedTeamId) {
      throw Object.assign(new Error("Race is not open"), { statusCode: 423 });
    }
    if (!p.teamId) p.teamId = assignTeam(run, cfg);
    const questions = cfg?.questions || [];
    const idx = Number(node.cursors?.[p.id] || 0);
    if (idx >= questions.length) {
      throw Object.assign(new Error("Question bank finished"), { statusCode: 409, code: "bank_finished" });
    }
    const q = questions[idx];
    if (String(payload.questionId) !== String(q.id)) {
      throw Object.assign(new Error("Stale question"), { statusCode: 409, code: "stale_question" });
    }
    const key = `${p.id}:${q.id}:${run.roundAttemptId}`;
    node.answered = node.answered || {};
    if (node.answered[key]) {
      throw Object.assign(new Error("Already answered"), { statusCode: 409, code: "already_answered" });
    }
    const choiceId = String(payload.choiceId || "");
    if (!q.choices.some((c) => c.id === choiceId)) {
      throw Object.assign(new Error("Invalid choice"), { statusCode: 400 });
    }
    node.answered[key] = choiceId;
    const correct = choiceId === q.correctChoiceId;
    const delta = correct ? 1 : -1;
    const team = (cfg.teams || []).find((t) => t.id === p.teamId);
    const target = team?.target || 1;
    const prev = Number(node.scores[p.teamId] || 0);
    const next = Math.max(0, Math.min(target, prev + delta));
    node.scores[p.teamId] = next;
    const event = {
      id: makeId(),
      teamId: p.teamId,
      participantNumber: p.number,
      delta,
      clamped: next !== prev + delta,
      at: Date.now(),
    };
    node.events = (node.events || []).concat(event).slice(-80);
    node.cursors = node.cursors || {};
    node.cursors[p.id] = idx + 1;
    node.lastFeedback = node.lastFeedback || {};
    node.lastFeedback[p.id] = { correct, delta, questionId: q.id };
    if (next >= target && !node.finishedTeamId) {
      node.finishedTeamId = p.teamId;
      node.phase = "finished";
    }
    const nextQ = questions[idx + 1];
    return finish({
      correct,
      delta,
      eventId: event.id,
      waiting: !nextQ,
      nextQuestion: nextQ ? { id: nextQ.id, prompt: nextQ.prompt, choices: nextQ.choices } : null,
    });
  }

  if (kind === "mini-quiz" && action === "answer") {
    assertAttempt(run, payload, { requireQuestion: true });
    if (node.phase !== "open") {
      throw Object.assign(new Error("Answers locked"), { statusCode: 423 });
    }
    const q = (cfg?.questions || [])[Number(node.questionIndex || 0)];
    if (!q) throw Object.assign(new Error("No question"), { statusCode: 409 });
    if (String(payload.questionId) !== String(q.id)) {
      throw Object.assign(new Error("Stale question"), { statusCode: 409, code: "stale_question" });
    }
    if (node.answers[p.id]) {
      throw Object.assign(new Error("Already answered"), { statusCode: 409, code: "already_answered" });
    }
    const choiceId = String(payload.choiceId || "");
    if (!q.choices.some((c) => c.id === choiceId)) {
      throw Object.assign(new Error("Invalid choice"), { statusCode: 400 });
    }
    node.answers[p.id] = choiceId;
    return finish({ accepted: true });
  }

  if (kind === "pinboard" && action === "submit") {
    assertAttempt(run, payload);
    const kindSub = payload.kind === "photo" ? "photo" : "note";
    const text = String(payload.text || "").slice(0, 280);
    const mediaId = payload.mediaId ? String(payload.mediaId) : null;
    if (kindSub === "note" && !text.trim()) {
      throw Object.assign(new Error("Note required"), { statusCode: 400 });
    }
    const sub = {
      id: makeId(),
      participantId: p.id,
      participantNumber: p.number,
      kind: kindSub,
      text,
      mediaId,
      status: "pending",
      createdAt: nowIso(),
    };
    node.submissions = (node.submissions || []).concat(sub);
    return finish({ submissionId: sub.id, status: "pending" });
  }

  if (kind === "scratcher" && action === "reveal-ticket") {
    assertAttempt(run, payload, { requireTicket: true });
    const ticket = (node.tickets || {})[p.id];
    if (!ticket) {
      throw Object.assign(new Error("No ticket"), { statusCode: 404, code: "no_ticket" });
    }
    if (String(payload.ticketId) !== String(ticket.ticketId)) {
      throw Object.assign(new Error("Stale ticket"), { statusCode: 409, code: "stale_ticket" });
    }
    if (!ticket.revealed) {
      ticket.revealed = true;
      ticket.revealedAt = nowIso();
      const award = run.prizeLedger?.awards?.[p.id];
      if (award) award.revealedAt = ticket.revealedAt;
      if (ticket.isWin) {
        node.celebrationQueue = (node.celebrationQueue || []).concat({
          participantNumber: p.number,
          at: Date.now(),
          id: ticket.ticketId,
        });
      }
    }
    return finish({ isWin: !!ticket.isWin, already: false });
  }

  throw Object.assign(new Error(`Unknown action ${action}`), { statusCode: 400 });
}

export function tickRun(run) {
  const node = run.node;
  if (!node) return false;
  const now = Date.now();
  if (node.kind === "mini-poll" && node.phase === "tallying" && node.tallyStartedAt) {
    const dur = Number(node.revealDurationMs || 3000);
    if (now >= Number(node.tallyStartedAt) + dur) {
      node.phase = "revealed";
      return true;
    }
  }
  if (node.kind === "spinning-wheel" && node.phase === "spinning" && node.spinStartedAt) {
    const dur = Number(node.durationMs || 6000);
    if (now >= Number(node.spinStartedAt) + dur + 400) {
      node.phase = "revealed";
      return true;
    }
  }
  return false;
}

export async function loadExperienceBySlug(slug) {
  const testHooks = globalThis.__RN_LIVE_TEST__ || {};
  if (typeof testHooks.loadExperience === "function") {
    return testHooks.loadExperience(slug);
  }
  const { readExperiencesIndex } = await import("./blobs.mjs");
  const list = await readExperiencesIndex();
  const row = list.find((x) => x.slug === String(slug || "").toLowerCase());
  if (!row) return null;
  const raw = await getExperienceJson(row.id);
  if (!raw) return null;
  return normalizeExperienceRecord(raw);
}

export { defaultJoinScreen, emptyNodeState, nodeKind, currentStep, clone, makeRoomCode, expectedNodeId };
