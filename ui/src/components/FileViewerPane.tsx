import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { api } from '../api';
import type { CafObject, DbexportObject, NavNode, ParsedCaf, ParsedDbexport, ReferenceHit } from '../api';
import { buildReferenceIndex } from '@oct/shared';
import { parseArchiveFile, createResolverFromBytes } from '../archiveParser';
import type { GraphicResolver } from '../archiveParser';
import ArchiveAuditTab from './ArchiveAuditTab';
import { buildArchiveAudit } from './archiveAudit';
import CafWorkspacePane from './CafWorkspacePane';
import GraphicsBrowser, { buildGraphicTagMap, GRAPHIC_CLASS_IDS } from './GraphicsBrowser';
import ObjectBrowser from './ObjectBrowser';
import ObjectPropertiesTable from './ObjectPropertiesTable';
import TreeGlyph from './TreeGlyph';
import {
  DEVICE_TABS, GROUP_TABS,
  type WorkspaceTabId,
  WorkspacePropertiesCard, WorkspaceSection, WorkspaceTabs,
  filterWorkspaceProperties, normalizeArchiveProperties,
} from './ObjectWorkspace';
import { loadStoredArchive, saveStoredArchive, saveStoredArchiveBytes, loadStoredArchiveBytes } from '../archiveStore';

// ─── Shared types ──────────────────────────────────────────────────────────

type LoadedFile = { type: 'caf'; data: ParsedCaf; name: string } | { type: 'dbexport'; data: ParsedDbexport; name: string; graphicResolver?: GraphicResolver };
type ViewMode = 'online' | 'offline';
type AnyObject = CafObject | DbexportObject;
type ViewTab = 'tree' | 'workspace' | 'objects' | 'io' | 'graphics' | 'refs' | 'audit' | 'diff' | 'export';

interface ArchiveSummary {
  objectCount: number;
  referenceCount: number;
  classCount: number;
  engineCount: number;
  scheduleCount: number;
  graphicsCount: number;
  programmingCount: number;
}

const HW_IO_CLASSES = new Set([239, 240, 241, 242, 243, 671, 672, 673, 674]);
const BACNET_OBJ_CLASSES = new Set([163, 164, 165, 166, 167, 168, 141]);

function getObjects(f: LoadedFile): AnyObject[] {
  return f.type === 'caf' ? f.data.objects : f.data.objects;
}

function displayName(o: AnyObject): string {
  return o.tag || o.description || `${o.className} #${o.objectid}`;
}

function getRef(o: AnyObject): string { return o.ref; }

function getPointLabel(o: AnyObject): string {
  return o.tag || o.description || o.ref.split(/[/\\]/).pop() || o.ref;
}

function isDbexportSection(ref: string, needle: string): boolean {
  return new RegExp(`(?:^|[/.])${needle}(?:[/.]|$)`, 'i').test(ref);
}

function summarizeArchive(file: LoadedFile): ArchiveSummary {
  const objects = getObjects(file);
  const classCount = new Set(objects.map(o => o.classid)).size;
  const engineCount = file.type === 'dbexport' ? file.data.engines.length : 0;
  const scheduleCount = objects.filter(o => isDbexportSection(o.ref, 'Schedule')).length;
  const graphicsCount = objects.filter(o => isDbexportSection(o.ref, 'Graphics')).length;
  const programmingCount = objects.filter(o => isDbexportSection(o.ref, 'Programming')).length;
  return {
    objectCount: objects.length,
    referenceCount: file.data.references.length,
    classCount,
    engineCount,
    scheduleCount,
    graphicsCount,
    programmingCount,
  };
}

function exportCsvRow(values: Array<string | number | null | undefined>): string {
  return values.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',');
}

function normalizeTreeQuery(value: string): string {
  return value.trim().toLowerCase();
}

function cafNodeMatches(obj: CafObject, query: string): boolean {
  if (!query) return true;
  return [obj.className, obj.tag, obj.description, obj.ref, obj.units ?? '']
    .some(value => value.toLowerCase().includes(query));
}

function cafNodeHasMatch(obj: CafObject, query: string, childMap: Map<string | null, CafObject[]>): boolean {
  if (!query || cafNodeMatches(obj, query)) return true;
  return (childMap.get(obj.ref) ?? []).some(child => cafNodeHasMatch(child, query, childMap));
}

function findNavNode(root: NavNode | null, ref: string): NavNode | null {
  if (!root) return null;
  if (root.reference === ref) return root;
  for (const child of root.children) {
    const found = findNavNode(child, ref);
    if (found) return found;
  }
  return null;
}

interface TreeChildRow {
  ref: string;
  label: string;
  classid: number;
  className: string;
  units: string | null;
  incomingCount: number;
}

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

