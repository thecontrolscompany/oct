import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { CafObject, ParsedCaf, ReferenceHit } from '../api';
import type { ReferenceIndex } from '@oct/shared';
import ObjectPropertiesTable from './ObjectPropertiesTable';

type WorkspaceMode = 'control' | 'logic';
type FeatureTab = 'parameters' | 'connections' | 'state-tables' | 'display' | 'advanced' | 'bacnet-exposed' | 'all-properties';
type PanelKey =
  | 'network-inputs'
  | 'inputs'
  | 'misc-inputs'
  | 'setpoint-misc'
  | 'state-generation'
  | 'output-control'
  | 'network-outputs'
  | 'outputs'
  | 'misc-outputs';

const INPUT_BACOID_TYPES = new Set([0, 2, 3, 5, 13, 19]);
const OUTPUT_BACOID_TYPES = new Set([1, 4, 14]);
const HW_INPUT_CLASSES = new Set([240, 242, 243, 671, 673]);
const HW_OUTPUT_CLASSES = new Set([239, 241, 672, 674]);
const LOGIC_CLASSES = new Set([307, 526, 527, 528, 529, 530, 531, 540, 555, 575, 585, 862]);

const FEATURE_TABS: Array<{ id: FeatureTab; label: string }> = [
  { id: 'parameters', label: 'Parameters' },
  { id: 'connections', label: 'Connections' },
  { id: 'state-tables', label: 'State Tables' },
  { id: 'display', label: 'Display' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'bacnet-exposed', label: 'BACnet Exposed' },
  { id: 'all-properties', label: 'All Properties' },
];

const PARAMETER_SECTIONS = [
  {
    id: 'setpoint-misc',
    label: 'Setpoint/Miscellaneous',
    keywords: ['setpoint', 'misc', 'sp', 'offset', 'trim', 'limit'],
  },
  {
    id: 'state-generation',
    label: 'State Generation',
    keywords: ['state', 'logic', 'sequence', 'table', 'program', 'calc', 'compare'],
  },
  {
    id: 'output-control',
    label: 'Output Control',
    keywords: ['output', 'control', 'cmd', 'actuator', 'drive', 'relay', 'valve', 'fan'],
  },
] as const;

function displayName(obj: CafObject): string {
  return obj.tag || obj.description || obj.shortTag || `${obj.className} #${obj.objectid}`;
}

function buildSearchText(obj: CafObject): string {
  return [obj.tag, obj.shortTag, obj.description, obj.className, obj.ref].filter(Boolean).join(' ').toLowerCase();
}

function isLogicLike(obj: CafObject): boolean {
  const hay = buildSearchText(obj);
  return LOGIC_CLASSES.has(obj.classid)
    || /state|logic|sequence|table|program|compare|calc|pid|timer|counter|branch/.test(hay);
}

function isSetpointLike(obj: CafObject): boolean {
  const hay = buildSearchText(obj);
  return /setpoint|offset|trim|limit|\bsp\b/.test(hay);
}

function isOutputControlLike(obj: CafObject): boolean {
  const hay = buildSearchText(obj);
  return /output|control|cmd|actuator|drive|valve|relay|fan|open|close/.test(hay);
}

function isInputLike(obj: CafObject): boolean {
  const hay = buildSearchText(obj);
  return /input|sensor|read|feedback|status|switch|temp|flow|press|analog|binary/.test(hay);
}

function classifyPanelKey(obj: CafObject, mode: WorkspaceMode): PanelKey {
  const bacoidType = obj.bacoidType;
  const isNetworkInput = bacoidType !== null && INPUT_BACOID_TYPES.has(bacoidType);
  const isNetworkOutput = bacoidType !== null && OUTPUT_BACOID_TYPES.has(bacoidType);
  const isHardwareInput = HW_INPUT_CLASSES.has(obj.classid);
  const isHardwareOutput = HW_OUTPUT_CLASSES.has(obj.classid);
  const logicLike = isLogicLike(obj);
  const setpointLike = isSetpointLike(obj);
  const outputControlLike = isOutputControlLike(obj);
  const inputLike = isInputLike(obj);

  if (mode === 'logic') {
    if (logicLike) return 'state-generation';
    if (outputControlLike) return 'output-control';
  }

  if (isNetworkInput) return 'network-inputs';
  if (isHardwareInput) return 'inputs';
  if (isNetworkOutput) return 'network-outputs';
  if (isHardwareOutput) return 'outputs';
  if (setpointLike) return 'setpoint-misc';
  if (logicLike) return 'state-generation';
  if (outputControlLike) return 'output-control';
  if (mode === 'control' && inputLike && bacoidType !== null) return 'misc-inputs';
  if (mode === 'control' && /output/.test(buildSearchText(obj)) && bacoidType !== null) return 'misc-outputs';
  return 'setpoint-misc';
}

