import { google } from "googleapis";

let _sheets = null;

function getSheetsClient() {
  if (_sheets) return _sheets;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");
  }
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  _sheets = google.sheets({ version: "v4", auth });
  return _sheets;
}

export const SPIN_HEADERS = [
  "timestamp_utc",
  "wheel_slug",
  "wheel_id",
  "segment_index",
  "prize_label",
  "outcome",
  "schema_version",
];

/**
 * Google Sheet tab titles: no \\ / * ? [ ] : and max 100 chars.
 * @param {string} slug
 * @param {string} wheelId
 */
export function sanitizeSheetTabName(slug, wheelId) {
  const safe = slug.replace(/[\\/*?:[\]]/g, "-").replace(/\s+/g, " ").trim().slice(0, 70);
  const suffix = (wheelId || "id").replace(/-/g, "").slice(0, 8);
  const base = safe || "wheel";
  const title = `${base}_${suffix}`;
  return title.slice(0, 100);
}

/**
 * Create a tab for this wheel (if missing) and write header rows.
 * Row 1: column headers. Row 2: prize labels for reference.
 *
 * @param {string} tabTitle
 * @param {{ prizeLabels: string[] }} opts
 */
export async function ensureWheelReportingTab(tabTitle, opts) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID");

  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === tabTitle);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabTitle } } }],
      },
    });

    const prizeLabels = opts.prizeLabels || [];
    const prizeRef = prizeLabels.map((_, i) => `Seg${i + 1}: ${prizeLabels[i] ?? ""}`).join(" | ");

    const values = [
      SPIN_HEADERS,
      ["prize_labels_ref", "", "", "", prizeRef, "", ""],
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabTitle.replace(/'/g, "''")}'!A1:G2`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
  }
}

/**
 * @param {string} tabTitle
 * @param {object} row
 */
export async function appendSpinRowToTab(tabTitle, row) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID");
  const sheets = getSheetsClient();
  const safe = tabTitle.replace(/'/g, "''");
  const values = [
    [
      row.timestampUtc,
      row.wheelSlug,
      row.wheelId,
      String(row.segmentIndex),
      row.prizeLabel,
      row.outcome,
      String(row.schemaVersion),
    ],
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${safe}'!A:G`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/** @deprecated use appendSpinRowToTab — single shared tab (legacy) */
export async function appendSpinRow(row) {
  const range = process.env.GOOGLE_SHEET_TAB || "Spins!A:G";
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID");
  const sheets = getSheetsClient();
  const values = [
    [
      row.timestampUtc,
      row.wheelSlug,
      row.wheelId,
      String(row.segmentIndex),
      row.prizeLabel,
      row.outcome,
      String(row.schemaVersion),
    ],
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/**
 * Read spin rows from a wheel-specific tab (rows 3+ are data; rows 1–2 are headers).
 * @param {string} tabTitle
 */
export async function readSpinRowsFromTab(tabTitle) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) return [];
  const sheets = getSheetsClient();
  const safe = tabTitle.replace(/'/g, "''");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${safe}'!A:G`,
  });
  const rows = res.data.values || [];
  if (rows.length < 3) return [];
  const header = rows[0];
  const dataRows = rows.slice(2);
  return dataRows.map((r) => {
    const o = {};
    header.forEach((h, i) => {
      o[h] = r[i] ?? "";
    });
    return o;
  });
}

/**
 * Read all spin rows from legacy single-tab setup (row 1 header, row 2+ data).
 */
export async function readSpinRows() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return [];
  const sheets = getSheetsClient();
  const range = process.env.GOOGLE_SHEET_TAB || "Spins!A:G";
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  const rows = res.data.values || [];
  if (rows.length < 2) return [];
  const header = rows[0];
  const dataRows = rows.slice(1);
  return dataRows.map((r) => {
    const o = {};
    header.forEach((h, i) => {
      o[h] = r[i] ?? "";
    });
    return o;
  });
}
