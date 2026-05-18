/** Pin board — record helpers for wheels API + public payload. */

export function emptyPinboardRecord(id, slug) {
  return {
    id,
    gameType: "pinboard",
    title: "Untitled pin board",
    clientName: "",
    slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: false,
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
    stickies: [],
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
      stickyAssets: [],
      photoPublishMode: "user_choice",
      uniformFrameId: "polaroid",
      photoFrames: [
        { id: "none", label: "No frame", imageUrl: "" },
        { id: "polaroid", label: "Polaroid", imageUrl: "" },
      ],
      photoStickers: [],
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
}

function migrateBoardColors(board) {
  const b = board || {};
  return {
    ...b,
    headerHex: b.headerHex || b.headerColor || "#ffffff",
    subheadHex: b.subheadHex || b.subheadColor || "#dce8e4",
    backgroundHex: b.backgroundHex || b.backgroundColor || "#3d5a4c",
  };
}

export function normalizePinboardRecord(doc) {
  if (!doc || doc.gameType !== "pinboard") return doc;
  doc.board = migrateBoardColors(doc.board);
  if (!doc.permissions) {
    doc.permissions = emptyPinboardRecord(doc.id, doc.slug).permissions;
  }
  if (!Array.isArray(doc.permissions.items)) doc.permissions.items = [];
  if (!doc.mobile) doc.mobile = emptyPinboardRecord(doc.id, doc.slug).mobile;
  if (!doc.moderator) doc.moderator = emptyPinboardRecord(doc.id, doc.slug).moderator;
  if (!Array.isArray(doc.mobile.photoFrames)) {
    doc.mobile.photoFrames = [{ id: "none", label: "No frame", imageUrl: "" }];
  }
  if (!Array.isArray(doc.mobile.photoStickers)) doc.mobile.photoStickers = [];
  if (!Array.isArray(doc.mobile.stickyAssets)) doc.mobile.stickyAssets = doc.stickies || [];
  if (!Array.isArray(doc.stickies)) doc.stickies = doc.mobile.stickyAssets;
  return doc;
}

/** Public config for player surfaces (no moderation secrets). */
export function toPublicPinboard(doc) {
  const p = normalizePinboardRecord({ ...doc });
  return {
    gameType: "pinboard",
    id: p.id,
    title: p.title,
    slug: p.slug,
    faviconUrl: p.faviconUrl || "",
    showPoweredBy: p.showPoweredBy === true,
    permissions: p.permissions,
    board: p.board,
    mobile: p.mobile,
    moderator: {
      headline: p.moderator.headline,
      approveLabel: p.moderator.approveLabel,
      rejectLabel: p.moderator.rejectLabel,
      backgroundHex: p.moderator.backgroundHex,
      backgroundImageUrl: p.moderator.backgroundImageUrl,
      useBackgroundImage: p.moderator.useBackgroundImage,
      textHex: p.moderator.textHex,
      buttonHex: p.moderator.buttonHex,
      buttonTextHex: p.moderator.buttonTextHex,
    },
    stickies: p.stickies,
    reportingEnabled: p.reportingEnabled,
  };
}
