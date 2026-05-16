import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { CctAttribute } from '../api';

const DATA_TYPE_LABELS: Record<number, string> = {
  1: 'Bool', 2: 'UInt8', 3: 'UInt16', 4: 'UInt32',
  5: 'Int16', 6: 'Float', 7: 'String', 8: 'Enum', 9: 'Date', 10: 'Time',
};

export default function AttributeTable({ objectId }: { objectId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['attributes', objectId],
    queryFn: () => api.attributes(objectId),
  });

  if (isLoading) return <div className="loading">Loading attributes…</div>;
  if (error) return <div className="error-msg">Error: {String(error)}</div>;
  if (!data?.length) return (
    <div className="empty-state">
      <div className="icon">📋</div>
      <p>No attribute values stored for this object</p>
    </div>
  );

  return (
    <div className="card">
      <div className="card-header">Attributes ({data.length})</div>
      <table className="attr-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Attribute Name</th>
            <th>Value</th>
            <th>Type</th>
            <th>Index</th>
            <th>Units</th>
          </tr>
        </thead>
        <tbody>
          {data.map((attr: CctAttribute) => (
            <tr key={attr.ValueId}>
              <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                {attr.MetasysAttributeNumber ?? '—'}
              </td>
              <td style={{ color: 'var(--text)' }}>{attr.AttributeName}</td>
              <td className="attr-value">{attr.ValueString ?? attr.ValueString1 ?? '—'}</td>
              <td>
                <span className="tag tag-gray">
                  {attr.swDataTypeId != null
                    ? (DATA_TYPE_LABELS[attr.swDataTypeId] ?? `T${attr.swDataTypeId}`)
                    : '—'}
                </span>
              </td>
              <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                {attr.ArrayIndex != null ? `[${attr.ArrayIndex}]` : ''}
                {attr.LevelIndex != null ? ` L${attr.LevelIndex}` : ''}
              </td>
              <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{attr.SystemOfUnits ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