function CafTreeNode({ obj, childMap, depth, selected, onSelect, expanded, onToggle, query }: {
  obj: CafObject;
  childMap: Map<string | null, CafObject[]>;
  depth: number;
  selected: string | null;
  onSelect: (r: string) => void;
  expanded: Set<string>;
  onToggle: (r: string) => void;
  query: string;
}) {
  const children = childMap.get(obj.ref) ?? [];
  const visibleChildren = query ? children.filter(child => cafNodeHasMatch(child, query, childMap)) : children;
  const isSelected = selected === obj.ref;
  const isMatch = cafNodeMatches(obj, query);
  const hasDescendantMatch = query ? children.some(child => cafNodeHasMatch(child, query, childMap)) : false;
  const isOpen = expanded.has(obj.ref) || (query ? (isMatch || hasDescendantMatch) : false);
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: `4px 10px 4px ${8 + depth * 14}px`,
          cursor: 'pointer',
          background: isSelected ? 'var(--accent)' : 'transparent',
          color: isSelected ? '#fff' : 'var(--text)',
          borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        }}
        onClick={() => { onSelect(obj.ref); if (children.length) onToggle(obj.ref); }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <span style={{ width: 14, fontSize: 10, color: isSelected ? '#fff' : 'var(--text-dim)', flexShrink: 0 }}>
          {children.length ? (isOpen ? '▾' : '▸') : ''}
        </span>
        <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, flexShrink: 0, fontFamily: 'Consolas,monospace', color: isSelected ? '#fff' : 'var(--accent)', background: isSelected ? 'rgba(255,255,255,0.15)' : 'var(--bg)', border: `1px solid ${isSelected ? 'rgba(255,255,255,0.3)' : 'var(--border)'}` }}>
          {obj.className}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: isMatch ? 1 : 0.92 }}>
          {displayName(obj)}
        </span>
        {obj.units && <span style={{ fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-dim)', flexShrink: 0 }}>[{obj.units}]</span>}
        {children.length > 0 && (
          <span style={{ marginLeft: 4, fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--text-dim)', flexShrink: 0 }}>
            {visibleChildren.length}
          </span>
        )}
      </div>
      {isOpen && visibleChildren.map(c => (
        <CafTreeNode key={c.ref} obj={c} childMap={childMap} depth={depth + 1} selected={selected} onSelect={onSelect} expanded={expanded} onToggle={onToggle} query={query} />
      ))}
    </div>
  );
}

// ─── Dbexport ref-based hierarchy tree ────────────────────────────────────────
// Builds a deep tree from object refs (ADS-1:NAE/FC-1.AHU-1.zone_temp) so the
// user can drill all the way down to individual points — not limited to the
// shallow navtree.xml structure.

interface DbexportTreeNode {
  key: string;
  label: string;
  ref: string | null;
  classid: number;
  className: string;
  children: DbexportTreeNode[];
}

interface HierNode {
  label: string;
  kind: string;
  classid: number | string;
  obj: AnyObject | null;
  children: Map<string, HierNode>;
  totalCount: number;
  key: string;
  _labelFromDescription?: boolean;
}

function parseDbexportRef(ref: string): { engine: string; segments: string[] } {
  const colonIdx = ref.indexOf(':');
  const after = colonIdx >= 0 ? ref.slice(colonIdx + 1) : ref;
  const slashIdx = after.indexOf('/');
  if (slashIdx < 0) return { engine: after, segments: [] };
  return { engine: after.slice(0, slashIdx), segments: after.slice(slashIdx + 1).split('.').filter(Boolean) };
}

function categorizeDbexportSegment(seg: string): { label: string; kind: string } {
  if (/^FC-\d+$/i.test(seg)) return { label: `Field Bus ${seg}`, kind: 'fieldbus' };
  if (/^FCB$/i.test(seg)) return { label: 'Field Bus (FCB)', kind: 'fieldbus' };
  if (/^Field\s*Bus/i.test(seg)) return { label: seg, kind: 'fieldbus' };
  if (/^N2(\s|-)/i.test(seg)) return { label: seg, kind: 'n2trunk' };
  if (/^BACnet\s*Trunk/i.test(seg)) return { label: seg, kind: 'bacnettrunk' };
  if (seg === 'Programming') return { label: 'Programming', kind: 'programming' };
  if (seg === 'System Programs') return { label: 'System Programs', kind: 'sysprograms' };
  if (seg === 'Schedule') return { label: 'Schedules', kind: 'schedules' };
  if (seg === 'Graphics') return { label: 'Graphics', kind: 'graphics' };
  if (seg.startsWith('$site')) return { label: 'Site Configuration', kind: 'site' };
  if (seg.startsWith('$Generic')) return { label: 'Generic Archive', kind: 'generic' };
  return { label: seg, kind: 'category' };
}

function buildDbexportHierarchy(objects: AnyObject[]): Map<string, HierNode> {
  const engines = new Map<string, HierNode>();
  for (const obj of objects) {
    const { engine: engineName, segments } = parseDbexportRef(obj.ref);
    if (!engineName) continue;
    let engine = engines.get(engineName);
    if (!engine) {
      engine = { label: engineName, kind: 'engine', classid: '', obj: null, children: new Map(), totalCount: 0, key: engineName };
      engines.set(engineName, engine);
    }
    if (segments.length === 0) { engine.classid = obj.classid; engine.obj = obj; continue; }
    let node = engine;
    let keyPath = engineName;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      keyPath = `${keyPath}#${seg}`;
      if (!node.children.has(seg)) {
        let label = seg;
        let kind = i === segments.length - 1 ? 'point' : 'equipment';
        if (i === 0) { const cat = categorizeDbexportSegment(seg); label = cat.label; kind = cat.kind; }
        node.children.set(seg, { label, kind, classid: '', obj: null, children: new Map(), totalCount: 0, key: keyPath });
      }
      node = node.children.get(seg)!;
      if (i === segments.length - 1) { node.classid = obj.classid; node.obj = obj; }
    }
  }
  const computeCounts = (n: HierNode): number => {
    let count = n.obj ? 1 : 0;
    for (const child of n.children.values()) count += computeCounts(child);
    n.totalCount = count;
    if (n.obj && !n._labelFromDescription && /^\d+([_\-.]\d+)?$/.test(n.label)) {
      const desc = n.obj.description || n.obj.tag;
      if (desc) { n.label = desc; n._labelFromDescription = true; }
    }
    return count;
  };
  for (const e of engines.values()) computeCounts(e);
  return engines;
}

function hierToTreeNode(node: HierNode): DbexportTreeNode {
  return {
    key: node.key,
    label: node.label,
    ref: node.obj?.ref ?? null,
    classid: typeof node.classid === 'number' ? node.classid : 0,
    className: node.obj?.className ?? (node.kind === 'engine' ? 'Engine' : node.kind),
    children: [...node.children.values()]
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
      .map(hierToTreeNode),
  };
}

function buildDbexportTreeRoots(objects: AnyObject[]): DbexportTreeNode[] {
  const hier = buildDbexportHierarchy(objects);
  return [...hier.values()]
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map(hierToTreeNode);
}

function dbexportTreeNodeMatches(node: DbexportTreeNode, query: string): boolean {
  if (!query) return true;
  if ([node.label, node.ref ?? '', node.className].some(v => v.toLowerCase().includes(query))) return true;
  return node.children.some(child => dbexportTreeNodeMatches(child, query));
}

