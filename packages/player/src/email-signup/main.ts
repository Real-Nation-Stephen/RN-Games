import type { EmailSignupRecord } from "@rngames/shared/page-modules";
import { parseFlowContextFromSearch } from "@rngames/shared";
import {
  applyPageTheme,
  completeStep,
  engageStep,
  fetchPageModule,
  flowModeActive,
  flowNextLabel,
  getSlugFromPath,
  initEmbeddedContexts,
  notifyStepContentReady,
  patchSessionData,
  setupPagePreview,
  wirePageLogo,
  wirePoweredBy,
} from "../page-module/shared";

const els = {
  app: document.getElementById("page-app")!,
  signupPanel: document.getElementById("signup-panel")!,
  thankYou: document.getElementById("thank-you")!,
  headline: document.getElementById("page-headline")!,
  form: document.getElementById("page-form") as HTMLFormElement,
  nameLabel: document.getElementById("name-label")!,
  emailLabel: document.getElementById("email-label")!,
  consentRow: document.getElementById("consent-row")!,
  consentText: document.getElementById("consent-text")!,
  consentCheckbox: document.getElementById("consent-checkbox") as HTMLInputElement,
  consentGdpr: document.getElementById("consent-gdpr")!,
  consentGdprLink: document.getElementById("consent-gdpr-link") as HTMLAnchorElement,
  submit: document.getElementById("page-submit") as HTMLButtonElement,
  thankYouHeadline: document.getElementById("thank-you-headline")!,
  thankYouBody: document.getElementById("thank-you-body")!,
  thankYouBtn: document.getElementById("thank-you-btn") as HTMLButtonElement,
  error: document.getElementById("page-error")!,
};

function showThankYou(cfg: EmailSignupRecord, onContinue: () => void) {
  els.signupPanel.hidden = true;
  els.thankYou.hidden = false;
  els.thankYouHeadline.textContent = "Thank you";
  els.thankYouBody.textContent = cfg.thankYouMessage;
  els.thankYouBtn.textContent = flowModeActive() ? flowNextLabel() : "Continue";
  els.thankYouBtn.onclick = onContinue;
  notifyStepContentReady();
}

function mountEmailSignup(cfg: EmailSignupRecord) {
  applyPageTheme(cfg, document.documentElement);
  wirePoweredBy(cfg);
  wirePageLogo(cfg);
  els.headline.textContent = cfg.headline;
  els.nameLabel.textContent = cfg.nameLabel;
  els.emailLabel.textContent = cfg.emailLabel;
  els.submit.textContent = flowModeActive() ? flowNextLabel() : cfg.submitLabel;
  els.signupPanel.hidden = false;
  els.thankYou.hidden = true;

  if (cfg.consentText) {
    els.consentRow.hidden = false;
    els.consentText.textContent = cfg.consentText;
    els.consentCheckbox.required = cfg.consentRequired;
  } else {
    els.consentRow.hidden = true;
  }
  if (cfg.consentGdprUrl) {
    els.consentGdpr.hidden = false;
    els.consentGdprLink.href = cfg.consentGdprUrl;
    els.consentGdprLink.textContent = cfg.consentGdprLinkLabel;
  } else {
    els.consentGdpr.hidden = true;
  }

  els.app.hidden = false;
  notifyStepContentReady();
  els.form.oninput = () => engageStep();
  els.form.onsubmit = (e) => {
    e.preventDefault();
    els.error.hidden = true;
    const fd = new FormData(els.form);
    const values = { name: String(fd.get("name") || "").trim(), email: String(fd.get("email") || "").trim() };
    if (!values.email) {
      els.error.hidden = false;
      els.error.textContent = "Email is required.";
      return;
    }
    if (cfg.consentRequired && cfg.consentText && !els.consentCheckbox.checked) {
      els.error.hidden = false;
      els.error.textContent = "Please accept to continue.";
      return;
    }
    const outcomes = { "form.fieldValues": values, completed: true };
    const flow = parseFlowContextFromSearch(new URLSearchParams(window.location.search));
    const finish = () => {
      void (async () => {
        if (flow?.sessionId) await patchSessionData(flow.sessionId, { emailSignup: values }, outcomes);
        completeStep({ gameId: cfg.id, ...outcomes });
      })();
    };
    showThankYou(cfg, finish);
  };
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    setupPagePreview("email-signup", (cfg) => mountEmailSignup(cfg as EmailSignupRecord));
    return;
  }
  initEmbeddedContexts();
  const slug = getSlugFromPath("email-signup");
  if (!slug) {
    els.error.textContent = "Missing slug.";
    els.error.hidden = false;
    return;
  }
  mountEmailSignup((await fetchPageModule(slug, "email-signup")) as EmailSignupRecord);
}

void boot().catch((e) => {
  els.error.hidden = false;
  els.error.textContent = e instanceof Error ? e.message : "Failed to load";
});
