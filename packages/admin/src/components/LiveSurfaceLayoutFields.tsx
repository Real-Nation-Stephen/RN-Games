import {
  componentLayoutMode,
  defaultLiveSurfaceLayouts,
  normalizeLiveSurfaceLayouts,
  type LiveAlignX,
  type LiveAlignY,
  type LiveLayoutMode,
  type LivePaneLayout,
  type LiveSurfaceLayouts,
} from "@rngames/shared";
import { CollapsibleSection } from "./CollapsibleSection";

type Props = {
  layout?: LiveSurfaceLayouts;
  layoutMode?: LiveLayoutMode;
  onChange: (next: { layoutMode: LiveLayoutMode; layout: LiveSurfaceLayouts }) => void;
  /** When set, inherit copies these values into custom so editors start from the live flow. */
  flowLayout?: LiveSurfaceLayouts;
  showInherit?: boolean;
};

function PaneFields({
  title,
  pane,
  onChange,
}: {
  title: string;
  pane: LivePaneLayout;
  onChange: (next: LivePaneLayout) => void;
}) {
  return (
    <CollapsibleSection title={title} summary={`${pane.alignX} / ${pane.alignY} · max ${pane.contentMaxWidthPx}px`}>
      <div className="grid2">
        <label className="field">
          Horizontal align
          <select value={pane.alignX} onChange={(e) => onChange({ ...pane, alignX: e.target.value as LiveAlignX })}>
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label className="field">
          Vertical align
          <select value={pane.alignY} onChange={(e) => onChange({ ...pane, alignY: e.target.value as LiveAlignY })}>
            <option value="top">Top</option>
            <option value="middle">Middle</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>
        <label className="field">
          Padding (px)
          <input
            type="number"
            min={0}
            max={160}
            value={pane.paddingPx}
            onChange={(e) => onChange({ ...pane, paddingPx: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Content max width (px)
          <input
            type="number"
            min={240}
            max={1920}
            value={pane.contentMaxWidthPx}
            onChange={(e) => onChange({ ...pane, contentMaxWidthPx: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Spacing (px)
          <input
            type="number"
            min={0}
            max={80}
            value={pane.gapPx}
            onChange={(e) => onChange({ ...pane, gapPx: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Heading size (px, 0 = auto)
          <input
            type="number"
            min={0}
            max={120}
            value={pane.headingSizePx}
            onChange={(e) => onChange({ ...pane, headingSizePx: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Body size (px, 0 = auto)
          <input
            type="number"
            min={0}
            max={64}
            value={pane.bodySizePx}
            onChange={(e) => onChange({ ...pane, bodySizePx: Number(e.target.value) })}
          />
        </label>
      </div>
    </CollapsibleSection>
  );
}

export function LiveSurfaceLayoutFields({ layout, layoutMode, onChange, flowLayout, showInherit = false }: Props) {
  const inherited = normalizeLiveSurfaceLayouts(flowLayout);
  const mode = showInherit ? componentLayoutMode({ layoutMode, layout }) : "custom";
  const current = normalizeLiveSurfaceLayouts(layout || (showInherit ? inherited : defaultLiveSurfaceLayouts()));

  return (
    <CollapsibleSection
      title="Presenter & phone layout"
      summary={mode === "inherit" ? "Inherit flow" : "Custom"}
      defaultOpen={mode === "custom"}
    >
      {showInherit ? (
        <label className="field">
          Layout source
          <select
            value={mode}
            onChange={(e) => {
              const next = e.target.value as LiveLayoutMode;
              onChange({
                layoutMode: next,
                layout: next === "custom" ? normalizeLiveSurfaceLayouts(layout || inherited) : current,
              });
            }}
          >
            <option value="inherit">Inherit flow layout</option>
            <option value="custom">Custom (overrides flow on live Presenter and phones)</option>
          </select>
        </label>
      ) : (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Applies to live Presenter, phones, Studio preview, and standalone. Components can override this per game.
        </p>
      )}
      {mode === "custom" || !showInherit ? (
        <>
          <PaneFields
            title="Presenter"
            pane={current.presenter}
            onChange={(presenter) => onChange({ layoutMode: showInherit ? "custom" : "custom", layout: { ...current, presenter } })}
          />
          <PaneFields
            title="Phone"
            pane={current.phone}
            onChange={(phone) => onChange({ layoutMode: "custom", layout: { ...current, phone } })}
          />
        </>
      ) : (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Using the Flow join-screen layout, then responsive centred defaults.
        </p>
      )}
    </CollapsibleSection>
  );
}
