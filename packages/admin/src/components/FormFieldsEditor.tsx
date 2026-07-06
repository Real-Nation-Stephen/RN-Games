import type { FormField, FormFieldType } from "@rngames/shared";
import { CollapsibleSection } from "./CollapsibleSection";

type Props = {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
};

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "postcode", label: "Postcode" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "checkbox", label: "Checkbox" },
];

function newFieldId() {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function FormFieldsEditor({ fields, onChange }: Props) {
  function update(index: number, patch: Partial<FormField>) {
    const next = [...fields];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  }

  return (
    <div>
      {fields.map((field, i) => (
        <CollapsibleSection key={field.id} title={field.label || `Field ${i + 1}`} summary={field.type}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button type="button" className="btn" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" className="btn" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button type="button" className="btn" onClick={() => onChange(fields.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
          <div className="grid2">
            <label className="field">
              Label
              <input value={field.label} onChange={(e) => update(i, { label: e.target.value })} />
            </label>
            <label className="field">
              Type
              <select value={field.type} onChange={(e) => update(i, { type: e.target.value as FormFieldType })}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Placeholder
              <input value={field.placeholder || ""} onChange={(e) => update(i, { placeholder: e.target.value })} />
            </label>
            <label className="field">
              Field ID (session key)
              <input value={field.id} onChange={(e) => update(i, { id: e.target.value.trim() })} />
            </label>
          </div>
          {(field.type === "dropdown" || field.type === "multiple_choice") && (
            <label className="field" style={{ marginTop: 8 }}>
              Options (one per line)
              <textarea
                rows={4}
                value={(field.options || []).join("\n")}
                onChange={(e) =>
                  update(i, { options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })
                }
              />
            </label>
          )}
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <input type="checkbox" checked={!!field.required} onChange={(e) => update(i, { required: e.target.checked })} />
            Required
          </label>
        </CollapsibleSection>
      ))}
      <button
        type="button"
        className="btn"
        style={{ marginTop: 8 }}
        onClick={() =>
          onChange([
            ...fields,
            { id: newFieldId(), type: "text", label: "New field", required: false, placeholder: "", options: [] },
          ])
        }
      >
        Add field
      </button>
    </div>
  );
}
