import { getLiveConnection, liveGetUrl, liveJson, setLiveSocketConnected } from "./api";
import { observeServerTime } from "./race-clock";
export type LivePollRole = "public" | "participant" | "moderator";
export function startLivePoll(opts: {
  code: () => string; role: LivePollRole;
  participantId?: () => string; participantSecret?: () => string; hostKey?: () => string;
  onState: (state: Record<string, unknown>) => void; onUnchanged?: () => void;
}) {
  let rev = "", activeCode = "", timer = 0, stopped = false, delay = 1000;
  let socket: WebSocket | null = null, retryAt = 0, lastMessage = 0, lastClock = 0, lastPing = 0;
  let badge: HTMLDivElement | null = null;
  function connectionStatus(message = "") {
    if (!stopped && !message && opts.role === "moderator" && getLiveConnection(opts.code()).mode === "dedicated") {
      message = socket?.readyState === WebSocket.OPEN ? "Live connection ready" : "Live link reconnecting — updates may be delayed";
    }
    if (!message) { badge?.remove(); badge = null; return; }
    if (!badge) {
      badge = document.createElement("div"); badge.setAttribute("role", "status");
      badge.style.cssText = "position:fixed;bottom:12px;left:12px;z-index:9999;background:#102720;color:#fff;padding:8px 12px;border-radius:8px;font:14px system-ui;max-width:75vw";
      document.body.append(badge);
    }
    badge.textContent = message;
  }
  function receive(data: Record<string, unknown>, code: string) {
    if (stopped || code !== opts.code()) return;
    if (data.changed && data.state && typeof data.state === "object") {
      const state = data.state as Record<string, unknown>;
      rev = String(state.viewToken || state.revision || ""); opts.onState(state);
    } else opts.onUnchanged?.();
  }
  function stream(code: string) {
    const route = getLiveConnection(code);
    if (route.mode !== "dedicated" || socket || Date.now() < retryAt) return;
    const url = new URL("/live", route.apiBase); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("code", code);
    const ws = new WebSocket(url); socket = ws; lastMessage = Date.now(); lastClock = 0; lastPing = 0;
    ws.onopen = () => ws.send(JSON.stringify({ code, role: opts.role,
      participantId: opts.participantId?.(), secret: opts.participantSecret?.(), hostKey: opts.hostKey?.() }));
    ws.onmessage = event => {
      if (socket !== ws || code !== opts.code()) return;
      lastMessage = Date.now(); setLiveSocketConnected(code, true); connectionStatus();
      if (event.data === "pong") { opts.onUnchanged?.(); return; }
      try {
        const data = JSON.parse(event.data);
        if (data.type === "clock") observeServerTime(data.now, data.sentAt);
        else receive(data, code);
        if (Date.now() - lastClock > 30000) {
          lastClock = Date.now(); ws.send(JSON.stringify({type:"clock",sentAt:lastClock}));
        }
      } catch { ws.close(); }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      setLiveSocketConnected(code, false); socket = null; retryAt = Date.now() + 2500 + Math.random() * 1500;
      if (!stopped) connectionStatus("Reconnecting… Your place is saved.");
    };
    ws.onerror = () => ws.close();
  }
  async function tick() {
    if (stopped) return;
    const code = opts.code();
    if (code !== activeCode) {
      setLiveSocketConnected(activeCode, false); const old = socket; socket = null; old?.close(); activeCode = code; rev = ""; retryAt = 0;
    }
    if (socket && Date.now() - lastMessage > 45000) { setLiveSocketConnected(code, false); const old = socket; socket = null; old.close(); retryAt = Date.now() + 2500; }
    if (socket?.readyState === WebSocket.OPEN && Date.now() - lastMessage < 45000) {
      if (Date.now() - lastPing > 15000) { lastPing = Date.now(); socket.send("ping"); }
      if (Date.now() - lastClock > 30000) { lastClock = Date.now(); socket.send(JSON.stringify({type:"clock",sentAt:lastClock})); }
      timer = window.setTimeout(tick, 1000); return;
    }
    try {
      if (code) {
        const params: Record<string, string | number> = { code, role: opts.role };
        if (rev) params.rev = rev;
        if (opts.participantId?.()) params.participantId = opts.participantId!();
        if (opts.hostKey?.()) params.hostKey = opts.hostKey!();
        const headers: Record<string, string> = {};
        if (opts.participantSecret?.()) headers["x-live-secret"] = opts.participantSecret!();
        const sentAt = Date.now();
        const data = await liveJson(liveGetUrl("live-run", params), { headers });
        if (!stopped && code === opts.code()) {
          observeServerTime((data.state as Record<string, unknown> | null)?.now || data.now, sentAt);
          receive(data, code); connectionStatus();
          delay = data.changed ? 900 + Math.random() * 250 : Math.min(2500, delay + 80);
          stream(code);
        }
      }
    } catch {
      delay = Math.min(4000, delay + 400);
      connectionStatus("Reconnecting… Your place is saved.");
    }
    if (!stopped) timer = window.setTimeout(tick, delay);
  }
  void tick();
  return () => { stopped = true; setLiveSocketConnected(activeCode, false); window.clearTimeout(timer); socket?.close(); connectionStatus(); };
}
