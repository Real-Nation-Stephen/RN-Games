import { useState } from "react";

type Props = {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function CollapsibleSection({ title, summary, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1px solid var(--rn-border)", borderRadius: 8, marginBottom: 12 }}>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          border: "none",
          borderRadius: open ? "8px 8px 0 0" : 8,
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {open ? "▼" : "▶"} {title}
        </span>
        {!open && summary ? (
          <span className="muted" style={{ fontSize: "0.82rem", fontWeight: 400 }}>
            {summary}
          </span>
        ) : null}
      </button>
      {open ? <div style={{ padding: "0 12px 12px" }}>{children}</div> : null}
    </div>
  );
}
