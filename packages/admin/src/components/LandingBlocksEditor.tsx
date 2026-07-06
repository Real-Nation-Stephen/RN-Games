import type {
  LandingBlock,
  LandingBlockType,
  LandingRecord,
} from "@rngames/shared";
import {
  LANDING_BLOCK_LABELS,
  createDefaultLandingBlock,
  newLandingBlockId,
} from "@rngames/shared";
import { uploadFile } from "../api";
import { CollapsibleSection } from "./CollapsibleSection";
import { HexField } from "./HexField";

type Props = {
  doc: LandingRecord;
  onChange: (blocks: LandingBlock[]) => void;
  onPageSettings: (patch: Partial<LandingRecord["pageSettings"]>) => void;
};

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
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  block: LandingBlock;
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
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            </label>
            <HexField label="Text colour (optional)" value={block.colorHex || ""} onChange={(v) => onChange({ ...block, colorHex: v })} />
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
              Link URL (standalone only)
              <input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} />
            </label>
            <HexField label="Background" value={block.backgroundHex} onChange={(v) => onChange({ ...block, backgroundHex: v })} />
            <HexField label="Text colour" value={block.textHex} onChange={(v) => onChange({ ...block, textHex: v })} />
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <input type="checkbox" checked={block.isPrimary} onChange={(e) => onChange({ ...block, isPrimary: e.target.checked })} />
              Primary action (continues experience / completes step)
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={block.fullWidth} onChange={(e) => onChange({ ...block, fullWidth: e.target.checked })} />
              Full width
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

export function LandingBlocksEditor({ doc, onChange, onPageSettings }: Props) {
  const blocks = doc.blocks;

  function updateBlock(index: number, next: LandingBlock) {
    const copy = [...blocks];
    copy[index] = next;
    onChange(copy);
  }

  function moveBlock(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= blocks.length) return;
    const copy = [...blocks];
    [copy[index], copy[j]] = [copy[j], copy[index]];
    onChange(copy);
  }

  return (
    <div>
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
      </div>

      {blocks.map((block, i) => (
        <BlockEditor
          key={block.id}
          block={block}
          onChange={(b) => updateBlock(i, b)}
          onRemove={() => onChange(blocks.filter((_, j) => j !== i))}
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
            onChange([...blocks, createDefaultLandingBlock(t)]);
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
