import type { FormField, FormRecord } from "@rngames/shared/page-modules";
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
  wirePoweredBy,
} from "../page-module/shared";

const els = {
  app: document.getElementById("page-app")!,
  headline: document.getElementById("page-headline")!,
  body: document.getElementById("page-body")!,
  form: document.getElementById("page-form") as HTMLFormElement,
  submit: document.getElementById("page-submit") as HTMLButtonElement,
  error: document.getElementById("page-error")!,
};

function showError(msg: string) {
  els.error.hidden = false;
  els.error.textContent = msg;
}

function renderField(field: FormField): HTMLElement {
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

async function boot() {
  initFlowContext();
  const slug = getSlugFromPath("form");
  if (!slug) {
    showError("Missing form slug.");
    return;
  }
  try {
    const cfg = (await fetchPageModule(slug, "form")) as FormRecord;
    applyPageTheme(cfg, document.documentElement);
    wirePoweredBy(cfg);
    els.headline.textContent = cfg.headline;
    els.body.textContent = cfg.body;
    els.submit.textContent = flowModeActive() ? flowNextLabel() : cfg.submitLabel;
    els.form.replaceChildren(...cfg.fields.map(renderField));
    els.app.hidden = false;

    els.form.addEventListener("input", () => engageStep(), { once: true });

    els.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const values: Record<string, string> = {};
      const fd = new FormData(els.form);
      for (const [k, v] of fd.entries()) values[k] = String(v).trim();

      for (const f of cfg.fields) {
        if (f.required && !values[f.id]) {
          showError(`${f.label} is required.`);
          return;
        }
      }
      els.error.hidden = true;

      const outcomes = { "form.fieldValues": values, completed: true };
      const flow = parseFlowContextFromSearch(new URLSearchParams(window.location.search));
      void (async () => {
        if (flow?.sessionId) {
          await patchSessionData(flow.sessionId, { formFields: values }, outcomes);
        }
        completeStep({ gameId: cfg.id, ...outcomes });
      })();
    });
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load");
  }
}

void boot();
