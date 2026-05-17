import { useMemo, useState } from 'react';
import type { ArchiveProperty } from '../api';

export default function ObjectPropertiesTable({ properties = [] }: { properties?: ArchiveProperty[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter(prop =>
      prop.name.toLowerCase().includes(q) ||
      prop.value.toLowerCase().includes(q) ||
      prop.valueType.toLowerCase().includes(q) ||
      String(prop.id).includes(q)
    );
  }, [properties, search]);

  return (
    <div className="sct-detail-stack">
      <div className="sct-subbar">
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {filtered.length.toLocaleString()} / {properties.length.toLocaleString()} properties
        </span>
        <input
          type="text"
          placeholder="Filter properties…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setSearch('')}>
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="sct-empty-card" style={{ minHeight: 120 }}>
          <div className="inner" style={{ width: '100%', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--shell-blue-ink)' }}>No properties match the current filter.</div>
            <div style={{ fontSize: 12 }}>Try a property name, value fragment, type, or numeric id.</div>
          </div>
        </div>
      ) : (
        <table className="sct-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Value</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(prop => (
              <tr key={`${prop.id}:${prop.name}`}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 600 }}>{prop.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Property {prop.id}</div>
                </td>
                <td style={{ wordBreak: 'break-word' }}>{prop.value || '—'}</td>
                <td style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{prop.valueType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
