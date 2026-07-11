/** Wave 2 page modules — record helpers (mirrors shared/page-modules.ts). */

const PAGE_TYPES = new Set(["landing", "form", "certificate", "badge", "consent", "email-signup", "redemption", "mini-quiz"]);

export function isPageModuleType(t) {
  return PAGE_TYPES.has(t);
}

function defaultTypography() {
  return { headlineHex: "#ffffff", bodyHex: "#e8eef5", subheadHex: "#e8eef5", labelHex: "#e8eef5", fonts: {}, fontUploads: {} };
}

function defaultPostSubmit() {
  return { enabled: false, logoUrl: "", headline: "Thank you", body: "", buttonLabel: "" };
}

function defaultCta(label = "Continue") {
  return { backgroundHex: "#2d6cdf", textHex: "#ffffff", label };
}

function basePage(id, slug, gameType, title) {
  return {
    id,
    gameType,
    title,
    clientName: "",
    slug,
    projectCode: "",
    designCode: "",
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
    logoUrl: "",
    logoAlign: "center",
    backgroundHex: "#0a1628",
    backgrounds: { desktop: "", tablet: "", mobile: "" },
    backgroundImage: "",
    backgroundMode: "fixed",
    typography: defaultTypography(),
    headline: title,
    body: "",
    primaryCta: defaultCta(),
    experienceAutoContinue: false,
    experienceAutoContinueDelayMs: 0,
  };
}

export function emptyPageModuleRecord(id, slug, gameType) {
  switch (gameType) {
    case "form":
      return {
        ...basePage(id, slug, "form", "Untitled form"),
        submitLabel: "Submit",
        fields: [
          { id: "name", type: "text", label: "Your name", required: true },
          { id: "email", type: "email", label: "Email", required: true },
        ],
        postSubmit: defaultPostSubmit(),
      };
    case "certificate":
      return {
        ...basePage(id, slug, "certificate", "Untitled certificate"),
        canvasWidth: 1200,
        canvasHeight: 848,
        certificateBackgroundUrl: "",
        downloadLabel: "Download",
        mergeFields: [
          {
            id: "name",
            label: "Name",
            sourceKey: "form.fieldValues.name",
            xPercent: 50,
            yPercent: 45,
            fontSizePx: 42,
            colorHex: "#1a1a1a",
            fontWeight: "bold",
            textAlign: "center",
          },
        ],
      };
    case "badge":
      return {
        ...basePage(id, slug, "badge", "Untitled badge"),
        canvasWidth: 512,
        canvasHeight: 512,
        badgeBackgroundUrl: "",
        downloadLabel: "Download",
        mergeFields: [
          {
            id: "name",
            label: "Name",
            sourceKey: "form.fieldValues.name",
            xPercent: 50,
            yPercent: 55,
            fontSizePx: 28,
            colorHex: "#1a1a1a",
            fontWeight: "bold",
            textAlign: "center",
          },
        ],
      };
    case "consent":
      return {
        ...basePage(id, slug, "consent", "Untitled consent"),
        introText: "Please read and accept to continue.",
        gdprUrl: "",
        gdprLinkLabel: "Privacy policy",
        acceptLabel: "Accept and continue",
        items: [{ id: "consent-main", label: "I agree to the terms above", required: true }],
        checkboxColumnWidthPx: 28,
      };
    case "email-signup":
      return {
        ...basePage(id, slug, "email-signup", "Untitled email signup"),
        nameLabel: "Name",
        emailLabel: "Email",
        submitLabel: "Sign up",
        thankYouMessage: "Thanks — you're on the list.",
        consentText: "",
        consentRequired: false,
        consentGdprUrl: "",
        consentGdprLinkLabel: "Privacy policy",
      };
    case "redemption":
      return {
        ...basePage(id, slug, "redemption", "Untitled redemption"),
        instructions: "Show this code at the desk to redeem your reward.",
        codeLabel: "Your code",
        redemptionCode: "SAMPLE-CODE",
      };
    case "mini-quiz": {
      const choiceA = newMiniQuizId();
      const choiceB = newMiniQuizId();
      return {
        ...basePage(id, slug, "mini-quiz", "Untitled mini quiz"),
        headline: "Quick quiz",
        body: "Answer a few questions to test your knowledge.",
        startLabel: "Start quiz",
        resultsHeadline: "Your results",
        resultsBody: "Thanks for playing!",
        continueLabel: "Continue",
        questions: [
          {
            id: newMiniQuizId(),
            prompt: "Sample question?",
            choices: [
              { id: choiceA, label: "Option A" },
              { id: choiceB, label: "Option B" },
            ],
            correctChoiceId: choiceA,
          },
        ],
      };
    }
    case "landing":
    default:
      return {
        ...basePage(id, slug, "landing", "Untitled landing page"),
        primaryCta: defaultCta("Get started"),
        experienceAutoContinue: true,
        experienceAutoContinueDelayMs: 2500,
        screens: defaultLandingScreens(),
        blocks: defaultLandingBlocks(),
        pageSettings: {
          maxWidthPx: 720,
          contentAlign: "center",
          verticalAlign: "center",
          paddingPx: 24,
          contentOffsetYPercent: 50,
          entranceAnimation: true,
          logoMatchPageAlign: true,
        },
      };
  }
}

