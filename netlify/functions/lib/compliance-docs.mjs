const DISCLAIMER =
  "This document is generated from platform configuration facts detected at the time of generation. It does not constitute legal advice. A qualified privacy professional should review before publication.";

export function generateComplianceDocuments(deployment, effective, findings, complianceStatus) {
  const hasPersonal = effective.fields.some(
    (f) => f.collect && (f.dataClass === "personal" || f.dataClass === "pseudonymous"),
  );
  const collectedFields = effective.fields.filter((f) => f.collect);
  const generatedAt = new Date().toISOString();

  const privacyPage = hasPersonal
    ? buildPersonalDataPrivacyPage(deployment, collectedFields, generatedAt)
    : buildNoPersonalDataStatement(deployment, generatedAt);

  const checklist = buildChecklist(deployment, findings, complianceStatus, generatedAt);
  const snippet = hasPersonal
    ? `This experience may process: ${collectedFields.map((f) => f.fieldId).join(", ") || "activity data"}. See the hosted privacy page for details.`
    : "This experience is configured not to collect personal or pseudonymous data beyond operational session identifiers.";

  return {
    generatedAt,
    disclaimer: DISCLAIMER,
    advisoryPilot: true,
    privacyPage,
    websiteSnippet: snippet,
    checklist,
    clientSummary: buildClientSummary(deployment, complianceStatus, hasPersonal, generatedAt),
  };
}

function buildNoPersonalDataStatement(deployment, generatedAt) {
  return `# Privacy notice — ${deployment.title}

${DISCLAIMER}

**Generated:** ${generatedAt}  
**Deployment:** ${deployment.slug} (${deployment.kind})

## Confirmed no-personal-data processing (configuration-based)

Based on the current deployment configuration scan, this deployment is **not configured to collect personal or pseudonymous data** such as names, email addresses, or free-text responses identifiable to an individual.

Operational session identifiers may still be used to maintain progress within a session. These are not presented as a general-purpose participant identity in reports.

If you change form fields, email collection, or other component settings, regenerate this document.
`;
}

function buildPersonalDataPrivacyPage(deployment, collectedFields, generatedAt) {
  const fieldLines = collectedFields.length
    ? collectedFields.map((f) => `- **${f.fieldId}** (${f.dataClass}) — from ${f.componentType}: ${f.reason}`).join("\n")
    : "- No specific fields detected; review component configuration.";

  return `# Privacy notice — ${deployment.title}

${DISCLAIMER}

**Generated:** ${generatedAt}  
**Deployment:** ${deployment.slug} (${deployment.kind})

## What this deployment may process

The platform detected the following data categories in the current configuration:

${fieldLines}

## Retention

Default retention period: ${deployment.measurement?.retention?.defaultDays ?? "not configured"} days.

## Reporting

Public aggregate-only reporting: ${deployment.measurement?.reporting?.publicAggregateOnly !== false ? "enabled by default" : "disabled"}.

## Your rights

Contact the deployment administrator for access, correction, or deletion requests relating to your data.
`;
}

function buildChecklist(deployment, findings, complianceStatus, generatedAt) {
  const lines = [
    `# Compliance checklist (indicative) — ${deployment.title}`,
    "",
    DISCLAIMER,
    "",
    `**Status:** ${complianceStatus.label}`,
    `**Generated:** ${generatedAt}`,
    "",
    "## Findings",
    "",
  ];
  if (!findings.length) {
    lines.push("- No advisory findings.");
  } else {
    for (const f of findings) {
      if (f.severity === "expected") continue;
      lines.push(`- [ ] **${f.ruleId}** (${f.severity}): ${f.message}`);
      if (f.recommendation) lines.push(`  - Recommendation: ${f.recommendation}`);
    }
  }
  lines.push("", "## Note", "", "Publish blocking, override audit and purge enforcement are not active in this advisory pilot.");
  return lines.join("\n");
}

function buildClientSummary(deployment, complianceStatus, hasPersonal, generatedAt) {
  return `Client summary — ${deployment.title}
Generated: ${generatedAt}
Indicative status: ${complianceStatus.label}
Personal data in configuration: ${hasPersonal ? "yes" : "no"}
This is an indicative assessment only, not a compliance certification.`;
}
