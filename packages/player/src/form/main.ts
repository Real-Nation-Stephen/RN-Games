import type { FormField, FormRecord } from "@rngames/shared/page-modules";
import {
  applyPageTheme,
  completeStep,
  engageStep,
  embeddedShellActive,
  fetchPageModule,
  flowModeActive,
  flowNextLabel,
  getSlugFromPath,
  initEmbeddedContexts,
  isInCourseEmbed,
  notifyCourseItemComplete,
  setupPagePreview,
  syncModuleSession,
  wirePageLogo,
  wirePoweredBy,
} from "../page-module/shared";

const els = {
  app: document.getElementById("page-app")!,
  formPanel: document.getElementById("form-panel")!,
  headline: document.getElementById("page-headline")!,
  body: document.getElementById("page-body")!,
  form: document.getElementById("page-form") as HTMLFormElement,
  submit: document.getElementById("page-submit") as HTMLButtonElement,
  postSubmit: document.getElementById("post-submit")!,
  postSubmitLogo: document.getElementById("post-submit-logo") as HTMLImageElement,
  postSubmitHeadline: document.getElementById("post-submit-headline")!,
  postSubmitBody: document.getElementById("post-submit-body")!,
  postSubmitBtn: document.getElementById("post-submit-btn") as HTMLButtonElement,
  error: document.getElementById("page-error")!,
};

function showError(msg: string) {
  els.error.hidden = false;
  els.error.textContent = msg;
}

function renderCheckboxField(field: FormField): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "page-field";
  const row = document.createElement("label");
  row.className = "page-checkbox-row";
  const text = document.createElement("span");
  text.className = "page-checkbox-text";
  text.textContent = (field.placeholder || field.label) + (field.required ? " *" : "");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.id = `field-${field.id}`;
  cb.name = field.id;
  cb.required = !!field.required;
  row.append(text, cb);
  wrap.appendChild(row);
  return wrap;
}

function renderField(field: FormField): HTMLElement {
  if (field.type === "checkbox") return renderCheckboxField(field);

  const wrap = document.createElement("div");
  wrap.className = "page-field";
  const label = document.createElement("label");
  label.textContent = field.label + (field.required ? " *" : "");
  label.htmlFor = `field-${field.id}`;
  wrap.appendChild(label);

  let input: HTMLElement;
  if (field.type === "dropdown" || field.type === "multiple_choice") {
    const sel = document.createElement("select");
    sel.id = `field-${field.id}`;
    sel.name = field.id;
    sel.required = !!field.required;
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = field.placeholder || "Select…";
    sel.appendChild(blank);
    for (const opt of field.options || []) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    }
    input = sel;
  } else {
    const inp = document.createElement("input");
    inp.id = `field-${field.id}`;
    inp.name = field.id;
    inp.required = !!field.required;
    inp.placeholder = field.placeholder || "";
    if (field.type === "email") inp.type = "email";
    else if (field.type === "phone") inp.type = "tel";
    else if (field.type === "date") inp.type = "date";
    else inp.type = "text";
    input = inp;
  }
  wrap.appendChild(input);
  return wrap;
}

function collectValues(cfg: FormRecord): Record<string, string> {
  const values: Record<string, string> = {};
  const fd = new FormData(els.form);
  for (const f of cfg.fields) {
    if (f.type === "checkbox") {
      const cb = els.form.querySelector<HTMLInputElement>(`input[name="${f.id}"]`);
      values[f.id] = cb?.checked ? "yes" : "";
    } else {
      values[f.id] = String(fd.get(f.id) || "").trim();
    }
  }
  return values;
}

function showPostSubmit(cfg: FormRecord, onContinue: () => void) {
  const ps = cfg.postSubmit;
  els.formPanel.hidden = true;
  els.postSubmit.hidden = false;
  if (ps.logoUrl) {
    els.postSubmitLogo.src = ps.logoUrl;
    els.postSubmitLogo.hidden = false;
  } else {
    els.postSubmitLogo.hidden = true;
  }
  els.postSubmitHeadline.textContent = ps.headline || "Thank you";
  els.postSubmitBody.textContent = ps.body || "";
  const btnLabel = ps.buttonLabel?.trim() || (embeddedShellActive() ? flowNextLabel() : "Continue");
  els.postSubmitBtn.textContent = btnLabel;
  els.postSubmitBtn.onclick = onContinue;
}

async function finishForm(cfg: FormRecord, values: Record<string, string>) {
  const outcomes = { "form.fieldValues": values, completed: true };
  await syncModuleSession({ formFields: values }, outcomes);
  try {
    await fetch("/api/form-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: cfg.slug, values }),
    });
  } catch {
    /* non-blocking */
  }
  const payload = { gameId: cfg.id, ...outcomes };
  if (flowModeActive()) {
    completeStep(payload);
  } else if (isInCourseEmbed()) {
    notifyCourseItemComplete(payload);
  }
}

function mountForm(cfg: FormRecord) {
  applyPageTheme(cfg, document.documentElement);
  wirePoweredBy(cfg);
  wirePageLogo(cfg);
  els.headline.textContent = cfg.headline;
  els.body.textContent = cfg.body;
  els.submit.textContent = embeddedShellActive() ? flowNextLabel() : cfg.submitLabel;
  els.form.replaceChildren(...cfg.fields.map(renderField));
  els.formPanel.hidden = false;
  els.postSubmit.hidden = true;
  els.app.hidden = false;

  els.form.addEventListener("input", () => engageStep(), { once: true });

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const values = collectValues(cfg);

    for (const f of cfg.fields) {
      if (f.required && !values[f.id]) {
        showError(`${f.label} is required.`);
        return;
      }
    }
    els.error.hidden = true;

    if (cfg.postSubmit?.enabled) {
      showPostSubmit(cfg, () => void finishForm(cfg, values));
      return;
    }
    void finishForm(cfg, values);
  });
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    setupPagePreview("form", (cfg) => mountForm(cfg as FormRecord));
    return;
  }
  initEmbeddedContexts();
  const slug = getSlugFromPath("form");
  if (!slug) {
    showError("Missing form slug.");
    return;
  }
  try {
    mountForm((await fetchPageModule(slug, "form")) as FormRecord);
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load");
  }
}

void boot();
