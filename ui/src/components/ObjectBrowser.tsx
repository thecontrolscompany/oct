import { useState, useMemo, useCallback } from 'react';
import type { CafObject, DbexportObject } from '../api';

type AnyObject = CafObject | DbexportObject;

type SortDir = 'asc' | 'desc';
type SortCol = 'className' | 'classid' | 'tag' | 'description' | 'units' | 'bacoidType' | 'bacoidInstance' | 'ref';

const PAGE_SIZES = [25, 50, 100, 250];

const BACNET_TYPE: Record<number, string> = {
  0: 'AI', 1: 'AO', 2: 'AV', 3: 'BI', 4: 'BO', 5: 'BV',
  6: 'CAL', 8: 'DEV', 9: 'EE', 13: 'MSI', 14: 'MSO', 15: 'NC',
  16: 'PROG', 17: 'SCHED', 18: 'AVG', 19: 'MSV', 20: 'TL',
  23: 'ACC', 56: 'NP',
};

const COLS: Array<{ key: SortCol; label: string; width?: number; mono?: boolean }> = [
  { key: 'className',      label: 'Class',       width: 160 },
  { key: 'tag',            label: 'Tag',         width: 160 },
  { key: 'description',    label: 'Description'            },
  { key: 'units',          label: 'Units',       width: 80  },
  { key: 'bacoidType',     label: 'BACnet',      width: 65  },
  { key: 'bacoidInstance', label: 'Instance',    width: 80, mono: true },
];

function sortVal(o: AnyObject, col: SortCol): string | number {
  switch (col) {
    case 'classid':        return o.classid;
    case 'bacoidType':     return o.bacoidType ?? -1;
    case 'bacoidInstance': return o.bacoidInstance ?? -1;
    case 'className':      return o.className.toLowerCase();
    case 'tag':            return o.tag.toLowerCase();
    case 'description':    return o.description.toLowerCase();
    case 'units':          return (o.units ?? '').toLowerCase();
    case 'ref':            return o.ref.toLowerCase();
  }
}

// ─── Pagination controls ────────────────────────────────────────────────────

function PaginationBar({
  page, totalPages, pageSize, totalItems, onPage, onPageSize,
}: {
  page: number; totalPages: number; pageSize: number; totalItems: number;
  onPage: (p: number) => void; onPageSize: (n: number) => void;
}) {
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  // Build page number buttons: always show first, last, current ±2, with ellipsis
  const pages: (number | '…')[] = [];
  const add = (n: number) => { if (!pages.includes(n)) pages.push(n); };
  add(1);
  if (page > 4) pages.push('…');
  for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) add(i);
  if (page < totalPages - 3) pages.push('…');
  if (totalPages > 1) add(totalPages);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
      borderTop: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap',
      background: 'var(--sidebar-bg)', fontSize: 12,
    }}>
      {/* Row count */}
      <span style={{ color: 'var(--text-dim)', minWidth: 120 }}>
        {totalItems === 0 ? 'No results' : `${start.toLocaleString()}–${end.toLocaleString()} of ${totalItems.toLocaleString()}`}
      </span>

      {/* Page size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
        <span style={{ color: 'var(--text-dim)' }}>Show</span>
        <select
          value={pageSize}
          onChange={e => onPageSize(parseInt(e.target.value))}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px', color: 'var(--text)', fontSize: 12 }}
        >
          {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Nav buttons */}
      <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
        <NavBtn label="«" title="First page"    disabled={page === 1}          onClick={() => onPage(1)} />
        <NavBtn label="‹" title="Previous page" disabled={page === 1}          onClick={() => onPage(page - 1)} />
        {pages.map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} style={{ padding: '2px 6px', color: 'var(--text-dim)' }}>…</span>
            : <NavBtn key={p} label={String(p)} active={p === page} onClick={() => onPage(p as number)} />
        )}
        <NavBtn label="›" title="Next page"     disabled={page === totalPages} onClick={() => onPage(page + 1)} />
        <NavBtn label="»" title="Last page"     disabled={page === totalPages} onClick={() => onPage(totalPages)} />
      </div>
    </div>
  );
}

