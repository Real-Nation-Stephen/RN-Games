import type { LiveFontUploads, LiveSurfaceBranding } from "@rngames/shared";
import { BgUploadRow } from "./BgUploadRow";
import { CollapsibleSection } from "./CollapsibleSection";
import { HexField } from "./HexField";

const FONT_ROLES = ["heading", "body", "button"] as const;

type Props = {
  branding: LiveSurfaceBranding;
  onChange: (next: LiveSurfaceBranding) => void;
  onUploadFont: (role: keyof LiveFontUploads, file: File) => void;
};

export function LiveSurfaceBrandingFields({ branding, onChange, onUploadFont }: Props) {
  const patch = (partial: Partial<LiveSurfaceBranding>) => onChange({ ...branding, ...partial });

  return (
    <>
      <HexField label="Background colour" value={branding.backgroundHex} onChange={(v) => patch({ backgroundHex: v })} />
      <HexField label="Headline colour" value={branding.headlineHex} onChange={(v) => patch({ headlineHex: v })} />
      <HexField label="Body colour" value={branding.bodyHex} onChange={(v) => patch({ bodyHex: v })} />
      <HexField label="Accent" value={branding.accentHex} onChange={(v) => patch({ accentHex: v })} />
      <HexField label="Button background" value={branding.buttonHex} onChange={(v) => patch({ buttonHex: v })} />
      <HexField label="Button text" value={branding.buttonTextHex} onChange={(v) => patch({ buttonTextHex: v })} />
      <BgUploadRow
        label="Logo"
        hint="Any brand mark. Not tied to a client."
        value={branding.logoUrl}
        onUploaded={(url) => patch({ logoUrl: url })}
      />
      <CollapsibleSection title="Backgrounds" summary="Phone and Presenter">
        <BgUploadRow
          label="Phone background"
          hint="Used on join phones. Live has two surfaces, not desktop/tablet/mobile breakpoints."
          value={branding.backgroundImageUrl}
          onUploaded={(url) => patch({ backgroundImageUrl: url })}
        />
        <BgUploadRow
          label="Presenter background"
          hint="Used on the audience screen. Falls back to the phone image if empty."
          value={branding.presenterBackgroundImageUrl}
          onUploaded={(url) => patch({ presenterBackgroundImageUrl: url })}
        />
      </CollapsibleSection>
      <CollapsibleSection title="Custom fonts" summary="Heading, body, button">
        {FONT_ROLES.map((role) => (
          <div key={role} style={{ marginTop: 10 }}>
            <label className="field">{role.charAt(0).toUpperCase() + role.slice(1)} font</label>
            <input
              type="file"
              accept=".woff,.woff2,.ttf,.otf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadFont(role, f);
              }}
            />
            {branding.fontUploads?.[role]?.url ? <span className="muted"> ✓</span> : null}
          </div>
        ))}
      </CollapsibleSection>
    </>
  );
}
