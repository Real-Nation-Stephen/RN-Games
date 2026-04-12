import { useEffect, useState } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import netlifyIdentity from "netlify-identity-widget";
import Home from "./pages/Home";
import WheelEditor from "./pages/WheelEditor";

const devAuth = import.meta.env.VITE_DEV_AUTH === "1";

function useUser() {
  const [user, setUser] = useState(
    devAuth ? ({ email: "dev@local.preview" } as unknown as ReturnType<typeof netlifyIdentity.currentUser>) : netlifyIdentity.currentUser(),
  );

  useEffect(() => {
    if (devAuth) return;
    const handler = (u: unknown) => setUser(u as typeof user);
    netlifyIdentity.on("login", handler);
    netlifyIdentity.on("logout", () => setUser(null));
    return () => {
      netlifyIdentity.off("login", handler);
      netlifyIdentity.off("logout", () => setUser(null));
    };
  }, []);

  return user;
}

export default function App() {
  const user = useUser();

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="brand">
          <Link to="/">
            <img src="/admin/rn-logo.png" alt="Real Nation" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
          </Link>
          <div>
            <h1>RNGames — Wheel Studio</h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Create and manage spinning wheels
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {devAuth && (
            <span className="muted" style={{ fontSize: 13 }}>
              Preview mode (no Netlify Identity)
            </span>
          )}
          {user && !devAuth ? (
            <button type="button" className="btn" onClick={() => netlifyIdentity.logout()}>
              Log out
            </button>
          ) : null}
          {!user ? (
            <button type="button" className="btn btn-primary" onClick={() => netlifyIdentity.open()}>
              Log in
            </button>
          ) : null}
        </div>
      </header>

      {!user ? (
        <div className="card">
          <p>Sign in to manage wheels.</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => netlifyIdentity.open()}>
            Log in
          </button>
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/wheels/:id" element={<WheelEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </div>
  );
}
