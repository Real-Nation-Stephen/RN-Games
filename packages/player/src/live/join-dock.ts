import QRCode from "qrcode";

export async function renderJoinDock(el: HTMLElement, opts: { code: string; joinUrl: string; featured?: boolean }) {
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
    img.src = await QRCode.toDataURL(opts.joinUrl, { margin: 1, width: 76 });
  }
}

export function shortJoinUrl(code: string): string {
  return `${window.location.origin}/j/${encodeURIComponent(code)}`;
}
