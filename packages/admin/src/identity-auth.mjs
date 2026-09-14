/**
 * Studio Identity headers.
 *
 * Installed netlify-identity-widget 1.9.2:
 *   currentUser() → gotrue.currentUser()
 *   refresh(forceRefresh) → currentUser().jwt(forceRefresh)
 * So `user.jwt()` is the documented refresh path, not a missing method.
 *
 * jwt() refreshes when expires_at is within 60s. On rejection GoTrue
 * clearSession()s; the iframe can still show the previous email. Do not send
 * the previous token after that — it is stale. Surface session-expired instead.
 */

export const SESSION_EXPIRED_MESSAGE = "Studio session expired. Sign in again to continue.";

export function identitySessionExpired(source) {
  return source === "jwt-failed" || source === "refresh-failed";
}

export async function identityAuthHeaders({
  devAuth = false,
  devBearer = "",
  currentUser,
  widgetRefresh,
} = {}) {
  const headers = { "Content-Type": "application/json" };
  if (devAuth && devBearer) {
    headers.Authorization = `Bearer ${devBearer}`;
    return { headers, source: "dev" };
  }
  const user = typeof currentUser === "function" ? currentUser() : null;
  if (user && typeof user.jwt === "function") {
    try {
      const token = await user.jwt();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        return { headers, source: "jwt" };
      }
    } catch {
      /* Refresh rejected. Do not attach the previous token; widget.refresh is the same jwt(). */
      return { headers, source: "jwt-failed" };
    }
  }
  if (user && typeof widgetRefresh === "function") {
    try {
      const token = await widgetRefresh();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        return { headers, source: "refresh" };
      }
    } catch {
      return { headers, source: "refresh-failed" };
    }
  }
  return { headers, source: "none" };
}

export async function identityForceRefresh({ currentUser, widgetRefresh } = {}) {
  const user = typeof currentUser === "function" ? currentUser() : null;
  if (user && typeof user.jwt === "function") {
    return user.jwt(true);
  }
  if (user && typeof widgetRefresh === "function") {
    return widgetRefresh(true);
  }
  return "";
}
