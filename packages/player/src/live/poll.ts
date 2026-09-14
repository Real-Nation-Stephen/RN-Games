import { liveGetUrl, liveJson } from "./api";

export type LivePollRole = "public" | "participant" | "moderator";

export function startLivePoll(opts: {
  code: () => string;
  role: LivePollRole;
  participantId?: () => string;
  participantSecret?: () => string;
  hostKey?: () => string;
  onState: (state: Record<string, unknown>) => void;
  onUnchanged?: () => void;
}) {
  let rev = "";
  let timer = 0;
  let stopped = false;
  let delay = 1000;

  async function tick() {
    if (stopped) return;
    try {
      const code = opts.code();
      if (!code) {
        timer = window.setTimeout(tick, delay);
        return;
      }
      const params: Record<string, string | number> = { code, role: opts.role };
      if (rev) params.rev = rev;
      const pid = opts.participantId?.();
      if (pid) params.participantId = pid;
      const hostKey = opts.hostKey?.();
      if (hostKey) params.hostKey = hostKey;
      const headers: Record<string, string> = {};
      const secret = opts.participantSecret?.();
      if (secret) headers["x-live-secret"] = secret;
      const data = await liveJson(liveGetUrl("live-run", params), Object.keys(headers).length ? { headers } : undefined);
      if (data.changed && data.state && typeof data.state === "object") {
        const state = data.state as Record<string, unknown>;
        rev = String(state.viewToken || state.revision || "");
        delay = 900 + Math.floor(Math.random() * 250);
        opts.onState(state);
      } else {
        delay = Math.min(2500, delay + 80);
        opts.onUnchanged?.();
      }
    } catch {
      delay = Math.min(4000, delay + 400);
    }
    timer = window.setTimeout(tick, delay);
  }

  void tick();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
