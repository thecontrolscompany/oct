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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {filtered.length.toLocaleString()} / {properties.length.toLocaleString()} properties
        </span>
        <input
          type="text"
          placeholder="Filter properties…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ minWidth: 240 }}
        />
        {search && (
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setSearch('')}>
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No properties match the current filter.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Property</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Value</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(prop => (
              <tr key={`${prop.id}:${prop.name}`} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px 4px 0', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 500 }}>{prop.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'Consolas, monospace' }}>#{prop.id}</div>
                </td>
                <td style={{ padding: '4px 8px', wordBreak: 'break-all' }}>{prop.value || '—'}</td>
                <td style={{ padding: '4px 8px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{prop.valueType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
