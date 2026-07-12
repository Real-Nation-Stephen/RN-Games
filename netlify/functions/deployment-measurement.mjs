import { connectLambda } from "@netlify/blobs";
import { requireAuth } from "./lib/auth.mjs";
import { scanDeployment, resolveEffectiveMeasurementJs } from "./lib/deployment-scan.mjs";
import { runComplianceScan, calculateComplianceStatus } from "./lib/compliance-scan.mjs";
import { generateComplianceDocuments } from "./lib/compliance-docs.mjs";
import { queryDeploymentMetrics, metricsDeploymentId } from "./lib/measurement-metrics.mjs";
import { blobStore } from "./lib/store.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function parseKind(raw) {
  const k = String(raw || "").trim().toLowerCase();
  if (k === "course" || k === "flow" || k === "component") return k;
  return null;
}

async function buildDeploymentView(kind, id) {
  const deployment = await scanDeployment(kind, id);
  if (!deployment) return null;
  const effective = resolveEffectiveMeasurementJs({
    deploymentKind: deployment.kind,
    recordId: deployment.recordId,
    measurement: deployment.measurement,
    scannedComponents: deployment.components,
  });
  const inventory = deployment.components.map((c) => ({
    componentType: c.componentType,
    instanceId: c.instanceId,
    title: c.title,
    reportingEnabled: !!c.config?.reportingEnabled,
    fieldCount: Array.isArray(c.config?.fields) ? c.config.fields.length : 0,
  }));
  return { deployment, effective, inventory };
}

export const handler = async (event, context) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const deny = requireAuth(event, context);
  if (deny) return { ...deny, headers: { ...headers, ...deny.headers } };

  const q = event.queryStringParameters || {};
  const kind = parseKind(q.kind);
  const id = String(q.id || "").trim();
  const view = String(q.view || "effective").trim().toLowerCase();

  if (!kind || !id) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "kind and id required" }) };
  }

  try {
    if (event.httpMethod === "GET") {
      const built = await buildDeploymentView(kind, id);
      if (!built) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Deployment not found" }) };
      }
      const { deployment, effective, inventory } = built;

      if (view === "metrics") {
        const deploymentId = metricsDeploymentId(kind, id);
        const metrics = await queryDeploymentMetrics(deploymentId, {
          from: q.from,
          to: q.to,
          excludePreview: deployment.measurement?.excludePreviewTraffic !== false,
        });
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            deploymentId,
            reporting: deployment.measurement?.reporting,
            complianceAdvisory: true,
            ...metrics,
          }),
        };
      }

      if (view === "compliance") {
        const findings = runComplianceScan(deployment, effective, {
          privacyPageConfigured: !!q.privacyPageConfigured,
          childrenEnabled: q.childrenEnabled === "1",
        });
        const complianceStatus = calculateComplianceStatus(findings);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            advisoryPilot: true,
            advisoryNotice:
              "Indicative Assessment (Advisory Pilot). Publish blocking, override audit and purge enforcement are not active.",
            complianceStatus,
            findings,
            effective,
            inventory,
            retention: deployment.measurement?.retention,
            reporting: deployment.measurement?.reporting,
          }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          deployment: {
            kind: deployment.kind,
            recordId: deployment.recordId,
            title: deployment.title,
            slug: deployment.slug,
            measurement: deployment.measurement,
          },
          effective,
          inventory,
        }),
      };
    }

    if (event.httpMethod === "POST" && view === "documents") {
      const built = await buildDeploymentView(kind, id);
      if (!built) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Deployment not found" }) };
      }
      const { deployment, effective } = built;
      const findings = runComplianceScan(deployment, effective);
      const complianceStatus = calculateComplianceStatus(findings);
      const documents = generateComplianceDocuments(deployment, effective, findings, complianceStatus);

      const st = await blobStore();
      const deploymentId = metricsDeploymentId(kind, id);
      const version = new Date().toISOString().replace(/[:.]/g, "-");
      const key = `compliance-doc:${deploymentId}:${version}`;
      await st.setJSON(key, { deploymentId, version, documents });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, key, documents }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Server error" }),
    };
  }
};
