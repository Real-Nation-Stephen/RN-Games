export const POPUP_BLOCKED_MESSAGE =
  "Pop-up blocked. Allow pop-ups for this site, then try again, or use the Flow Master link shown below.";

/** Must run synchronously in the click handler, before any await. */
export function openBlankWindow(): Window | null {
  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

export function assignWindowLocation(win: Window | null, url: string): boolean {
  if (!win || win.closed) return false;
  try {
    win.location.replace(url);
    try {
      win.opener = null;
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    try {
      win.close();
    } catch {
      /* ignore */
    }
    return false;
  }
}
