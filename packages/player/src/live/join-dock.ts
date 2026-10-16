import QRCode from "qrcode";

export async function renderJoinDock(el: HTMLElement, opts: { code: string; joinUrl: string; featured?: boolean }) {
  if (el.dataset.joinUrl === opts.joinUrl && el.querySelector("img")?.getAttribute("src")) return;
  el.dataset.joinUrl = opts.joinUrl;
  el.className = "live-dock";
  const host = opts.joinUrl.replace(/^https?:\/\//, "");
  el.innerHTML = `
    <img alt="Join QR" />
    <div class="live-dock-copy">
      <div class="live-dock-kicker">Join at any time</div>
      <div class="live-dock-url">${host}</div>
      <div class="live-dock-code">Code ${opts.code}</div>
    </div>
  `;
  const img = el.querySelector("img");
  if (img) {
    const svg = await QRCode.toString(opts.joinUrl, { type: "svg", margin: 4 });
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
}

export function shortJoinUrl(code: string): string {
  return `${window.location.origin}/j/${encodeURIComponent(code)}`;
}
