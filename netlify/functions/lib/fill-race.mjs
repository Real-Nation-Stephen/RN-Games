/** Shared server deadlines: never trust a participant's clock or claimed answer time. */
export const FILL_PRELOAD_MS = 3000;
export const FILL_COUNTDOWN_MS = 3000;

export function finishFill(node, cfg, reason, now = Date.now()) {
  const teams = cfg?.teams || [];
  const high = Math.max(0, ...teams.map((t) => Number(node.scores?.[t.id] || 0)));
  const leaders = teams.filter((t) => Number(node.scores?.[t.id] || 0) === high);
  node.finishedTeamId = leaders.length === 1 ? leaders[0].id : null;
  node.tied = leaders.length !== 1;
  node.finishReason = reason;
  node.finishedAt = reason === 'timeout' ? node.endsAt : now;
  node.phase = 'finished';
}

export function tickFill(node, cfg, now = Date.now()) {
  let changed = false;
  if (node.phase === 'countdown' && now >= node.startsAt) {
    node.phase = 'racing';
    changed = true;
  }
  if (node.phase === 'racing' && node.endsAt && now >= node.endsAt) {
    finishFill(node, cfg, 'timeout', now);
    changed = true;
  }
  return changed;
}

export function scheduleFill(node, now = Date.now(), immediate = false) {
  const remaining = node.remainingMs ?? (Number(node.durationSeconds || 90) * 1000);
  node.countdownAt = now + (immediate ? 0 : FILL_PRELOAD_MS);
  node.startsAt = node.countdownAt + (immediate ? 0 : FILL_COUNTDOWN_MS);
  node.endsAt = node.startsAt + remaining;
  node.remainingMs = null;
  node.phase = immediate ? 'racing' : 'countdown';
}
