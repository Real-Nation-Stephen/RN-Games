type MetadataRecord = {
  projectCode?: string;
  designCode?: string;
  archived?: boolean;
};

type Props<T extends MetadataRecord> = {
  record: T;
  onChange: (patch: Partial<T>) => void;
  onArchive?: () => void;
  archiving?: boolean;
};

/** Project/design codes shared across component editors. */
export function ComponentMetadataFields<T extends MetadataRecord>({
  record,
  onChange,
  onArchive,
  archiving,
}: Props<T>) {
  return (
    <>
      <label className="field">
        Project code
        <input
          value={record.projectCode || ""}
          onChange={(e) => onChange({ projectCode: e.target.value } as Partial<T>)}
        />
      </label>
      <label className="field">
        Design code
        <input
          value={record.designCode || ""}
          onChange={(e) => onChange({ designCode: e.target.value } as Partial<T>)}
        />
      </label>
      {record.archived ? (
        <p className="muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
          This component is archived and hidden from new experience steps.
        </p>
      ) : null}
      {onArchive && !record.archived ? (
        <div style={{ gridColumn: "1 / -1" }}>
          <button type="button" className="btn" disabled={archiving} onClick={onArchive}>
            Archive component
          </button>
        </div>
      ) : null}
    </>
  );
}
