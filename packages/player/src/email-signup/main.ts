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
  initFlowContext,
  patchSessionData,
  setupPagePreview,
  wirePoweredBy,
} from "../page-module/shared";

const els = {
  app: document.getElementById("page-app")!,
  headline: document.getElementById("page-headline")!,
  form: document.getElementById("page-form") as HTMLFormElement,
  nameLabel: document.getElementById("name-label")!,
  emailLabel: document.getElementById("email-label")!,
  submit: document.getElementById("page-submit") as HTMLButtonElement,
  error: document.getElementById("page-error")!,
};

function mountEmailSignup(cfg: EmailSignupRecord) {
  applyPageTheme(cfg, document.documentElement);
  wirePoweredBy(cfg);
  els.headline.textContent = cfg.headline;
  els.nameLabel.textContent = cfg.nameLabel;
  els.emailLabel.textContent = cfg.emailLabel;
  els.submit.textContent = flowModeActive() ? flowNextLabel() : cfg.submitLabel;
  els.app.hidden = false;
  els.form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(els.form);
    const values = { name: String(fd.get("name") || "").trim(), email: String(fd.get("email") || "").trim() };
    if (!values.email) {
      els.error.hidden = false;
      els.error.textContent = "Email is required.";
      return;
    }
    const outcomes = { "form.fieldValues": values, completed: true };
    const flow = parseFlowContextFromSearch(new URLSearchParams(window.location.search));
    void (async () => {
      if (flow?.sessionId) await patchSessionData(flow.sessionId, { emailSignup: values }, outcomes);
      completeStep({ gameId: cfg.id, ...outcomes });
    })();
  };
  els.form.oninput = () => engageStep();
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    setupPagePreview("email-signup", (cfg) => mountEmailSignup(cfg as EmailSignupRecord));
    return;
  }
  initFlowContext();
  const slug = getSlugFromPath("email-signup");
  if (!slug) {
    els.error.textContent = "Missing slug.";
    els.error.hidden = false;
    return;
  }
  const cfg = (await fetchPageModule(slug, "email-signup")) as EmailSignupRecord;
  mountEmailSignup(cfg);
}

void boot().catch((e) => {
  els.error.hidden = false;
  els.error.textContent = e instanceof Error ? e.message : "Failed to load";
});