function sortObjects(objects: CafObject[]): CafObject[] {
  return [...objects].sort((a, b) => {
    const ai = displayName(a).localeCompare(displayName(b), undefined, { numeric: true });
    if (ai !== 0) return ai;
    return a.objectid - b.objectid;
  });
}

function filterPropertiesForSection(obj: CafObject, sectionId: string): CafObject['properties'] {
  const section = PARAMETER_SECTIONS.find(item => item.id === sectionId);
  if (!section) return obj.properties;
  if (obj.properties.length === 0) return obj.properties;
  const keywords = section.keywords.map(keyword => keyword.toLowerCase());
  const filtered = obj.properties.filter(prop => {
    const hay = [prop.name, prop.value, prop.valueType, String(prop.id)].join(' ').toLowerCase();
    return keywords.some(keyword => hay.includes(keyword));
  });
  return filtered.length > 0 ? filtered : obj.properties;
}

function buildReferenceRows(referenceIndex: ReferenceIndex, selectedRef: string): ReferenceHit[] {
  return [...(referenceIndex.byTarget.get(selectedRef) ?? [])].sort((a, b) => {
    const sourceA = `${a.sourcePath ?? a.source}:${a.referringItem}:${a.referringAttr}`;
    const sourceB = `${b.sourcePath ?? b.source}:${b.referringItem}:${b.referringAttr}`;
    return sourceA.localeCompare(sourceB, undefined, { numeric: true });
  });
}

function collectDescendants(rootRef: string, byParent: Map<string | null, CafObject[]>): CafObject[] {
  const result: CafObject[] = [];
  const stack = [...(byParent.get(rootRef) ?? [])];
  while (stack.length) {
    const item = stack.shift()!;
    result.push(item);
    stack.unshift(...(byParent.get(item.ref) ?? []));
  }
  return result;
}

function countDescendants(rootRef: string, byParent: Map<string | null, CafObject[]>): number {
  return collectDescendants(rootRef, byParent).length;
}

function isApplicationRootCandidate(obj: CafObject): boolean {
  return [575, 555, 540, 585, 307, 526, 527, 528, 529, 530, 531].includes(obj.classid);
}

function makeSummaryLine(obj: CafObject): string {
  const parts = [obj.className];
  if (obj.units) parts.push(obj.units);
  if (obj.bacoidType !== null && obj.bacoidInstance !== null) parts.push(`BACnet ${obj.bacoidType}:${obj.bacoidInstance}`);
  return parts.join(' · ');
}

function makeDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function makeObjectMetadata(obj: CafObject): Array<[string, string]> {
  return [
    ['Tag', obj.tag || '—'],
    ['Description', obj.description || '—'],
    ['Short Tag', obj.shortTag || '—'],
    ['Class', obj.className],
    ['Object ID', String(obj.objectid)],
    ['Ref', obj.ref],
    ['Units', obj.units ?? '—'],
    ['BACnet', obj.bacoidType !== null && obj.bacoidInstance !== null ? `${obj.bacoidType}:${obj.bacoidInstance}` : '—'],
    ['Default', obj.defaultValue !== null ? String(obj.defaultValue) : '—'],
  ];
}

