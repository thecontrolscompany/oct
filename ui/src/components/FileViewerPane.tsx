import { useState, useCallback, useMemo } from 'react';
import { api } from '../api';
import type { CafObject, DbexportObject, NavNode, ParsedCaf, ParsedDbexport, ReferenceHit } from '../api';
import { buildReferenceMap } from '@oct/shared';
import ObjectBrowser from './ObjectBrowser';

// ─── Shared types ──────────────────────────────────────────────────────────

type LoadedFile = { type: 'caf'; data: ParsedCaf; name: string } | { type: 'dbexport'; data: ParsedDbexport; name: string };
type AnyObject = CafObject | DbexportObject;
type ViewTab = 'tree' | 'objects' | 'io' | 'refs' | 'diff' | 'export';

const HW_IO_CLASSES = new Set([239, 240, 241, 242, 243, 671, 672, 673, 674]);
const BACNET_OBJ_CLASSES = new Set([163, 164, 165, 166, 167, 168, 141]);

function getObjects(f: LoadedFile): AnyObject[] {
  return f.type === 'caf' ? f.data.objects : f.data.objects;
}

function displayName(o: AnyObject): string {
  return o.tag || o.description || `${o.className} #${o.objectid}`;
}

function getRef(o: AnyObject): string { return o.ref; }

// ─── Drop zone ─────────────────────────────────────────────────────────────

function DropZone({ onFile, label }: { onFile: (f: File) => void; label?: string }) {
  const [dragging, setDragging] = useState(false);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.caf,.dbexport';
        input.onchange = () => { if (input.files?.[0]) onFile(input.files[0]); };
        input.click();
      }}
      style={{
        border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8, padding: '32px 48px', textAlign: 'center',
        cursor: 'pointer', transition: 'border-color 0.15s',
        background: dragging ? 'rgba(100,160,255,0.05)' : 'transparent',
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 6 }}>📂</div>
      <div style={{ fontWeight: 600, marginBottom: 3 }}>{label ?? 'Drop a .caf or .dbexport file'}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>or click to browse</div>
    </div>
  );
}

// ─── CAF tree (ref-path hierarchy) ────────────────────────────────────────

