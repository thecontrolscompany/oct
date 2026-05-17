import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CafObject, DbexportObject, ReferenceHit } from '../api';
import type { ReferenceIndex } from '@oct/shared';
import type { GraphicResolver } from '../archiveParser';
import TreeGlyph from './TreeGlyph';

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

interface GraphicTreeNode {
  key: string;
  label: string;
  ref: string | null;
  classid: number | null;
  className: string;
  graphic: AnyObject | null;
  children: GraphicTreeNode[];
}

function parseGraphicRef(ref: string): { engine: string; segments: string[] } {
  const colonIdx = ref.indexOf(':');
  const after = colonIdx >= 0 ? ref.slice(colonIdx + 1) : ref;
  const slashIdx = after.indexOf('/');
  if (slashIdx < 0) return { engine: after, segments: [] };
  return { engine: after.slice(0, slashIdx), segments: after.slice(slashIdx + 1).split('.').filter(Boolean) };
}

function categorizeGraphicSegment(seg: string): { label: string; kind: string } {
  if (seg === 'Graphics') return { label: 'Graphics', kind: 'graphics' };
  if (seg === '$FacilityGraphics') return { label: 'Facility Graphics', kind: 'graphics' };
  if (/^\d+$/i.test(seg)) return { label: `Group ${seg}`, kind: 'group' };
  if (/^\d{8}-\d{6}-[\w]+$/i.test(seg)) return { label: seg, kind: 'graphic' };
  return { label: seg, kind: 'group' };
}

function buildGraphicHierarchy(objects: AnyObject[]): GraphicTreeNode[] {
  const roots = new Map<string, GraphicTreeNode>();

  for (const obj of objects) {
    if (!GRAPHIC_CLASS_IDS.has(obj.classid)) continue;
    const { engine, segments } = parseGraphicRef(obj.ref);
    if (!engine) continue;

    let node = roots.get(engine);
    if (!node) {
      node = {
        key: engine,
        label: engine,
        ref: null,
        classid: null,
        className: 'Engine',
        graphic: null,
        children: [],
      };
      roots.set(engine, node);
    }

    if (segments.length === 0) {
      node.graphic = obj;
      node.ref = obj.ref;
      node.classid = obj.classid;
      node.className = obj.className;
      continue;
    }

    let current = node;
    let keyPath = engine;
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      keyPath = `${keyPath}#${seg}`;
      let child = current.children.find(entry => entry.key === keyPath);
      if (!child) {
        const cat = i === 0 ? categorizeGraphicSegment(seg) : null;
        child = {
          key: keyPath,
          label: cat?.label ?? seg,
          ref: null,
          classid: null,
          className: cat?.kind ?? 'group',
          graphic: null,
          children: [],
        };
        current.children.push(child);
      }
      current = child;
      if (i === segments.length - 1) {
        current.graphic = obj;
        current.ref = obj.ref;
        current.classid = obj.classid;
        current.className = obj.className;
        if (/^\d+$/i.test(current.label) || /^\d{8}-\d{6}-[\w]+$/i.test(current.label)) {
          current.label = displayName(obj);
        }
      }
    }
  }

  const sortNodes = (nodes: GraphicTreeNode[]): GraphicTreeNode[] =>
    nodes
      .sort((a, b) => {
        const aWeight = a.graphic ? 2 : a.children.length > 0 ? 1 : 0;
        const bWeight = b.graphic ? 2 : b.children.length > 0 ? 1 : 0;
        if (aWeight !== bWeight) return aWeight - bWeight;
        return a.label.localeCompare(b.label, undefined, { numeric: true });
      })
      .map(node => ({
        ...node,
        children: sortNodes(node.children),
      }));

  return sortNodes([...roots.values()]);
}

function graphicTreeMatches(node: GraphicTreeNode, query: string): boolean {
  if (!query) return true;
  if ([node.label, node.ref ?? '', node.className].some(v => v.toLowerCase().includes(query))) return true;
  return node.children.some(child => graphicTreeMatches(child, query));
}

function graphicTreeKind(node: GraphicTreeNode): 'engine' | 'folder' | 'point' {
  if (node.graphic) return 'point';
  if (node.children.length > 0) return node.className === 'Engine' ? 'engine' : 'folder';
  return 'folder';
}

