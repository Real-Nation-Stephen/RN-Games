export type QuizMotion = "static" | "videoSequences";
export type QuizPresentation = "frame16x9" | "responsive";

export type QuizSequenceType =
  | "intro"
  | "holding"
  | "question"
  | "reveal"
  | "leaderboard"
  | "outro"
  | "breaker"
  | /** Play-along only: waiting / how to connect */
  "connection";

export type QuizAdvanceKind = "host" | "timer" | "waitAll" | "autoAfterMedia";

export type QuizInputMode = "none" | "local" | "playAlong";

/** High-level runtime mode for the quiz experience. */
export type QuizPlayMode = "facilitated" | "playAlong" | "kiosk";

/** Text entrance presets (extend without breaking older quizzes). */
export type QuizTextAnimationId = "none" | "fadeIn" | "floatIn" | "slideUp";

export type QuizPresentVAlign = "top" | "middle";
export type QuizPresentHAlign = "left" | "center";

export type QuizSequenceStyle = {
  /** Overrides stage / slide background when set */
  bgHex?: string;
  /** Per-sequence background image (upload URL) */
  bgImageUrl?: string;
  textHex?: string;
  buttonHex?: string;
  /** Presentation: vertical align for the right content tile. */
  presentVAlign?: QuizPresentVAlign;
  /** Presentation: horizontal align for the right content tile. */
  presentHAlign?: QuizPresentHAlign;
  /** Presentation: show small brand logo above headline (uses quiz.branding.logoUrl). */
  presentShowLogo?: boolean;
  /** Presentation: logo max height (px). 0/undefined = CSS default. */
  presentLogoHeightPx?: number;
  /** Presentation: spacing below logo (px). 0/undefined = CSS default. */
  presentLogoGapPx?: number;
  /** Presentation: logo max width (px). 0/undefined = CSS default. */
  presentLogoMaxWidthPx?: number;
  /** Presentation: padding inside the right content tile. 0/undefined = CSS default. */
  presentTilePadPx?: number;
  /** Presentation: outer padding for the right panel. 0/undefined = CSS default. */
  presentRightPadPx?: number;
  /** Presentation: title font size (px). 0/undefined = CSS default. */
  presentTitleSizePx?: number;
  /** Presentation: body font size (px). 0/undefined = CSS default. */
  presentBodySizePx?: number;
  /**
   * Extra spacing between the question text and the input block (answers/slider).
   * Useful for fine-tuning different fonts / copy lengths in Presentation view.
   */
  questionToAnswersGapPx?: number;
  /** Optional short sound when slide is shown */
  soundUrl?: string;
  soundLoop?: boolean;
  textAnimation?: QuizTextAnimationId;
};

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
      type: Exclude<QuizSequenceType, "question" | "reveal">;
      title?: string;
      body?: string;
      headline?: string;
      subhead?: string;
      /** Optional section header for host list + navigation clarity. */
      section?: { title?: string };
      advance?: { kind: QuizAdvanceKind };
      timing?: { durationMs?: number; opensAtMs?: number; closesAtMs?: number };
      media?: { videoUrl?: string; bgVideoUrl?: string; bgImageUrl?: string; bgColor?: string };
      style?: QuizSequenceStyle;
      /** Leaderboard: show bonus steal moment tied to a prior question */
      bonusReveal?: boolean;
    }
  | {
      id: string;
      type: "reveal";
      /** Which question sequence id this reveals (correct answer / commentary) */
      referencesQuestionId?: string;
      /** Multi-answer reveal: reveal multiple questions in one slide. */
      referencesQuestionIds?: string[];
      title?: string;
      body?: string;
      section?: { title?: string };
      advance?: { kind: QuizAdvanceKind };
      timing?: { durationMs?: number; opensAtMs?: number; closesAtMs?: number };
      media?: { videoUrl?: string; bgVideoUrl?: string; bgImageUrl?: string; bgColor?: string };
      style?: QuizSequenceStyle;
      textAnimation?: QuizTextAnimationId;
    }
  | {
      id: string;
      type: "question";
      prompt: { text?: string; body?: string; imageUrl?: string; audioUrl?: string };
      input: QuizInput;
      correct?: { choiceId?: string; text?: string; value?: number; stopId?: string };
      scoring?: { pointsCorrect?: number; pointsWrong?: number };
      timerSeconds?: number;
      section?: { title?: string };
      advance?: { kind: QuizAdvanceKind };
      timing?: { durationMs?: number; opensAtMs?: number; closesAtMs?: number };
      media?: { videoUrl?: string; bgVideoUrl?: string; bgImageUrl?: string; bgColor?: string };
      style?: QuizSequenceStyle;
      /** Fastest-correct bonus steal eligible for this question */
      bonusStealEligible?: boolean;
      textAnimation?: QuizTextAnimationId;
    };