function CafTreeNode({ obj, childMap, depth, selected, onSelect }: {
  obj: CafObject; childMap: Map<string | null, CafObject[]>;
  depth: number; selected: string | null; onSelect: (r: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const children = childMap.get(obj.ref) ?? [];
  const isSelected = selected === obj.ref;
  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', paddingLeft: 8 + depth * 14,
          padding: `2px 8px 2px ${8 + depth * 14}px`, cursor: 'pointer',
          background: isSelected ? 'var(--accent)' : 'transparent',
          color: isSelected ? '#fff' : 'var(--text)',
        }}
        onClick={() => { onSelect(obj.ref); if (children.length) setOpen(o => !o); }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <span style={{ width: 14, fontSize: 10, color: isSelected ? '#fff' : 'var(--text-dim)' }}>
          {children.length ? (open ? '▾' : '▸') : ''}
        </span>
        <span style={{ fontSize: 10, padding: '0 4px', borderRadius: 3, marginRight: 5, flexShrink: 0, fontFamily: 'Consolas,monospace', color: isSelected ? '#fff' : 'var(--accent)', background: isSelected ? 'rgba(255,255,255,0.15)' : 'var(--bg)', border: `1px solid ${isSelected ? 'rgba(255,255,255,0.3)' : 'var(--border)'}` }}>
          {obj.className}
        </span>
        <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName(obj)}
        </span>
        {obj.units && <span style={{ marginLeft: 6, fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-dim)', flexShrink: 0 }}>[{obj.units}]</span>}
      </div>
      {open && children.map(c => (
        <CafTreeNode key={c.ref} obj={c} childMap={childMap} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ─── NavNode tree (dbexport hierarchy) ─────────────────────────────────────

function NavTreeNode({ node, depth, selected, onSelect }: {
  node: NavNode; depth: number; selected: string | null; onSelect: (r: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const isSelected = selected === node.reference;
  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center',
          padding: `2px 8px 2px ${8 + depth * 14}px`, cursor: 'pointer',
          background: isSelected ? 'var(--accent)' : 'transparent',
          color: isSelected ? '#fff' : 'var(--text)',
        }}
        onClick={() => { onSelect(node.reference); if (node.children.length) setOpen(o => !o); }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <span style={{ width: 14, fontSize: 10, color: isSelected ? '#fff' : 'var(--text-dim)' }}>
          {node.children.length ? (open ? '▾' : '▸') : ''}
        </span>
        {node.className !== `Class${node.classid}` && node.className !== 'Class0' && (
          <span style={{ fontSize: 10, padding: '0 4px', borderRadius: 3, marginRight: 5, flexShrink: 0, fontFamily: 'Consolas,monospace', color: isSelected ? '#fff' : 'var(--accent)', background: isSelected ? 'rgba(255,255,255,0.15)' : 'var(--bg)', border: `1px solid ${isSelected ? 'rgba(255,255,255,0.3)' : 'var(--border)'}` }}>
            {node.className}
          </span>
        )}
        <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.label || node.reference.split(/[/\\]/).pop()}
        </span>
      </div>
      {open && node.children.map((c, i) => (
        <NavTreeNode key={i} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ─── Object detail ──────────────────────────────────────────────────────────

function ObjectDetail({ obj, incoming }: { obj: AnyObject; incoming: ReferenceHit[] }) {
  const rows: [string, string][] = [];
  if (obj.tag) rows.push(['Tag', obj.tag]);
  if (obj.description) rows.push(['Description', obj.description]);
  if (obj.bacoidType !== null) rows.push(['BACnet Type', String(obj.bacoidType)]);
  if (obj.bacoidInstance !== null) rows.push(['Instance', String(obj.bacoidInstance)]);
  if (obj.units) rows.push(['Units', obj.units]);
  if (obj.defaultValue !== null) rows.push(['Default', String(obj.defaultValue)]);
  rows.push(['Class', `${obj.className} (${obj.classid})`]);
  rows.push(['Ref', obj.ref]);
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{displayName(obj)}</div>
      <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '3px 8px 3px 0', color: 'var(--text-dim)', width: 100 }}>{k}</td>
              <td style={{ padding: '3px 0', wordBreak: 'break-all', fontFamily: k === 'Ref' ? 'Consolas,monospace' : undefined, fontSize: k === 'Ref' ? 10 : 12 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>
          REFERENCED BY
        </div>
        {incoming.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No incoming references found in the parsed archive.</div>
        ) : (
          <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Referring item</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Attribute</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {incoming.slice(0, 12).map(hit => (
                <tr key={`${hit.referringItem}|${hit.referringAttr}|${hit.source}`} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px 4px 0', wordBreak: 'break-all' }}>{hit.referringItem}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{hit.referringAttr}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{hit.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Objects table (flat, searchable) ──────────────────────────────────────

// ObjectsTable replaced by ObjectBrowser (imported above)

// ─── I/O table ──────────────────────────────────────────────────────────────

function IoTable({ objects }: { objects: AnyObject[] }) {
  const io = objects.filter(o => HW_IO_CLASSES.has(o.classid) || BACNET_OBJ_CLASSES.has(o.classid));
  if (io.length === 0) return <div style={{ padding: 24, color: 'var(--text-dim)' }}>No I/O points found</div>;
  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, background: 'var(--sidebar-bg)' }}>
          <tr style={{ fontSize: 11, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
            <th style={{ textAlign: 'left', padding: '4px 8px', width: 120 }}>Type</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Tag</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Description</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', width: 90 }}>Units</th>
            <th style={{ textAlign: 'right', padding: '4px 8px', width: 70 }}>Default</th>
          </tr>
        </thead>
        <tbody>
          {io.map(o => (
            <tr key={o.ref} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '4px 8px' }}>
                <span style={{ fontSize: 10, padding: '1px 4px', borderRadius: 3, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)', fontFamily: 'Consolas,monospace' }}>{o.className}</span>
              </td>
              <td style={{ padding: '4px 8px', fontWeight: 500 }}>{o.tag}</td>
              <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{o.description}</td>
              <td style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-dim)' }}>{o.units ?? '—'}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'Consolas,monospace', fontSize: 11, color: 'var(--accent)' }}>
                {o.defaultValue !== null ? o.defaultValue : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Diff tab ───────────────────────────────────────────────────────────────

type DiffRow = { ref: string; className: string; status: 'added' | 'removed' | 'changed'; before: string; after: string };

function DiffTab({ fileA, fileB }: { fileA: LoadedFile | null; fileB: LoadedFile | null }) {
  const [loading, setLoading] = useState(false);
  const [fileAState, setFileAState] = useState<LoadedFile | null>(fileA);
  const [fileBState, setFileBState] = useState<LoadedFile | null>(fileB);

  const diff = useMemo<DiffRow[]>(() => {
    if (!fileAState || !fileBState) return [];
    const aMap = new Map(getObjects(fileAState).map(o => [getRef(o), o]));
    const bMap = new Map(getObjects(fileBState).map(o => [getRef(o), o]));
    const rows: DiffRow[] = [];

    for (const [ref, a] of aMap) {
      const b = bMap.get(ref);
      if (!b) {
        rows.push({ ref, className: a.className, status: 'removed', before: displayName(a), after: '' });
      } else {
        const aDesc = `${a.tag}|${a.description}|${a.defaultValue}|${a.units}`;
        const bDesc = `${b.tag}|${b.description}|${b.defaultValue}|${b.units}`;
        if (aDesc !== bDesc) rows.push({ ref, className: a.className, status: 'changed', before: displayName(a), after: displayName(b) });
      }
    }
    for (const [ref, b] of bMap) {
      if (!aMap.has(ref)) rows.push({ ref, className: b.className, status: 'added', before: '', after: displayName(b) });
    }
    return rows.sort((a, b) => a.status.localeCompare(b.status) || a.ref.localeCompare(b.ref));
  }, [fileAState, fileBState]);

  const loadFile = async (file: File, slot: 'a' | 'b') => {
    setLoading(true);
    try {
      const name = file.name;
      if (file.name.toLowerCase().endsWith('.caf')) {
        const data = await api.caf.upload(file);
        if (slot === 'a') setFileAState({ type: 'caf', data, name });
        else setFileBState({ type: 'caf', data, name });
      } else {
        const data = await api.dbexport.upload(file);
        if (slot === 'a') setFileAState({ type: 'dbexport', data, name });
        else setFileBState({ type: 'dbexport', data, name });
      }
    } finally { setLoading(false); }
  };

  const downloadDiffCsv = () => {
    const header = 'Status,Class,Ref,Before,After\n';
    const rows = diff.map(r => `${r.status},${r.className},"${r.ref}","${r.before}","${r.after}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'diff.csv'; a.click();
  };

  const STATUS_COLOR: Record<string, string> = { added: 'var(--success)', removed: 'var(--error, #e55)', changed: '#f90' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 12, padding: 12, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>BEFORE {fileAState && <span style={{ color: 'var(--text)' }}>— {fileAState.name}</span>}</div>
          <DropZone onFile={f => loadFile(f, 'a')} label="Drop 'Before' file" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>AFTER {fileBState && <span style={{ color: 'var(--text)' }}>— {fileBState.name}</span>}</div>
          <DropZone onFile={f => loadFile(f, 'b')} label="Drop 'After' file" />
        </div>
      </div>
      {loading && <div style={{ padding: 16, color: 'var(--text-dim)' }}>Parsing…</div>}
      {diff.length > 0 && (
        <>
          <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--success)', marginRight: 12 }}>+{diff.filter(r => r.status === 'added').length} added</span>
              <span style={{ color: 'var(--error, #e55)', marginRight: 12 }}>-{diff.filter(r => r.status === 'removed').length} removed</span>
              <span style={{ color: '#f90' }}>~{diff.filter(r => r.status === 'changed').length} changed</span>
            </span>
            <button className="btn btn-ghost" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={downloadDiffCsv}>Export CSV</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--sidebar-bg)' }}>
                <tr style={{ fontSize: 11, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', width: 70 }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', width: 130 }}>Class</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>Ref</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>Before</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>After</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', color: STATUS_COLOR[r.status] }}>
                    <td style={{ padding: '3px 8px', fontWeight: 600, fontSize: 11 }}>{r.status}</td>
                    <td style={{ padding: '3px 8px', fontFamily: 'Consolas,monospace', fontSize: 10 }}>{r.className}</td>
                    <td style={{ padding: '3px 8px', fontFamily: 'Consolas,monospace', fontSize: 10, color: 'var(--text-dim)', wordBreak: 'break-all' }}>{r.ref}</td>
                    <td style={{ padding: '3px 8px' }}>{r.before}</td>
                    <td style={{ padding: '3px 8px' }}>{r.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!loading && fileAState && fileBState && diff.length === 0 && (
        <div style={{ padding: 24, color: 'var(--text-dim)', textAlign: 'center' }}>No differences found — files are identical at the object level.</div>
      )}
    </div>
  );
}

// ─── Export tab ──────────────────────────────────────────────────────────────

function ExportTab({ file }: { file: LoadedFile }) {
  const objects = getObjects(file);

  const exportCsv = () => {
    const header = 'ref,classid,className,tag,description,units,defaultValue,bacoidType,bacoidInstance\n';
    const rows = objects.map(o =>
      `"${o.ref}",${o.classid},"${o.className}","${o.tag}","${o.description}","${o.units ?? ''}",${o.defaultValue ?? ''},${o.bacoidType ?? ''},${o.bacoidInstance ?? ''}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${file.name.replace(/\.[^.]+$/, '')}.csv`; a.click();
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(file.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${file.name.replace(/\.[^.]+$/, '')}.json`; a.click();
  };

  const stats = file.type === 'caf' ? file.data.stats : file.data.stats;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Export {file.name}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={exportCsv}>
            Download CSV — {objects.length.toLocaleString()} objects
          </button>
          <button className="btn btn-ghost" onClick={exportJson}>
            Download JSON (full)
          </button>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>OBJECT TYPE BREAKDOWN</div>
        {stats.map(s => (
          <div key={s.classid} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
            <span>{s.className}</span>
            <span style={{ color: 'var(--accent)', fontFamily: 'Consolas,monospace' }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReferencesTab({
  file,
  referenceMap,
  selectedTarget,
  onSelectTarget,
}: {
  file: LoadedFile;
  referenceMap: Map<string, ReferenceHit[]>;
  selectedTarget: string | null;
  onSelectTarget: (target: string) => void;
}) {
  const [search, setSearch] = useState('');
  const targets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...referenceMap.entries()]
      .filter(([target, hits]) => {
        if (!q) return true;
        return target.toLowerCase().includes(q) || hits.some(hit =>
          hit.referringItem.toLowerCase().includes(q) ||
          hit.referringAttr.toLowerCase().includes(q) ||
          hit.source.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [referenceMap, search]);

  const activeTarget = selectedTarget && referenceMap.has(selectedTarget)
    ? selectedTarget
    : targets[0]?.[0] ?? null;
  const activeHits = activeTarget ? referenceMap.get(activeTarget) ?? [] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>REFERENCE INDEX</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{file.name}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            {referenceMap.size.toLocaleString()} targets · {file.data.references.length.toLocaleString()} hits
          </span>
          <input
            type="text"
            placeholder="Search target, referrer, source…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '360px 1fr', minHeight: 0 }}>
        <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
          {targets.length === 0 ? (
            <div style={{ padding: 18, color: 'var(--text-dim)' }}>No references found in this file.</div>
          ) : (
            targets.map(([target, hits]) => {
              const active = target === activeTarget;
              return (
                <button
                  key={target}
                  onClick={() => onSelectTarget(target)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    padding: '8px 12px',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: active ? 'rgba(100,160,255,0.12)' : 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'Consolas, monospace', fontSize: 11, wordBreak: 'break-all' }}>{target}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{hits[0]?.source ?? 'unknown source'}</div>
                  </div>
                  <span style={{ color: 'var(--accent)', fontFamily: 'Consolas, monospace', flexShrink: 0 }}>
                    {hits.length}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div style={{ overflowY: 'auto' }}>
          {!activeTarget ? (
            <div style={{ padding: 18, color: 'var(--text-dim)' }}>Select a target to inspect the incoming references.</div>
          ) : (
            <div style={{ padding: 18 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>TARGET</div>
                <div style={{ fontFamily: 'Consolas, monospace', wordBreak: 'break-all', fontSize: 13 }}>{activeTarget}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  {activeHits.length.toLocaleString()} incoming reference(s)
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Referring item</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Attribute</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {activeHits.map(hit => (
                    <tr key={`${hit.referringItem}|${hit.referringAttr}|${hit.source}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px 4px 0', wordBreak: 'break-all' }}>{hit.referringItem}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{hit.referringAttr}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{hit.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main pane ───────────────────────────────────────────────────────────────

export default function FileViewerPane() {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewTab>('tree');
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Build maps for CAF tree
  const { objMap, childMap, cafRoots } = useMemo(() => {
    if (!file || file.type !== 'caf') return { objMap: new Map(), childMap: new Map(), cafRoots: [] };
    const objMap = new Map(file.data.objects.map(o => [o.ref, o]));
    const childMap = new Map<string | null, CafObject[]>();
    for (const o of file.data.objects) {
      if (!childMap.has(o.parentRef)) childMap.set(o.parentRef, []);
      childMap.get(o.parentRef)!.push(o);
    }
    return { objMap, childMap, cafRoots: childMap.get(null) ?? [] };
  }, [file]);

  const referenceMap = useMemo(() => {
    if (!file) return new Map<string, ReferenceHit[]>();
    return buildReferenceMap(file.data.references);
  }, [file]);

  const selectedObj = selected && file
    ? (file.type === 'caf' ? objMap.get(selected) : file.data.objects.find(o => o.ref === selected)) ?? null
    : null;

  const handleFile = useCallback(async (f: File) => {
    setLoading(true); setError(null); setFile(null); setSelected(null); setTab('tree');
    try {
      const name = f.name;
      if (f.name.toLowerCase().endsWith('.caf')) {
        const data = await api.caf.upload(f);
        setFile({ type: 'caf', data, name });
      } else if (f.name.toLowerCase().endsWith('.dbexport')) {
        const data = await api.dbexport.upload(f);
        setFile({ type: 'dbexport', data, name });
      } else {
        setError('Unsupported file type. Drop a .caf or .dbexport file.');
      }
    } catch (e) { setError(String(e)); } finally { setLoading(false); }
  }, []);

  if (!file && !loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = '.caf,.dbexport';
            input.onchange = () => { if (input.files?.[0]) handleFile(input.files[0]); };
            input.click();
          }}
          style={{
            border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8, padding: '40px 60px', textAlign: 'center', cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop a .caf or .dbexport file here</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>or click to browse</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>.caf — CCT controller program · .dbexport — Metasys SCT archive</div>
        </div>
        {error && <div style={{ color: 'var(--error, #e55)', fontSize: 13 }}>{error}</div>}
      </div>
    );
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--text-dim)', textAlign: 'center' }}>Parsing file…</div>;
  if (!file) return null;

  const allObjects = getObjects(file);
  const TABS: [ViewTab, string][] = [['tree', 'Tree'], ['objects', 'Objects'], ['io', 'I/O Points'], ['refs', 'References'], ['diff', 'Diff'], ['export', 'Export']];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {file.type === 'caf' && file.data.controller.tag ? file.data.controller.tag : file.name}
        </span>
        <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: file.type === 'caf' ? 'var(--accent)' : '#8a2be2', color: '#fff', fontFamily: 'Consolas,monospace' }}>
          {file.type === 'caf' ? 'CAF' : 'dbexport'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {file.type === 'caf'
            ? `${file.data.controller.modelName} · fw ${file.data.controller.appVersion} · ${allObjects.length} objects · ${file.data.references.length} refs`
            : `${file.data.engines.length} engine(s) · ${allObjects.length} objects · ${file.data.references.length} refs`
          }
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {TABS.map(([id, label]) => (
            <button key={id} className={`tab${tab === id ? ' active' : ''}`}
              style={{ borderRadius: 4, marginBottom: 0, border: 'none', fontSize: 11, padding: '3px 10px' }}
              onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => { setFile(null); setSelected(null); }}>
            Close
          </button>
        </div>
      </div>

      {/* Content */}
      {tab === 'objects' && <ObjectBrowser objects={allObjects} onSelect={setSelected} />}
      {tab === 'io' && <div style={{ flex: 1, overflow: 'hidden' }}><IoTable objects={allObjects} /></div>}
      {tab === 'refs' && (
        <ReferencesTab
          file={file}
          referenceMap={referenceMap}
          selectedTarget={selected}
          onSelectTarget={setSelected}
        />
      )}
      {tab === 'export' && <div style={{ flex: 1, overflowY: 'auto' }}><ExportTab file={file} /></div>}
      {tab === 'diff' && <DiffTab fileA={file} fileB={null} />}

      {tab === 'tree' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ width: 420, borderRight: '1px solid var(--border)', overflowY: 'auto', flexShrink: 0 }}>
            {file.type === 'caf'
              ? cafRoots.map(r => <CafTreeNode key={r.ref} obj={r} childMap={childMap} depth={0} selected={selected} onSelect={setSelected} />)
              : file.data.site
                ? <NavTreeNode node={file.data.site} depth={0} selected={selected} onSelect={setSelected} />
                : <div style={{ padding: 16, color: 'var(--text-dim)' }}>No navtree found — showing object list</div>
            }
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {selectedObj
              ? <ObjectDetail obj={selectedObj} incoming={referenceMap.get(selectedObj.ref) ?? []} />
              : <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>Select an object in the tree</div>
            }
          </div>
        </div>
      )}
    </div>
  );
}