function GraphicTreeRow({
  node,
  depth,
  selectedKey,
  expanded,
  onSelect,
  onToggle,
  query,
  referenceIndex,
}: {
  node: GraphicTreeNode;
  depth: number;
  selectedKey: string | null;
  expanded: Set<string>;
  onSelect: (node: GraphicTreeNode) => void;
  onToggle: (key: string) => void;
  query: string;
  referenceIndex: ReferenceIndex;
}) {
  const isSelected = selectedKey === node.ref;
  const hasMatches = query ? graphicTreeMatches(node, query) : true;
  const visibleChildren = query ? node.children.filter(child => graphicTreeMatches(child, query)) : node.children;
  const isOpen = expanded.has(node.key) || (query ? visibleChildren.length > 0 : false);
  const kind = graphicTreeKind(node);
  const incomingCount = node.ref ? (referenceIndex.counts.get(node.ref) ?? 0) : 0;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: `5px 10px 5px ${12 + depth * 14}px`,
          cursor: 'pointer',
          background: isSelected ? 'rgba(67,120,181,0.14)' : 'transparent',
          borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
          borderBottom: '1px solid rgba(175,199,226,0.3)',
          opacity: hasMatches ? 1 : 0.45,
        }}
        onClick={() => { if (node.ref) onSelect(node); if (node.children.length) onToggle(node.key); }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <span style={{ width: 12, fontSize: 10, flexShrink: 0, textAlign: 'center', color: 'var(--text-dim)' }}>
          {node.children.length ? (isOpen ? '▾' : '▸') : ''}
        </span>
        <TreeGlyph kind={kind} active={isSelected} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.label}
        </span>
        {node.graphic && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(175,199,226,0.65)', borderRadius: 999, padding: '1px 6px' }}>
            {CLASS_LABEL[node.classid ?? 0] ?? 'graphic'}
          </span>
        )}
        {incomingCount > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(175,199,226,0.65)', borderRadius: 999, padding: '1px 6px' }}>
            {incomingCount} in
          </span>
        )}
      </div>
      {isOpen && visibleChildren.map(child => (
        <GraphicTreeRow
          key={child.key}
          node={child}
          depth={depth + 1}
          selectedKey={selectedKey}
          expanded={expanded}
          onSelect={onSelect}
          onToggle={onToggle}
          query={query}
          referenceIndex={referenceIndex}
        />
      ))}
    </div>
  );
}

// ─── SVG utilities ────────────────────────────────────────────────────────────

function sanitizeSvg(raw: string): string {
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
}

