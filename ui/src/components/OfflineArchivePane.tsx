import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CafObject, DbexportObject, ParsedCaf, ParsedDbexport, ReferenceHit } from '../api';
import { api } from '../api';
import { buildReferenceIndex } from '@oct/shared';
import { parseArchiveFile } from '../archiveParser';
import { loadStoredArchive, saveStoredArchive } from '../archiveStore';
import ObjectPropertiesTable from './ObjectPropertiesTable';
import { HAS_API_HOST } from '../connection';
import TreeGlyph from './TreeGlyph';

type LoadedArchive = { type: 'caf'; data: ParsedCaf; name: string } | { type: 'dbexport'; data: ParsedDbexport; name: string };
type AnyObject = CafObject | DbexportObject;

interface TreeNode {
  key: string;
  label: string;
  ref: string | null;
  classid: number;
  className: string;
  object: AnyObject | null;
  children: TreeNode[];
  kind: 'group' | 'object';
}

interface HierNode {
  label: string;
  kind: string;
  classid: number | string;
  obj: AnyObject | null;
  children: Map<string, HierNode>;
  totalCount: number;
  key: string;
  _segmentLabel?: string;
  _labelFromDescription?: boolean;
}

function displayName(o: AnyObject): string {
  return o.tag || o.description || `${o.className} #${o.objectid}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isSqlExportName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.sql') || (lower.startsWith('.') && lower.includes('dbexport') && lower.includes('sql'));
}

function treeMatches(node: TreeNode, query: string): boolean {
  if (!query) return true;
  if ([node.label, node.ref ?? '', node.className].some(value => value.toLowerCase().includes(query))) return true;
  return node.children.some(child => treeMatches(child, query));
}

function buildCafNodes(objects: CafObject[]): TreeNode[] {
  const byParent = new Map<string | null, CafObject[]>();
  for (const obj of objects) {
    if (!byParent.has(obj.parentRef)) byParent.set(obj.parentRef, []);
    byParent.get(obj.parentRef)!.push(obj);
  }
  const build = (obj: CafObject): TreeNode => ({
    key: obj.ref,
    label: displayName(obj),
    ref: obj.ref,
    classid: obj.classid,
    className: obj.className,
    object: obj,
    kind: 'object',
    children: (byParent.get(obj.ref) ?? []).map(build),
  });
  return (byParent.get(null) ?? objects).map(build);
}

function parseRef(ref: string): { adx: string; engine: string; segments: string[]; path: string } {
  const colonIdx = ref.indexOf(':');
  let adx = '';
  let after = ref;
  if (colonIdx >= 0) {
    adx = ref.slice(0, colonIdx);
    after = ref.slice(colonIdx + 1);
  }
  const slashIdx = after.indexOf('/');
  if (slashIdx < 0) return { adx, engine: after, segments: [], path: '' };
  const engine = after.slice(0, slashIdx);
  const path = after.slice(slashIdx + 1);
  const segments = path.split('.').filter(Boolean);
  return { adx, engine, segments, path };
}

function categorizeFirstSegment(seg: string): { label: string; kind: string } {
  if (/^FC-\d+$/i.test(seg)) return { label: `Field Bus ${seg}`, kind: 'fieldbus' };
  if (/^FCB$/i.test(seg)) return { label: 'Field Bus (FCB)', kind: 'fieldbus' };
  if (/^Field\s*Bus/i.test(seg)) return { label: seg, kind: 'fieldbus' };
  if (/^N2(\s|-)/i.test(seg)) return { label: seg, kind: 'n2trunk' };
  if (/^BACnet\s*Trunk/i.test(seg)) return { label: seg, kind: 'bacnettrunk' };
  if (/^LON\s*Trunk/i.test(seg)) return { label: seg, kind: 'lontrunk' };
  if (seg === 'Programming') return { label: 'Programming', kind: 'programming' };
  if (seg === 'System Programs') return { label: 'System Programs', kind: 'sysprograms' };
  if (seg === 'Schedule') return { label: 'Schedules', kind: 'schedules' };
  if (seg === 'Graphics') return { label: 'Graphics', kind: 'graphics' };
  if (seg.startsWith('$site')) return { label: 'Site Configuration', kind: 'site' };
  if (seg.startsWith('$Generic')) return { label: 'Generic Archive', kind: 'generic' };
  if (seg.startsWith('$Facility')) return { label: seg, kind: 'generic' };
  return { label: seg, kind: 'category' };
}

function isOpaqueSegment(seg: string): boolean {
  if (!seg) return true;
  if (/^\d+$/.test(seg)) return true;
  if (/^\d+[_\-.]\d+$/.test(seg)) return true;
  if (/^\$\d+$/.test(seg)) return true;
  return false;
}

function buildHierarchy(objects: AnyObject[]): Map<string, HierNode> {
  const engines = new Map<string, HierNode>();

  for (const obj of objects) {
    const { engine: engineName, segments } = parseRef(obj.ref);
    if (!engineName) continue;

    let engine = engines.get(engineName);
    if (!engine) {
      engine = {
        label: engineName,
        kind: 'engine',
        classid: '',
        obj: null,
        children: new Map(),
        totalCount: 0,
        key: engineName,
      };
      engines.set(engineName, engine);
    }

    if (segments.length === 0) {
      engine.classid = obj.classid;
      engine.obj = obj;
      continue;
    }

    let node = engine;
    let keyPath = engineName;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      keyPath = `${keyPath}#${seg}`;
      if (!node.children.has(seg)) {
        let label = seg;
        let kind = i === segments.length - 1 ? 'point' : 'equipment';
        if (i === 0) {
          const cat = categorizeFirstSegment(seg);
          label = cat.label;
          kind = cat.kind;
        }
        node.children.set(seg, {
          label,
          kind,
          classid: '',
          obj: null,
          children: new Map(),
          totalCount: 0,
          key: keyPath,
        });
      }
      node = node.children.get(seg)!;
      if (i === segments.length - 1) {
        node.classid = obj.classid;
        node.obj = obj;
      }
    }
  }

  const computeCounts = (node: HierNode): number => {
    let count = node.obj ? 1 : 0;
    for (const child of node.children.values()) count += computeCounts(child);
    node.totalCount = count;
    if (node.obj && !node._labelFromDescription && isOpaqueSegment(node.label)) {
      const desc = node.obj.description || node.obj.tag;
      if (desc && desc.length > 0 && desc !== node.label) {
        node._segmentLabel = node.label;
        node.label = desc;
        node._labelFromDescription = true;
      }
    }
    return count;
  };

  for (const engine of engines.values()) computeCounts(engine);
  return engines;
}