function newLandingBlockId() {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function newLandingScreenId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function newMiniQuizId() {
  return `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function defaultLandingBlocks() {
  return [
    { id: newLandingBlockId(), type: "text", content: "Welcome", variant: "headline", align: "inherit" },
    { id: newLandingBlockId(), type: "text", content: "Tell your story here.", variant: "body", align: "inherit" },
    {
      id: newLandingBlockId(),
      type: "button",
      label: "Get started",
      url: "",
      backgroundHex: "#2d6cdf",
      textHex: "#ffffff",
      align: "inherit",
      fullWidth: false,
      isPrimary: true,
      action: "primary",
    },
  ];
}

function defaultLandingScreens() {
  return [{ id: newLandingScreenId(), title: "Page 1", blocks: defaultLandingBlocks() }];
}

function normalizeLandingBlock(raw, index) {
  const type = String(raw.type || "text");
  const id = String(raw.id || `block-${index}`);
  if (type === "image") {
    return {
      id,
      type,
      url: String(raw.url || ""),
      alt: String(raw.alt || ""),
      fit: raw.fit || "contain",
      maxHeightPx: Math.max(40, Number(raw.maxHeightPx) || 320),
      borderRadiusPx: Math.max(0, Number(raw.borderRadiusPx) || 8),
      align: raw.align || "center",
      fullWidth: !!raw.fullWidth,
    };
  }
  if (type === "image_text") {
    return {
      id,
      type,
      imageUrl: String(raw.imageUrl || ""),
      imageAlt: String(raw.imageAlt || ""),
      imageFit: raw.imageFit || "cover",
      layout: raw.layout === "image_right" ? "image_right" : "image_left",
      headline: String(raw.headline || ""),
      body: String(raw.body || ""),
      gapPx: Math.max(0, Number(raw.gapPx) || 20),
    };
  }
  if (type === "gallery") {
    const images = Array.isArray(raw.images)
      ? raw.images.map((img, i) => ({
          id: String(img.id || `img-${i}`),
          url: String(img.url || ""),
          alt: String(img.alt || ""),
          caption: String(img.caption || ""),
        }))
      : [];
    const cols = Number(raw.columns) || 3;
    const fit = raw.imageFit;
    return {
      id,
      type,
      images,
      columns: cols === 2 || cols === 4 ? cols : 3,
      gapPx: Math.max(0, Number(raw.gapPx) || 12),
      imageFit: fit === "contain" || fit === "fill" ? fit : "cover",
    };
  }
  if (type === "video") {
    return {
      id,
      type,
      url: String(raw.url || ""),
      aspectRatio: raw.aspectRatio || "16:9",
      autoplay: !!raw.autoplay,
      muted: raw.muted !== false,
    };
  }
  if (type === "spacer") {
    return { id, type, heightPx: Math.max(4, Number(raw.heightPx) || 32) };
  }
  if (type === "divider") {
    return {
      id,
      type,
      colorHex: String(raw.colorHex || "rgba(255,255,255,0.2)"),
      thicknessPx: Math.max(1, Number(raw.thicknessPx) || 1),
      widthPercent: Math.max(10, Math.min(100, Number(raw.widthPercent) || 60)),
    };
  }
  if (type === "button") {
    const isPrimary = !!raw.isPrimary;
    let action = raw.action;
    if (!action) {
      if (isPrimary) action = "primary";
      else if (raw.url) action = "link";
      else action = "primary";
    }
    return {
      id,
      type,
      label: String(raw.label || "Continue"),
      url: String(raw.url || ""),
      backgroundHex: String(raw.backgroundHex || "#2d6cdf"),
      textHex: String(raw.textHex || "#ffffff"),
      align: raw.align || "center",
      fullWidth: !!raw.fullWidth,
      isPrimary,
      action,
      targetScreenId: raw.targetScreenId ? String(raw.targetScreenId) : undefined,
    };
  }
  if (type === "embed") {
    return {
      id,
      type,
      url: String(raw.url || ""),
      heightPx: Math.max(120, Number(raw.heightPx) || 480),
      title: String(raw.title || "Embedded content"),
    };
  }
  if (type === "poll") {
    const options = Array.isArray(raw.options)
      ? raw.options.map((opt, i) => ({
          id: String(opt.id || `opt-${i}`),
          label: String(opt.label || `Option ${i + 1}`),
        }))
      : [];
    return {
      id,
      type: "poll",
      question: String(raw.question || "Poll question"),
      options: options.length
        ? options
        : [
            { id: `opt-${index}-a`, label: "Option A" },
            { id: `opt-${index}-b`, label: "Option B" },
          ],
    };
  }
  return {
    id,
    type: "text",
    content: String(raw.content || ""),
    variant: raw.variant || "body",
    align: raw.align || "center",
    colorHex: String(raw.colorHex || ""),
    fontSizePx: raw.fontSizePx ? Math.max(10, Number(raw.fontSizePx) || 0) : undefined,
  };
}

function legacyLandingBlocks(doc) {
  const blocks = [];
  if (doc.headline) blocks.push({ id: newLandingBlockId(), type: "text", content: doc.headline, variant: "headline", align: "center" });
  if (doc.body) blocks.push({ id: newLandingBlockId(), type: "text", content: doc.body, variant: "body", align: "center" });
  if (doc.primaryCta?.label) {
    blocks.push({
      id: newLandingBlockId(),
      type: "button",
      label: doc.primaryCta.label,
      url: doc.primaryCta.url || "",
      backgroundHex: doc.primaryCta.backgroundHex || "#2d6cdf",
      textHex: doc.primaryCta.textHex || "#ffffff",
      align: "center",
      fullWidth: false,
      isPrimary: true,
    });
  }
  return blocks.length ? blocks : defaultLandingBlocks();
}

function normalizeBase(doc) {
  return {
    id: doc.id,
    title: String(doc.title || "Untitled"),
    clientName: String(doc.clientName || ""),
    slug: String(doc.slug || "").trim().toLowerCase(),
    projectCode: String(doc.projectCode || ""),
    designCode: String(doc.designCode || ""),
    archived: !!doc.archived,
    updatedAt: doc.updatedAt || new Date().toISOString(),
    reportingEnabled: !!doc.reportingEnabled,
    reportingLockedAt: doc.reportingLockedAt ?? null,
    thumbnailUrl: String(doc.thumbnailUrl || ""),
    faviconUrl: String(doc.faviconUrl || ""),
    reportingSheetTab: String(doc.reportingSheetTab || ""),
    showPoweredBy: doc.showPoweredBy !== false,
    logoUrl: String(doc.logoUrl || ""),
    logoAlign: ["left", "right"].includes(doc.logoAlign) ? doc.logoAlign : "center",
    backgroundHex: String(doc.backgroundHex || "#0a1628"),
    backgrounds: {
      desktop: String(doc.backgrounds?.desktop || ""),
      tablet: String(doc.backgrounds?.tablet || ""),
      mobile: String(doc.backgrounds?.mobile || ""),
    },
    backgroundImage: String(doc.backgroundImage || ""),
    backgroundMode: doc.backgroundMode === "scroll" ? "scroll" : "fixed",
    typography: {
      ...defaultTypography(),
      ...(doc.typography || {}),
      fonts: { ...(doc.typography?.fonts || {}) },
      fontUploads: { ...(doc.typography?.fontUploads || {}) },
    },
    headline: String(doc.headline || doc.title || ""),
    body: String(doc.body || ""),
    primaryCta: { ...defaultCta(), ...(doc.primaryCta || {}) },
    experienceAutoContinue: !!doc.experienceAutoContinue,
    experienceAutoContinueDelayMs: Math.max(0, Number(doc.experienceAutoContinueDelayMs) || 0),
  };
}

export function normalizePageModule(doc) {
  const base = normalizeBase(doc);
  const gt = doc.gameType || "landing";
  if (gt === "form") {
    const fields = Array.isArray(doc.fields)
      ? doc.fields.map((f, i) => ({
          id: String(f.id || `field-${i}`),
          type: String(f.type || "text"),
          label: String(f.label || `Field ${i + 1}`),
          placeholder: String(f.placeholder || ""),
          required: !!f.required,
          options: Array.isArray(f.options) ? f.options.map(String) : [],
          validationHint: String(f.validationHint || ""),
        }))
      : emptyPageModuleRecord(doc.id, doc.slug, "form").fields;
    return {
      ...base,
      gameType: "form",
      submitLabel: String(doc.submitLabel || "Submit"),
      fields,
      postSubmit: {
        ...defaultPostSubmit(),
        ...(doc.postSubmit || {}),
        enabled: !!doc.postSubmit?.enabled,
      },
    };
  }
  if (gt === "certificate") {
    const mergeFields = Array.isArray(doc.mergeFields)
      ? doc.mergeFields.map((m, i) => ({
          id: String(m.id || `mf-${i}`),
          label: String(m.label || ""),
          sourceKey: String(m.sourceKey || ""),
          xPercent: Math.max(0, Math.min(100, Number(m.xPercent) || 50)),
          yPercent: Math.max(0, Math.min(100, Number(m.yPercent) || 50)),
          fontSizePx: Math.max(8, Number(m.fontSizePx) || 24),
          colorHex: String(m.colorHex || "#111111"),
          fontWeight: m.fontWeight === "bold" ? "bold" : "normal",
          textAlign: ["left", "right"].includes(m.textAlign) ? m.textAlign : "center",
        }))
      : [];
    return {
      ...base,
      gameType: "certificate",
      canvasWidth: Math.max(320, Number(doc.canvasWidth) || 1200),
      canvasHeight: Math.max(240, Number(doc.canvasHeight) || 848),
      certificateBackgroundUrl: String(doc.certificateBackgroundUrl || ""),
      downloadLabel: String(doc.downloadLabel || "Download"),
      mergeFields,
    };
  }
  if (gt === "badge") {
    const mergeFields = Array.isArray(doc.mergeFields)
      ? doc.mergeFields.map((m, i) => ({
          id: String(m.id || `mf-${i}`),
          label: String(m.label || ""),
          sourceKey: String(m.sourceKey || ""),
          xPercent: Math.max(0, Math.min(100, Number(m.xPercent) || 50)),
          yPercent: Math.max(0, Math.min(100, Number(m.yPercent) || 50)),
          fontSizePx: Math.max(8, Number(m.fontSizePx) || 24),
          colorHex: String(m.colorHex || "#111111"),
          fontWeight: m.fontWeight === "bold" ? "bold" : "normal",
          textAlign: ["left", "right"].includes(m.textAlign) ? m.textAlign : "center",
        }))
      : [];
    return {
      ...base,
      gameType: "badge",
      canvasWidth: Math.max(160, Number(doc.canvasWidth) || 512),
      canvasHeight: Math.max(160, Number(doc.canvasHeight) || 512),
      badgeBackgroundUrl: String(doc.badgeBackgroundUrl || ""),
      downloadLabel: String(doc.downloadLabel || "Download"),
      mergeFields,
    };
  }
  if (gt === "consent") {
    const items = Array.isArray(doc.items)
      ? doc.items.map((it, i) => ({
          id: String(it.id || `item-${i}`),
          label: String(it.label || ""),
          required: !!it.required,
        }))
      : [];
    return {
      ...base,
      gameType: "consent",
      introText: String(doc.introText || ""),
      gdprUrl: String(doc.gdprUrl || ""),
      gdprLinkLabel: String(doc.gdprLinkLabel || "Privacy policy"),
      acceptLabel: String(doc.acceptLabel || "Accept and continue"),
      items,
      checkboxColumnWidthPx: Math.max(20, Math.min(80, Number(doc.checkboxColumnWidthPx) || 28)),
    };
  }
  if (gt === "email-signup") {
    return {
      ...base,
      gameType: "email-signup",
      nameLabel: String(doc.nameLabel || "Name"),
      emailLabel: String(doc.emailLabel || "Email"),
      submitLabel: String(doc.submitLabel || "Sign up"),
      thankYouMessage: String(doc.thankYouMessage || "Thanks!"),
      consentText: String(doc.consentText || ""),
      consentRequired: !!doc.consentRequired,
      consentGdprUrl: String(doc.consentGdprUrl || ""),
      consentGdprLinkLabel: String(doc.consentGdprLinkLabel || "Privacy policy"),
    };
  }
  if (gt === "redemption") {
    return {
      ...base,
      gameType: "redemption",
      instructions: String(doc.instructions || ""),
      codeLabel: String(doc.codeLabel || "Your code"),
      redemptionCode: String(doc.redemptionCode || ""),
    };
  }
  if (gt === "mini-quiz") {
    const defaults = emptyPageModuleRecord(doc.id, doc.slug, "mini-quiz");
    const questions = Array.isArray(doc.questions) && doc.questions.length
      ? doc.questions.map((q, i) => {
          const rawChoices = Array.isArray(q.choices) ? q.choices.slice(0, 4) : [];
          const choices = rawChoices.map((c, ci) => ({
            id: String(c.id || `choice-${i}-${ci}`),
            label: String(c.label || `Option ${ci + 1}`),
          }));
          while (choices.length < 2) {
            const id = newMiniQuizId();
            choices.push({ id, label: `Option ${choices.length + 1}` });
          }
          const correctChoiceId = choices.some((c) => c.id === q.correctChoiceId)
            ? String(q.correctChoiceId)
            : choices[0].id;
          return {
            id: String(q.id || `question-${i}`),
            prompt: String(q.prompt || `Question ${i + 1}`),
            choices,
            correctChoiceId,
          };
        })
      : defaults.questions;
    return {
      ...base,
      gameType: "mini-quiz",
      startLabel: String(doc.startLabel || defaults.startLabel),
      resultsHeadline: String(doc.resultsHeadline || defaults.resultsHeadline),
      resultsBody: String(doc.resultsBody || defaults.resultsBody),
      continueLabel: String(doc.continueLabel || defaults.continueLabel),
      questions,
    };
  }
  return {
    ...base,
    gameType: "landing",
    screens: (() => {
      if (Array.isArray(doc.screens) && doc.screens.length) {
        return doc.screens.map((s, si) => ({
          id: String(s.id || `screen-${si}`),
          title: String(s.title || `Page ${si + 1}`),
          blocks: Array.isArray(s.blocks)
            ? s.blocks.map((b, i) => normalizeLandingBlock(b, i))
            : defaultLandingBlocks(),
          flowCompleteOverride: !!s.flowCompleteOverride,
        }));
      }
      return [
        {
          id: newLandingScreenId(),
          title: "Page 1",
          blocks: Array.isArray(doc.blocks) && doc.blocks.length
            ? doc.blocks.map((b, i) => normalizeLandingBlock(b, i))
            : legacyLandingBlocks(doc),
        },
      ];
    })(),
    blocks: (() => {
      const screens = Array.isArray(doc.screens) && doc.screens.length ? doc.screens : null;
      if (screens) {
        const first = screens[0];
        return Array.isArray(first?.blocks)
          ? first.blocks.map((b, i) => normalizeLandingBlock(b, i))
          : defaultLandingBlocks();
      }
      return Array.isArray(doc.blocks) && doc.blocks.length
        ? doc.blocks.map((b, i) => normalizeLandingBlock(b, i))
        : legacyLandingBlocks(doc);
    })(),
    pageSettings: {
      maxWidthPx: Math.max(320, Number(doc.pageSettings?.maxWidthPx) || 720),
      contentAlign: ["left", "right"].includes(doc.pageSettings?.contentAlign) ? doc.pageSettings.contentAlign : "center",
      verticalAlign: doc.pageSettings?.verticalAlign === "top" ? "top" : "center",
      paddingPx: Math.max(0, Number(doc.pageSettings?.paddingPx) || 24),
      contentOffsetYPercent: Math.max(0, Math.min(100, Number(doc.pageSettings?.contentOffsetYPercent ?? 50))),
      entranceAnimation: doc.pageSettings?.entranceAnimation !== false,
      logoMatchPageAlign: doc.pageSettings?.logoMatchPageAlign !== false,
    },
  };
}

export function toPublicPageModule(doc) {
  return normalizePageModule(doc);
}
