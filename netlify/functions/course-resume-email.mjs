import { randomUUID } from "node:crypto";
import { connectLambda } from "@netlify/blobs";
import {
  getCourseSessionJson,
  getCourseJson,
  readCoursesIndex,
} from "./lib/blobs.mjs";
import { normalizeCourseRecord } from "./lib/course.mjs";
import { blobStore } from "./lib/store.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

const RATE_LIMIT_PER_HOUR = 30;

function clientIp(event) {
  return (
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["client-ip"] ||
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function checkRateLimit(ip) {
  const hour = new Date().toISOString().slice(0, 13);
  const key = `course-email-rate:${ip}:${hour}`;
  const st = await blobStore();
  const raw = await st.get(key, { type: "json" });
  const count = Number(raw?.count) || 0;
  if (count >= RATE_LIMIT_PER_HOUR) return false;
  await st.setJSON(key, { count: count + 1, hour });
  return true;
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function siteOrigin(event) {
  const host = event.headers.host || event.headers["x-forwarded-host"];
  const proto = event.headers["x-forwarded-proto"] || "https";
  if (host) return `${proto}://${host}`;
  return process.env.URL || process.env.DEPLOY_PRIME_URL || "https://localhost";
}

async function sendViaResend({ to, from, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, reason: "email_not_configured" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Email send failed");
  }
  return { sent: true };
}

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
  }

  try {
    const ip = clientIp(event);
    if (!(await checkRateLimit(ip))) {
      return { statusCode: 429, body: JSON.stringify({ error: "Too many emails. Try again later." }), headers };
    }

    const body = JSON.parse(event.body || "{}");
    const email = normalizeEmail(body.email);
    const sessionId = String(body.sessionId || "").trim();

    if (!email || !isValidEmail(email)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Valid email required" }), headers };
    }
    if (!sessionId) {
      return { statusCode: 400, body: JSON.stringify({ error: "sessionId required" }), headers };
    }

    const session = await getCourseSessionJson(sessionId);
    if (!session) {
      return { statusCode: 404, body: JSON.stringify({ error: "Session not found" }), headers };
    }

    const list = await readCoursesIndex();
    const row = list.find((c) => c.id === session.courseId);
    const courseDoc = row ? normalizeCourseRecord(await getCourseJson(row.id)) : null;
    const courseTitle = courseDoc?.title || row?.title || "Your course";
    const origin = siteOrigin(event);
    const resumeUrl =
      body.resumeUrl?.trim() ||
      (session.resumeToken
        ? `${origin}/course/${encodeURIComponent(session.courseSlug)}?resumeToken=${encodeURIComponent(session.resumeToken)}`
        : `${origin}/course/${encodeURIComponent(session.courseSlug)}`);

    const from = process.env.COURSE_EMAIL_FROM?.trim() || "RN Game Studio <onboarding@resend.dev>";
    const subject = `Your learning link: ${courseTitle}`;
    const html = `
      <p>Hi,</p>
      <p>Use the link below to return to <strong>${courseTitle}</strong> and pick up where you left off.</p>
      <p>We use your email only to send this learning link and reconnect your progress — not for marketing unless you opt in elsewhere.</p>
      <p><a href="${resumeUrl}">${resumeUrl}</a></p>
      <p>If you did not request this email, you can ignore it.</p>
    `;

    const result = await sendViaResend({ to: email, from, subject, html });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ...result,
        resumeUrl,
      }),
      headers,
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Server error" }),
    };
  }
};
