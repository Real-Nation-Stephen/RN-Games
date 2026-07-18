/**
 * Advisory compliance scan — indicative assessment pilot.
 * Does not imply full compliance readiness; publish blocking deferred.
 */

const SEVERITY = {
  expected: "expected",
  recommendation: "recommendation",
  warning: "warning",
  review_required: "review_required",
  high_risk: "high_risk",
};

function hasCollectedField(effective, fieldId, dataClass) {
  return effective.fields.some((f) => f.collect && (fieldId ? f.fieldId === fieldId : f.dataClass === dataClass));
}

function hasEmailCollection(deployment) {
  return deployment.components.some((c) => {
    if (c.componentType !== "form" && c.componentType !== "email-signup") return false;
    const fields = c.config?.fields;
    if (!Array.isArray(fields)) return false;
    return fields.some((f) => f?.type === "email" || f?.id === "email" || String(f?.label || "").toLowerCase().includes("email"));
  });
}

function hasMetadataGaps(deployment) {
  return deployment.components.filter((c) => !c.componentType || c.componentType === "module");
}

export function runComplianceScan(deployment, effective, context = {}) {
  const findings = [];
  const childrenEnabled = !!context.childrenEnabled;
  const hasPersonal =
    effective.fields.some(
      (f) =>
        (f.dataClass === "personal" || f.dataClass === "pseudonymous") &&
        f.reason !== "Not enabled in component configuration.",
    ) || hasEmailCollection(deployment);

  const add = (ruleId, severity, message, recommendation, blocksPublish = false) => {
    findings.push({
      ruleId,
      severity,
      message,
      recommendation,
      blocksPublish: false, // advisory pilot — never block
      advisoryOnly: true,
    });
  };

  if (childrenEnabled && hasEmailCollection(deployment)) {
    add("CHILD_EMAIL_001", SEVERITY.warning, "Children context with email collection detected.", "Consider Resume Links or another non-email return method.");
  }

  if (hasMetadataGaps(deployment).length) {
    add("METADATA_GAP_001", SEVERITY.review_required, "One or more deployed components lack complete compliance metadata.", "Complete the component metadata contract.");
  }

  if (hasCollectedField(effective, "email", "personal")) {
    const privacyUrl = deployment.kind === "course" ? "" : "";
    if (!context.privacyPageConfigured && hasPersonal) {
      add("NO_PRIVACY_PAGE_001", SEVERITY.high_risk, "Personal or pseudonymous data may be processed without a configured privacy page.", "Configure and publish the deployment privacy page.");
    }
  }

  if (hasPersonal && !deployment.measurement?.retention?.defaultDays) {
    add("RETENTION_MISSING_001", SEVERITY.high_risk, "Retained personal or behavioural data lacks a retention policy.", "Configure a retention period and purge action.");
  }

  for (const c of deployment.components) {
    if (c.componentType === "leaderboard") {
      add("LEADERBOARD_REAL_NAME_001", SEVERITY.recommendation, "Leaderboard may display participant-entered names.", "Use moderated aliases or generated display names.");
    }
    if (c.componentType === "pinboard" && c.config?.mobile?.guestSubmit?.allowPhotos) {
      add("PHOTO_PUBLIC_001", SEVERITY.review_required, "Photo upload is enabled on pinboard.", "Confirm publication consent and moderation workflow.");
    }
    if (c.componentType === "email-signup") {
      const hasOptIn =
        (Array.isArray(c.config?.consentItems) && c.config.consentItems.length) ||
        (Array.isArray(c.config?.items) && c.config.items.length) ||
        (c.config?.consentRequired && c.config?.consentText);
      if (!hasOptIn) {
        add("EMAIL_SIGNUP_OPTIN_002", SEVERITY.high_risk, "Email Signup has no explicit opt-in state.", "Add an explicit opt-in and record its wording/version.");
      }
    }
    if (c.componentType === "form" && Array.isArray(c.config?.fields)) {
      const hasFreeText = c.config.fields.some((f) => f?.type === "textarea" || f?.type === "text");
      if (hasFreeText) {
        add("FORM_FREE_TEXT_001", SEVERITY.recommendation, "Free-text field enabled on a form.", "Add guidance not to submit unnecessary personal or sensitive information.");
      }
    }
    if (!getComponentMetadataExists(c.componentType)) {
      add("METADATA_GAP_001", SEVERITY.review_required, `Component type "${c.componentType}" has incomplete metadata.`, "Register component in metadata contract.");
    }
  }

  if (deployment.measurement?.reporting?.enabled && !deployment.measurement?.reporting?.publicAggregateOnly) {
    add("PUBLIC_REPORT_NAME_001", SEVERITY.high_risk, "Reporting may expose identifiable learner data.", "Use aggregate-only public reports unless explicitly approved.");
  }

  if (!hasPersonal) {
    add("NO_PERSONAL_DATA_001", SEVERITY.expected, "No personal or pseudonymous data collection detected in current configuration.", "A no-personal-data-processing statement may be generated.");
  }

  return findings;
}

function getComponentMetadataExists(componentType) {
  const known = new Set([
    "course", "flow", "form", "email-signup", "leaderboard", "certificate", "pinboard",
    "mini-quiz", "landing", "runner", "catch", "matching", "spinning-wheel", "badge", "quiz",
    "scratcher", "flip-cards", "consent", "redemption",
  ]);
  return known.has(componentType);
}

export function calculateComplianceStatus(findings) {
  const active = findings.filter((f) => f.severity !== SEVERITY.expected);
  const hasHigh = active.some((f) => f.severity === SEVERITY.high_risk);
  const hasReview = active.some((f) => f.severity === SEVERITY.review_required);
  const hasWarning = active.some((f) => f.severity === SEVERITY.warning || f.severity === SEVERITY.recommendation);

  if (hasHigh || hasReview) return { status: "review_required", label: "Review Required (Indicative)" };
  if (hasWarning) return { status: "ready_with_recommendations", label: "Ready with Recommendations (Indicative)" };
  if (active.length === 0) return { status: "ready", label: "Ready (Indicative)" };
  return { status: "ready_with_recommendations", label: "Ready with Recommendations (Indicative)" };
}
