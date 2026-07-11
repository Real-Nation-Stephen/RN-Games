import { useState } from "react";
import type {
  LandingBlock,
  LandingBlockType,
  LandingRecord,
  LandingScreen,
} from "@rngames/shared";
import {
  LANDING_BLOCK_LABELS,
  createDefaultLandingBlock,
  getLandingScreens,
  newLandingBlockId,
  newLandingScreenId,
} from "@rngames/shared";
import { uploadFile } from "../api";
import { CollapsibleSection } from "./CollapsibleSection";
import { HexField } from "./HexField";

type Props = {
  doc: LandingRecord;
  onScreensChange: (screens: LandingScreen[]) => void;
  onPageSettings: (patch: Partial<LandingRecord["pageSettings"]>) => void;
};

const ALIGN_OPTIONS = (
  <>
    <option value="inherit">Match page</option>
    <option value="left">Left</option>
    <option value="center">Centre</option>
    <option value="right">Right</option>
  </>
);

function blockSummary(block: LandingBlock): string {
  switch (block.type) {
    case "text":
      return block.content.slice(0, 40) || "Empty text";
    case "image":
      return block.url ? "Image set" : "No image";
    case "image_text":
      return block.headline || "Image + text";
    case "gallery":
      return `${block.images.length} image(s)`;
    case "video":
      return block.url ? "Video linked" : "No video URL";
    case "spacer":
      return `${block.heightPx}px`;
    case "divider":
      return "Divider line";
    case "button":
      return block.label;
    case "embed":
      return block.url ? "Embed set" : "No embed URL";
  }
}

