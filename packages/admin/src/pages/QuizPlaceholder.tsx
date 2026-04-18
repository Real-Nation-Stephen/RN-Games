import { Link } from "react-router-dom";

/** Shell route for the future Quiz editor — structure mirrors where the full builder will live. */
export default function QuizPlaceholder() {
  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <Link to="/">← Back to studio</Link>
      </p>
      <div className="card" style={{ maxWidth: 560 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.15rem" }}>Quiz</h2>
        <p className="muted" style={{ margin: "0 0 16px", fontSize: "0.9rem", lineHeight: 1.5 }}>
          The quiz builder will live here: question sets, scoring, branding, and publish links — similar to spinning wheels,
          scoped to quiz campaigns.
        </p>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          This page is a placeholder so navigation and home layout stay correct as we add game types.
        </p>
      </div>
    </div>
  );
}