function NavBtn({ label, title, disabled, active, onClick }: {
  label: string; title?: string; disabled?: boolean; active?: boolean; onClick: () => void;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 3,
        background: active ? 'var(--accent)' : 'var(--bg)',
        color: active ? '#fff' : disabled ? 'var(--text-dim)' : 'var(--text)',
        cursor: disabled ? 'default' : 'pointer', fontSize: 12,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ObjectBrowser({
  objects,
  onSelect,
  incomingCounts,
}: {
  objects: AnyObject[];
  onSelect?: (ref: string) => void;
  incomingCounts?: Map<string, number>;
}) {
  const [search, setSearch]       = useState('');
  const [classFilter, setClass]   = useState('');
  const [typeFilter, setType]     = useState('');
  const [sortCol, setSortCol]     = useState<SortCol>('className');
  const [sortDir, setSortDir]     = useState<SortDir>('asc');
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(50);

  // Unique class names for filter dropdown
  const classNames = useMemo(() =>
    [...new Set(objects.map(o => o.className))].sort(), [objects]);

  // Unique BACnet types for filter dropdown
  const bacnetTypes = useMemo(() =>
    [...new Set(objects.map(o => o.bacoidType).filter((t): t is number => t !== null))]
      .sort((a, b) => a - b), [objects]);

  const handleSort = useCallback((col: SortCol) => {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  }, [sortCol]);

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1); }, []);
  const handleClass  = useCallback((v: string) => { setClass(v);  setPage(1); }, []);
  const handleType   = useCallback((v: string) => { setType(v);   setPage(1); }, []);
  const handleSize   = useCallback((n: number) => { setPageSize(n); setPage(1); }, []);

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return objects.filter(o => {
      if (classFilter && o.className !== classFilter) return false;
      if (typeFilter  && String(o.bacoidType) !== typeFilter) return false;
      if (!q) return true;
      return (
        o.className.toLowerCase().includes(q) ||
        o.tag.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        o.ref.toLowerCase().includes(q) ||
        (o.units ?? '').toLowerCase().includes(q) ||
        String(o.classid).includes(q) ||
        String(o.bacoidInstance ?? '').includes(q)
      );
    });
  }, [objects, search, classFilter, typeFilter]);

  // Sort
  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortVal(a, sortCol);
      const bv = sortVal(b, sortCol);
      if (av < bv) return -dir;
      if (av > bv) return  dir;
      return 0;
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageItems  = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (col !== sortCol) return <span style={{ opacity: 0.25, marginLeft: 3 }}>⇅</span>;
    return <span style={{ marginLeft: 3 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  // Export filtered data as CSV
  const exportCsv = () => {
    const header = 'Class,Tag,Description,Units,BACnet Type,Instance,Refs,Ref\n';
    const rows = sorted.map(o =>
      `"${o.className}","${o.tag}","${o.description}","${o.units ?? ''}","${o.bacoidType !== null ? (BACNET_TYPE[o.bacoidType] ?? o.bacoidType) : ''}",${o.bacoidInstance ?? ''},${incomingCounts?.get(o.ref) ?? 0},"${o.ref}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'objects.csv';
    a.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Filter bar */}
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap',
      }}>
        <input
          type="text"
          placeholder="Search class, tag, description, ref…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          style={{ flex: '1 1 200px', maxWidth: 320 }}
        />

        <select
          value={classFilter}
          onChange={e => handleClass(e.target.value)}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 6px', color: 'var(--text)', fontSize: 12, maxWidth: 180 }}
        >
          <option value="">All classes</option>
          {classNames.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={typeFilter}
          onChange={e => handleType(e.target.value)}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 6px', color: 'var(--text)', fontSize: 12, width: 100 }}
        >
          <option value="">All BACnet types</option>
          {bacnetTypes.map(t => (
            <option key={t} value={String(t)}>{BACNET_TYPE[t] ?? `Type ${t}`} ({t})</option>
          ))}
        </select>

        {(search || classFilter || typeFilter) && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => { handleSearch(''); handleClass(''); handleType(''); }}
          >
            Clear
          </button>
        )}

        <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 4 }}>
          {filtered.length.toLocaleString()} / {objects.length.toLocaleString()}
        </span>

        <button
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: '3px 8px', marginLeft: 'auto' }}
          onClick={exportCsv}
          title="Export filtered results as CSV"
        >
          ↓ CSV
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 700 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--sidebar-bg)' }}>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
          {COLS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    textAlign: 'left', padding: '6px 8px', fontSize: 11,
                    color: sortCol === col.key ? 'var(--accent)' : 'var(--text-dim)',
                    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                    width: col.width, fontWeight: 600,
                  }}
                  title={`Sort by ${col.label}`}
                >
                  {col.label}<SortIcon col={col.key} />
                </th>
              ))}
              <th
                style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, width: 70 }}
              >
                Refs
              </th>
              <th
                style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}
              >
                Ref
              </th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + 2} style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
                  No objects match the current filters.
                </td>
              </tr>
            ) : pageItems.map((o, i) => (
              <tr
                key={o.ref}
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(128,128,128,0.03)',
                  cursor: onSelect ? 'pointer' : 'default',
                }}
                onClick={() => onSelect?.(o.ref)}
                onMouseEnter={e => { if (onSelect) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? 'transparent' : 'rgba(128,128,128,0.03)'; }}
              >
                <td style={{ padding: '4px 8px' }}>
                  <span style={{
                    display: 'inline-block', padding: '1px 5px', borderRadius: 3,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    color: 'var(--accent)', fontFamily: 'Consolas, monospace', fontSize: 11,
                  }}>
                    {o.className}
                  </span>
                </td>
                <td style={{ padding: '4px 8px', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.tag}
                </td>
                <td style={{ padding: '4px 8px', color: 'var(--text-dim)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.description}
                </td>
                <td style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-dim)' }}>
                  {o.units ?? ''}
                </td>
                <td style={{ padding: '4px 8px', fontSize: 11 }}>
                  {o.bacoidType !== null ? (
                    <span style={{
                      padding: '0 4px', borderRadius: 3, fontSize: 10,
                      background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
                      fontFamily: 'Consolas, monospace', color: 'var(--text)',
                    }}>
                      {BACNET_TYPE[o.bacoidType] ?? o.bacoidType}
                    </span>
                  ) : ''}
                </td>
                <td style={{ padding: '4px 8px', fontFamily: 'Consolas, monospace', fontSize: 11, color: 'var(--text-dim)' }}>
                  {o.bacoidInstance ?? ''}
                </td>
                <td style={{ padding: '4px 8px', fontFamily: 'Consolas, monospace', fontSize: 11 }}>
                  {incomingCounts?.get(o.ref) ? (
                    <span style={{
                      display: 'inline-block', minWidth: 24, textAlign: 'center',
                      padding: '0 5px', borderRadius: 999, background: 'var(--bg)',
                      border: '1px solid var(--border)', color: 'var(--accent)',
                    }}>
                      {incomingCounts.get(o.ref)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>0</span>
                  )}
                </td>
                <td style={{ padding: '4px 8px', fontFamily: 'Consolas, monospace', fontSize: 10, color: 'var(--text-dim)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={o.ref}>
                  {o.ref}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <PaginationBar
        page={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={filtered.length}
        onPage={setPage}
        onPageSize={handleSize}
      />
    </div>
  );
}