export type QuizTrack = { id: string; name: string; sequences: QuizSequence[] };

/** Optional per-surface kits (URLs from uploads). */
export type QuizSurfaceTheme = {
  backgroundHex?: string;
  backgroundImageUrl?: string;
  headerImageUrl?: string;
  textHex?: string;
  mutedHex?: string;
  buttonHex?: string;
  /** Button down/selected color (mobile answer UX). */
  buttonDownHex?: string;
  buttonTextHex?: string;
  overlayHex?: string;
  /** Comma-separated font stack or Google Font name */
  fontHeading?: string;
  fontBody?: string;
};

export type QuizConfig = {
  gameType: "quiz";
  id: string;
  title: string;
  slug: string;
  faviconUrl?: string;
  showPoweredBy?: boolean;
  /** How this quiz is intended to be run. */
  playMode?: QuizPlayMode;
  mode: { presentation: QuizPresentation; motion: QuizMotion };
  branding?: {
    logoUrl?: string;
    backgroundColor?: string;
    backgroundImage?: string;
    backgroundVideo?: string;
    fonts?: {
      heading?: string;
      subheading?: string;
      body?: string;
      button?: string;
    };
    /**
     * Uploaded font files (served from `/api/file?id=...`). If present, the player
     * UIs will register these via `@font-face` and use the provided `family` names.
     */
    fontUploads?: {
      heading?: { url: string; family: string; weight?: number | string; style?: "normal" | "italic" };
      subheading?: { url: string; family: string; weight?: number | string; style?: "normal" | "italic" };
      body?: { url: string; family: string; weight?: number | string; style?: "normal" | "italic" };
      button?: { url: string; family: string; weight?: number | string; style?: "normal" | "italic" };
    };
    layout?: { buttonBottomPadPx?: number };
    /** Player phone UI */
    mobile?: QuizSurfaceTheme & {
      /** Sprite icons for picker (comma-separated URLs or single sheet — MVP: URL list) */
      playerIconSetUrl?: string;
    };
    /** Customizable player phone copy (optional). */
    mobileCopy?: {
      joinTitle?: string;
      joinNameLabel?: string;
      joinNamePlaceholder?: string;
      joinIconLabel?: string;
      joinButtonLabel?: string;
      joinHelpText?: string;
      betweenQuestionsText?: string;
      pickAnswerText?: string;
      answersLockedText?: string;
      submitButtonLabel?: string;
      submittedText?: string;
    };
    /** Host controller (facilitator) */
    host?: QuizSurfaceTheme;
    /** Projected leaderboard */
    leaderboard?: QuizSurfaceTheme;
  };
  playAlong?: {
    enabled?: boolean;
    maxParticipants?: number;
    retentionHours?: number;
    profanityBlock?: boolean;
    bonus?: { fastestCorrectSteal?: boolean; stealPoints?: number };
  };
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
  current?: { type: QuizSequenceType; question?: { id?: string; text?: string; choices?: { id: string; label: string }[] } };
  /** For play-along: how many unique participants have answered the current question. */
  answeredCount?: number;
  bonus?: { kind: string; winnerId?: string; points?: number } | null;
  /** Multi-answer reveal: how many answers are currently revealed on the slide. */
  revealShown?: number;
  /** Multi-answer reveal: the reveal sequence this applies to (guards against stale state). */
  revealSeqId?: string;
};