function dbexportGlyphKind(node: DbexportTreeNode): 'engine' | 'bus' | 'folder' | 'equipment' | 'point' {
  if (node.children.length > 0 && node.ref) return 'engine';
  const isBus = /field\s*bus|n2trunk|bacnettrunk|lontrunk|fieldbus/i.test(node.className + node.label);
  if (isBus) return 'bus';
  if (node.children.length > 0) return 'folder';
  if (node.ref) return 'point';
  return 'equipment';
}

function DbexportTreeRow({ node, depth, selectedKey, expanded, onSelect, onToggle, query }: {
  node: DbexportTreeNode;
  depth: number;
  selectedKey: string | null;
  expanded: Set<string>;
  onSelect: (node: DbexportTreeNode) => void;
  onToggle: (key: string) => void;
  query: string;
}) {
  const isSelected = selectedKey === node.key || (!!node.ref && selectedKey === node.ref);
  const visibleChildren = query ? node.children.filter(c => dbexportTreeNodeMatches(c, query)) : node.children;
  const isOpen = expanded.has(node.key) || (query ? dbexportTreeNodeMatches(node, query) && node.children.some(c => dbexportTreeNodeMatches(c, query)) : false);
  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: `5px 10px 5px ${12 + depth * 14}px`,
          cursor: 'pointer',
          background: isSelected ? 'rgba(67,120,181,0.14)' : 'transparent',
          borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
          borderBottom: '1px solid rgba(175,199,226,0.3)',
        }}
        onClick={() => { onSelect(node); if (node.children.length) onToggle(node.key); }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <span style={{ width: 12, fontSize: 10, flexShrink: 0, textAlign: 'center', color: 'var(--text-dim)' }}>
          {node.children.length ? (isOpen ? '▾' : '▸') : ''}
        </span>
        <TreeGlyph kind={dbexportGlyphKind(node)} active={isSelected} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.label}
        </span>
        {visibleChildren.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(175,199,226,0.65)', borderRadius: 999, padding: '1px 6px' }}>
            {visibleChildren.length}
          </span>
        )}
      </div>
      {isOpen && visibleChildren.map(child => (
        <DbexportTreeRow
          key={child.key}
          node={child}
          depth={depth + 1}
          selectedKey={selectedKey}
          expanded={expanded}
          onSelect={onSelect}
          onToggle={onToggle}
          query={query}
        />
      ))}
    </div>
  );
}

// ─── Dbexport detail pane (tabbed workspace, matches OfflineArchivePane) ─────

function inferWorkspaceKind(node: DbexportTreeNode | null, obj: AnyObject | null): 'device' | 'group' {
  if (!node || !obj) return 'group';
  const text = `${node.label} ${node.className}`.toLowerCase();
  if (/folder|tree|engine|view|category|program|graphics|site configuration|generic archive/.test(text)) return 'group';
  return 'device';
}

