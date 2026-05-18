/** Normalise to #rrggbb for <input type="color">; empty stays empty. */
export function normalizeHexInput(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const h = s.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  return s;
}

function hexForColorInput(hex: string, fallback: string): string {
  const n = normalizeHexInput(hex);
  return /^#[0-9a-f]{6}$/.test(n) ? n : fallback;
}

type HexFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function HexField({ label, value, onChange, placeholder = "#ffffff" }: HexFieldProps) {
  const picker = hexForColorInput(value, "#ffffff");

  return (
    <label className="field">
      {label}
      <div className="hex-field-row" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="color"
          value={picker}
          onChange={(e) => onChange(normalizeHexInput(e.target.value))}
          aria-label={`${label} colour picker`}
          style={{ width: 44, height: 36, padding: 2, cursor: "pointer", flexShrink: 0 }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onChange(normalizeHexInput(value))}
          placeholder={placeholder}
          spellCheck={false}
          style={{ flex: 1 }}
        />
      </div>
    </label>
  );
}
