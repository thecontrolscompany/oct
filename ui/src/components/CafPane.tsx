import { useState, useCallback, useMemo } from 'react';
import { api } from '../api';
import type { ParsedCaf, CafObject } from '../api';

// BACnet object type numbers → short label
const BACNET_TYPE: Record<number, string> = {
  0: 'AI', 1: 'AO', 2: 'AV', 3: 'BI', 4: 'BO', 5: 'BV',
  8: 'DEV', 13: 'MSI', 14: 'MSO', 19: 'MSV',
};

// Hardware I/O classids
const HW_IO_CLASSES = new Set([239, 240, 241, 242, 243, 671, 672, 673, 674]);
// BACnet object classids
const BACNET_OBJ_CLASSES = new Set([163, 164, 165, 166, 167, 168, 141]);

function displayName(obj: CafObject): string {
  return obj.tag || obj.description || obj.shortTag || `${obj.className} #${obj.objectid}`;
}

// ─── Tree node ────────────────────────────────────────────────────────────────
function TreeNode({
  obj, children, depth, selected, onSelect,
}: {
  obj: CafObject;
  children: CafObject[];
  depth: number;
  selected: string | null;
  onSelect: (ref: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = children.length > 0;
  const isSelected = selected === obj.ref;

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', paddingLeft: 8 + depth * 14,
          paddingTop: 2, paddingBottom: 2, paddingRight: 8,
          cursor: 'pointer', userSelect: 'none',
          background: isSelected ? 'var(--accent)' : 'transparent',
          color: isSelected ? '#fff' : 'var(--text)',
        }}
        onClick={() => { onSelect(obj.ref); if (hasChildren) setOpen(o => !o); }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <span style={{ width: 14, display: 'inline-block', fontSize: 10, color: isSelected ? '#fff' : 'var(--text-dim)', flexShrink: 0 }}>
          {hasChildren ? (open ? '▾' : '▸') : ''}
        </span>
        <span style={{
          fontSize: 10, padding: '0 4px', borderRadius: 3, marginRight: 5, flexShrink: 0,
          background: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--bg)',
          color: isSelected ? '#fff' : 'var(--accent)',
          border: `1px solid ${isSelected ? 'rgba(255,255,255,0.3)' : 'var(--border)'}`,
          fontFamily: 'Consolas, monospace',
        }}>
          {obj.className}
        </span>
        <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName(obj)}
        </span>
        {obj.units && (
          <span style={{ marginLeft: 6, fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-dim)', flexShrink: 0 }}>
            [{obj.units}]
          </span>
        )}
      </div>
      {open && hasChildren && (
        <div>
          {children.map(child => (
            <RecursiveNode key={child.ref} ref_={child.ref} depth={depth + 1} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

// Deferred lookup component to avoid passing whole map down
let _objMap: Map<string, CafObject> | null = null;
let _childMap: Map<string | null, CafObject[]> | null = null;

function RecursiveNode({ ref_, depth, selected, onSelect }: {
  ref_: string; depth: number; selected: string | null; onSelect: (ref: string) => void;
}) {
  const obj = _objMap?.get(ref_);
  const children = _childMap?.get(ref_) ?? [];
  if (!obj) return null;
  return <TreeNode obj={obj} children={children} depth={depth} selected={selected} onSelect={onSelect} />;
}

// ─── Detail panel ─────────────────────────────────────────────────────────────
function DetailPanel({ obj }: { obj: CafObject }) {
  const rows: Array<[string, string]> = [];
  if (obj.tag)          rows.push(['Tag', obj.tag]);
  if (obj.description)  rows.push(['Description', obj.description]);
  if (obj.shortTag)     rows.push(['Short Tag', obj.shortTag]);
  if (obj.bacoidType !== null) rows.push(['BACnet Type', BACNET_TYPE[obj.bacoidType] ?? String(obj.bacoidType)]);
  if (obj.bacoidInstance !== null) rows.push(['Instance', String(obj.bacoidInstance)]);
  if (obj.units)        rows.push(['Units', obj.units]);
  if (obj.defaultValue !== null) rows.push(['Default', String(obj.defaultValue)]);
  rows.push(['Class', `${obj.className} (${obj.classid})`]);
  rows.push(['Object ID', String(obj.objectid)]);
  rows.push(['Ref', obj.ref]);

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
        {displayName(obj)}
      </div>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '4px 8px 4px 0', color: 'var(--text-dim)', width: 100, verticalAlign: 'top' }}>{k}</td>
              <td style={{ padding: '4px 0', color: 'var(--text)', fontFamily: k === 'Ref' ? 'Consolas, monospace' : undefined, wordBreak: 'break-all', fontSize: k === 'Ref' ? 10 : 12 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── I/O Table ────────────────────────────────────────────────────────────────
function IoTable({ objects }: { objects: CafObject[] }) {
  const io = objects.filter(o => HW_IO_CLASSES.has(o.classid) || BACNET_OBJ_CLASSES.has(o.classid));
  const hw = io.filter(o => HW_IO_CLASSES.has(o.classid));
  const bacnet = io.filter(o => BACNET_OBJ_CLASSES.has(o.classid));

  const renderTable = (items: CafObject[], title: string) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', padding: '4px 0', marginBottom: 4 }}>
        {title} ({items.length})
      </div>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ fontSize: 11, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
            <th style={{ textAlign: 'left', padding: '3px 8px 3px 0', width: 80 }}>Type</th>
            <th style={{ textAlign: 'left', padding: '3px 8px' }}>Tag</th>
            <th style={{ textAlign: 'left', padding: '3px 8px' }}>Description</th>
            <th style={{ textAlign: 'left', padding: '3px 0', width: 60 }}>Short Tag</th>
            <th style={{ textAlign: 'left', padding: '3px 0 3px 8px', width: 100 }}>Units</th>
            <th style={{ textAlign: 'right', padding: '3px 0', width: 70 }}>Default</th>
          </tr>
        </thead>
        <tbody>
          {items.map(obj => (
            <tr key={obj.ref} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '4px 8px 4px 0' }}>
                <span style={{
                  fontSize: 10, padding: '1px 4px', borderRadius: 3,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  color: 'var(--accent)', fontFamily: 'Consolas, monospace',
                }}>
                  {obj.className}
                </span>
              </td>
              <td style={{ padding: '4px 8px', color: 'var(--text)', fontWeight: 500 }}>{obj.tag}</td>
              <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{obj.description}</td>
              <td style={{ padding: '4px 0', color: 'var(--text-dim)', fontSize: 11 }}>{obj.shortTag}</td>
              <td style={{ padding: '4px 0 4px 8px', color: 'var(--text-dim)', fontSize: 11 }}>{obj.units ?? '—'}</td>
              <td style={{ padding: '4px 0', color: 'var(--accent)', textAlign: 'right', fontFamily: 'Consolas, monospace', fontSize: 11 }}>
                {obj.defaultValue !== null ? obj.defaultValue : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      {hw.length > 0 && renderTable(hw, 'Hardware I/O')}
      {bacnet.length > 0 && renderTable(bacnet, 'BACnet Objects')}
      {io.length === 0 && <div style={{ color: 'var(--text-dim)', padding: 8 }}>No I/O points found</div>}
    </div>
  );
}

// ─── Stats panel ──────────────────────────────────────────────────────────────
function StatsPanel({ caf }: { caf: ParsedCaf }) {
  return (
    <div style={{ padding: 12 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>CONTROLLER</div>
        <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {[
              ['Model', caf.controller.modelName],
              ['Description', caf.controller.description],
              ['Tag', caf.controller.tag],
              ['App Version', caf.controller.appVersion],
              ['IP Address', caf.controller.ip ?? '—'],
              ['Object ID', String(caf.controller.objectId)],
              ['Total Objects', String(caf.objects.length)],
            ].map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '3px 8px 3px 0', color: 'var(--text-dim)', width: 100 }}>{k}</td>
                <td style={{ padding: '3px 0', color: 'var(--text)' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>
        OBJECT TYPES
      </div>
      {caf.stats.map(s => (
        <div key={s.classid} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text)' }}>{s.className}</span>
          <span style={{ color: 'var(--accent)', fontFamily: 'Consolas, monospace' }}>{s.count}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main pane ────────────────────────────────────────────────────────────────
type Tab = 'tree' | 'io' | 'stats';

export default function CafPane() {
  const [caf, setCaf] = useState<ParsedCaf | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('tree');
  const [dragging, setDragging] = useState(false);

  const objMap = useMemo(() => {
    const m = new Map<string, CafObject>();
    caf?.objects.forEach(o => m.set(o.ref, o));
    _objMap = m;
    return m;
  }, [caf]);

  const childMap = useMemo(() => {
    const m = new Map<string | null, CafObject[]>();
    caf?.objects.forEach(o => {
      const p = o.parentRef;
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(o);
    });
    _childMap = m;
    return m;
  }, [caf]);

  const roots = childMap.get(null) ?? [];
  const selectedObj = selected ? objMap.get(selected) ?? null : null;

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.caf')) {
      setError('Please select a .caf file');
      return;
    }
    setLoading(true);
    setError(null);
    setCaf(null);
    setSelected(null);
    try {
      const result = await api.caf.upload(file);
      setCaf(result);
      setTab('tree');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  if (!caf && !loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8, padding: '40px 60px', textAlign: 'center',
            background: dragging ? 'rgba(var(--accent-rgb, 100,160,255),0.05)' : 'transparent',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onClick={() => document.getElementById('caf-file-input')?.click()}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop a .caf file here</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>or click to browse</div>
        </div>
        <input
          id="caf-file-input"
          type="file"
          accept=".caf"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {error && <div style={{ color: 'var(--error)', fontSize: 13 }}>{error}</div>}
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-dim)', textAlign: 'center' }}>Parsing .caf…</div>;
  }

  if (!caf) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{caf.controller.tag || caf.controller.modelName}</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
          {caf.controller.modelName} · fw {caf.controller.appVersion} · {caf.objects.length} objects
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['tree', 'io', 'stats'] as Tab[]).map(t => (
            <button
              key={t}
              className={`tab${tab === t ? ' active' : ''}`}
              style={{ borderRadius: 4, marginBottom: 0, border: 'none', fontSize: 11, padding: '3px 10px' }}
              onClick={() => setTab(t)}
            >
              {t === 'tree' ? 'Object Tree' : t === 'io' ? 'I/O Points' : 'Stats'}
            </button>
          ))}
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => { setCaf(null); setSelected(null); }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Content */}
      {tab === 'stats' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <StatsPanel caf={caf} />
        </div>
      )}

      {tab === 'io' && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <IoTable objects={caf.objects} />
        </div>
      )}

      {tab === 'tree' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Tree */}
          <div style={{ width: 420, borderRight: '1px solid var(--border)', overflowY: 'auto', flexShrink: 0 }}>
            {roots.map(root => (
              <RecursiveNode key={root.ref} ref_={root.ref} depth={0} selected={selected} onSelect={setSelected} />
            ))}
          </div>

          {/* Detail */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {selectedObj
              ? <DetailPanel obj={selectedObj} />
              : <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>Select an object in the tree</div>
            }
          </div>
        </div>
      )}
    </div>
  );
}
