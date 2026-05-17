import { useMemo, useState } from 'react';
import type { CafObject, DbexportObject, ReferenceHit } from '../api';
import type { ReferenceIndex } from '@oct/shared';

type AnyObject = CafObject | DbexportObject;

export const GRAPHIC_CLASS_IDS = new Set([357, 717, 844]);

const CLASS_LABEL: Record<number, string> = {
  357: 'Graphic Binding',
  717: 'Graphic',
  844: 'Facility Graphic',
};

function displayName(o: AnyObject): string {
  return o.tag || o.description || `${o.className} #${o.objectid}`;
}

function getBindingFileName(o: AnyObject): string | null {
  return 'bindingFileName' in o ? ((o as DbexportObject).bindingFileName ?? null) : null;
}

export function buildGraphicTagMap(objects: AnyObject[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const o of objects) {
    if (GRAPHIC_CLASS_IDS.has(o.classid)) m.set(o.ref, displayName(o));
  }
  return m;
}

interface GraphicEntry {
  graphic: AnyObject;
  bindingChild: AnyObject | null;
}

// ─── Bindings detail panel ────────────────────────────────────────────────────

function GraphicDetail({
  entry,
  bindings,
  objectMap,
  onSelectObject,
}: {
  entry: GraphicEntry;
  bindings: ReferenceHit[];
  objectMap: Map<string, AnyObject>;
  onSelectObject?: (ref: string) => void;
}) {
  const { graphic, bindingChild } = entry;
  const [bindingSearch, setBindingSearch] = useState('');

  const filteredBindings = useMemo(() => {
    const q = bindingSearch.trim().toLowerCase();
    if (!q) return bindings;
    return bindings.filter(
      h =>
        h.target.toLowerCase().includes(q) ||
        h.referringAttr.toLowerCase().includes(q) ||
        (h.referringPath ?? '').toLowerCase().includes(q),
    );
  }, [bindings, bindingSearch]);

  const graphicFileName = getBindingFileName(graphic);
  const bindingFileName = bindingChild ? getBindingFileName(bindingChild) : null;

  const metaRows: Array<[string, string, boolean?]> = [];
  if (graphic.tag) metaRows.push(['Tag', graphic.tag]);
  if (graphic.description && graphic.description !== graphic.tag)
    metaRows.push(['Description', graphic.description]);
  metaRows.push(['Ref', graphic.ref, true]);
  if (graphicFileName) metaRows.push(['Graphic file', graphicFileName]);
  if (bindingChild) metaRows.push(['Binding object', bindingChild.ref, true]);
  if (bindingFileName) metaRows.push(['Binding file', bindingFileName]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{displayName(graphic)}</div>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 3,
          background: 'var(--bg)', border: '1px solid var(--border)',
          color: 'var(--accent)', fontFamily: 'Consolas, monospace',
        }}>
          {CLASS_LABEL[graphic.classid] ?? graphic.className}
        </span>
      </div>

      <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%', marginBottom: 16 }}>
        <tbody>
          {metaRows.map(([k, v, mono]) => (
            <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '3px 8px 3px 0', color: 'var(--text-dim)', width: 120, whiteSpace: 'nowrap' }}>{k}</td>
              <td style={{ padding: '3px 0', wordBreak: 'break-all', fontFamily: mono ? 'Consolas, monospace' : undefined, fontSize: mono ? 10 : 12 }}>
                {k === 'Binding object' && onSelectObject ? (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 10, padding: '1px 6px', fontFamily: 'Consolas, monospace' }}
                    onClick={() => onSelectObject(v)}
                  >
                    {v}
                  </button>
                ) : v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)' }}>BOUND POINTS</div>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {bindings.length.toLocaleString()} binding{bindings.length === 1 ? '' : 's'}
        </span>
        {bindings.length > 0 && (
          <input
            type="text"
            placeholder="Filter…"
            value={bindingSearch}
            onChange={e => setBindingSearch(e.target.value)}
            style={{ marginLeft: 'auto', minWidth: 180 }}
          />
        )}
        {bindingSearch && (
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setBindingSearch('')}>
            Clear
          </button>
        )}
      </div>

      {bindings.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
          No binding data — the binding file may not have been loaded (server-side parse required), or this graphic has no point references.
        </div>
      ) : filteredBindings.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No bindings match the current filter.</div>
      ) : (
        <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Target</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', width: 140 }}>Binding type</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', width: 120 }}>SVG element</th>
            </tr>
          </thead>
          <tbody>
            {filteredBindings.map((hit, i) => {
              const targetExists = objectMap.has(hit.target);
              const svgElement = hit.referringPath?.split('/').pop() ?? '';
              return (
                <tr
                  key={i}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: onSelectObject && targetExists ? 'pointer' : 'default',
                  }}
                  onClick={() => { if (onSelectObject && targetExists) onSelectObject(hit.target); }}
                  onMouseEnter={e => { if (onSelectObject && targetExists) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <td style={{ padding: '4px 8px 4px 0', wordBreak: 'break-all' }}>
                    <span style={{
                      fontFamily: 'Consolas, monospace', fontSize: 10,
                      color: targetExists ? 'var(--accent)' : 'var(--text-dim)',
                    }}>
                      {hit.target}
                    </span>
                    {!targetExists && (
                      <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 5 }}>(unresolved)</span>
                    )}
                  </td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-dim)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {hit.referringAttr}
                  </td>
                  <td style={{ padding: '4px 8px', fontFamily: 'Consolas, monospace', fontSize: 10, color: 'var(--text-dim)' }}>
                    {svgElement}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GraphicsBrowser({
  objects,
  references,
  referenceIndex,
  onSelectObject,
}: {
  objects: AnyObject[];
  references: ReferenceHit[];
  referenceIndex: ReferenceIndex;
  onSelectObject?: (ref: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const objectMap = useMemo(() => new Map(objects.map(o => [o.ref, o])), [objects]);

  const graphicRefSet = useMemo(() => {
    const s = new Set<string>();
    for (const o of objects) { if (GRAPHIC_CLASS_IDS.has(o.classid)) s.add(o.ref); }
    return s;
  }, [objects]);

  // Outgoing refs emitted by graphic/binding objects
  const outgoingMap = useMemo(() => {
    const map = new Map<string, ReferenceHit[]>();
    for (const hit of references) {
      if (!graphicRefSet.has(hit.referringItem)) continue;
      const list = map.get(hit.referringItem);
      if (list) list.push(hit);
      else map.set(hit.referringItem, [hit]);
    }
    return map;
  }, [references, graphicRefSet]);

  // Pair each class-844/717 graphic with its class-357 .bindings child
  const graphicEntries = useMemo((): GraphicEntry[] => {
    const graphics = objects.filter(o => o.classid === 844 || o.classid === 717);
    return graphics
      .map(g => ({
        graphic: g,
        bindingChild: objectMap.get(`${g.ref}.bindings`) ?? null,
      }))
      .sort((a, b) => displayName(a.graphic).localeCompare(displayName(b.graphic)));
  }, [objects, objectMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return graphicEntries;
    return graphicEntries.filter(
      ({ graphic }) =>
        displayName(graphic).toLowerCase().includes(q) ||
        graphic.ref.toLowerCase().includes(q),
    );
  }, [graphicEntries, search]);

  const selectedEntry = useMemo(
    () => (selected ? graphicEntries.find(e => e.graphic.ref === selected) ?? null : null),
    [selected, graphicEntries],
  );

  const selectedBindings = useMemo(() => {
    if (!selectedEntry) return [];
    const bindRef = selectedEntry.bindingChild?.ref;
    if (bindRef) return outgoingMap.get(bindRef) ?? [];
    return outgoingMap.get(selectedEntry.graphic.ref) ?? [];
  }, [selectedEntry, outgoingMap]);

  if (graphicEntries.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Graphics</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>No graphic objects in this archive</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', maxWidth: 360 }}>
            <div style={{ marginBottom: 6 }}>No Facility Graphic or Graphic objects (class 844, 717)</div>
            <div style={{ fontSize: 11 }}>
              Only .dbexport archives exported from Metasys with graphics content will have entries here.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Graphics</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {graphicEntries.length.toLocaleString()} graphic{graphicEntries.length === 1 ? '' : 's'}
        </span>
        <input
          type="text"
          placeholder="Filter graphics…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: 'auto', minWidth: 220 }}
        />
        {search && (
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setSearch('')}>
            Clear
          </button>
        )}
      </div>

      {/* Two-panel body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', overflow: 'hidden', minHeight: 0 }}>

        {/* Left — graphic list */}
        <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--sidebar-bg)' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 18, color: 'var(--text-dim)', fontSize: 12 }}>No graphics match.</div>
          ) : filtered.map(({ graphic, bindingChild }) => {
            const isSelected = graphic.ref === selected;
            const bindingRef = bindingChild?.ref ?? graphic.ref;
            const bindingCount = outgoingMap.get(bindingRef)?.length ?? 0;
            const incomingCount = referenceIndex.counts.get(graphic.ref) ?? 0;
            return (
              <div
                key={graphic.ref}
                onClick={() => setSelected(isSelected ? null : graphic.ref)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: isSelected ? 'rgba(100,160,255,0.10)' : 'transparent',
                  borderLeft: `3px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={{
                    fontWeight: 600, fontSize: 12, flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {displayName(graphic)}
                  </span>
                  {bindingCount > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'Consolas, monospace', flexShrink: 0 }}>
                      {bindingCount} pts
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {CLASS_LABEL[graphic.classid] ?? graphic.className}
                  {incomingCount > 0 && (
                    <span style={{ marginLeft: 8 }}>{incomingCount} incoming</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right — detail */}
        <div style={{ overflowY: 'auto' }}>
          {selectedEntry ? (
            <GraphicDetail
              entry={selectedEntry}
              bindings={selectedBindings}
              objectMap={objectMap}
              onSelectObject={onSelectObject}
            />
          ) : (
            <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>
              Select a graphic from the list to inspect its bindings and bound points.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