function mapHierarchyToTree(nodes: Map<string, HierNode>): TreeNode[] {
  const convert = (node: HierNode): TreeNode => ({
    key: node.key,
    label: node.label,
    ref: node.obj?.ref ?? null,
    classid: typeof node.classid === 'number' ? node.classid : 0,
    className: node.obj?.className ?? (node.kind === 'engine' ? 'Engine' : node.kind),
    object: node.obj,
    kind: node.children.size > 0 ? 'group' : 'object',
    children: [...node.children.values()]
      .sort((a, b) => {
        const ao = a.kind === 'engine' ? 0 : 1;
        const bo = b.kind === 'engine' ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return a.label.localeCompare(b.label, undefined, { numeric: true });
      })
      .map(convert),
  });
  return [...nodes.values()]
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map(convert);
}

function buildDbexportNodes(file: ParsedDbexport, objects: DbexportObject[]): TreeNode[] {
  const hier = buildHierarchy(objects);
  if (hier.size > 0) {
    return mapHierarchyToTree(hier);
  }
  const roots = file.engines.map(engine => ({
    key: `engine:${engine.ref}`,
    label: engine.name || engine.ref,
    ref: engine.ref,
    classid: 0,
    className: 'Engine',
    object: null,
    kind: 'group' as const,
    children: objects
      .filter(obj => obj.engineRef === engine.ref)
      .sort((a, b) => a.ref.localeCompare(b.ref))
      .map(obj => ({
        key: obj.ref,
        label: displayName(obj),
        ref: obj.ref,
        classid: obj.classid,
        className: obj.className,
        object: obj,
        kind: 'object' as const,
        children: [],
      })),
  }));
  return roots.length > 0 ? roots : objects.map(obj => ({
    key: obj.ref,
    label: displayName(obj),
    ref: obj.ref,
    classid: obj.classid,
    className: obj.className,
    object: obj,
    kind: 'object' as const,
    children: [],
  }));
}

