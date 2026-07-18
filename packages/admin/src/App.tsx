import { useEffect, useState } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import netlifyIdentity from "netlify-identity-widget";
import Home from "./pages/Home";
import QuizEditor from "./pages/QuizEditor";
import ScratcherEditor from "./pages/ScratcherEditor";
import FlipCardEditor from "./pages/FlipCardEditor";
import PinboardEditor from "./pages/PinboardEditor";
import LeaderboardEditor from "./pages/LeaderboardEditor";
import CatchEditor from "./pages/CatchEditor";
import MatchingEditor from "./pages/MatchingEditor";
import RunnerEditor from "./pages/RunnerEditor";
import WheelEditor from "./pages/WheelEditor";
import ExperienceEditor from "./pages/ExperienceEditor";
import ExperiencesListPage from "./pages/ExperiencesListPage";
import CourseEditor from "./pages/CourseEditor";
import CoursesListPage from "./pages/CoursesListPage";
import LibraryPage from "./pages/LibraryPage";
import PageModuleEditor from "./pages/PageModuleEditor";
import AnalyticsPage from "./pages/AnalyticsPage";
import BadgeEditor from "./pages/BadgeEditor";
import MiniQuizEditor from "./pages/MiniQuizEditor";

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
            <h1>RN Game Studio</h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Create and manage your games
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
          <p>Sign in to manage your games.</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => netlifyIdentity.open()}>
            Log in
          </button>
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/experiences" element={<ExperiencesListPage />} />
          <Route path="/experiences/:id" element={<ExperienceEditor />} />
          <Route path="/courses" element={<CoursesListPage />} />
          <Route path="/courses/:id" element={<CourseEditor />} />
          <Route path="/library/:gameType" element={<LibraryPage />} />
          <Route path="/quizzes/:id" element={<QuizEditor />} />
          <Route path="/wheels/:id" element={<WheelEditor />} />
          <Route path="/scratchers/:id" element={<ScratcherEditor />} />
          <Route path="/flip-cards/:id" element={<FlipCardEditor />} />
          <Route path="/pinboards/:id" element={<PinboardEditor />} />
          <Route path="/leaderboards/:id" element={<LeaderboardEditor />} />
          <Route path="/catch/:id" element={<CatchEditor />} />
          <Route path="/matching/:id" element={<MatchingEditor />} />
          <Route path="/runner/:id" element={<RunnerEditor />} />
          <Route path="/landing/:id" element={<PageModuleEditor gameType="landing" />} />
          <Route path="/forms/:id" element={<PageModuleEditor gameType="form" />} />
          <Route path="/certificates/:id" element={<PageModuleEditor gameType="certificate" />} />
          <Route path="/badges/:id" element={<BadgeEditor />} />
          <Route path="/consent/:id" element={<PageModuleEditor gameType="consent" />} />
          <Route path="/email-signups/:id" element={<PageModuleEditor gameType="email-signup" />} />
          <Route path="/redemptions/:id" element={<PageModuleEditor gameType="redemption" />} />
          <Route path="/mini-quizzes/:id" element={<MiniQuizEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </div>
  );
}
