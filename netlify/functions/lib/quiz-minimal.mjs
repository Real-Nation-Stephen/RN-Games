/** Shared quiz sequence snapshot for clients (session poll + control responses). */
export function minimalCurrent(quiz, seqIdx) {
  const seq = quiz?.tracks?.[0]?.sequences?.[seqIdx];
  if (!seq) return null;
  if (seq.type !== "question") return { type: seq.type };
  const choices = seq.input?.type === "buttons" ? seq.input.choices || [] : [];
  return { type: "question", question: { id: seq.id, text: seq.prompt?.text || "Question", choices } };
}

export function sessionPublicState(session, quiz) {
  const current = quiz?.gameType === "quiz" ? minimalCurrent(quiz, session.currentSequenceIndex) : null;
  let answeredCount = 0;
  if (current?.type === "question" && current?.question?.id) {
    const qid = current.question.id;
    const ans = Array.isArray(session?.answers?.[qid]) ? session.answers[qid] : [];
    const uniq = new Set();
    for (const a of ans) {
      const pid = a?.participantId;
      if (pid) uniq.add(pid);
    }
    answeredCount = uniq.size;
  }
  return {
    revision: session.revision,
    code: session.code,
    quizId: session.quizId,
    quizSlug: session.quizSlug,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    currentSequenceIndex: session.currentSequenceIndex,
    phase: session.phase,
    openedAt: session.openedAt,
    closesAt: session.closesAt,
    participants: session.participants || [],
    current,
    answeredCount,
    bonus: session.bonus || null,
    lobbyOpen: session.lobbyOpen !== false,
    revealShown: session.revealShown,
    revealSeqId: session.revealSeqId,
  };
}
