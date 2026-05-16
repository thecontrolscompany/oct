import { useState, useMemo } from 'react';
import { DICTIONARY_UNIQUE, CATEGORIES, type DictEntry } from '../data/jciDictionary';

type SortKey = 'classid' | 'name' | 'category' | 'bacnetType' | 'context';
type SortDir = 'asc' | 'desc';

const CONTEXT_LABELS: Record<string, string> = { cct: 'CCT', sct: 'SCT', both: 'Both' };
const PAGE_SIZES = [25, 50, 100] as const;

function badge(context: DictEntry['context']) {
  const color = context === 'cct' ? '#2563eb' : context === 'sct' ? '#16a34a' : '#7c3aed';
  return (
    <span style={{
      background: color, color: '#fff', borderRadius: 4,
      padding: '1px 6px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {CONTEXT_LABELS[context]}
    </span>
  );
}

export default function DictionaryPane() {
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('');
  const [ctxFilter, setCtxFilter]   = useState('');
  const [btFilter, setBtFilter]     = useState('');
  const [sortKey, setSortKey]       = useState<SortKey>('classid');
  const [sortDir, setSortDir]       = useState<SortDir>('asc');
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState<number>(50);
  const [expanded, setExpanded]     = useState<number | null>(null);

  const bacnetTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of DICTIONARY_UNIQUE) {
      if (e.bacnetTypeName) set.add(e.bacnetTypeName);
    }
    return [...set].sort();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return DICTIONARY_UNIQUE.filter(e => {
      if (catFilter && e.category !== catFilter) return false;
      if (ctxFilter && e.context !== ctxFilter) return false;
      if (btFilter && e.bacnetTypeName !== btFilter) return false;
      if (!q) return true;
      return (
        String(e.classid).includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.bacnetTypeName ?? '').toLowerCase().includes(q)
      );
    });
  }, [search, catFilter, ctxFilter, btFilter]);

  const sorted = useMemo(() => {
    const cmp = (a: DictEntry, b: DictEntry) => {
      let va: string | number = '', vb: string | number = '';
      if (sortKey === 'classid')   { va = a.classid; vb = b.classid; }
      else if (sortKey === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (sortKey === 'category') { va = a.category.toLowerCase(); vb = b.category.toLowerCase(); }
      else if (sortKey === 'bacnetType') { va = a.bacnetTypeName ?? ''; vb = b.bacnetTypeName ?? ''; }
      else if (sortKey === 'context')  { va = a.context; vb = b.context; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    };
    return [...filtered].sort(cmp);
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const slice = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const filtersActive = !!(search || catFilter || ctxFilter || btFilter);

  const clearFilters = () => {
    setSearch(''); setCatFilter(''); setCtxFilter(''); setBtFilter(''); setPage(1);
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const Th = ({ label, k, style }: { label: string; k: SortKey; style?: React.CSSProperties }) => (
    <th
      onClick={() => handleSort(k)}
      style={{ cursor: 'pointer', userSelect: 'none', padding: '6px 10px',
        borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
        background: 'var(--bg)', textAlign: 'left', ...style }}
    >
      {label}{arrow(k)}
    </th>
  );

  // Pagination bar
  const PaginationBar = () => {
    const pages: (number | '…')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safePage > 3) pages.push('…');
      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pages.push(i);
      if (safePage < totalPages - 2) pages.push('…');
      pages.push(totalPages);
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" style={{ padding: '2px 7px' }} disabled={safePage === 1} onClick={() => setPage(1)}>«</button>
        <button className="btn btn-ghost" style={{ padding: '2px 7px' }} disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button>
        {pages.map((p, i) =>
          p === '…' ? <span key={`e${i}`} style={{ padding: '2px 4px', color: 'var(--text-dim)' }}>…</span>
            : <button key={p} className={`btn ${p === safePage ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '2px 8px', minWidth: 30 }} onClick={() => setPage(p as number)}>{p}</button>
        )}
        <button className="btn btn-ghost" style={{ padding: '2px 7px' }} disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</button>
        <button className="btn btn-ghost" style={{ padding: '2px 7px' }} disabled={safePage === totalPages} onClick={() => setPage(totalPages)}>»</button>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-alt)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
          JCI Class ID Dictionary
          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-dim)', marginLeft: 10 }}>
            {DICTIONARY_UNIQUE.length} class IDs · Sources: CCT Primitives.xml, Metasys SCT dbexport
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text" placeholder="Search class ID, name, description…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: 260, padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 4, color: 'var(--text)', fontSize: 12 }}
          />

          <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }}
            style={{ padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 4, color: 'var(--text)', fontSize: 12, maxWidth: 220 }}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={ctxFilter} onChange={e => { setCtxFilter(e.target.value); setPage(1); }}
            style={{ padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
            <option value="">All Contexts</option>
            <option value="cct">CCT Only</option>
            <option value="sct">SCT / Metasys Only</option>
            <option value="both">Both</option>
          </select>

          <select value={btFilter} onChange={e => { setBtFilter(e.target.value); setPage(1); }}
            style={{ padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 4, color: 'var(--text)', fontSize: 12, maxWidth: 180 }}>
            <option value="">All BACnet Types</option>
            {bacnetTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {filtersActive && (
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={clearFilters}>
              Clear ✕
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', gap: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {filtered.length === DICTIONARY_UNIQUE.length
            ? `${DICTIONARY_UNIQUE.length} entries`
            : `${filtered.length} of ${DICTIONARY_UNIQUE.length} entries`}
          {filtered.length > 0 && ` · page ${safePage} of ${totalPages}`}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>Per page:</label>
          <select value={pageSize} onChange={e => { setPageSize(parseInt(e.target.value)); setPage(1); }}
            style={{ padding: '2px 6px', background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <Th label="Class ID" k="classid" style={{ width: 80 }} />
              <Th label="Name" k="name" style={{ width: 200 }} />
              <Th label="Category" k="category" style={{ width: 200 }} />
              <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)',
                background: 'var(--bg)', textAlign: 'left', fontWeight: 600 }}>
                Description
              </th>
              <Th label="BACnet Type" k="bacnetType" style={{ width: 150 }} />
              <Th label="Context" k="context" style={{ width: 70 }} />
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)' }}>
                No entries match the current filters.
              </td></tr>
            ) : slice.map((e, i) => (
              <>
                <tr key={e.classid}
                  style={{
                    background: expanded === e.classid
                      ? 'color-mix(in srgb, var(--accent) 12%, var(--bg))'
                      : i % 2 === 0 ? 'var(--bg)' : 'var(--bg-alt)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpanded(expanded === e.classid ? null : e.classid)}
                >
                  <td style={{ padding: '5px 10px', fontFamily: 'Consolas, monospace', color: 'var(--accent)', fontWeight: 700 }}>
                    {e.classid}
                  </td>
                  <td style={{ padding: '5px 10px', fontWeight: 500 }}>{e.name}</td>
                  <td style={{ padding: '5px 10px', color: 'var(--text-dim)', fontSize: 11 }}>{e.category}</td>
                  <td style={{ padding: '5px 10px', maxWidth: 400 }}>
                    <span style={{ display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {e.description}
                    </span>
                  </td>
                  <td style={{ padding: '5px 10px', color: 'var(--text-dim)', fontSize: 11 }}>
                    {e.bacnetTypeName
                      ? <><span style={{ fontFamily: 'Consolas, monospace', color: 'var(--text)' }}>{e.bacnetType}</span> {e.bacnetTypeName}</>
                      : <span style={{ color: 'var(--border)' }}>JCI proprietary</span>}
                  </td>
                  <td style={{ padding: '5px 10px' }}>{badge(e.context)}</td>
                </tr>
                {expanded === e.classid && (
                  <tr key={`${e.classid}-detail`}
                    style={{ background: 'color-mix(in srgb, var(--accent) 8%, var(--bg))' }}>
                    <td />
                    <td colSpan={5} style={{ padding: '8px 10px 12px' }}>
                      <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 6 }}>
                        {e.description}
                      </div>
                      {e.notes && (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                          <strong>Notes:</strong> {e.notes}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        <strong>Source:</strong> {e.source}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'center', background: 'var(--bg)' }}>
        <PaginationBar />
      </div>
    </div>
  );
}
