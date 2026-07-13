/** Map live component configs to registry field ids — mirrors packages/shared measurement/field-detection.ts */

function mapFormFieldToRegistryIds(field) {
  const ids = [];
  const type = String(field.type || "text");
  const label = String(field.label || "").toLowerCase();
  const id = String(field.id || "").toLowerCase();

  if (type === "email" || id.includes("email") || label.includes("email")) ids.push("email");
  if (type === "phone" || type === "postcode" || label.includes("phone") || label.includes("postcode")) {
    ids.push("freeText");
  }
  if (type === "textarea") ids.push("freeText");
  if (type === "text" && (label.includes("name") || id.includes("name"))) {
    ids.push("displayName");
  } else if (type === "text" && !ids.includes("email") && !ids.includes("displayName")) {
    ids.push("freeText");
  }
  if (["dropdown", "multiple_choice", "checkbox", "date"].includes(type)) ids.push("freeText");
  return ids;
}

export function detectEnabledRegistryFieldIds({ componentType, config }) {
  const enabled = new Set();

  if (componentType === "form") {
    if (Array.isArray(config?.fields)) {
      for (const f of config.fields) {
        if (!f || typeof f !== "object") continue;
        for (const id of mapFormFieldToRegistryIds(f)) enabled.add(id);
      }
    }
    return [...enabled];
  }

  if (componentType === "email-signup") {
    enabled.add("email");
    enabled.add("displayName");
    if (config?.consentRequired || config?.consentText) enabled.add("marketingOptIn");
    return [...enabled];
  }

  if (componentType === "leaderboard") return ["displayName"];
  if (componentType === "certificate") return ["learnerName"];
  if (componentType === "pinboard" && config?.mobile?.guestSubmit?.allowPhotos) return ["photo"];
  if (config?.reportingEnabled === true) return ["reportingEnabled"];
  return [];
}
