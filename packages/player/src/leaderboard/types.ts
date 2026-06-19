export type LeaderboardMode = "linked" | "manual";

export interface LeaderboardConfig {
  id: string;
  gameType: "leaderboard";
  title: string;
  slug: string;
  faviconUrl?: string;
  showPoweredBy?: boolean;
  mode: LeaderboardMode;
  linkedGameId: string;
  linkedGameSlug: string;
  board: {
    header: string;
    subhead: string;
    headerHex: string;
    subheadHex: string;
    useBackgroundImage: boolean;
    backgroundHex: string;
    backgroundImage: string;
    brandLogoUrl: string;
    brandLogoCorner: "bl" | "br" | "tl" | "tr";
    fonts: { heading?: string; subheading?: string; body?: string };
  };
  moderator?: {
    headline: string;
    backgroundHex: string;
    textHex: string;
    buttonHex: string;
    buttonTextHex: string;
    buttonDangerHex: string;
    buttonDangerTextHex: string;
  };
}

export interface LeaderboardRow {
  id: string;
  rank: number;
  displayName: string;
  score: number;
  source?: "linked" | "manual";
}

export interface LeaderboardPublicState {
  revision: number;
  panOffset: number;
  total: number;
  indicator: string | null;
  rows: LeaderboardRow[];
  /** Full ranked list (moderator UI); live board uses `rows` only. */
  entries: LeaderboardRow[];
}
