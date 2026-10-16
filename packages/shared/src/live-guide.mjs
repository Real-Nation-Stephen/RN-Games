/** One operator journey shared by the console and authoritative live engine. */
export function liveStageKey(state) {
  const a = state.activity || {};
  return JSON.stringify([state.runId, state.roundAttemptId, state.currentStepIndex,
    a.kind, a.phase, a.questionIndex ?? null, !!state.held]);
}

export function nextLiveAction(state) {
  const a = state.activity || {}, kind = a.kind, phase = a.phase;
  const step = (state.steps || []).find(s => s.current);
  const result = (action, label, tip, disabled = false) => ({ action, label, tip, disabled });
  const next = () => result('next', 'Next activity', 'Move the presenter and all phones to the next activity.');
  if (state.status === 'superseded') return result('', 'Session replaced', 'Open the current operator link.', true);
  if (state.held) return result('resume', 'Resume', 'Responses are paused. Resume continues the activity; a paused race starts with a fresh countdown.');
  if (kind === 'closing') return result('', 'Run complete', 'Finished. Use Advanced tools → Start new run for another audience.', true);
  if (kind === 'lobby') return result('next', 'First activity', 'Let guests scan the QR. Click the presenter once to enable sound, then start when the room is ready.');
  if (kind === 'mini-poll') {
    if (phase === 'idle') return result('open', 'Open voting', 'Next opens voting on phones. Give the room time to respond before clicking again.');
    if (phase === 'open' || phase === 'closed') return result('prepare-tally', 'Tally votes', `${a.responseCount || 0} votes received. Next closes voting and counts the votes; results stay hidden.`);
    if (phase === 'tallied') return result('reveal-results', 'Show results', 'The votes are counted. Next plays the reveal and shows the results to everyone.');
    if (phase === 'tallying') return result('', 'Revealing…', 'Let the reveal finish before moving on.', true);
    if (phase === 'revealed') return next();
  }
  if (kind === 'fill-game') {
    if (phase === 'idle') {
      const waiting = a.readinessRequired && (!a.readyTotal || a.readyCount !== a.readyTotal);
      return result('start-race', 'Start race', waiting
        ? `${a.readyCount || 0} / ${a.readyTotal || 0} phones ready. Keep phones open while the questions load.`
        : `${a.durationSeconds || 90} second race. Next starts the countdown. Timer and target can be changed in Advanced tools.`, !!waiting);
    }
    if (phase === 'countdown') return result('', 'Starting…', 'The race opens automatically after the shared countdown.', true);
    if (phase === 'racing') return result('', 'Race in progress', 'The race ends at a full keg or when time runs out. Advanced tools contains Pause and Finish early.', true);
    if (phase === 'finished') return next();
  }
  if (kind === 'mini-quiz') {
    if (phase === 'idle') return result('open', 'Open answers', 'Next lets guests answer this question on their phones.');
    if (phase === 'open' || phase === 'closed') return result('reveal', 'Reveal answer', 'Next closes answers and reveals the correct choice.');
    if (phase === 'revealed' && Number(a.questionIndex) + 1 < Number(a.questionCount)) return result('next-question', 'Next question', 'Show the next question, then click Next to open answers.');
    return next();
  }
  if (kind === 'pinboard') {
    const pending = (a.submissions || []).filter(s => s.status === 'pending').length;
    return result('next', 'Next activity', pending ? `${pending} responses need review below. Approve the ones you want on screen before moving on.` : 'Approve responses below to show them on screen. Next moves on when the discussion is finished.');
  }
  if (kind === 'spinning-wheel') {
    if (phase === 'spinning') return result('', 'Spinning…', 'Wait for the winner before moving on.', true);
    if (phase === 'revealed') return next();
    return result('spin', 'Spin the wheel', 'Next draws from eligible participants. Previous winners cannot win again.', !state.eligibleCount);
  }
  if (kind === 'scratcher' && phase === 'idle') return result('release', 'Release scratchers', 'Next sends scratchcards to phones. Set the winner count in Advanced tools first.');
  return result('next', 'Next activity', kind === 'scratcher' ? 'Let guests finish scratching before moving on.' : `Move on from ${step?.label || 'this activity'} when ready.`);
}
