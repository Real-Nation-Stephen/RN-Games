import type { PinboardConfig } from "./types";

/** Demo sticky PNGs — replace with uploaded assets in studio. */
const STICKY_YELLOW =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280"><rect width="280" height="280" rx="4" fill="#F7E889"/><path d="M0 0 L40 0 L0 40 Z" fill="rgba(0,0,0,0.06)"/></svg>`,
  );

const STICKY_PINK =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280"><rect width="280" height="280" rx="4" fill="#F5B5C8"/><path d="M0 0 L40 0 L0 40 Z" fill="rgba(0,0,0,0.06)"/></svg>`,
  );

const STICKY_BLUE =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280"><rect width="280" height="280" rx="4" fill="#A8D4F0"/><path d="M0 0 L40 0 L0 40 Z" fill="rgba(0,0,0,0.06)"/></svg>`,
  );

const FRAME_POLAROID =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360"><defs><mask id="h"><rect width="300" height="360" fill="white"/><rect x="22" y="22" width="256" height="256" fill="black"/></mask></defs><rect width="300" height="360" fill="#fafafa" mask="url(#h)"/></svg>`,
  );

const FRAME_GOLD =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360"><rect x="8" y="8" width="284" height="344" fill="none" stroke="#c9a227" stroke-width="12" rx="4"/><rect x="20" y="20" width="260" height="260" fill="none" stroke="#c9a227" stroke-width="4" rx="2"/></svg>`,
  );

const PHOTO_STICKER_STAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><polygon fill="#FFD54F" stroke="#F9A825" stroke-width="3" points="60,8 74,44 112,48 82,72 92,110 60,88 28,110 38,72 8,48 46,44"/></svg>`,
  );

const PHOTO_STICKER_HEART =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><path fill="#E91E63" d="M60 98 C60 98 14 68 14 40 C14 24 26 14 40 14 C50 14 56 20 60 26 C64 20 70 14 80 14 C94 14 106 24 106 40 C106 68 60 98 60 98Z"/></svg>`,
  );

const PHOTO_STICKER_SPARKLE =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><path fill="#7E57C2" d="M60 4 L68 44 L108 52 L68 60 L60 100 L52 60 L12 52 L52 44 Z"/><circle fill="#B39DDB" cx="88" cy="24" r="10"/><circle fill="#B39DDB" cx="24" cy="88" r="8"/></svg>`,
  );

export const DEFAULT_PINBOARD_CONFIG: PinboardConfig = {
  eventId: "demo",
  title: "Event pin board",
  clientName: "Demo client",
  slug: "demo-pinboard",
  permissions: {
    enabled: false,
    headline: "Before you continue",
    introText: "Please read and accept the following to take part.",
    gdprUrl: "",
    gdprLinkLabel: "Privacy policy (GDPR)",
    items: [
      {
        id: "consent-photo",
        label: "I consent to my photo being displayed on the event pin board after moderation",
        required: true,
      },
    ],
    acceptButtonLabel: "Accept and continue",
  },
  board: {
    header: "Share your moment",
    subhead: "Scan the QR code to add a photo or note to the wall",
    headerHex: "#ffffff",
    subheadHex: "#dce8e4",
    useBackgroundImage: false,
    backgroundHex: "#3d5a4c",
    backgroundImage: "",
    brandLogoUrl: "",
    brandLogoCorner: "bl",
    polaroidFrames: true,
    fonts: {},
    fontUploads: {},
  },
  stickies: [
    { id: "yellow", label: "Yellow", imageUrl: STICKY_YELLOW },
    { id: "pink", label: "Pink", imageUrl: STICKY_PINK },
    { id: "blue", label: "Blue", imageUrl: STICKY_BLUE },
  ],
  mobile: {
    headline: "Add to the wall",
    subheadline: "Take a selfie or leave a note for the host to approve",
    submitLabel: "Submit",
    thankYouMessage: "Thanks! Your submission is with the event team.",
    backgroundHex: "#1a2332",
    useBackgroundImage: false,
    textHex: "#f5f5f5",
    buttonHex: "#d93ddb",
    buttonTextHex: "#ffffff",
    stickyAssets: [
      { id: "yellow", label: "Yellow", imageUrl: STICKY_YELLOW },
      { id: "pink", label: "Pink", imageUrl: STICKY_PINK },
      { id: "blue", label: "Blue", imageUrl: STICKY_BLUE },
    ],
    photoPublishMode: "user_choice",
    uniformFrameId: "polaroid",
    photoFrames: [
      { id: "none", label: "No frame", imageUrl: "" },
      { id: "polaroid", label: "Polaroid", imageUrl: FRAME_POLAROID },
      { id: "gold", label: "Gold", imageUrl: FRAME_GOLD },
    ],
    photoStickers: [
      { id: "star", label: "Star", imageUrl: PHOTO_STICKER_STAR },
      { id: "heart", label: "Heart", imageUrl: PHOTO_STICKER_HEART },
      { id: "sparkle", label: "Sparkle", imageUrl: PHOTO_STICKER_SPARKLE },
    ],
  },
  moderator: {
    headline: "Event moderation",
    approveLabel: "Approve",
    rejectLabel: "Reject",
    backgroundHex: "#121820",
    useBackgroundImage: false,
    textHex: "#eef2f7",
    buttonHex: "#2d6a4f",
    buttonTextHex: "#ffffff",
  },
};