function SectionCard({
  title,
  count,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="commission-panel commission-panel-side" style={{ minHeight: 0, flex: 1 }}>
      <div className="commission-panel-header" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <span>{title}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="commission-panel-count">{count}</span>
          <span aria-hidden="true" style={{ fontSize: 11, color: '#456385' }}>{collapsed ? '▸' : '▾'}</span>
        </span>
      </div>
      {!collapsed && (
        <div className="commission-panel-list" style={{ maxHeight: 'none', flex: 1 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function PanelItem({
  object,
  selected,
  onSelect,
}: {
  object: CafObject;
  selected: boolean;
  onSelect: (ref: string) => void;
}) {
  return (
    <button
      type="button"
      className={`commission-panel-item${selected ? ' commission-panel-item-active' : ''}`}
      onClick={() => onSelect(object.ref)}
    >
      <div className="commission-panel-item-title">{displayName(object)}</div>
      <div className="commission-panel-item-meta">{makeSummaryLine(object)}</div>
    </button>
  );
}

function renderFeatureProperties(
  object: CafObject,
  sectionId: string,
): Array<{ id: number; name: string; value: string; valueType: string }> {
  const props = sectionId === 'all-properties'
    ? object.properties
    : filterPropertiesForSection(object, sectionId);
  return props.map(prop => ({
    id: prop.id,
    name: prop.name,
    value: prop.value,
    valueType: prop.valueType,
  }));
}

export default function CafWorkspacePane({
  caf,
  selected,
  onSelect,
  referenceIndex,
}: {
  caf: ParsedCaf;
  selected: string | null;
  onSelect: (ref: string) => void;
  referenceIndex: ReferenceIndex;
}) {
  const [mode, setMode] = useState<WorkspaceMode>('control');
  const [featureTab, setFeatureTab] = useState<FeatureTab>('parameters');
  const [featureSection, setFeatureSection] = useState('setpoint-misc');
  const [collapsed, setCollapsed] = useState<Record<PanelKey, boolean>>({
    'network-inputs': false,
    inputs: false,
    'misc-inputs': false,
    'setpoint-misc': false,
    'state-generation': false,
    'output-control': false,
    'network-outputs': false,
    outputs: false,
    'misc-outputs': false,
  });
  const [weights, setWeights] = useState([1.2, 0.95, 1, 0.95, 1.2]);
  const dragRef = useRef<{
    index: number;
    startX: number;
    startWeights: number[];
    width: number;
  } | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);

  const objMap = useMemo(() => new Map(caf.objects.map(obj => [obj.ref, obj])), [caf.objects]);
  const byParent = useMemo(() => {
    const map = new Map<string | null, CafObject[]>();
    for (const obj of caf.objects) {
      if (!map.has(obj.parentRef)) map.set(obj.parentRef, []);
      map.get(obj.parentRef)!.push(obj);
    }
    for (const list of map.values()) {
      list.sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { numeric: true }));
    }
    return map;
  }, [caf.objects]);

  const applicationRoots = useMemo(() => {
    const roots = (byParent.get(caf.controller.ref) ?? [])
      .filter(obj => isApplicationRootCandidate(obj) && (byParent.get(obj.ref)?.length ?? 0) > 0)
      .map(obj => ({
        obj,
        descendantCount: countDescendants(obj.ref, byParent),
      }))
      .sort((a, b) => {
        const aScore = (a.obj.classid === 575 ? 0 : a.obj.classid === 555 ? 1 : 2);
        const bScore = (b.obj.classid === 575 ? 0 : b.obj.classid === 555 ? 1 : 2);
        if (aScore !== bScore) return aScore - bScore;
        return b.descendantCount - a.descendantCount;
      });
    return roots;
  }, [byParent, caf.controller.ref]);

  const activeApplicationRoot = applicationRoots[0]?.obj ?? caf.objects.find(obj => obj.parentRef === caf.controller.ref && obj.classid === 575) ?? caf.objects.find(obj => obj.parentRef === caf.controller.ref && (byParent.get(obj.ref)?.length ?? 0) > 0) ?? caf.controller;
  const activeApplicationLabel = displayName(activeApplicationRoot);
  const workspaceObjects = useMemo(() => {
    const subtree = collectDescendants(activeApplicationRoot.ref, byParent);
    return [activeApplicationRoot, ...subtree];
  }, [activeApplicationRoot, byParent]);
  const workspaceRefSet = useMemo(() => new Set(workspaceObjects.map(obj => obj.ref)), [workspaceObjects]);

  useEffect(() => {
    if (!selected || workspaceRefSet.has(selected)) return;
    const fallback = objMap.get(activeApplicationRoot.ref) ?? caf.objects[0] ?? null;
    if (fallback && fallback.ref !== selected) onSelect(fallback.ref);
  }, [activeApplicationRoot.ref, caf.objects, objMap, onSelect, selected, workspaceRefSet]);

  const selectedObject = selected && workspaceRefSet.has(selected) ? objMap.get(selected) ?? null : null;
  const activeObject = selectedObject ?? objMap.get(activeApplicationRoot.ref) ?? caf.objects[0] ?? null;
  const selectedIncoming = useMemo(() => (
    activeObject ? buildReferenceRows(referenceIndex, activeObject.ref) : []
  ), [activeObject, referenceIndex]);

  const sections = useMemo(() => {
    const buckets: Record<PanelKey, CafObject[]> = {
      'network-inputs': [],
      inputs: [],
      'misc-inputs': [],
      'setpoint-misc': [],
      'state-generation': [],
      'output-control': [],
      'network-outputs': [],
      outputs: [],
      'misc-outputs': [],
    };

    for (const obj of workspaceObjects) {
      const bucket = classifyPanelKey(obj, mode);
      buckets[bucket].push(obj);
    }

    for (const key of Object.keys(buckets) as PanelKey[]) {
      buckets[key] = sortObjects(buckets[key]);
    }

    return buckets;
  }, [mode, workspaceObjects]);

  const stateTableCandidates = useMemo(() => {
    if (!activeObject) return [];
    const descendants = collectDescendants(activeObject.ref, byParent).filter(candidate => workspaceObjects.some(obj => obj.ref === candidate.ref));
    return descendants.filter(candidate => {
      const hay = buildSearchText(candidate);
      return /state|table|logic|sequence|program|compare|calc|pid/.test(hay)
        || LOGIC_CLASSES.has(candidate.classid);
    });
  }, [activeObject, byParent, workspaceObjects]);

  useEffect(() => {
    setFeatureSection(current => {
      if (featureTab !== 'parameters') return current;
      if (PARAMETER_SECTIONS.some(section => section.id === current)) return current;
      return 'setpoint-misc';
    });
  }, [featureTab]);

  const handlePointerDown = useCallback((index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (index < 0 || index >= weights.length - 1) return;
    const width = layoutRef.current?.clientWidth ?? 1;
    dragRef.current = {
      index,
      startX: event.clientX,
      startWeights: [...weights],
      width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [weights]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const { index, startX, startWeights, width } = dragRef.current;
      const total = startWeights.reduce((sum, value) => sum + value, 0);
      const delta = ((event.clientX - startX) / Math.max(width, 1)) * total;
      const next = [...startWeights];
      const min = 0.55;
      const left = Math.max(min, next[index] + delta);
      const right = Math.max(min, next[index + 1] - delta);
      const applied = left - next[index];
      next[index] = left;
      next[index + 1] = right;

      const nextTotal = next.reduce((sum, value) => sum + value, 0);
      const scale = total / nextTotal;
      setWeights(next.map(value => Math.max(min, value * scale)));
      if (Math.abs(applied) > 0.0001) {
        event.preventDefault();
      }
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const sectionsByColumn = [
    [
      { key: 'network-inputs' as const, title: 'Network Inputs' },
      { key: 'inputs' as const, title: 'Inputs' },
      { key: 'misc-inputs' as const, title: 'Miscellaneous' },
    ],
    [{ key: 'setpoint-misc' as const, title: 'Setpoint/Miscellaneous' }],
    [{ key: 'state-generation' as const, title: 'State Generation' }],
    [{ key: 'output-control' as const, title: 'Output Control' }],
    [
      { key: 'network-outputs' as const, title: 'Network Outputs' },
      { key: 'outputs' as const, title: 'Outputs' },
      { key: 'misc-outputs' as const, title: 'Miscellaneous' },
    ],
  ];

  return (
    <div className="content" style={{ padding: 0, overflow: 'auto', height: '100%' }}>
      <div className="card" style={{ margin: 12 }}>
        <div className="card-header">
          CAF Workspace
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
            {activeApplicationLabel} · {workspaceObjects.length} layout object(s)
          </span>
        </div>
        <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>View</span>
          <button
            type="button"
            className={`commission-mode-tab${mode === 'control' ? ' commission-mode-tab-active' : ''}`}
            onClick={() => setMode('control')}
          >
            Control
          </button>
          <button
            type="button"
            className={`commission-mode-tab${mode === 'logic' ? ' commission-mode-tab-active' : ''}`}
            onClick={() => setMode('logic')}
          >
            Logic
          </button>
          {applicationRoots.length > 1 && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)' }}>
              Applications: {applicationRoots.length}
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
            Select a block to inspect parameters and references
          </span>
        </div>
      </div>

      <div className="card" style={{ margin: 12 }}>
        <div className="card-header">
          Application
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
            {activeObject ? displayName(activeObject) : 'Select a block'}
          </span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div
            ref={layoutRef}
            style={{
              display: 'flex',
              minHeight: 560,
              overflow: 'hidden',
              background: 'linear-gradient(180deg, #f1f5f9 0%, #dbe7f7 100%)',
              borderTop: '1px solid #a6b8d3',
            }}
          >
            {sectionsByColumn.map((columnSections, columnIndex) => (
              <FragmentColumn
                key={`col-${columnIndex}`}
                columnIndex={columnIndex}
                columnSections={columnSections}
                weights={weights}
                collapsed={collapsed}
                sections={sections}
                activeObject={activeObject}
                onSelect={onSelect}
                onToggleSection={(key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))}
                isLast={columnIndex === sectionsByColumn.length - 1}
                handlePointerDown={handlePointerDown}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ margin: 12 }}>
        <div className="card-header">Features</div>
        <div className="commission-feature-tabs">
          {FEATURE_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`commission-feature-tab${featureTab === tab.id ? ' commission-feature-tab-active' : ''}`}
              onClick={() => setFeatureTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 14, minHeight: 320 }}>
          {!activeObject ? (
            <div style={{ color: 'var(--text-dim)', padding: 16 }}>
              Select a block above to inspect its parameters, connections, and exposed properties.
            </div>
          ) : featureTab === 'parameters' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12, minHeight: 280 }}>
              <div className="commission-panel commission-panel-side" style={{ minHeight: 0 }}>
                <div className="commission-panel-header">
                  <span>Sections</span>
                  <span className="commission-panel-count">{PARAMETER_SECTIONS.length}</span>
                </div>
                <div className="commission-panel-list" style={{ maxHeight: 'none' }}>
                  {PARAMETER_SECTIONS.map(section => (
                    <button
                      key={section.id}
                      type="button"
                      className={`commission-panel-item${featureSection === section.id ? ' commission-panel-item-active' : ''}`}
                      onClick={() => setFeatureSection(section.id)}
                    >
                      <div className="commission-panel-item-title">{section.label}</div>
                      <div className="commission-panel-item-meta">
                        {makeDisplayValue(filterPropertiesForSection(activeObject, section.id).length)} item(s)
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>{displayName(activeObject)}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{activeObject.description || activeObject.ref}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
                  {makeObjectMetadata(activeObject).slice(0, 3).map(([label, value]) => (
                    <div key={label} className="stat-box">
                      <div className="stat-label">{label}</div>
                      <div className="stat-value" style={{ fontSize: 13 }}>{value}</div>
                    </div>
                  ))}
                </div>

                <table className="sct-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Value</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderFeatureProperties(activeObject, featureSection).length === 0 ? (
                      <tr><td colSpan={3} style={{ color: 'var(--text-dim)', padding: 12 }}>No properties found.</td></tr>
                    ) : renderFeatureProperties(activeObject, featureSection).map(prop => (
                      <tr key={`${prop.id}:${prop.name}`}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{prop.name}</div>
                          <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>Property {prop.id}</div>
                        </td>
                        <td style={{ wordBreak: 'break-word' }}>{prop.value}</td>
                        <td style={{ color: 'var(--text-dim)' }}>{prop.valueType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : featureTab === 'connections' ? (
            <div>
              <div style={{ marginBottom: 12, color: 'var(--text-dim)', fontSize: 12 }}>
                Incoming references for <strong>{displayName(activeObject)}</strong>
              </div>
              {selectedIncoming.length === 0 ? (
                <div style={{ color: 'var(--text-dim)' }}>No incoming references found.</div>
              ) : (
                <table className="sct-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Attribute</th>
                      <th>Path</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedIncoming.map(hit => (
                      <tr key={`${hit.sourcePath ?? hit.source}:${hit.referringItem}:${hit.referringAttr}:${hit.referringPath ?? ''}`}>
                        <td>
                          <button className="link-button" onClick={() => onSelect(hit.referringItem)}>{hit.referringItem}</button>
                          <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{hit.sourcePath ?? hit.source}</div>
                        </td>
                        <td>{hit.referringAttr}</td>
                        <td style={{ wordBreak: 'break-word' }}>{hit.referringPath ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : featureTab === 'state-tables' ? (
            <div>
              <div style={{ marginBottom: 12, color: 'var(--text-dim)', fontSize: 12 }}>
                State and logic descendants for <strong>{displayName(activeObject)}</strong>
              </div>
              {stateTableCandidates.length === 0 ? (
                <div style={{ color: 'var(--text-dim)' }}>No state table or logic descendants found.</div>
              ) : (
                <table className="sct-table">
                  <thead>
                    <tr>
                      <th>Object</th>
                      <th>Class</th>
                      <th>Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stateTableCandidates.map(item => (
                      <tr key={item.ref}>
                        <td>
                          <button className="link-button" onClick={() => onSelect(item.ref)}>{displayName(item)}</button>
                          <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{item.description || '—'}</div>
                        </td>
                        <td>{item.className}</td>
                        <td style={{ fontFamily: 'Consolas, monospace', fontSize: 11, wordBreak: 'break-all' }}>{item.ref}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : featureTab === 'display' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="stat-box">
                <div className="stat-label">Display Name</div>
                <div className="stat-value" style={{ fontSize: 15 }}>{displayName(activeObject)}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Summary</div>
                <div className="stat-value" style={{ fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit' }}>
                  {activeObject.description || 'No description'}
                  <br />
                  {makeSummaryLine(activeObject)}
                  <br />
                  {activeObject.ref}
                </div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Children</div>
                <div className="stat-value" style={{ fontSize: 13 }}>
                  {collectDescendants(activeObject.ref, byParent).length.toLocaleString()} descendant object(s)
                </div>
              </div>
            </div>
          ) : featureTab === 'advanced' || featureTab === 'all-properties' ? (
            <ObjectPropertiesTable properties={activeObject.properties} />
          ) : featureTab === 'bacnet-exposed' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="stat-box">
                <div className="stat-label">BACnet Object</div>
                <div className="stat-value" style={{ fontSize: 14 }}>
                  {activeObject.bacoidType !== null && activeObject.bacoidInstance !== null ? `${activeObject.bacoidType}:${activeObject.bacoidInstance}` : 'Not exposed'}
                </div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Mapped Properties</div>
                <div className="stat-value" style={{ fontSize: 14 }}>{activeObject.properties.length}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">References</div>
                <div className="stat-value" style={{ fontSize: 14 }}>{selectedIncoming.length}</div>
              </div>
              <ObjectPropertiesTable properties={activeObject.properties.filter(prop => /bacnet|object|name|description|present|status|units/i.test(prop.name))} />
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        .link-button {
          background: none;
          border: none;
          color: var(--accent);
          cursor: pointer;
          padding: 0;
          font: inherit;
          text-align: left;
        }
        .link-button:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}

function FragmentColumn({
  columnIndex,
  columnSections,
  weights,
  collapsed,
  sections,
  activeObject,
  onSelect,
  onToggleSection,
  isLast,
  handlePointerDown,
}: {
  columnIndex: number;
  columnSections: Array<{ key: PanelKey; title: string }>;
  weights: number[];
  collapsed: Record<PanelKey, boolean>;
  sections: Record<PanelKey, CafObject[]>;
  activeObject: CafObject | null;
  onSelect: (ref: string) => void;
  onToggleSection: (key: PanelKey) => void;
  isLast: boolean;
  handlePointerDown: (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <>
      <div
        style={{
          flex: weights[columnIndex],
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 10,
        }}
      >
        {columnSections.map(section => (
          <SectionCard
            key={section.key}
            title={section.title}
            count={sections[section.key].length}
            collapsed={collapsed[section.key]}
            onToggle={() => onToggleSection(section.key)}
          >
            {sections[section.key].length === 0 ? (
              <div style={{ padding: 12, color: '#6d7f96', fontSize: 12 }}>No mapped objects</div>
            ) : sections[section.key].map(object => (
              <PanelItem
                key={object.ref}
                object={object}
                selected={activeObject?.ref === object.ref}
                onSelect={onSelect}
              />
            ))}
          </SectionCard>
        ))}
      </div>
      {!isLast && (
        <div
          role="separator"
          aria-label="Resize column"
          onPointerDown={handlePointerDown(columnIndex)}
          style={{
            width: 6,
            cursor: 'col-resize',
            flexShrink: 0,
            background: 'linear-gradient(180deg, rgba(154,176,207,0.3), rgba(154,176,207,0.7))',
            borderLeft: '1px solid #8ea6c7',
            borderRight: '1px solid #8ea6c7',
          }}
        />
      )}
    </>
  );
}
