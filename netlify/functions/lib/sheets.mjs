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

const SPIN_HEADERS = [
  "timestamp_utc",
  "wheel_slug",
  "wheel_id",
  "segment_index",
  "prize_label",
  "outcome",
  "schema_version",
];

export async function appendSpinRow(row) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID");
  const sheets = getSheetsClient();
  const range = process.env.GOOGLE_SHEET_TAB || "Spins!A:G";
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
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/**
 * Read all spin rows (excluding header) — OK for moderate volume; paginate later if needed.
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