function getSvgDimensions(svgContent: string): { width: number; height: number } {
  const vbMatch = svgContent.match(/viewBox\s*=\s*["']\s*[\d.]*\s+[\d.]*\s+([\d.]+)\s+([\d.]+)\s*["']/);
  if (vbMatch) return { width: parseFloat(vbMatch[1]), height: parseFloat(vbMatch[2]) };
  const wMatch = svgContent.match(/\bwidth\s*=\s*["']([\d.]+)["']/);
  const hMatch = svgContent.match(/\bheight\s*=\s*["']([\d.]+)["']/);
  if (wMatch && hMatch) return { width: parseFloat(wMatch[1]), height: parseFloat(hMatch[2]) };
  return { width: 1920, height: 1080 };
}

// ─── Graphic viewer ───────────────────────────────────────────────────────────

export function GraphicViewer({
  graphic,
  bindings,
  graphicResolver,
  objectMap,
  onSelectObject,
}: {
  graphic: AnyObject;
  bindings: ReferenceHit[];
  graphicResolver?: GraphicResolver;
  objectMap: Map<string, AnyObject>;
  onSelectObject?: (ref: string) => void;
}) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [bindingsOpen, setBindingsOpen] = useState(false);
  const [bindingSearch, setBindingSearch] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const boundTargetMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const hit of bindings) {
      const id = hit.referringPath?.split('/').pop()?.trim();
      if (!id) continue;
      const list = map.get(id);
      if (list) list.push(hit.target);
      else map.set(id, [hit.target]);
    }
    return map;
  }, [bindings]);

  const svgFilename = getBindingFileName(graphic);

  // Load SVG when graphic or resolver changes
  useEffect(() => {
    setSvgContent(null);
    setLoadError(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });

    if (!svgFilename) return;
    if (!graphicResolver) return;

    let cancelled = false;
    setLoading(true);
    graphicResolver.resolve(svgFilename)
      .then(content => {
        if (cancelled) return;
        if (!content) { setLoadError('Graphic file not found in archive.'); return; }
        setSvgContent(sanitizeSvg(content));
      })
      .catch(err => {
        if (!cancelled) setLoadError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [svgFilename, graphicResolver]);

  // Fit-to-screen after SVG appears in DOM
  useLayoutEffect(() => {
    if (!svgContent || !containerRef.current) return;
    const dims = getSvgDimensions(svgContent);
    const cW = containerRef.current.clientWidth;
    const cH = containerRef.current.clientHeight;
    if (cW <= 0 || cH <= 0) return;
    const fitZ = Math.min(cW / dims.width, cH / dims.height) * 0.95;
    setZoom(fitZ);
    setPan({ x: (cW - dims.width * fitZ) / 2, y: (cH - dims.height * fitZ) / 2 });
  }, [svgContent]);

  // Highlight bound SVG elements
  useEffect(() => {
    if (!svgContainerRef.current || !svgContent) return;
    const container = svgContainerRef.current;

    // Collect all SVG element IDs from binding referringPaths
    const boundIds = new Set<string>();
    for (const hit of bindings) {
      const seg = hit.referringPath?.split('/').pop() ?? '';
      if (seg) boundIds.add(seg);
    }
    if (boundIds.size === 0) return;

    // Inject a style tag for the highlight if not already present
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;
    let styleTag = svgEl.querySelector('#oct-bound-style') as SVGStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElementNS('http://www.w3.org/2000/svg', 'style') as SVGStyleElement;
      styleTag.id = 'oct-bound-style';
      styleTag.textContent = '.oct-bound { filter: drop-shadow(0 0 5px rgba(255,140,0,0.9)) !important; cursor: pointer; }';
      svgEl.prepend(styleTag);
    }

    // Apply highlight class
    for (const id of boundIds) {
      try {
        const el = container.querySelector(`#${CSS.escape(id)}`);
        if (el) {
          el.classList.add('oct-bound');
          const targets = boundTargetMap.get(id);
          if (targets && targets.length > 0) {
            el.setAttribute('data-oct-bound-target', targets.join('|'));
          }
        }
      } catch {
        // Malformed ID — skip
      }
    }
  }, [svgContent, bindings, boundTargetMap]);

  // ─── Interaction handlers ─────────────────────────────────────────────────

  const getFitState = () => {
    if (!containerRef.current) return { zoom: 1, pan: { x: 0, y: 0 } };
    const dims = svgContent ? getSvgDimensions(svgContent) : { width: 1920, height: 1080 };
    const cW = containerRef.current.clientWidth;
    const cH = containerRef.current.clientHeight;
    const fitZ = Math.min(cW / dims.width, cH / dims.height) * 0.95;
    return { zoom: fitZ, pan: { x: (cW - dims.width * fitZ) / 2, y: (cH - dims.height * fitZ) / 2 } };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as Element | null;
    if (target?.closest?.('[data-oct-bound-target]')) return;
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  };
  const handleMouseUp = () => { isDragging.current = false; };

  const handleGraphicClick = (e: React.MouseEvent) => {
    const target = e.target as Element | null;
    const boundEl = target?.closest?.('[data-oct-bound-target]') as HTMLElement | null;
    if (!boundEl) return;
    const hitTarget = boundEl.dataset.octBoundTarget?.split('|')[0]?.trim();
    if (!hitTarget) return;
    if (!onSelectObject || !objectMap.has(hitTarget)) return;
    e.stopPropagation();
    onSelectObject(hitTarget);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.05, Math.min(zoom * factor, 12));
    const ratio = newZoom / zoom;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setPan(p => ({ x: mx - (mx - p.x) * ratio, y: my - (my - p.y) * ratio }));
    setZoom(newZoom);
  };

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

  // ─── Fallback states ──────────────────────────────────────────────────────

  if (!svgFilename) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>{displayName(graphic)}</div>
          <div>No graphic file associated with this object (property 902 not found).</div>
        </div>
      </div>
    );
  }

  // Class 717 "Graphic" objects use legacy XAML/Silverlight format (.xaml files)
  // which cannot be rendered in a browser. Only class 844 Facility Graphics (.json SVG) render.
  if (svgFilename.toLowerCase().endsWith('.xaml')) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>{displayName(graphic)}</div>
          <div style={{ marginBottom: 4 }}>Legacy Silverlight graphic — cannot render in browser.</div>
          <div style={{ fontSize: 11, fontFamily: 'Consolas, monospace' }}>{svgFilename}</div>
        </div>
      </div>
    );
  }

  if (!graphicResolver) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>{displayName(graphic)}</div>
          <div style={{ marginBottom: 10 }}>Graphic rendering requires a live archive session.</div>
          <div style={{ fontSize: 11 }}>
            Drop the .dbexport file again to render graphics, or open via the online viewer.<br />
            <span style={{ fontFamily: 'Consolas, monospace' }}>{svgFilename}</span>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
        Loading {svgFilename}…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <div style={{ color: 'var(--error, #e55)', fontWeight: 600, marginBottom: 6 }}>Failed to load graphic</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'Consolas, monospace' }}>{svgFilename}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>{loadError}</div>
        </div>
      </div>
    );
  }

  if (!svgContent) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Viewer toolbar */}
      <div style={{
        padding: '4px 10px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
        background: 'var(--sidebar-bg)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName(graphic)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'Consolas, monospace' }}>
          {svgFilename}
        </span>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
          <button
            className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 7px' }}
            onClick={() => { const f = getFitState(); setZoom(f.zoom); setPan(f.pan); }}
          >
            Fit
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => setZoom(z => Math.min(z * 1.4, 12))}>+</button>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', minWidth: 38, textAlign: 'center', fontFamily: 'Consolas, monospace' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => setZoom(z => Math.max(z / 1.4, 0.05))}>−</button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>1:1</button>
        </div>
      </div>

      {/* SVG viewport */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          cursor: isDragging.current ? 'grabbing' : 'grab',
          background: '#f4f4f4',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          ref={svgContainerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            userSelect: 'none',
            pointerEvents: 'auto',
          }}
          onClick={handleGraphicClick}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>

      {/* Collapsible bindings panel */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)' }}>
        <button
          style={{
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 12px', background: 'var(--sidebar-bg)', border: 'none', cursor: 'pointer',
            color: 'var(--text)', fontSize: 11, fontWeight: 600,
          }}
          onClick={() => setBindingsOpen(o => !o)}
        >
          <span>BOUND POINTS</span>
          <span style={{ color: 'var(--accent)', fontFamily: 'Consolas, monospace' }}>
            {bindings.length} {bindingsOpen ? '▲' : '▼'}
          </span>
        </button>

        {bindingsOpen && (
          <div style={{ maxHeight: 220, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {bindings.length > 0 && (
              <div style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Filter bindings…"
                  value={bindingSearch}
                  onChange={e => setBindingSearch(e.target.value)}
                  style={{ flex: 1, fontSize: 11 }}
                  onClick={e => e.stopPropagation()}
                />
                {bindingSearch && (
                  <button className="btn btn-ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setBindingSearch('')}>
                    Clear
                  </button>
                )}
              </div>
            )}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {bindings.length === 0 ? (
                <div style={{ padding: '10px 12px', color: 'var(--text-dim)', fontSize: 12 }}>
                  No binding data. The binding file may not have been parsed (server-side parse or re-upload required).
                </div>
              ) : filteredBindings.length === 0 ? (
                <div style={{ padding: '10px 12px', color: 'var(--text-dim)', fontSize: 12 }}>
                  No bindings match.
                </div>
              ) : (
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--sidebar-bg)' }}>
                    <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Target</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', width: 110 }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', width: 120 }}>Element</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBindings.map((hit, i) => {
                      const exists = objectMap.has(hit.target);
                      const svgElement = hit.referringPath?.split('/').pop() ?? '';
                      return (
                        <tr
                          key={i}
                          style={{ borderBottom: '1px solid var(--border)', cursor: onSelectObject && exists ? 'pointer' : 'default' }}
                          onClick={() => { if (onSelectObject && exists) onSelectObject(hit.target); }}
                          onMouseEnter={e => { if (onSelectObject && exists) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '3px 8px 3px 0', wordBreak: 'break-all' }}>
                            <span style={{ fontFamily: 'Consolas, monospace', color: exists ? 'var(--accent)' : 'var(--text-dim)' }}>
                              {hit.target}
                            </span>
                            {!exists && <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>(unresolved)</span>}
                          </td>
                          <td style={{ padding: '3px 8px', color: 'var(--text-dim)' }}>{hit.referringAttr}</td>
                          <td style={{ padding: '3px 8px', fontFamily: 'Consolas, monospace', color: 'var(--text-dim)' }}>{svgElement}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main browser component ───────────────────────────────────────────────────

interface GraphicEntry {
  graphic: AnyObject;
  bindingChild: AnyObject | null;
}

export default function GraphicsBrowser({
  objects,
  references,
  referenceIndex,
  onSelectObject,
  graphicResolver,
}: {
  objects: AnyObject[];
  references: ReferenceHit[];
  referenceIndex: ReferenceIndex;
  onSelectObject?: (ref: string) => void;
  graphicResolver?: GraphicResolver;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set());

  const objectMap = useMemo(() => new Map(objects.map(o => [o.ref, o])), [objects]);

  const graphicTreeRoots = useMemo(() => buildGraphicHierarchy(objects), [objects]);

  const outgoingMap = useMemo(() => {
    const map = new Map<string, ReferenceHit[]>();
    for (const hit of references) {
      if (!GRAPHIC_CLASS_IDS.has(objectMap.get(hit.referringItem)?.classid ?? -1)) continue;
      const list = map.get(hit.referringItem);
      if (list) list.push(hit);
      else map.set(hit.referringItem, [hit]);
    }
    return map;
  }, [references, objectMap]);

  const graphicEntries = useMemo((): GraphicEntry[] => {
    const graphics = objects.filter(o => o.classid === 844 || o.classid === 717);
    return graphics
      .map(g => ({
        graphic: g,
        bindingChild: objectMap.get(`${g.ref}.bindings`) ?? null,
      }))
      .sort((a, b) => displayName(a.graphic).localeCompare(displayName(b.graphic)));
  }, [objects, objectMap]);

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

  const filteredTreeRoots = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return graphicTreeRoots;
    return graphicTreeRoots.filter(node => graphicTreeMatches(node, q));
  }, [graphicTreeRoots, search]);

  useEffect(() => {
    setTreeExpanded(prev => {
      if (search.trim()) {
        const next = new Set(prev);
        const walk = (nodes: GraphicTreeNode[]) => {
          for (const node of nodes) {
            if (graphicTreeMatches(node, search.trim().toLowerCase())) {
              next.add(node.key);
            }
            walk(node.children);
          }
        };
        walk(graphicTreeRoots);
        return next;
      }
      return prev;
    });
  }, [graphicTreeRoots, search]);

  useEffect(() => {
    if (selected) return;
    const firstGraphic = graphicEntries[0] ?? null;
    if (firstGraphic) setSelected(firstGraphic.graphic.ref);
  }, [graphicEntries, selected]);

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
        {!graphicResolver && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>
            Re-upload to render
          </span>
        )}
        <input
          type="text"
          placeholder="Filter tree…"
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

        {/* Left — navigation tree */}
        <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--sidebar-bg)' }}>
          {filteredTreeRoots.length === 0 ? (
            <div style={{ padding: 18, color: 'var(--text-dim)', fontSize: 12 }}>No graphics match.</div>
          ) : (
            filteredTreeRoots.map(node => (
              <GraphicTreeRow
                key={node.key}
                node={node}
                depth={0}
                selectedKey={selected}
                expanded={treeExpanded}
                onSelect={item => {
                  if (item.ref) setSelected(item.ref);
                }}
                onToggle={key => {
                  setTreeExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
                query={search.trim().toLowerCase()}
                referenceIndex={referenceIndex}
              />
            ))
          )}
        </div>

        {/* Right — viewer */}
        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {selectedEntry ? (
            <GraphicViewer
              graphic={selectedEntry.graphic}
              bindings={selectedBindings}
              graphicResolver={graphicResolver}
              objectMap={objectMap}
              onSelectObject={onSelectObject}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13, padding: 24, textAlign: 'center' }}>
              <div>
                <div style={{ marginBottom: 6 }}>Select a graphic from the list.</div>
                <div style={{ fontSize: 11 }}>
                  {graphicResolver
                    ? 'Graphics will render inline. Bound points are highlighted in orange.'
                    : 'Re-upload or open via the online viewer to render graphics.'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