function DbexportDetailPane({
  node,
  obj,
  incoming,
  children,
  onSelectChild,
  onSelectReference,
  graphicTagMap,
}: {
  node: DbexportTreeNode | null;
  obj: AnyObject | null;
  incoming: ReferenceHit[];
  children: DbexportTreeNode[];
  onSelectChild: (node: DbexportTreeNode) => void;
  onSelectReference: (ref: string) => void;
  graphicTagMap?: Map<string, string>;
}) {
  const workspaceKind = inferWorkspaceKind(node, obj);
  const tabs = workspaceKind === 'device' ? DEVICE_TABS : GROUP_TABS;
  const [tab, setTab] = useState<WorkspaceTabId>(tabs[0].id);

  useEffect(() => { setTab(tabs[0].id); }, [node?.key, tabs]);

  const normalizedProps = useMemo(() => normalizeArchiveProperties(obj?.properties ?? []), [obj]);
  const currentTab = tabs.find(t => t.id === tab) ?? tabs[0];
  const currentProps = useMemo(
    () => filterWorkspaceProperties(normalizedProps, currentTab?.keywords),
    [normalizedProps, currentTab],
  );

  if (!node) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13, padding: 24, textAlign: 'center' }}>
        Select a node in the tree to inspect its details.
      </div>
    );
  }

  const lines: Array<[string, string]> = [['Class', node.className]];
  if (obj) {
    if (obj.tag) lines.push(['Tag', obj.tag]);
    if (obj.description) lines.push(['Description', obj.description]);
    if (obj.units) lines.push(['Units', obj.units]);
    if (obj.defaultValue !== null) lines.push(['Default', String(obj.defaultValue)]);
    if (obj.createdAt) lines.push(['Created', obj.createdAt]);
    if (obj.modifiedAt) lines.push(['Modified', obj.modifiedAt]);
    lines.push(['Ref', obj.ref]);
  } else if (node.ref) {
    lines.push(['Ref', node.ref]);
  }

  const graphicHits = graphicTagMap ? incoming.filter(h => graphicTagMap.has(h.referringItem)) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <WorkspaceTabs tabs={tabs} activeTab={tab} onChange={setTab} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* Device tabs */}
        {workspaceKind === 'device' && (tab === 'configuration' || tab === 'device') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <WorkspaceSection title="Details">
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>{node.label}</div>
              <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {lines.map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '3px 8px 3px 0', color: 'var(--text-dim)', width: 110, whiteSpace: 'nowrap' }}>{k}</td>
                      <td style={{ padding: '3px 0', wordBreak: 'break-all', fontFamily: k === 'Ref' ? 'Consolas,monospace' : undefined, fontSize: k === 'Ref' ? 10 : 12 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </WorkspaceSection>
            {children.length > 0 && (
              <WorkspaceSection title="Contents">
                <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                  <thead><tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Child</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Class</th>
                  </tr></thead>
                  <tbody>
                    {children.map(child => (
                      <tr key={child.key} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={() => onSelectChild(child)}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                        <td style={{ padding: '4px 8px 4px 0', fontWeight: 500 }}>{child.label}</td>
                        <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{child.className}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </WorkspaceSection>
            )}
            {graphicHits.length > 0 && (
              <WorkspaceSection title="Bound to Graphics">
                <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                  <thead><tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Graphic</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Binding type</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>SVG element</th>
                  </tr></thead>
                  <tbody>
                    {graphicHits.slice(0, 20).map((hit, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={() => onSelectReference(hit.referringItem)}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                        <td style={{ padding: '4px 8px 4px 0', fontWeight: 500 }}>{graphicTagMap!.get(hit.referringItem) ?? hit.referringItem}</td>
                        <td style={{ padding: '4px 8px', color: 'var(--text-dim)', fontSize: 11 }}>{hit.referringAttr}</td>
                        <td style={{ padding: '4px 8px', fontFamily: 'Consolas,monospace', fontSize: 10, color: 'var(--text-dim)' }}>{hit.referringPath?.split('/').pop() ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </WorkspaceSection>
            )}
            <WorkspaceSection title="Referenced By">
              {incoming.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No incoming references found in the archive.</div>
              ) : (
                <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                  <thead><tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Referring item</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Attribute</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Source</th>
                  </tr></thead>
                  <tbody>
                    {incoming.slice(0, 20).map(hit => (
                      <tr key={`${hit.target}|${hit.referringItem}|${hit.referringAttr}`}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={() => onSelectReference(hit.referringItem)}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                        <td style={{ padding: '4px 8px 4px 0', wordBreak: 'break-all', fontWeight: 500 }}>{hit.referringItem}</td>
                        <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{hit.referringAttr}</td>
                        <td style={{ padding: '4px 8px', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{hit.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </WorkspaceSection>
            <WorkspacePropertiesCard title="Properties" subtitle={`${currentProps.length} matching`} properties={currentProps} emptyMessage="No matching properties for this item." />
          </div>
        )}
        {workspaceKind === 'device' && !['configuration', 'device', 'all-properties'].includes(tab) && (
          <WorkspacePropertiesCard title={currentTab?.label ?? tab} subtitle={`${currentProps.length} matching`} properties={currentProps} emptyMessage={`No ${currentTab?.label ?? tab} properties matched.`} />
        )}
        {workspaceKind === 'device' && tab === 'all-properties' && (
          <WorkspacePropertiesCard title="All Properties" subtitle={`${normalizedProps.length} total`} properties={normalizedProps} emptyMessage="No properties stored for this item." />
        )}

        {/* Group tabs */}
        {workspaceKind === 'group' && tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <WorkspaceSection title="Details">
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>{node.label}</div>
              <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {lines.map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '3px 8px 3px 0', color: 'var(--text-dim)', width: 110 }}>{k}</td>
                      <td style={{ padding: '3px 0', wordBreak: 'break-all', fontFamily: k === 'Ref' ? 'Consolas,monospace' : undefined, fontSize: k === 'Ref' ? 10 : 12 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </WorkspaceSection>
            <WorkspaceSection title="Summary">
              <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '3px 8px 3px 0', color: 'var(--text-dim)', width: 110 }}>Children</td><td style={{ padding: '3px 0' }}>{children.length.toLocaleString()}</td></tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '3px 8px 3px 0', color: 'var(--text-dim)' }}>References</td><td style={{ padding: '3px 0' }}>{incoming.length.toLocaleString()}</td></tr>
                </tbody>
              </table>
            </WorkspaceSection>
          </div>
        )}
        {workspaceKind === 'group' && tab === 'contents' && (
          <WorkspaceSection title="Contents">
            {children.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No child nodes.</div>
            ) : (
              <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Child</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>Class</th>
                </tr></thead>
                <tbody>
                  {children.map(child => (
                    <tr key={child.key} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => onSelectChild(child)}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      <td style={{ padding: '4px 8px 4px 0', fontWeight: 500 }}>{child.label}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{child.className}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </WorkspaceSection>
        )}
        {workspaceKind === 'group' && tab === 'all-properties' && (
          <WorkspacePropertiesCard title="All Properties" subtitle={`${normalizedProps.length} total`} properties={normalizedProps} emptyMessage="No properties stored for this item." />
        )}
      </div>
    </div>
  );
}

// ─── Object detail ──────────────────────────────────────────────────────────

function ObjectDetail({
  obj,
  incoming,
  children,
  onSelectReference,
  onSelectChild,
  graphicTagMap,
}: {
  obj: AnyObject;
  incoming: ReferenceHit[];
  children: TreeChildRow[];
  onSelectReference?: (ref: string) => void;
  onSelectChild?: (ref: string) => void;
  graphicTagMap?: Map<string, string>;
}) {
  const [childSearch, setChildSearch] = useState('');
  const rows: [string, string][] = [];
  if (obj.tag) rows.push(['Tag', obj.tag]);
  if (obj.description) rows.push(['Description', obj.description]);
  if (obj.bacoidType !== null) rows.push(['BACnet Type', String(obj.bacoidType)]);
  if (obj.bacoidInstance !== null) rows.push(['Instance', String(obj.bacoidInstance)]);
  if (obj.units) rows.push(['Units', obj.units]);
  if (obj.defaultValue !== null) rows.push(['Default', String(obj.defaultValue)]);
  if (obj.createdAt) rows.push(['Created', obj.createdAt]);
  if (obj.modifiedAt) rows.push(['Modified', obj.modifiedAt]);
  rows.push(['Class', obj.className]);
  rows.push(['Ref', obj.ref]);
  const filteredChildren = useMemo(() => {
    const q = childSearch.trim().toLowerCase();
    if (!q) return children;
    return children.filter(child =>
      child.ref.toLowerCase().includes(q) ||
      child.label.toLowerCase().includes(q) ||
      child.className.toLowerCase().includes(q)
    );
  }, [children, childSearch]);
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
          PROPERTIES
        </div>
        <ObjectPropertiesTable properties={obj.properties ?? []} />
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>
          CONTENTS
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {children.length.toLocaleString()} immediate child{children.length === 1 ? '' : 'ren'}
          </span>
          <input
            type="text"
            placeholder="Filter children…"
            value={childSearch}
            onChange={e => setChildSearch(e.target.value)}
            style={{ minWidth: 220 }}
          />
          {childSearch && (
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setChildSearch('')}>
              Clear
            </button>
          )}
        </div>
        {filteredChildren.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No children match the current filter.</div>
        ) : (
          <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Child</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Class</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Units</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Refs</th>
              </tr>
            </thead>
            <tbody>
              {filteredChildren.map(child => (
                <tr
                  key={child.ref}
                  style={{ borderBottom: '1px solid var(--border)', cursor: onSelectChild ? 'pointer' : 'default' }}
                  onClick={() => onSelectChild?.(child.ref)}
                  onMouseEnter={e => { if (onSelectChild) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                  onMouseLeave={e => { if (onSelectChild) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <td style={{ padding: '4px 8px 4px 0', wordBreak: 'break-all' }}>
                    <div style={{ fontWeight: 500 }}>{child.label}</div>
                    <div style={{ color: 'var(--text-dim)', fontFamily: 'Consolas,monospace', fontSize: 10 }}>{child.ref}</div>
                  </td>
                  <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{child.className}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{child.units ?? '—'}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'Consolas,monospace', color: 'var(--accent)' }}>
                    {child.incomingCount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {graphicTagMap && graphicTagMap.size > 0 && (() => {
        const graphicHits = incoming.filter(h => graphicTagMap.has(h.referringItem));
        if (graphicHits.length === 0) return null;
        return (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>
              BOUND TO GRAPHICS
            </div>
            <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Graphic</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', width: 140 }}>Binding type</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>SVG element</th>
                </tr>
              </thead>
              <tbody>
                {graphicHits.slice(0, 20).map((hit, i) => {
                  const graphicName = graphicTagMap.get(hit.referringItem) ?? hit.referringItem;
                  const svgElement = hit.referringPath?.split('/').pop() ?? '';
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid var(--border)', cursor: onSelectReference ? 'pointer' : 'default' }}
                      onClick={() => onSelectReference?.(hit.referringItem)}
                      onMouseEnter={e => { if (onSelectReference) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                      onMouseLeave={e => { if (onSelectReference) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '4px 8px 4px 0', fontWeight: 500 }}>{graphicName}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-dim)', fontSize: 11 }}>{hit.referringAttr}</td>
                      <td style={{ padding: '4px 8px', fontFamily: 'Consolas, monospace', fontSize: 10, color: 'var(--text-dim)' }}>{svgElement}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}
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
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Source path</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Ref path</th>
              </tr>
            </thead>
            <tbody>
              {incoming.slice(0, 12).map(hit => (
                <tr
                  key={`${hit.target}|${hit.referringItem}|${hit.referringAttr}|${hit.sourcePath ?? hit.source}|${hit.referringPath ?? hit.referringItem}`}
                  style={{ borderBottom: '1px solid var(--border)', cursor: onSelectReference ? 'pointer' : 'default' }}
                  onClick={() => onSelectReference?.(hit.referringItem)}
                  onMouseEnter={e => { if (onSelectReference) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                  onMouseLeave={e => { if (onSelectReference) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <td style={{ padding: '4px 8px 4px 0', wordBreak: 'break-all' }}>{hit.referringItem}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{hit.referringAttr}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{hit.source}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{hit.sourcePath ?? hit.source}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{hit.referringPath ?? hit.referringItem}</td>
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

function DiffTab({
  fileA,
  fileB,
  loadArchive,
}: {
  fileA: LoadedFile | null;
  fileB: LoadedFile | null;
  loadArchive: (file: File) => Promise<LoadedFile>;
}) {
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

  const summaryA = useMemo(() => fileAState ? summarizeArchive(fileAState) : null, [fileAState]);
  const summaryB = useMemo(() => fileBState ? summarizeArchive(fileBState) : null, [fileBState]);

  const loadFile = async (file: File, slot: 'a' | 'b') => {
    setLoading(true);
    try {
      const loaded = await loadArchive(file);
      if (slot === 'a') setFileAState(loaded);
      else setFileBState(loaded);
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
          {summaryA && summaryB && (
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'grid', gap: 10, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Before</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{fileAState?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {summaryA.objectCount.toLocaleString()} objects · {summaryA.referenceCount.toLocaleString()} refs · {summaryA.classCount.toLocaleString()} classes
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>After</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{fileBState?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {summaryB.objectCount.toLocaleString()} objects · {summaryB.referenceCount.toLocaleString()} refs · {summaryB.classCount.toLocaleString()} classes
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Structural delta</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{(summaryB.objectCount - summaryA.objectCount).toLocaleString()} objects</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{(summaryB.referenceCount - summaryA.referenceCount).toLocaleString()} refs</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Archive sections</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {summaryB.scheduleCount.toLocaleString()} schedules · {summaryB.graphicsCount.toLocaleString()} graphics · {summaryB.programmingCount.toLocaleString()} programs
                </div>
              </div>
            </div>
          )}
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

function ExportTab({ file, referenceIndex }: { file: LoadedFile; referenceIndex: { byTarget: Map<string, ReferenceHit[]>; counts: Map<string, number>; totalHits: number } }) {
  const objects = getObjects(file);
  const summary = useMemo(() => summarizeArchive(file), [file]);
  const audit = useMemo(() => buildArchiveAudit(file, referenceIndex), [file, referenceIndex]);

  const exportCsv = () => {
    const header = 'ref,className,tag,description,units,defaultValue,bacoidType,bacoidInstance,createdAt,modifiedAt\n';
    const rows = objects.map(o =>
      exportCsvRow([o.ref, o.className, o.tag, o.description, o.units ?? '', o.defaultValue ?? '', o.bacoidType ?? '', o.bacoidInstance ?? '', o.createdAt ?? '', o.modifiedAt ?? ''])
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${file.name.replace(/\.[^.]+$/, '')}.csv`; a.click();
  };

  const exportPointListCsv = () => {
    const header = 'ref,label,tag,description,units,defaultValue,bacoidType,bacoidInstance,createdAt,modifiedAt\n';
    const rows = objects.map(o =>
      exportCsvRow([o.ref, getPointLabel(o), o.tag, o.description, o.units ?? '', o.defaultValue ?? '', o.bacoidType ?? '', o.bacoidInstance ?? '', o.createdAt ?? '', o.modifiedAt ?? ''])
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${file.name.replace(/\.[^.]+$/, '')}.point-list.csv`; a.click();
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(file.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${file.name.replace(/\.[^.]+$/, '')}.json`; a.click();
  };

  const stats = file.type === 'caf' ? file.data.stats : file.data.stats;
  const validationRows: Array<[string, string, string]> = [
    ['Objects', summary.objectCount.toLocaleString(), 'Parsed objects available for export'],
    ['References', summary.referenceCount.toLocaleString(), 'Reference graph available for audit'],
    ['Missing tags', audit.summary.missingTags.toLocaleString(), 'Objects without a tag'],
    ['Missing descriptions', audit.summary.missingDescriptions.toLocaleString(), 'Objects without a description'],
    ['Unbound refs', audit.summary.unbound.toLocaleString(), 'Targets that do not exist in this archive'],
    ['Duplicates', (audit.summary.duplicateDescriptions + audit.summary.duplicateTags + audit.summary.duplicateRefs).toLocaleString(), 'Potential cleanup candidates'],
    ['Suppressed alarms', audit.summary.suppressedAlarms.toLocaleString(), 'Alarm-like objects with suppress/disable text'],
    ['I/O missing units', audit.summary.ioMissingUnits.toLocaleString(), 'Points that may benefit from a units label'],
  ];

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Export {file.name}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={exportCsv}>
            Download CSV — {objects.length.toLocaleString()} objects
          </button>
          <button className="btn btn-ghost" onClick={exportPointListCsv}>
            Download point list CSV
          </button>
          <button className="btn btn-ghost" onClick={exportJson}>
            Download JSON (full)
          </button>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>PRE-EXPORT VALIDATION</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Check</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Value</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>What it means</th>
            </tr>
          </thead>
          <tbody>
            {validationRows.map(([label, value, note]) => (
              <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px 4px 0' }}>{label}</td>
                <td style={{ padding: '4px 8px', fontFamily: 'Consolas, monospace' }}>{value}</td>
                <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>ARCHIVE SECTIONS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Schedules</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{summary.scheduleCount.toLocaleString()}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Graphics</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{summary.graphicsCount.toLocaleString()}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Programming</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{summary.programmingCount.toLocaleString()}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Classes</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{summary.classCount.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReferencesTab({
  file,
  referenceIndex,
  selectedTarget,
  onSelectTarget,
}: {
  file: LoadedFile;
  referenceIndex: { byTarget: Map<string, ReferenceHit[]>; counts: Map<string, number>; totalHits: number };
  selectedTarget: string | null;
  onSelectTarget: (target: string) => void;
}) {
  const [search, setSearch] = useState('');
  const targets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...referenceIndex.byTarget.entries()]
      .filter(([target, hits]) => {
        if (!q) return true;
        return target.toLowerCase().includes(q) || hits.some(hit =>
          hit.referringItem.toLowerCase().includes(q) ||
          hit.referringAttr.toLowerCase().includes(q) ||
          hit.source.toLowerCase().includes(q) ||
          (hit.sourcePath ?? '').toLowerCase().includes(q) ||
          (hit.referringPath ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [referenceIndex.byTarget, search]);

  const activeTarget = selectedTarget && referenceIndex.byTarget.has(selectedTarget)
    ? selectedTarget
    : targets[0]?.[0] ?? null;
  const activeHits = activeTarget ? referenceIndex.byTarget.get(activeTarget) ?? [] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>REFERENCE INDEX</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{file.name}</div>
          </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            {referenceIndex.byTarget.size.toLocaleString()} targets · {referenceIndex.totalHits.toLocaleString()} hits
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
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                      {hits[0]?.source ?? 'unknown source'} · {hits.length.toLocaleString()} hit{hits.length === 1 ? '' : 's'}
                    </div>
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
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Source path</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Ref path</th>
                  </tr>
                </thead>
                <tbody>
                  {activeHits.map(hit => (
                    <tr key={`${hit.target}|${hit.referringItem}|${hit.referringAttr}|${hit.sourcePath ?? hit.source}|${hit.referringPath ?? hit.referringItem}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px 4px 0', wordBreak: 'break-all' }}>{hit.referringItem}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{hit.referringAttr}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{hit.source}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{hit.sourcePath ?? hit.source}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{hit.referringPath ?? hit.referringItem}</td>
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

export default function FileViewerPane({ mode = 'online' }: { mode?: ViewMode }) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [previewFile, setPreviewFile] = useState<LoadedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewTab>('tree');
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedDbexportNode, setSelectedDbexportNode] = useState<DbexportTreeNode | null>(null);
  const [dragging, setDragging] = useState(false);
  const [treeSearch, setTreeSearch] = useState('');
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set());
  const seededArchiveRef = useRef<string | null>(null);
  const currentFile = previewFile ?? file;
  const storeKey = mode === 'offline' ? 'oct:file-viewer:offline' : 'oct:file-viewer:online';
  const loadArchive = useCallback(async (f: File): Promise<LoadedFile> => {
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.caf') && !lower.endsWith('.dbexport')) {
      throw new Error('Unsupported file type. Drop a .caf or .dbexport file.');
    }
    if (mode === 'offline') {
      return parseArchiveFile(f);
    }
    const name = f.name;
    if (lower.endsWith('.caf')) {
      const data = await api.caf.upload(f);
      return { type: 'caf', data, name };
    }
    const data = await api.dbexport.upload(f);
    const graphicResolver: GraphicResolver = {
      async resolve(svgFilename: string): Promise<string | null> {
        try { return await api.dbexport.graphic(svgFilename); }
        catch { return null; }
      },
    };
    return { type: 'dbexport', data, name, graphicResolver };
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    setRestoring(true);
    Promise.all([loadStoredArchive(storeKey), loadStoredArchiveBytes(storeKey)])
      .then(async ([saved, bytes]) => {
        if (cancelled) return;
        if (!saved) return;
        let loaded: LoadedFile = saved;
        // Rebuild graphicResolver from stored bytes so graphics work after page refresh
        if (saved.type === 'dbexport' && bytes) {
          try {
            const resolver = await createResolverFromBytes(bytes);
            loaded = { ...saved, graphicResolver: resolver };
          } catch {
            // Bytes exist but couldn't be parsed — fall through without resolver
          }
        }
        setFile(loaded);
        setPreviewFile(null);
        setSelected(null);
        setSelectedDbexportNode(null);
        setTab('tree');
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => { cancelled = true; };
  }, [storeKey]);

  useEffect(() => {
    if (!currentFile) return;
    saveStoredArchive(storeKey, currentFile).catch(() => {});
  }, [currentFile, storeKey]);

  // Build maps for CAF tree
  const { objMap, childMap, cafRoots } = useMemo(() => {
    if (!currentFile || currentFile.type !== 'caf') return { objMap: new Map(), childMap: new Map(), cafRoots: [] };
    const objMap = new Map(currentFile.data.objects.map(o => [o.ref, o]));
    const childMap = new Map<string | null, CafObject[]>();
    for (const o of currentFile.data.objects) {
      if (!childMap.has(o.parentRef)) childMap.set(o.parentRef, []);
      childMap.get(o.parentRef)!.push(o);
    }
    return { objMap, childMap, cafRoots: childMap.get(null) ?? [] };
  }, [currentFile]);

  useEffect(() => {
    if (!currentFile) return;
    if (seededArchiveRef.current === currentFile.name) return;
    seededArchiveRef.current = currentFile.name;
    setTreeExpanded(new Set());
  }, [currentFile, cafRoots]);

  const treeQuery = useMemo(() => normalizeTreeQuery(treeSearch), [treeSearch]);

  const referenceIndex = useMemo(() => {
    if (!currentFile) return { byTarget: new Map<string, ReferenceHit[]>(), counts: new Map<string, number>(), totalHits: 0 };
    return buildReferenceIndex(currentFile.data.references);
  }, [currentFile]);

  const referenceMap = referenceIndex.byTarget;
  const incomingCounts = referenceIndex.counts;

  const selectedObj = selected && currentFile
    ? (currentFile.type === 'caf' ? objMap.get(selected) : currentFile.data.objects.find(o => o.ref === selected)) ?? null
    : null;

  const selectedNavNode = useMemo(() => {
    if (!currentFile || currentFile.type !== 'dbexport' || !currentFile.data.site || !selected) return null;
    return findNavNode(currentFile.data.site, selected);
  }, [currentFile, selected]);

  const treeChildren = useMemo<TreeChildRow[]>(() => {
    if (!currentFile || !selected) return [];
    if (currentFile.type === 'caf') {
      return (childMap.get(selected) ?? []).map((child: CafObject) => ({
        ref: child.ref,
        label: displayName(child),
        classid: child.classid,
        className: child.className,
        units: child.units,
        incomingCount: incomingCounts.get(child.ref) ?? 0,
      }));
    }
    const node = selectedNavNode;
    if (!node) return [];
    return node.children.map((child: NavNode) => {
      const childObj = currentFile.data.objects.find(o => o.ref === child.reference);
      return {
        ref: child.reference,
        label: child.label || child.reference.split(/[/\\]/).pop() || child.reference,
        classid: childObj?.classid ?? child.classid,
        className: childObj?.className ?? child.className,
        units: childObj?.units ?? null,
        incomingCount: incomingCounts.get(child.reference) ?? 0,
      };
    });
  }, [currentFile, selected, childMap, incomingCounts, selectedNavNode]);

  const graphicTagMap = useMemo(
    () => (currentFile ? buildGraphicTagMap(getObjects(currentFile)) : new Map<string, string>()),
    [currentFile],
  );

  const dbexportRoots = useMemo(() => {
    if (!currentFile || currentFile.type !== 'dbexport') return [] as DbexportTreeNode[];
    return buildDbexportTreeRoots(getObjects(currentFile));
  }, [currentFile]);

  const treeStats = useMemo(() => {
    if (!currentFile) return { total: 0, visible: 0 };
    if (currentFile.type === 'caf') {
      const visible = treeQuery ? cafRoots.filter(root => cafNodeHasMatch(root, treeQuery, childMap)).length : cafRoots.length;
      return { total: currentFile.data.objects.length, visible };
    }
    const visible = treeQuery ? dbexportRoots.filter(r => dbexportTreeNodeMatches(r, treeQuery)).length : dbexportRoots.length;
    return { total: currentFile.data.objects.length, visible };
  }, [currentFile, cafRoots, childMap, treeQuery, dbexportRoots]);

  const toggleTreeNode = useCallback((ref: string) => {
    setTreeExpanded(prev => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref); else next.add(ref);
      return next;
    });
  }, []);

  const handleFile = useCallback(async (f: File) => {
    setLoading(true); setError(null); setFile(null); setPreviewFile(null); setSelected(null); setSelectedDbexportNode(null); setTreeSearch(''); setTreeExpanded(new Set()); setTab('tree');
    try {
      const loaded = await loadArchive(f);
      setFile(loaded);
      // Persist raw bytes so the graphicResolver can be rebuilt after page refresh
      if (loaded.type === 'dbexport') {
        f.arrayBuffer().then(buf => saveStoredArchiveBytes(storeKey, buf)).catch(() => {});
      }
    } catch (e) {
      setError(String(e));
    } finally { setLoading(false); }
  }, [loadArchive, storeKey]);

  if (restoring) {
    return <div style={{ padding: 24, color: 'var(--text-dim)', textAlign: 'center' }}>Restoring last archive…</div>;
  }

  if (!currentFile && !loading) {
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
  if (!currentFile) return null;

  const allObjects = getObjects(currentFile);
  const hasGraphics = allObjects.some(o => GRAPHIC_CLASS_IDS.has(o.classid));
  const TABS: [ViewTab, string][] = [
    ['tree', 'Tree'],
    ...(currentFile.type === 'caf' ? [['workspace', 'CAF Workspace'] as [ViewTab, string]] : []),
    ['objects', 'Objects'], ['io', 'I/O Points'],
    ...(hasGraphics ? [['graphics', 'Graphics'] as [ViewTab, string]] : []),
    ['refs', 'References'], ['audit', 'Audit'], ['diff', 'Diff'], ['export', 'Export'],
  ];
  const selectedDetailObj = selectedObj ?? (selectedNavNode ? currentFile.data.objects.find(o => o.ref === selectedNavNode.reference) ?? null : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {currentFile.type === 'caf' && currentFile.data.controller.tag ? currentFile.data.controller.tag : currentFile.name}
        </span>
        <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: currentFile.type === 'caf' ? 'var(--accent)' : '#8a2be2', color: '#fff', fontFamily: 'Consolas,monospace' }}>
          {currentFile.type === 'caf' ? 'CAF' : 'dbexport'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {currentFile.type === 'caf'
            ? `${currentFile.data.controller.modelName} · fw ${currentFile.data.controller.appVersion} · ${allObjects.length} objects · ${currentFile.data.references.length} refs`
            : `${currentFile.data.engines.length} engine(s) · ${allObjects.length} objects · ${currentFile.data.references.length} refs`
          }
        </span>
        {previewFile && (
          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--success)', color: '#fff', fontFamily: 'Consolas,monospace' }}>
            PREVIEW
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {TABS.map(([id, label]) => (
            <button key={id} className={`tab${tab === id ? ' active' : ''}`}
              style={{ borderRadius: 4, marginBottom: 0, border: 'none', fontSize: 11, padding: '3px 10px' }}
              onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
          {previewFile && (
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => { setPreviewFile(null); setSelected(null); setTab('audit'); }}>
              Reset preview
            </button>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => { setFile(null); setPreviewFile(null); setSelected(null); }}>
            Close
          </button>
        </div>
      </div>

      {/* Content */}
      {tab === 'objects' && <ObjectBrowser objects={allObjects} onSelect={setSelected} incomingCounts={incomingCounts} />}
      {tab === 'workspace' && currentFile.type === 'caf' && (
        <CafWorkspacePane
          caf={currentFile.data}
          selected={selected}
          onSelect={setSelected}
          referenceIndex={referenceIndex}
        />
      )}
      {tab === 'io' && <div style={{ flex: 1, overflow: 'hidden' }}><IoTable objects={allObjects} /></div>}
      {tab === 'graphics' && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <GraphicsBrowser
            objects={allObjects}
            references={currentFile.data.references}
            referenceIndex={referenceIndex}
            onSelectObject={ref => { setSelected(ref); setTab('tree'); }}
            graphicResolver={currentFile.type === 'dbexport' ? currentFile.graphicResolver : undefined}
          />
        </div>
      )}
      {tab === 'refs' && (
        <ReferencesTab
          file={currentFile}
          referenceIndex={referenceIndex}
          selectedTarget={selected}
          onSelectTarget={setSelected}
        />
      )}
      {tab === 'audit' && (
        <ArchiveAuditTab
          file={currentFile}
          referenceIndex={referenceIndex}
          onSelectObject={setSelected}
          onOpenReferences={(target) => { setSelected(target); setTab('refs'); }}
          onApplyRewrite={(nextFile) => { setPreviewFile(nextFile); setSelected(null); setTab('audit'); }}
          onResetRewrite={() => { setPreviewFile(null); setSelected(null); }}
        />
      )}
      {tab === 'export' && <div style={{ flex: 1, overflowY: 'auto' }}><ExportTab file={currentFile} referenceIndex={referenceIndex} /></div>}
      {tab === 'diff' && <DiffTab fileA={previewFile ?? file} fileB={previewFile ? file : null} loadArchive={loadArchive} />}

      {tab === 'tree' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>NAVIGATION</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{currentFile.name}</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {treeStats.visible.toLocaleString()} visible · {treeStats.total.toLocaleString()} objects
              </span>
              <input
                type="text"
                placeholder="Filter tree…"
                value={treeSearch}
                onChange={e => setTreeSearch(e.target.value)}
                style={{ minWidth: 240 }}
              />
              {treeSearch && (
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setTreeSearch('')}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ width: 420, borderRight: '1px solid var(--border)', overflowY: 'auto', flexShrink: 0, background: 'var(--sidebar-bg)' }}>
              {currentFile.type === 'caf'
                ? cafRoots.filter(r => !treeQuery || cafNodeHasMatch(r, treeQuery, childMap)).length > 0
                  ? cafRoots.filter(r => !treeQuery || cafNodeHasMatch(r, treeQuery, childMap)).map(r => (
                      <CafTreeNode
                        key={r.ref}
                        obj={r}
                        childMap={childMap}
                        depth={0}
                        selected={selected}
                        onSelect={setSelected}
                        expanded={treeExpanded}
                        onToggle={toggleTreeNode}
                        query={treeQuery}
                      />
                    ))
                  : <div style={{ padding: 16, color: 'var(--text-dim)' }}>No CAF objects match the current filter.</div>
                : (() => {
                    const visible = treeQuery ? dbexportRoots.filter(r => dbexportTreeNodeMatches(r, treeQuery)) : dbexportRoots;
                    if (visible.length === 0) return (
                      <div style={{ padding: 16, color: 'var(--text-dim)' }}>
                        {treeQuery ? 'No objects match the current filter.' : 'No objects found in archive.'}
                      </div>
                    );
                    return <>{visible.map(r => (
                      <DbexportTreeRow
                        key={r.key}
                        node={r}
                        depth={0}
                        selectedKey={selected}
                        expanded={treeExpanded}
                        onSelect={node => { setSelected(node.ref ?? node.key); setSelectedDbexportNode(node); }}
                        onToggle={toggleTreeNode}
                        query={treeQuery}
                      />
                    ))}</>;
                  })()
              }
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {currentFile.type === 'dbexport'
                ? <DbexportDetailPane
                    node={selectedDbexportNode}
                    obj={selectedDetailObj}
                    incoming={selectedDetailObj ? (referenceMap.get(selectedDetailObj.ref) ?? []) : []}
                    children={selectedDbexportNode?.children ?? []}
                    onSelectChild={node => { setSelected(node.ref ?? node.key); setSelectedDbexportNode(node); if (node.children.length) toggleTreeNode(node.key); }}
                    onSelectReference={ref => { setSelected(ref); setSelectedDbexportNode(null); }}
                    graphicTagMap={graphicTagMap}
                  />
                : selectedDetailObj
                  ? <ObjectDetail
                      obj={selectedDetailObj}
                      incoming={referenceMap.get(selectedDetailObj.ref) ?? []}
                      children={treeChildren}
                      onSelectReference={setSelected}
                      onSelectChild={setSelected}
                      graphicTagMap={graphicTagMap}
                    />
                  : <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>Select an object in the tree</div>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
