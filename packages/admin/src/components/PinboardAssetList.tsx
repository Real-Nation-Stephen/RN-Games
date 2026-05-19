import { uploadFile } from "../api";

export type PinboardAssetItem = { id: string; label: string; imageUrl: string };

async function pickManyImages(onUrls: (urls: string[]) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.onchange = async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    files.sort((a, b) => a.name.localeCompare(b.name));
    const urls: string[] = [];
    for (const f of files) {
      const { url } = await uploadFile(f);
      urls.push(url);
    }
    onUrls(urls);
  };
  input.click();
}

function labelFromFilename(url: string, index: number) {
  try {
    const name = new URL(url, window.location.origin).pathname.split("/").pop() || "";
    const base = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
    if (base) return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    /* ignore */
  }
  return `Asset ${index + 1}`;
}

type Props = {
  title: string;
  hint?: string;
  items: PinboardAssetItem[];
  onChange: (items: PinboardAssetItem[]) => void;
  allowEmptyImage?: boolean;
};

export function PinboardAssetList({ title, hint, items, onChange, allowEmptyImage }: Props) {
  const addFromUploads = (urls: string[]) => {
    const next = [...items];
    for (const url of urls) {
      next.push({
        id: crypto.randomUUID(),
        label: labelFromFilename(url, next.length),
        imageUrl: url,
      });
    }
    onChange(next);
  };

  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: "0 0 6px", fontSize: "1rem" }}>{title}</h4>
      {hint ? (
        <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.85rem" }}>
          {hint}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => void pickManyImages(addFromUploads)}>
          Upload images
        </button>
        {allowEmptyImage ? (
          <button
            type="button"
            className="btn"
            onClick={() =>
              onChange([
                ...items,
                { id: crypto.randomUUID(), label: "No frame", imageUrl: "" },
              ])
            }
          >
            Add “no frame” slot
          </button>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item, i) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: 10,
              border: "1px solid var(--rn-border)",
              borderRadius: 8,
            }}
          >
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" width={52} height={52} style={{ objectFit: "contain", borderRadius: 6 }} />
            ) : (
              <span
                style={{
                  width: 52,
                  height: 52,
                  display: "grid",
                  placeItems: "center",
                  fontSize: "0.7rem",
                  opacity: 0.6,
                  border: "1px dashed var(--rn-border)",
                  borderRadius: 6,
                }}
              >
                Empty
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <label className="field">Label</label>
              <input
                value={item.label}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...item, label: e.target.value };
                  onChange(next);
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-danger"
              style={{ alignSelf: "flex-end" }}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        {!items.length ? <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>No assets yet.</p> : null}
      </div>
    </div>
  );
}
