import { uploadFile } from "../api";

type Props = {
  label: string;
  hint: string;
  value: string;
  onUploaded: (url: string) => void;
};

export function BgUploadRow({ label, hint, value, onUploaded }: Props) {
  return (
    <div style={{ marginTop: 12 }}>
      <label className="field">{label}</label>
      <p className="muted" style={{ fontSize: "0.82rem", margin: "4px 0 8px" }}>
        {hint}
      </p>
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
      {value ? <span className="muted"> ✓</span> : null}
    </div>
  );
}
