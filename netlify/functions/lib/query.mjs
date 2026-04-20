/** Netlify/AWS sometimes omit or split query params — parse from raw pieces when needed. */
export function getQueryParam(event, name) {
  const q = event.queryStringParameters;
  if (q && q[name] != null && String(q[name]).length > 0) {
    return String(q[name]);
  }
  const mv = event.multiValueQueryStringParameters?.[name];
  if (mv && mv[0]) return String(mv[0]);
  const raw = event.rawQuery || "";
  if (raw) {
    const v = new URLSearchParams(raw).get(name);
    if (v) return v;
  }
  const path = event.path || "";
  const qi = path.indexOf("?");
  if (qi >= 0) {
    const v = new URLSearchParams(path.slice(qi + 1)).get(name);
    if (v) return v;
  }
  return "";
}
