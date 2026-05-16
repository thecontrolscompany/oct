import { useState, useMemo } from 'react';
import { FDB_ENUM_SETS } from '../data/fdbEnums';
import type { FdbEnumSet } from '../data/fdbEnums';

const PAGE_SIZES = [25, 50, 100] as const;

function exportJson(setId: number, name: string, members: Array<{ EnumMemberId: number; Name: string }>) {
  const obj: Record<number, string> = {};
  for (const m of members) obj[m.EnumMemberId] = m.Name;
  const blob = new Blob([JSON.stringify({ enumSetId: setId, name, members: obj }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `enumSet_${setId}_${name.replace(/[^a-z0-9]/gi, '_')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportCsv(name: string, members: Array<{ EnumMemberId: number; Name: string }>) {
  const rows = ['EnumMemberId,Name', ...members.map(m => `${m.EnumMemberId},"${m.Name.replace(/"/g, '""')}"`)];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^a-z0-9]/gi, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function EnumsPane() {
  const [search, setSearch]             = useState('');
  const [selected, setSelected]         = useState<FdbEnumSet | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState<number>(50);

  const filteredSets = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return FDB_ENUM_SETS;
    return FDB_ENUM_SETS.filter(s =>
      String(s.EnumSetId).includes(q) || s.Name.toLowerCase().includes(q)
    );
  }, [search]);

  const filteredMembers = useMemo(() => {
    if (!selected) return [];
    const q = memberSearch.toLowerCase();
    if (!q) return selected.members;
    return selected.members.filter(m =>
      String(m.EnumMemberId).includes(q) || m.Name.toLowerCase().includes(q)
    );
  }, [selected, memberSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const memberSlice = filteredMembers.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Left — enum set list */}
      <div style={{ width: 300, minWidth: 260, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-alt)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
            Enum Sets
            <span style={{ fontWeight: 400, color: 'var(--text-dim)', fontSize: 11, marginLeft: 8 }}>
              {filteredSets.length}{search ? ` of ${FDB_ENUM_SETS.length}` : ''}
            </span>
          </div>
          <input
            type="text" placeholder="Search ID or name…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '4px 8px', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredSets.map(s => (
            <div key={s.EnumSetId}
              onClick={() => { setSelected(s); setMemberSearch(''); setPage(1); }}
              style={{
                padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                borderBottom: '1px solid var(--border)',
                background: selected?.EnumSetId === s.EnumSetId
                  ? 'color-mix(in srgb, var(--accent) 15%, var(--bg))'
                  : 'transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 500 }}>{s.Name}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{s.MemberCount}</span>
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'Consolas, monospace' }}>
                set {s.EnumSetId}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — members */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-dim)', fontSize: 13 }}>
            Select an enum set
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)',
              background: 'var(--bg-alt)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{selected.Name}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 12, marginLeft: 10 }}>
                  set {selected.EnumSetId} · {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }}
                  onClick={() => exportCsv(selected.Name, selected.members)}>
                  CSV
                </button>
                <button className="btn btn-primary" style={{ fontSize: 12, padding: '3px 10px' }}
                  onClick={() => exportJson(selected.EnumSetId, selected.Name, selected.members)}>
                  JSON
                </button>
              </div>
            </div>

            {/* Search + page size */}
            <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text" placeholder="Filter members…"
                value={memberSearch} onChange={e => { setMemberSearch(e.target.value); setPage(1); }}
                style={{ width: 220, padding: '3px 8px', background: 'var(--bg)',
                  border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 'auto' }}>Per page:</span>
              <select value={pageSize} onChange={e => { setPageSize(parseInt(e.target.value)); setPage(1); }}
                style={{ padding: '2px 6px', background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
                {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Members table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '5px 16px', borderBottom: '1px solid var(--border)',
                      background: 'var(--bg)', textAlign: 'left', width: 80, fontWeight: 600 }}>ID</th>
                    <th style={{ padding: '5px 16px', borderBottom: '1px solid var(--border)',
                      background: 'var(--bg)', textAlign: 'left', fontWeight: 600 }}>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {memberSlice.length === 0
                    ? <tr><td colSpan={2} style={{ padding: 16, color: 'var(--text-dim)', textAlign: 'center' }}>No members match</td></tr>
                    : memberSlice.map((m, i) => (
                      <tr key={m.EnumMemberId}
                        style={{ background: i % 2 === 0 ? 'var(--bg)' : 'var(--bg-alt)' }}>
                        <td style={{ padding: '4px 16px', fontFamily: 'Consolas, monospace',
                          color: 'var(--accent)', width: 80 }}>{m.EnumMemberId}</td>
                        <td style={{ padding: '4px 16px' }}>{m.Name}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border)',
                display: 'flex', justifyContent: 'center', gap: 4 }}>
                <button className="btn btn-ghost" style={{ padding: '2px 7px' }}
                  disabled={safePage === 1} onClick={() => setPage(1)}>«</button>
                <button className="btn btn-ghost" style={{ padding: '2px 7px' }}
                  disabled={safePage === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                <span style={{ padding: '2px 10px', fontSize: 12, color: 'var(--text-dim)' }}>
                  {safePage} / {totalPages}
                </span>
                <button className="btn btn-ghost" style={{ padding: '2px 7px' }}
                  disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                <button className="btn btn-ghost" style={{ padding: '2px 7px' }}
                  disabled={safePage === totalPages} onClick={() => setPage(totalPages)}>»</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
