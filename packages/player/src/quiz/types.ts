export type QuizMotion = "static" | "videoSequences";
export type QuizPresentation = "frame16x9" | "responsive";

export type QuizSequenceType = "intro" | "holding" | "question" | "reveal" | "leaderboard" | "outro" | "breaker";
export type QuizAdvanceKind = "host" | "timer" | "waitAll" | "autoAfterMedia";

export type QuizInputMode = "none" | "local" | "playAlong";

export type QuizInput =
  | { mode: QuizInputMode; type: "buttons"; choices: { id: string; label: string }[]; multi?: boolean }
  | { mode: QuizInputMode; type: "textExact"; accepted: string[] }
  | {
      mode: QuizInputMode;
      type: "slider";
      kind: "continuous" | "discrete";
      continuous?: { min: number; max: number; correctValue: number; tolerance?: number; scoring?: "exact" | "distance" };
      discrete?: { stops: { id: string; label: string; value: number }[]; correctStopId: string; snap?: boolean };
    };

export type QuizSequence =
  | {
      id: string;
      type: Exclude<QuizSequenceType, "question">;
      title?: string;
      body?: string;
      advance?: { kind: QuizAdvanceKind };
      timing?: { durationMs?: number; opensAtMs?: number; closesAtMs?: number };
      media?: { videoUrl?: string; bgVideoUrl?: string; bgImageUrl?: string; bgColor?: string };
    }
  | {
      id: string;
      type: "question";
      prompt: { text?: string; body?: string; imageUrl?: string; audioUrl?: string };
      input: QuizInput;
      correct?: { choiceId?: string; text?: string; value?: number; stopId?: string };
      scoring?: { pointsCorrect?: number; pointsWrong?: number };
      timerSeconds?: number;
      advance?: { kind: QuizAdvanceKind };
      timing?: { durationMs?: number; opensAtMs?: number; closesAtMs?: number };
      media?: { videoUrl?: string; bgVideoUrl?: string; bgImageUrl?: string; bgColor?: string };
    };

export type QuizTrack = { id: string; name: string; sequences: QuizSequence[] };

export type QuizConfig = {
  gameType: "quiz";
  id: string;
  title: string;
  slug: string;
  faviconUrl?: string;
  showPoweredBy?: boolean;
  mode: { presentation: QuizPresentation; motion: QuizMotion };
  branding?: {
    logoUrl?: string;
    backgroundColor?: string;
    backgroundImage?: string;
    backgroundVideo?: string;
  };
  playAlong?: { enabled?: boolean; maxParticipants?: number };
  tracks: QuizTrack[];
};

export type SessionPhase = "lobby" | "open" | "closed" | "bonus" | "reveal" | "ended";

export type SessionState = {
  revision: number;
  code: string;
  quizId: string;
  quizSlug: string;
  createdAt: string;
  expiresAt: string;
  currentSequenceIndex: number;
  phase: SessionPhase;
  openedAt?: number | null;
  closesAt?: number | null;
  participants: { id: string; name: string; icon: string; score: number }[];
  /** False after host locks lobby (game started); new joins rejected. */
  lobbyOpen?: boolean;
  // Minimal current question snapshot for join UI.
  current?: { type: QuizSequenceType; question?: { text?: string; choices?: { id: string; label: string }[] } };
  bonus?: { kind: string; winnerId?: string; points?: number } | null;
};