function TreeRow({
  node,
  depth,
  selectedKey,
  expanded,
  onSelect,
  onToggle,
  query,
}: {
  node: TreeNode;
  depth: number;
  selectedKey: string | null;
  expanded: Set<string>;
  onSelect: (node: TreeNode) => void;
  onToggle: (key: string) => void;
  query: string;
}) {
  const isSelected = selectedKey === node.key;
  const isOpen = expanded.has(node.key) || (query ? treeMatches(node, query) : false);
  const visibleChildren = query ? node.children.filter(child => treeMatches(child, query)) : node.children;
  const hasChildren = visibleChildren.length > 0;
  const busLabel = /(?:field\s*bus|n2|bacnet\s*trunk|lon\s*trunk)/i.test(`${node.label} ${node.className}`);
  const iconKind =
    node.object && node.kind === 'group'
      ? 'engine'
      : busLabel
        ? 'bus'
        : node.kind === 'group'
          ? 'folder'
          : 'point';
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: `4px 10px 4px ${10 + depth * 14}px`,
          cursor: 'pointer',
          background: isSelected ? 'rgba(100,160,255,0.18)' : 'transparent',
          borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        }}
        onClick={() => {
          onSelect(node);
          if (node.children.length) onToggle(node.key);
        }}
        >
        <span style={{ width: 12, fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
          {node.children.length ? (isOpen ? '▾' : '▸') : ''}
        </span>
        <TreeGlyph kind={iconKind} active={isSelected} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.label}
        </span>
        {hasChildren && (
          <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
            {visibleChildren.length}
          </span>
        )}
      </div>
      {isOpen && visibleChildren.map(child => (
        <TreeRow
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

function DetailPane({
  archive,
  selectedNode,
  selectedObject,
  incoming,
  children,
  onSelectChild,
  onSelectReference,
}: {
  archive: LoadedArchive;
  selectedNode: TreeNode | null;
  selectedObject: AnyObject | null;
  incoming: ReferenceHit[];
  children: TreeNode[];
  onSelectChild: (node: TreeNode) => void;
  onSelectReference: (ref: string) => void;
}) {
  if (!selectedNode) {
    return (
      <div style={{ padding: 24, color: 'var(--text-dim)' }}>
        Drop a `.caf` or `.dbexport` archive to browse its tree.
      </div>
    );
  }

  const lines: Array<[string, string]> = [
    ['Archive', archive.name],
    ['Node', selectedNode.label],
    ['Class', selectedNode.className],
  ];
  if (selectedObject) {
    if (selectedObject.tag) lines.push(['Tag', selectedObject.tag]);
    if (selectedObject.description) lines.push(['Description', selectedObject.description]);
    if (selectedObject.units) lines.push(['Units', selectedObject.units]);
    if (selectedObject.defaultValue !== null) lines.push(['Default', String(selectedObject.defaultValue)]);
    if (selectedObject.createdAt) lines.push(['Created', selectedObject.createdAt]);
    if (selectedObject.modifiedAt) lines.push(['Modified', selectedObject.modifiedAt]);
    lines.push(['Ref', selectedObject.ref]);
  } else if (selectedNode.ref) {
    lines.push(['Ref', selectedNode.ref]);
  }

  return (
    <div style={{ padding: 16, overflowY: 'auto' }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>DETAILS</div>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>{selectedNode.label}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody>
          {lines.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ width: 110, padding: '4px 8px 4px 0', color: 'var(--text-dim)' }}>{k}</td>
              <td style={{ padding: '4px 0', wordBreak: 'break-all', fontFamily: k === 'Ref' ? 'Consolas, monospace' : undefined }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedObject && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>PROPERTIES</div>
          <ObjectPropertiesTable properties={selectedObject.properties ?? []} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>CONTENTS</div>
        {children.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No child nodes.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Child</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Class</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Units</th>
              </tr>
            </thead>
            <tbody>
              {children.map(child => (
                <tr
                  key={child.key}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => onSelectChild(child)}
                >
                  <td style={{ padding: '4px 8px 4px 0' }}>{child.label}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{child.className}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{child.object?.units ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>REFERENCED BY</div>
        {incoming.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No incoming references found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Referring item</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Attribute</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {incoming.slice(0, 20).map(hit => (
                <tr
                  key={`${hit.target}|${hit.referringItem}|${hit.referringAttr}|${hit.sourcePath ?? hit.source}`}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => onSelectReference(hit.referringItem)}
                >
                  <td style={{ padding: '4px 8px 4px 0', wordBreak: 'break-all' }}>{hit.referringItem}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{hit.referringAttr}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{hit.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FileDropZone({ onFile }: { onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      onClick={() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.caf,.dbexport,.sql';
        input.onchange = () => {
          if (input.files?.[0]) onFile(input.files[0]);
        };
        input.click();
      }}
      style={{
        border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8,
        padding: '24px 32px',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? 'rgba(100,160,255,0.06)' : 'transparent',
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 6 }}>📂</div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop a `.caf`, `.dbexport`, or `.sql` file</div>
      <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>or click to browse</div>
    </div>
  );
}

export default function OfflineArchivePane() {
  const [archive, setArchive] = useState<LoadedArchive | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveDbSummary, setArchiveDbSummary] = useState<Awaited<ReturnType<typeof api.sctArchive.summary>> | null>(null);
  const [archiveDbError, setArchiveDbError] = useState<string | null>(null);
  const [refreshingMaps, setRefreshingMaps] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const seededArchiveRef = useRef<string | null>(null);
  const storeKey = 'oct:offline-archive';

  useEffect(() => {
    let cancelled = false;
    setRestoring(true);
    loadStoredArchive(storeKey)
      .then(saved => {
        if (cancelled) return;
        if (saved) {
          setArchive(saved);
          setSelectedKey(null);
          setSearch('');
          setExpanded(new Set());
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => { cancelled = true; };
  }, [storeKey]);

  useEffect(() => {
    if (!archive) return;
    saveStoredArchive(storeKey, archive).catch(() => {});
  }, [archive, storeKey]);

  const loadArchiveDbSummary = useCallback(async () => {
    if (!HAS_API_HOST) return;
    const summary = await api.sctArchive.summary();
    setArchiveDbSummary(summary);
    setArchiveDbError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (HAS_API_HOST) {
      loadArchiveDbSummary()
        .catch(err => {
          if (!cancelled) setArchiveDbError(String(err));
        });
    }
    return () => { cancelled = true; };
  }, [loadArchiveDbSummary]);

  const tree = useMemo(() => {
    if (!archive) return [] as TreeNode[];
    return archive.type === 'caf'
      ? buildCafNodes(archive.data.objects)
      : buildDbexportNodes(archive.data, archive.data.objects);
  }, [archive]);

  const filteredTree = useMemo(() => {
    const q = normalize(search);
    if (!q) return tree;
    return tree.filter(node => treeMatches(node, q));
  }, [search, tree]);

  const flatNodes = useMemo(() => {
    const map = new Map<string, TreeNode>();
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        map.set(node.key, node);
        if (node.children.length) walk(node.children);
      }
    };
    walk(tree);
    return map;
  }, [tree]);

  const referenceIndex = useMemo(() => {
    if (!archive) return { byTarget: new Map<string, ReferenceHit[]>(), counts: new Map<string, number>(), totalHits: 0 };
    return buildReferenceIndex(archive.data.references);
  }, [archive]);

  const selectedNode = selectedKey ? flatNodes.get(selectedKey) ?? null : null;
  const selectedObject = selectedNode?.object ?? null;
  const activeChildren = selectedNode?.children ?? [];
  const activeIncoming = selectedObject ? (referenceIndex.byTarget.get(selectedObject.ref) ?? []) : [];

  const handleSelect = useCallback((node: TreeNode) => {
    setSelectedKey(node.key);
  }, []);

  const handleLoad = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      if (isSqlExportName(file.name)) {
        throw new Error('SQL export detected. This browser loads archive `.caf` and `.dbexport` files; keep SQL exports separate by naming them with a leading period.');
      }
      const loaded = await parseArchiveFile(file);
      setArchive(loaded);
      setSelectedKey(null);
      setSearch('');
      setExpanded(new Set());
    } catch (err) {
      setArchive(null);
      setSelectedKey(null);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleExpanded = useCallback((key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!archive) return;
    if (seededArchiveRef.current === archive.name) return;
    seededArchiveRef.current = archive.name;
    setExpanded(new Set(tree.map(node => node.key)));
  }, [archive, tree]);

  const refreshArchiveMaps = useCallback(async () => {
    setRefreshingMaps(true);
    setArchiveDbError(null);
    try {
      const result = await api.sctArchive.refreshNameMaps();
      await loadArchiveDbSummary();
      setArchiveDbError(`Refreshed ${result.classMapCount} class maps and ${result.globalNameCount} global names.`);
    } catch (err) {
      setArchiveDbError(String(err));
    } finally {
      setRefreshingMaps(false);
    }
  }, [loadArchiveDbSummary]);

  useEffect(() => {
    if (!archive) return;
    if (selectedKey && flatNodes.has(selectedKey)) return;
    const first = filteredTree[0] ?? tree[0] ?? null;
    if (first) setSelectedKey(first.key);
  }, [archive, filteredTree, flatNodes, selectedKey, tree]);

  if (restoring) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24, gap: 14, overflow: 'hidden' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Restoring last archive…</div>
      </div>
    );
  }

  const itemCount = archiveDbSummary?.tables.find(t => t.name === 'Item')?.rowCount ?? null;
  const valueCount = archiveDbSummary?.tables.find(t => t.name === 'Value')?.rowCount ?? null;
  const propertyCount = archiveDbSummary?.tables.find(t => t.name === 'Property')?.rowCount ?? null;
  const procCount = archiveDbSummary?.procedureCounts.reduce((sum, row) => sum + row.count, 0) ?? null;

  if (!archive) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24, gap: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Offline</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Archive browser</div>
          </div>
          <div style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: 12 }}>
            dbexport-style tree browsing for `.caf` and `.dbexport`
          </div>
        </div>
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 12,
          background: 'var(--surface)',
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>SCT ARCHIVE DB</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{archiveDbSummary?.database ?? 'DaytonaState'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {archiveDbSummary ? `${archiveDbSummary.tables.length} tables · ${archiveDbSummary.procedures.length} procedures` : 'Waiting for SQL summary'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>ITEMS</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{itemCount !== null ? itemCount.toLocaleString() : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>VALUES / PROPS</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {valueCount !== null ? valueCount.toLocaleString() : '—'}
              <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 6 }}>
                / {propertyCount !== null ? propertyCount.toLocaleString() : '—'}
              </span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>PROC GROUPS</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{procCount !== null ? procCount.toLocaleString() : '—'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-ghost" disabled={!HAS_API_HOST || refreshingMaps} onClick={refreshArchiveMaps}>
            {refreshingMaps ? 'Refreshing name maps…' : 'Refresh name maps'}
          </button>
          {archiveDbError && <div style={{ color: archiveDbError.startsWith('Refreshed ') ? 'var(--success)' : 'var(--danger)', fontSize: 12 }}>{archiveDbError}</div>}
          {!archiveDbError && !HAS_API_HOST && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Connect the backend to inspect the imported SCT database.</div>}
        </div>
        <FileDropZone onFile={handleLoad} />
        {loading && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Parsing archive…</div>}
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>NAVIGATION</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{archive.name}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {archive.data.objects.length.toLocaleString()} objects · {archive.data.references.length.toLocaleString()} refs
          </span>
          <input
            type="text"
            placeholder="Filter tree…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 260 }}
          />
          {search && (
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setSearch('')}>
              Clear
            </button>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} disabled={!HAS_API_HOST || refreshingMaps} onClick={refreshArchiveMaps}>
            {refreshingMaps ? 'Refreshing…' : 'Refresh name maps'}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setArchive(null)}>
            Close
          </button>
        </div>
      </div>

      {(archiveDbSummary || archiveDbError) && (
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          flexWrap: 'wrap',
          background: 'rgba(100,160,255,0.04)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            SCT DB {archiveDbSummary?.database ?? 'DaytonaState'}
          </span>
          <span style={{ fontSize: 11 }}>
            {itemCount !== null ? `${itemCount.toLocaleString()} items` : 'items: —'}
          </span>
          <span style={{ fontSize: 11 }}>
            {valueCount !== null ? `${valueCount.toLocaleString()} values` : 'values: —'}
          </span>
          <span style={{ fontSize: 11 }}>
            {propertyCount !== null ? `${propertyCount.toLocaleString()} properties` : 'properties: —'}
          </span>
          <span style={{ fontSize: 11 }}>
            {procCount !== null ? `${procCount.toLocaleString()} proc group entries` : 'proc groups: —'}
          </span>
          {archiveDbError && (
            <span style={{ fontSize: 11, color: archiveDbError.startsWith('Refreshed ') ? 'var(--success)' : 'var(--danger)' }}>
              {archiveDbError}
            </span>
          )}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <aside style={{ width: 360, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--border)', background: 'var(--sidebar-bg)' }}>
          {filteredTree.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--text-dim)' }}>No tree nodes match the current filter.</div>
          ) : (
            filteredTree.map(node => (
              <TreeRow
                key={node.key}
                node={node}
                depth={0}
                selectedKey={selectedKey}
                expanded={expanded}
                onSelect={handleSelect}
                onToggle={toggleExpanded}
                query={normalize(search)}
              />
            ))
          )}
        </aside>
        <section style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {loading && <div style={{ padding: 16, color: 'var(--text-dim)' }}>Parsing archive…</div>}
          <DetailPane
            archive={archive}
            selectedNode={selectedNode}
            selectedObject={selectedObject}
            incoming={activeIncoming}
            children={activeChildren}
            onSelectChild={node => {
              setSelectedKey(node.key);
              setExpanded(prev => new Set(prev).add(node.key));
            }}
            onSelectReference={ref => setSelectedKey(ref)}
          />
        </section>
      </div>
    </div>
  );
}
