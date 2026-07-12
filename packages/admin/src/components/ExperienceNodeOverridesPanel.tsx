import type { ExperienceNodeOverrides } from "@rngames/shared";

type Props = {
  overrides: ExperienceNodeOverrides | undefined;
  onChange: (overrides: ExperienceNodeOverrides | undefined) => void;
};

export function ExperienceNodeOverridesPanel({ overrides, onChange }: Props) {
  const o = overrides || {};

  function patch(partial: Partial<ExperienceNodeOverrides>) {
    const next = { ...o, ...partial };
    const empty =
      !next.completionBehaviour &&
      !next.endScreen &&
      !next.leaderboard;
    onChange(empty ? undefined : next);
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h4 style={{ marginTop: 0 }}>Experience overrides (this step)</h4>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Adjust completion behaviour and end-screen copy without changing the component layout.
        Use <strong>Module item complete</strong> on the final step when embedded in a course to show the &quot;Mark complete &amp; continue&quot; bar.
      </p>
      <div className="grid2">
        <label className="field">
          Completion behaviour
          <select
            value={o.completionBehaviour || ""}
            onChange={(e) =>
              patch({
                completionBehaviour: (e.target.value || undefined) as ExperienceNodeOverrides["completionBehaviour"],
              })
            }
          >
            <option value="">Component default</option>
            <option value="auto_continue">Auto-continue</option>
            <option value="show_continue">Show continue</option>
            <option value="replay">Replay</option>
            <option value="custom">Custom</option>
            <option value="module_item_complete">Module item complete</option>
          </select>
        </label>
        <label className="field">
          End screen headline
          <input
            value={o.endScreen?.headline || ""}
            onChange={(e) =>
              patch({
                endScreen: { ...o.endScreen, headline: e.target.value || undefined },
              })
            }
          />
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          End screen body
          <textarea
            rows={2}
            value={o.endScreen?.body || ""}
            onChange={(e) =>
              patch({
                endScreen: { ...o.endScreen, body: e.target.value || undefined },
              })
            }
          />
        </label>
        <label className="field">
          Primary CTA label
          <input
            value={o.endScreen?.primaryCtaLabel || ""}
            onChange={(e) =>
              patch({
                endScreen: { ...o.endScreen, primaryCtaLabel: e.target.value || undefined },
              })
            }
          />
        </label>
        <label className="field">
          Secondary CTA label
          <input
            value={o.endScreen?.secondaryCtaLabel || ""}
            onChange={(e) =>
              patch({
                endScreen: { ...o.endScreen, secondaryCtaLabel: e.target.value || undefined },
              })
            }
          />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", gridColumn: "1 / -1" }}>
          <input
            type="checkbox"
            checked={!!o.endScreen?.hidePlayAgain}
            onChange={(e) =>
              patch({
                endScreen: { ...o.endScreen, hidePlayAgain: e.target.checked || undefined },
              })
            }
          />
          Hide play again
        </label>
        <label className="field">
          Leaderboard mode
          <select
            value={o.leaderboard?.mode || ""}
            onChange={(e) =>
              patch({
                leaderboard: {
                  ...o.leaderboard,
                  mode: (e.target.value || undefined) as NonNullable<
                    ExperienceNodeOverrides["leaderboard"]
                  >["mode"],
                },
              })
            }
          >
            <option value="">Component default</option>
            <option value="player_rank">Player rank</option>
            <option value="top10">Top 10</option>
            <option value="projector">Projector</option>
          </select>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={!!o.leaderboard?.autoContinue}
            onChange={(e) =>
              patch({
                leaderboard: { ...o.leaderboard, autoContinue: e.target.checked || undefined },
              })
            }
          />
          Leaderboard auto-continue
        </label>
      </div>
    </div>
  );
}
