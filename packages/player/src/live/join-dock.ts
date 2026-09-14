import QRCode from "qrcode";

export async function renderJoinDock(el: HTMLElement, opts: { code: string; joinUrl: string; featured?: boolean }) {
  el.className = opts.featured ? "live-dock featured" : "live-dock";
  el.innerHTML = `
    <img alt="Join QR" />
    <div>
      <div>Join</div>
      <div><strong>${opts.code}</strong></div>
      <div style="max-width:220px;word-break:break-all;opacity:0.85">${opts.joinUrl.replace(/^https?:\/\//, "")}</div>
    </div>
  `;
  const img = el.querySelector("img");
  if (img) {
    img.src = await QRCode.toDataURL(opts.joinUrl, { margin: 1, width: opts.featured ? 220 : 96 });
  }
}

export function shortJoinUrl(code: string): string {
  return `${window.location.origin}/j/${encodeURIComponent(code)}`;
}
