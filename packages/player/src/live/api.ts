export function liveEndpoint(name: string): string {
  return import.meta.env.DEV ? `/api/${name}` : `/.netlify/functions/${name}`;
}

export function liveGetUrl(name: string, params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") q.set(k, String(v));
  }
  return `${liveEndpoint(name)}?${q.toString()}`;
}

export async function liveJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) {
    const err = new Error(String(data.error || `HTTP ${res.status}`));
    (err as Error & { status: number; payload: unknown }).status = res.status;
    (err as Error & { status: number; payload: unknown }).payload = data;
    throw err;
  }
  return data;
}
