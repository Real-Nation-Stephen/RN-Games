/**
 * Studio Identity headers. netlify-identity-widget sessions expire in ~1h;
 * GoTrue `user.jwt()` refreshes when the session is near expiry. Never send the
 * widget's cached token string without that refresh.
 */

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
      return { headers, source: "jwt-failed" };
    }
  }
  if (typeof widgetRefresh === "function") {
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
  if (typeof widgetRefresh === "function") {
    return widgetRefresh();
  }
  return "";
}