function ImageUpload({
  label,
  value,
  onUploaded,
}: {
  label: string;
  value: string;
  onUploaded: (url: string) => void;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <label className="field">{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {value ? (
          <img src={value} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6 }} />
        ) : null}
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { url } = await uploadFile(f);
            onUploaded(url);
          }}
        />
        {value ? <span className="muted">✓</span> : null}
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  screens,
  activeScreenId,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  block: LandingBlock;
  screens: LandingScreen[];
  activeScreenId: string;
  onChange: (b: LandingBlock) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const title = LANDING_BLOCK_LABELS[block.type];

  const controls = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
      <button type="button" className="btn" disabled={!canMoveUp} onClick={onMoveUp}>
        ↑
      </button>
      <button type="button" className="btn" disabled={!canMoveDown} onClick={onMoveDown}>
        ↓
      </button>
      <button type="button" className="btn" onClick={onRemove}>
        Remove
      </button>
    </div>
  );

  const body = (() => {
    switch (block.type) {
      case "text":
        return (
          <>
            <label className="field">
              Style
              <select
                value={block.variant}
                onChange={(e) => onChange({ ...block, variant: e.target.value as typeof block.variant })}
              >
                <option value="headline">Headline</option>
                <option value="subheadline">Subheadline</option>
                <option value="body">Body</option>
                <option value="caption">Caption</option>
              </select>
            </label>
            <label className="field">
              Alignment
              <select value={block.align} onChange={(e) => onChange({ ...block, align: e.target.value as typeof block.align })}>
                {ALIGN_OPTIONS}
              </select>
            </label>
            <HexField label="Text colour (optional)" value={block.colorHex || ""} onChange={(v) => onChange({ ...block, colorHex: v })} />
            <label className="field">
              Font size (px, optional)
              <input
                type="number"
                min={10}
                max={120}
                value={block.fontSizePx ?? ""}
                placeholder="Default"
                onChange={(e) =>
                  onChange({
                    ...block,
                    fontSizePx: e.target.value ? Number(e.target.value) || undefined : undefined,
                  })
                }
              />
            </label>
            <label className="field">
              Content
              <textarea rows={4} value={block.content} onChange={(e) => onChange({ ...block, content: e.target.value })} />
            </label>
          </>
        );
      case "image":
        return (
          <>
            <ImageUpload label="Image" value={block.url} onUploaded={(url) => onChange({ ...block, url })} />
            <label className="field">
              Alt text
              <input value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} />
            </label>
            <label className="field">
              Alignment
              <select value={block.align} onChange={(e) => onChange({ ...block, align: e.target.value as typeof block.align })}>
                {ALIGN_OPTIONS}
              </select>
            </label>
            <label className="field">
              Fit
              <select value={block.fit} onChange={(e) => onChange({ ...block, fit: e.target.value as typeof block.fit })}>
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
                <option value="fill">Fill</option>
                <option value="inset">Inset (padded)</option>
              </select>
            </label>
            <label className="field">
              Max height (px)
              <input
                type="number"
                min={40}
                value={block.maxHeightPx}
                onChange={(e) => onChange({ ...block, maxHeightPx: Number(e.target.value) || 320 })}
              />
            </label>
            <label className="field">
              Corner radius (px)
              <input
                type="number"
                min={0}
                value={block.borderRadiusPx}
                onChange={(e) => onChange({ ...block, borderRadiusPx: Number(e.target.value) || 0 })}
              />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <input type="checkbox" checked={block.fullWidth} onChange={(e) => onChange({ ...block, fullWidth: e.target.checked })} />
              Full width
            </label>
          </>
        );
      case "image_text":
        return (
          <>
            <label className="field">
              Layout
              <select value={block.layout} onChange={(e) => onChange({ ...block, layout: e.target.value as typeof block.layout })}>
                <option value="image_left">Image left</option>
                <option value="image_right">Image right</option>
              </select>
            </label>
            <ImageUpload label="Image" value={block.imageUrl} onUploaded={(url) => onChange({ ...block, imageUrl: url })} />
            <label className="field">
              Headline
              <input value={block.headline} onChange={(e) => onChange({ ...block, headline: e.target.value })} />
            </label>
            <label className="field">
              Body
              <textarea rows={3} value={block.body} onChange={(e) => onChange({ ...block, body: e.target.value })} />
            </label>
          </>
        );
      case "gallery":
        return (
          <>
            <label className="field">
              Columns
              <select
                value={block.columns}
                onChange={(e) => onChange({ ...block, columns: Number(e.target.value) as 2 | 3 | 4 })}
              >
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>
            <label className="field">
              Image fit
              <select
                value={block.imageFit || "cover"}
                onChange={(e) => onChange({ ...block, imageFit: e.target.value as typeof block.imageFit })}
              >
                <option value="cover">Cover (crop to square)</option>
                <option value="contain">Contain (fit inside)</option>
                <option value="fill">Fill (stretch)</option>
              </select>
            </label>
            {block.images.map((img, i) => (
              <div key={img.id} style={{ border: "1px solid var(--rn-border)", borderRadius: 8, padding: 10, marginTop: 10 }}>
                <ImageUpload label={`Image ${i + 1}`} value={img.url} onUploaded={(url) => {
                  const images = [...block.images];
                  images[i] = { ...images[i], url };
                  onChange({ ...block, images });
                }} />
                <label className="field">
                  Caption
                  <input
                    value={img.caption || ""}
                    onChange={(e) => {
                      const images = [...block.images];
                      images[i] = { ...images[i], caption: e.target.value };
                      onChange({ ...block, images });
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn"
                  onClick={() => onChange({ ...block, images: block.images.filter((_, j) => j !== i) })}
                >
                  Remove image
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn"
              style={{ marginTop: 10 }}
              onClick={() =>
                onChange({
                  ...block,
                  images: [...block.images, { id: newLandingBlockId(), url: "", alt: "", caption: "" }],
                })
              }
            >
              Add image
            </button>
          </>
        );
      case "video":
        return (
          <>
            <label className="field">
              Video URL (YouTube, Vimeo, or MP4)
              <input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} />
            </label>
            <label className="field">
              Aspect ratio
              <select
                value={block.aspectRatio}
                onChange={(e) => onChange({ ...block, aspectRatio: e.target.value as typeof block.aspectRatio })}
              >
                <option value="16:9">16:9</option>
                <option value="4:3">4:3</option>
                <option value="1:1">1:1</option>
              </select>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={block.autoplay} onChange={(e) => onChange({ ...block, autoplay: e.target.checked })} />
              Autoplay
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={block.muted} onChange={(e) => onChange({ ...block, muted: e.target.checked })} />
              Muted
            </label>
          </>
        );
      case "spacer":
        return (
          <label className="field">
            Height (px)
            <input
              type="number"
              min={4}
              value={block.heightPx}
              onChange={(e) => onChange({ ...block, heightPx: Number(e.target.value) || 32 })}
            />
          </label>
        );
      case "divider":
        return (
          <>
            <HexField label="Line colour" value={block.colorHex} onChange={(v) => onChange({ ...block, colorHex: v })} />
            <label className="field">
              Width (%)
              <input
                type="number"
                min={10}
                max={100}
                value={block.widthPercent}
                onChange={(e) => onChange({ ...block, widthPercent: Number(e.target.value) || 60 })}
              />
            </label>
          </>
        );
      case "button":
        return (
          <>
            <label className="field">
              Label
              <input value={block.label} onChange={(e) => onChange({ ...block, label: e.target.value })} />
            </label>
            <label className="field">
              Alignment
              <select value={block.align} onChange={(e) => onChange({ ...block, align: e.target.value as typeof block.align })}>
                {ALIGN_OPTIONS}
              </select>
            </label>
            <label className="field">
              Button action
              <select
                value={block.action || (block.isPrimary ? "primary" : block.url ? "link" : "primary")}
                onChange={(e) => {
                  const action = e.target.value as typeof block.action;
                  onChange({
                    ...block,
                    action,
                    isPrimary: action === "primary",
                  });
                }}
              >
                <option value="primary">Continue / complete step (flow)</option>
                <option value="screen">Go to another page</option>
                <option value="link">Open link (standalone)</option>
              </select>
            </label>
            {(block.action === "screen" || (!block.action && block.targetScreenId)) && screens.length > 1 ? (
              <label className="field">
                Target page
                <select
                  value={block.targetScreenId || ""}
                  onChange={(e) => onChange({ ...block, action: "screen", targetScreenId: e.target.value })}
                >
                  <option value="">Select page…</option>
                  {screens
                    .filter((s) => s.id !== activeScreenId)
                    .map((s, i) => (
                      <option key={s.id} value={s.id}>
                        {s.title || `Page ${i + 1}`}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            {(block.action === "link" || (!block.action && block.url && !block.isPrimary)) && (
              <label className="field">
                Link URL (standalone only)
                <input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} />
              </label>
            )}
            <HexField label="Background" value={block.backgroundHex} onChange={(v) => onChange({ ...block, backgroundHex: v })} />
            <HexField label="Text colour" value={block.textHex} onChange={(v) => onChange({ ...block, textHex: v })} />
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={block.fullWidth} onChange={(e) => onChange({ ...block, fullWidth: e.target.checked })} />
              Full width
            </label>
          </>
        );
      case "embed":
        return (
          <>
            <label className="field">
              Embed URL
              <input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="https://…" />
            </label>
            <label className="field">
              Height (px)
              <input
                type="number"
                min={120}
                value={block.heightPx}
                onChange={(e) => onChange({ ...block, heightPx: Number(e.target.value) || 400 })}
              />
            </label>
            <label className="field">
              Title (accessibility)
              <input value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} />
            </label>
          </>
        );
    }
  })();

  return (
    <CollapsibleSection title={title} summary={blockSummary(block)} defaultOpen={false}>
      {controls}
      {body}
    </CollapsibleSection>
  );
}

export function LandingBlocksEditor({ doc, onScreensChange, onPageSettings }: Props) {
  const screens = getLandingScreens(doc);
  const [activeScreenId, setActiveScreenId] = useState(screens[0]?.id || "");
  const activeScreen = screens.find((s) => s.id === activeScreenId) || screens[0];
  const blocks = activeScreen?.blocks || [];

  function updateScreens(next: LandingScreen[]) {
    onScreensChange(next);
    if (!next.some((s) => s.id === activeScreenId)) {
      setActiveScreenId(next[0]?.id || "");
    }
  }

  function patchActiveScreen(patch: Partial<LandingScreen>) {
    if (!activeScreen) return;
    updateScreens(screens.map((s) => (s.id === activeScreen.id ? { ...s, ...patch } : s)));
  }

  function updateBlock(index: number, next: LandingBlock) {
    const copy = [...blocks];
    copy[index] = next;
    patchActiveScreen({ blocks: copy });
  }

  function moveBlock(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= blocks.length) return;
    const copy = [...blocks];
    [copy[index], copy[j]] = [copy[j], copy[index]];
    patchActiveScreen({ blocks: copy });
  }

  function addScreen() {
    const n = screens.length + 1;
    const screen: LandingScreen = {
      id: newLandingScreenId(),
      title: `Page ${n}`,
      blocks: [createDefaultLandingBlock("text")],
    };
    updateScreens([...screens, screen]);
    setActiveScreenId(screen.id);
  }

  function removeScreen(screenId: string) {
    if (screens.length <= 1) return;
    const next = screens.filter((s) => s.id !== screenId);
    updateScreens(next);
    if (activeScreenId === screenId) setActiveScreenId(next[0]?.id || "");
  }

  function duplicateScreen(screenId: string) {
    const source = screens.find((s) => s.id === screenId);
    if (!source) return;
    const copy: LandingScreen = {
      id: newLandingScreenId(),
      title: `${source.title || "Page"} copy`,
      flowCompleteOverride: source.flowCompleteOverride,
      blocks: source.blocks.map((b) => ({ ...b, id: newLandingBlockId() })),
    };
    const idx = screens.findIndex((s) => s.id === screenId);
    const next = [...screens];
    next.splice(idx + 1, 0, copy);
    updateScreens(next);
    setActiveScreenId(copy.id);
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
        {screens.map((screen, i) => (
          <button
            key={screen.id}
            type="button"
            className="btn"
            style={{
              fontWeight: activeScreen?.id === screen.id ? 700 : 400,
              borderColor: activeScreen?.id === screen.id ? "var(--accent, #6cf)" : undefined,
            }}
            onClick={() => setActiveScreenId(screen.id)}
          >
            {screen.title || `Page ${i + 1}`}
            {screen.flowCompleteOverride ? " ★" : ""} ({screen.blocks.length})
          </button>
        ))}
        <button type="button" className="btn btn-primary" onClick={addScreen}>
          Add page
        </button>
      </div>

      {activeScreen ? (
        <div className="grid2" style={{ marginBottom: 16 }}>
          <label className="field">
            Page title
            <input
              value={activeScreen.title}
              onChange={(e) => patchActiveScreen({ title: e.target.value })}
            />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={() => duplicateScreen(activeScreen.id)}>
              Duplicate page
            </button>
            {screens.length > 1 ? (
              <button type="button" className="btn" onClick={() => removeScreen(activeScreen.id)}>
                Remove this page
              </button>
            ) : null}
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", gridColumn: "1 / -1" }}>
            <input
              type="checkbox"
              checked={!!activeScreen.flowCompleteOverride}
              onChange={(e) => patchActiveScreen({ flowCompleteOverride: e.target.checked })}
            />
            Flow complete override — placeholder page for experience end-screen copy (hidden when opened standalone)
          </label>
        </div>
      ) : null}

      <div className="grid2" style={{ marginBottom: 16 }}>
        <label className="field">
          Page max width (px)
          <input
            type="number"
            min={320}
            value={doc.pageSettings.maxWidthPx}
            onChange={(e) => onPageSettings({ maxWidthPx: Number(e.target.value) || 720 })}
          />
        </label>
        <label className="field">
          Page padding (px)
          <input
            type="number"
            min={0}
            value={doc.pageSettings.paddingPx}
            onChange={(e) => onPageSettings({ paddingPx: Number(e.target.value) || 24 })}
          />
        </label>
        <label className="field">
          Content alignment
          <select
            value={doc.pageSettings.contentAlign}
            onChange={(e) => onPageSettings({ contentAlign: e.target.value as LandingRecord["pageSettings"]["contentAlign"] })}
          >
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label className="field">
          Vertical position
          <select
            value={doc.pageSettings.verticalAlign}
            onChange={(e) => onPageSettings({ verticalAlign: e.target.value as "top" | "center" })}
          >
            <option value="center">Centred</option>
            <option value="top">Top</option>
          </select>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", gridColumn: "1 / -1" }}>
          <input
            type="checkbox"
            checked={doc.pageSettings.logoMatchPageAlign !== false}
            onChange={(e) => onPageSettings({ logoMatchPageAlign: e.target.checked })}
          />
          Logo follows page alignment (recommended for left-aligned layouts)
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          <input
            type="range"
            min={0}
            max={100}
            value={doc.pageSettings.contentOffsetYPercent ?? 50}
            onChange={(e) => onPageSettings({ contentOffsetYPercent: Number(e.target.value) })}
          />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", gridColumn: "1 / -1" }}>
          <input
            type="checkbox"
            checked={doc.pageSettings.entranceAnimation !== false}
            onChange={(e) => onPageSettings({ entranceAnimation: e.target.checked })}
          />
          Entrance animation
        </label>
      </div>

      {blocks.map((block, i) => (
        <BlockEditor
          key={block.id}
          block={block}
          screens={screens}
          activeScreenId={activeScreen?.id || ""}
          onChange={(b) => updateBlock(i, b)}
          onRemove={() => patchActiveScreen({ blocks: blocks.filter((_, j) => j !== i) })}
          onMoveUp={() => moveBlock(i, -1)}
          onMoveDown={() => moveBlock(i, 1)}
          canMoveUp={i > 0}
          canMoveDown={i < blocks.length - 1}
        />
      ))}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <select
          id="add-block-type"
          defaultValue=""
          onChange={(e) => {
            const t = e.target.value as LandingBlockType;
            if (!t) return;
            patchActiveScreen({ blocks: [...blocks, createDefaultLandingBlock(t)] });
            e.target.value = "";
          }}
        >
          <option value="">Add block…</option>
          {(Object.keys(LANDING_BLOCK_LABELS) as LandingBlockType[]).map((t) => (
            <option key={t} value={t}>
              {LANDING_BLOCK_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
