/** Map live component configs to registry field ids for measurement/compliance scans. */

export type FieldDetectionInput = {
  componentType: string;
  config: Record<string, unknown>;
};

function mapFormFieldToRegistryIds(field: { id?: string; type?: string; label?: string }): string[] {
  const ids: string[] = [];
  const type = String(field.type || "text");
  const label = String(field.label || "").toLowerCase();
  const id = String(field.id || "").toLowerCase();

  if (type === "email" || id.includes("email") || label.includes("email")) {
    ids.push("email");
  }
  if (type === "phone" || type === "postcode" || label.includes("phone") || label.includes("postcode")) {
    ids.push("freeText");
  }
  if (type === "textarea") {
    ids.push("freeText");
  }
  if (type === "text" && (label.includes("name") || id.includes("name"))) {
    ids.push("displayName");
  } else if (type === "text" && !ids.includes("email") && !ids.includes("displayName")) {
    ids.push("freeText");
  }
  if (type === "dropdown" || type === "multiple_choice" || type === "checkbox" || type === "date") {
    ids.push("freeText");
  }
  return ids;
}

export function detectEnabledRegistryFieldIds(input: FieldDetectionInput): string[] {
  const { componentType, config } = input;
  const enabled = new Set<string>();

  if (componentType === "form") {
    const fields = config.fields;
    if (Array.isArray(fields)) {
      for (const f of fields) {
        if (!f || typeof f !== "object") continue;
        for (const id of mapFormFieldToRegistryIds(f as { id?: string; type?: string; label?: string })) {
          enabled.add(id);
        }
      }
    }
    return [...enabled];
  }

  if (componentType === "email-signup") {
    enabled.add("email");
    enabled.add("displayName");
    if (config.consentRequired || config.consentText) {
      enabled.add("marketingOptIn");
    }
    return [...enabled];
  }

  if (componentType === "leaderboard") return ["displayName"];
  if (componentType === "certificate") return ["learnerName"];

  if (componentType === "pinboard") {
    const mobile = config.mobile as { guestSubmit?: { allowPhotos?: boolean } } | undefined;
    if (mobile?.guestSubmit?.allowPhotos) return ["photo"];
  }

  if (config.reportingEnabled === true) return ["reportingEnabled"];
  return [];
}
