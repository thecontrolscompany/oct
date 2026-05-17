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

const HW_INPUT_CLASSES  = new Set([240, 242, 243, 671, 673]);
const HW_OUTPUT_CLASSES = new Set([239, 241, 672, 674]);

// CCT Signal Blocks — 526/528/530 = Input Float/Enum/Boolean, 527/529/531 = Output Float/Enum/Boolean
// Only objects with a friendly label are network interface points; the rest are internal wires.
const NETWORK_INPUT_CLASSES  = new Set([526, 528, 530]);
const NETWORK_OUTPUT_CLASSES = new Set([527, 529, 531]);

// CCT primitive/logic classids
// 536=Control Activity, 538=Last Value, 539=Reliability Check, 540=State Selection
// 543=Command Hierarchy, 551=Float Constant, 556=Sensor Primitive, 559=Boolean Primitive
// 560=Comparison Primitive, 561=Math Primitive, 562=Mux Primitive, 568=Enum Constant
const SETPOINT_CLASSES    = new Set([538, 551, 568]);       // Constants + Last Value
const STATE_GEN_CLASSES   = new Set([536, 540, 559, 562]);  // Control Activity + state primitives
const OUTPUT_CTRL_CLASSES = new Set([543]);
const SENSOR_CLASSES      = new Set([556, 539]); // Sensor Primitive, Reliability Check → Inputs

const LOGIC_CLASSES = new Set([307, 540, 555, 575, 585, 862]);

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

function looksLikeCafRef(value: string): boolean {
  return /^8-1([/.].+)?$/i.test(value.trim());
}

function hasFriendlyLabel(obj: CafObject): boolean {
  return [obj.tag, obj.description, obj.shortTag]
    .map(value => value?.trim() ?? '')
    .some(value => value !== '' && !looksLikeCafRef(value));
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

function isRenderableWorkspaceObject(obj: CafObject, _mode: WorkspaceMode, ctrl536Refs?: Set<string>): boolean {
  // Always render hardware I/O
  if (HW_INPUT_CLASSES.has(obj.classid) || HW_OUTPUT_CLASSES.has(obj.classid)) return true;
  // Signal blocks: only those with a readable label are interface points; rest are internal wires
  if (NETWORK_INPUT_CLASSES.has(obj.classid) || NETWORK_OUTPUT_CLASSES.has(obj.classid)) return hasFriendlyLabel(obj);
  // Application-level structure and sensor blocks — always show
  if (obj.classid === 575 || obj.classid === 585) return true;
  if (SENSOR_CLASSES.has(obj.classid)) return true;
  // Control Activities (536) — show all; they ARE the logic program blocks
  // Command Hierarchies (543) — show only when a direct child of a 536
  if (obj.classid === 536) return true;
  if (obj.classid === 543) return ctrl536Refs ? (obj.parentRef !== null && ctrl536Refs.has(obj.parentRef)) : true;
  // Control Points (555) — always show
  if (obj.classid === 555) return true;
  // Math (561), Comparison (560), State Selection (540) — always show
  if (obj.classid === 560 || obj.classid === 561 || obj.classid === 540) return true;
  // Constants, Last Value, Boolean/Mux primitives (538, 551, 559, 562, 568) — only if named
  if (SETPOINT_CLASSES.has(obj.classid) || obj.classid === 559 || obj.classid === 562) return hasFriendlyLabel(obj);
  // Fallback: any other named object that looks like logic/setpoint/output-control
  if (hasFriendlyLabel(obj) && (isLogicLike(obj) || isSetpointLike(obj) || isOutputControlLike(obj))) return true;
  return false;
}

function classifyPanelKey(obj: CafObject, mode: WorkspaceMode): PanelKey {
  // Network interface first — signal blocks with friendly labels
  if (NETWORK_INPUT_CLASSES.has(obj.classid)) return 'network-inputs';
  if (NETWORK_OUTPUT_CLASSES.has(obj.classid)) {
    // Output blocks that look like a calculated setpoint belong in setpoint-misc
    if (isSetpointLike(obj)) return 'setpoint-misc';
    return 'network-outputs';
  }

  // Physical hardware I/O
  if (HW_INPUT_CLASSES.has(obj.classid)) return 'inputs';
  if (HW_OUTPUT_CLASSES.has(obj.classid)) return 'outputs';

  // Sensor Primitive and Reliability Check → misc-inputs
  if (SENSOR_CLASSES.has(obj.classid)) return 'misc-inputs';

  // Command Hierarchy → output-control
  if (OUTPUT_CTRL_CLASSES.has(obj.classid)) return 'output-control';

  // Control Point (555): output-control; in logic mode with bacoid → network-outputs
  if (obj.classid === 555) {
    if (mode === 'logic' && obj.bacoidType !== null) return 'network-outputs';
    return 'output-control';
  }

  // Control Activities, State Selection, Boolean/Mux primitives → state-generation
  if (STATE_GEN_CLASSES.has(obj.classid)) return 'state-generation';

  // Constants and Last Value → setpoint-misc
  if (SETPOINT_CLASSES.has(obj.classid)) {
    if (isOutputControlLike(obj)) return 'output-control';
    return 'setpoint-misc';
  }

  // Math (561) and Comparison (560): keyword-guided
  if (obj.classid === 561 || obj.classid === 560) {
    if (isOutputControlLike(obj)) return 'output-control';
    if (isSetpointLike(obj)) return 'setpoint-misc';
    return 'state-generation';
  }

  // Keyword-based fallback
  if (isOutputControlLike(obj)) return 'output-control';
  if (isSetpointLike(obj)) return 'setpoint-misc';
  if (isLogicLike(obj)) return 'state-generation';
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

// Extract connected object refs from prop 3184 (connection port array: attrref elements)
// and from direct attrref/ref values in other props — gives a quick "wired to" list
function extractWiredRefs(obj: CafObject): { portId: number; targetRef: string }[] {
  const results: { portId: number; targetRef: string }[] = [];
  for (const prop of obj.properties) {
    if (prop.value && /^8-1[/.]/.test(prop.value.trim())) {
      results.push({ portId: prop.id, targetRef: prop.value.trim() });
    }
  }
  return results;
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
  flex,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  flex?: number;
}) {
  return (
    <div
      className="commission-panel commission-panel-side"
      style={{ minHeight: 0, flex: flex ?? 1, display: 'flex', flexDirection: 'column' }}
    >
      <div className="commission-panel-header" style={{ cursor: 'pointer', flexShrink: 0 }} onClick={onToggle}>
        <span>{title}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="commission-panel-count">{count}</span>
          <span aria-hidden="true" style={{ fontSize: 11, color: '#456385' }}>{collapsed ? '▸' : '▾'}</span>
        </span>
      </div>
      {!collapsed && (
        <div className="commission-panel-list ws-section-list">
          {children}
        </div>
      )}
    </div>
  );
}

function isHwIO(obj: CafObject): boolean {
  return HW_INPUT_CLASSES.has(obj.classid) || HW_OUTPUT_CLASSES.has(obj.classid);
}

function isExpansionPoint(obj: CafObject, controllerRef: string): boolean {
  // Expansion module points have a parentRef that is NOT the controller itself
  return isHwIO(obj) && obj.parentRef !== null && obj.parentRef !== controllerRef;
}

function PanelItem({
  object,
  selected,
  onSelect,
  controllerRef,
}: {
  object: CafObject;
  selected: boolean;
  onSelect: (ref: string) => void;
  controllerRef: string;
}) {
  const isHW = isHwIO(object);
  const isExp = isHW && isExpansionPoint(object, controllerRef);
  const physicalPoint = isHW ? object.shortTag : null;

  return (
    <button
      type="button"
      className={`commission-panel-item${selected ? ' commission-panel-item-active' : ''}`}
      onClick={() => onSelect(object.ref)}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="commission-panel-item-title">{displayName(object)}</span>
        {physicalPoint && (
          <span style={{ fontSize: 10, fontFamily: 'Consolas, monospace', color: selected ? 'rgba(255,255,255,0.75)' : 'var(--accent)', flexShrink: 0 }}>
            {physicalPoint}
          </span>
        )}
        {isExp && (
          <span style={{ fontSize: 9, color: selected ? 'rgba(255,255,255,0.6)' : 'var(--text-dim)', flexShrink: 0 }}>
            EXP
          </span>
        )}
      </div>
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
  const [activeAppIndex, setActiveAppIndex] = useState(0);
  const [panelSearch, setPanelSearch] = useState('');
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
  const [layoutHeight, setLayoutHeight] = useState(580);
  const [sectionWeights, setSectionWeights] = useState<Record<number, number[]>>({
    0: [1, 1, 1],
    4: [1, 1, 1],
  });
  const dragRef = useRef<
    | { kind: 'col'; index: number; startX: number; startWeights: number[]; totalW: number }
    | { kind: 'sec'; col: number; sec: number; startY: number; startWeights: number[]; totalH: number }
    | { kind: 'h'; startY: number; startH: number }
    | null
  >(null);
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

  const activeApplicationRoot = applicationRoots[activeAppIndex]?.obj
    ?? applicationRoots[0]?.obj
    ?? caf.objects.find(obj => obj.parentRef === caf.controller.ref && obj.classid === 575)
    ?? caf.objects.find(obj => obj.parentRef === caf.controller.ref && (byParent.get(obj.ref)?.length ?? 0) > 0)
    ?? caf.controller;
  const activeApplicationLabel = displayName(activeApplicationRoot);

  // Reset app index when CAF changes
  useEffect(() => { setActiveAppIndex(0); setPanelSearch(''); }, [caf]);

  const workspaceObjects = useMemo(() => {
    const appSubtree = [activeApplicationRoot, ...collectDescendants(activeApplicationRoot.ref, byParent)];
    // Hardware I/O objects are direct children of the controller, not inside the application subtree
    const controllerChildren = byParent.get(caf.controller.ref) ?? [];
    const hwIO = controllerChildren.filter(obj =>
      (HW_INPUT_CLASSES.has(obj.classid) || HW_OUTPUT_CLASSES.has(obj.classid)) &&
      obj.ref !== activeApplicationRoot.ref,
    );
    const seen = new Set(appSubtree.map(o => o.ref));
    return [...appSubtree, ...hwIO.filter(o => !seen.has(o.ref))];
  }, [activeApplicationRoot, byParent, caf.controller.ref]);

  const panelSearchQuery = panelSearch.trim().toLowerCase();
  const renderedWorkspaceObjects = useMemo(() => {
    const ctrl536Refs = new Set(workspaceObjects.filter(o => o.classid === 536).map(o => o.ref));
    const base = workspaceObjects.filter(obj => isRenderableWorkspaceObject(obj, mode, ctrl536Refs));
    if (!panelSearchQuery) return base;
    return base.filter(obj => buildSearchText(obj).includes(panelSearchQuery));
  }, [mode, workspaceObjects, panelSearchQuery]);
  const workspaceRefSet = useMemo(() => new Set(renderedWorkspaceObjects.map(obj => obj.ref)), [renderedWorkspaceObjects]);

  const selectedObject = selected ? objMap.get(selected) ?? null : null;
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

    for (const obj of renderedWorkspaceObjects) {
      const bucket = classifyPanelKey(obj, mode);
      buckets[bucket].push(obj);
    }

    for (const key of Object.keys(buckets) as PanelKey[]) {
      buckets[key] = sortObjects(buckets[key]);
    }

    return buckets;
  }, [mode, renderedWorkspaceObjects]);

  const stateTableCandidates = useMemo(() => {
    if (!activeObject) return [];
    const descendants = collectDescendants(activeObject.ref, byParent).filter(candidate => workspaceRefSet.has(candidate.ref));
    return descendants.filter(candidate => {
      const hay = buildSearchText(candidate);
      return /state|table|logic|sequence|program|compare|calc|pid/.test(hay)
        || LOGIC_CLASSES.has(candidate.classid);
    });
  }, [activeObject, byParent, workspaceRefSet]);

  useEffect(() => {
    setFeatureSection(current => {
      if (featureTab !== 'parameters') return current;
      if (PARAMETER_SECTIONS.some(section => section.id === current)) return current;
      return 'setpoint-misc';
    });
  }, [featureTab]);

  const handlePointerDown = useCallback((index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (index < 0 || index >= weights.length - 1) return;
    const totalW = layoutRef.current?.clientWidth ?? 1;
    dragRef.current = { kind: 'col', index, startX: event.clientX, startWeights: [...weights], totalW };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [weights]);

  const handleSectionPointerDown = useCallback(
    (col: number, sec: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      const totalH = layoutRef.current?.clientHeight ?? layoutHeight;
      dragRef.current = {
        kind: 'sec', col, sec,
        startY: event.clientY,
        startWeights: [...(sectionWeights[col] ?? [1, 1, 1])],
        totalH,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [sectionWeights, layoutHeight],
  );

  const handleHeightPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { kind: 'h', startY: event.clientY, startH: layoutHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [layoutHeight]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const op = dragRef.current;
      if (!op) return;
      if (op.kind === 'col') {
        const { index, startX, startWeights, totalW } = op;
        const total = startWeights.reduce((s, v) => s + v, 0);
        const delta = ((event.clientX - startX) / Math.max(totalW, 1)) * total;
        const next = [...startWeights];
        const min = 0.55;
        next[index] = Math.max(min, next[index] + delta);
        next[index + 1] = Math.max(min, next[index + 1] - delta);
        const scale = total / next.reduce((s, v) => s + v, 0);
        setWeights(next.map(v => Math.max(min, v * scale)));
      } else if (op.kind === 'sec') {
        const { col, sec, startY, startWeights, totalH } = op;
        const total = startWeights.reduce((s, v) => s + v, 0);
        const delta = ((event.clientY - startY) / Math.max(totalH, 1)) * total;
        const next = [...startWeights];
        const min = 0.2;
        next[sec] = Math.max(min, next[sec] + delta);
        next[sec + 1] = Math.max(min, next[sec + 1] - delta);
        const scale = total / next.reduce((s, v) => s + v, 0);
        setSectionWeights(prev => ({ ...prev, [col]: next.map(v => Math.max(min, v * scale)) }));
      } else if (op.kind === 'h') {
        setLayoutHeight(Math.max(240, op.startH + (event.clientY - op.startY)));
      }
      event.preventDefault();
    };

    const onUp = () => { dragRef.current = null; };
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
            {activeApplicationLabel} · {renderedWorkspaceObjects.length}{panelSearchQuery ? ' matching' : ''} object(s)
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
            <>
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)' }}>Application</span>
              <select
                value={activeAppIndex}
                onChange={e => { setActiveAppIndex(parseInt(e.target.value)); setPanelSearch(''); }}
                style={{
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
                  padding: '3px 8px', color: 'var(--text)', fontSize: 12,
                }}
              >
                {applicationRoots.map((root, i) => (
                  <option key={root.obj.ref} value={i}>
                    {displayName(root.obj)} ({root.descendantCount} objects)
                  </option>
                ))}
              </select>
            </>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Filter panels…"
              value={panelSearch}
              onChange={e => setPanelSearch(e.target.value)}
              style={{ width: 180, fontSize: 12 }}
            />
            {panelSearch && (
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => setPanelSearch('')}>Clear</button>
            )}
          </div>
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
              height: layoutHeight,
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
                sectionWeights={sectionWeights}
                collapsed={collapsed}
                sections={sections}
                activeObject={activeObject}
                onSelect={onSelect}
                onToggleSection={(key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))}
                isLast={columnIndex === sectionsByColumn.length - 1}
                isFiltered={!!panelSearchQuery}
                controllerRef={caf.controller.ref}
                handlePointerDown={handlePointerDown}
                handleSectionPointerDown={handleSectionPointerDown}
              />
            ))}
          </div>
          <div
            role="separator"
            aria-label="Resize workspace height"
            onPointerDown={handleHeightPointerDown}
            style={{
              height: 6,
              cursor: 'ns-resize',
              flexShrink: 0,
              background: 'linear-gradient(90deg, rgba(154,176,207,0.25), rgba(154,176,207,0.6), rgba(154,176,207,0.25))',
              borderTop: '1px solid #8ea6c7',
            }}
          />
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Wired connections (from property values that are object refs) */}
              {(() => {
                const wired = extractWiredRefs(activeObject);
                if (wired.length === 0) return null;
                return (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>WIRED CONNECTIONS</div>
                    <table className="sct-table">
                      <thead><tr><th>Connected object</th><th>Label</th><th>Property</th></tr></thead>
                      <tbody>
                        {wired.map(({ portId, targetRef }) => {
                          const target = objMap.get(targetRef);
                          return (
                            <tr key={`${portId}:${targetRef}`}>
                              <td>
                                <button className="link-button" onClick={() => onSelect(targetRef)}>{targetRef}</button>
                              </td>
                              <td style={{ color: 'var(--text-dim)' }}>{target ? displayName(target) : '—'}</td>
                              <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>Prop {portId}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* Incoming references from the reference index */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>
                  INCOMING REFERENCES ({selectedIncoming.length})
                </div>
                {selectedIncoming.length === 0 ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No incoming references found.</div>
                ) : (
                  <table className="sct-table">
                    <thead>
                      <tr><th>Source</th><th>Attribute</th><th>Path</th></tr>
                    </thead>
                    <tbody>
                      {selectedIncoming.map(hit => (
                        <tr key={`${hit.sourcePath ?? hit.source}:${hit.referringItem}:${hit.referringAttr}:${hit.referringPath ?? ''}`}>
                          <td>
                            <button className="link-button" onClick={() => onSelect(hit.referringItem)}>
                              {(() => { const o = objMap.get(hit.referringItem); return o ? displayName(o) : hit.referringItem; })()}
                            </button>
                            <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{hit.referringItem}</div>
                          </td>
                          <td style={{ color: 'var(--text-dim)' }}>{hit.referringAttr}</td>
                          <td style={{ wordBreak: 'break-word', fontSize: 11, color: 'var(--text-dim)' }}>{hit.referringPath ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
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
        .link-button:hover { text-decoration: underline; }
        .ws-section-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          max-height: none;
        }
        .ws-section-list::-webkit-scrollbar { width: 4px; }
        .ws-section-list::-webkit-scrollbar-track { background: transparent; }
        .ws-section-list::-webkit-scrollbar-thumb {
          background: rgba(100, 130, 160, 0.4);
          border-radius: 2px;
        }
        .ws-section-list::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 130, 160, 0.75);
        }
      `}</style>
    </div>
  );
}

function FragmentColumn({
  columnIndex,
  columnSections,
  weights,
  sectionWeights,
  collapsed,
  sections,
  activeObject,
  onSelect,
  onToggleSection,
  isLast,
  isFiltered,
  controllerRef,
  handlePointerDown,
  handleSectionPointerDown,
}: {
  columnIndex: number;
  columnSections: Array<{ key: PanelKey; title: string }>;
  weights: number[];
  sectionWeights: Record<number, number[]>;
  collapsed: Record<PanelKey, boolean>;
  sections: Record<PanelKey, CafObject[]>;
  activeObject: CafObject | null;
  onSelect: (ref: string) => void;
  onToggleSection: (key: PanelKey) => void;
  controllerRef: string;
  isLast: boolean;
  isFiltered: boolean;
  handlePointerDown: (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleSectionPointerDown: (col: number, sec: number) => (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const colWeights = sectionWeights[columnIndex];
  return (
    <>
      <div
        style={{
          flex: weights[columnIndex],
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: 8,
        }}
      >
        {columnSections.flatMap((section, sectionIndex) => [
          <SectionCard
            key={section.key}
            title={section.title}
            count={sections[section.key].length}
            collapsed={collapsed[section.key]}
            flex={colWeights?.[sectionIndex] ?? 1}
            onToggle={() => onToggleSection(section.key)}
          >
            {sections[section.key].length === 0 ? (
              <div style={{ padding: 12, color: '#6d7f96', fontSize: 12 }}>
                {isFiltered ? 'No matches' : 'No mapped objects'}
              </div>
            ) : sections[section.key].map(object => (
              <PanelItem
                key={object.ref}
                object={object}
                selected={activeObject?.ref === object.ref}
                onSelect={onSelect}
                controllerRef={controllerRef}
              />
            ))}
          </SectionCard>,
          ...(sectionIndex < columnSections.length - 1 ? [
            <div
              key={`sec-drag-${sectionIndex}`}
              role="separator"
              aria-label="Resize section"
              onPointerDown={handleSectionPointerDown(columnIndex, sectionIndex)}
              style={{
                height: 5,
                cursor: 'row-resize',
                flexShrink: 0,
                background: 'linear-gradient(90deg, rgba(154,176,207,0.25), rgba(154,176,207,0.6), rgba(154,176,207,0.25))',
                borderTop: '1px solid #8ea6c7',
                borderBottom: '1px solid #8ea6c7',
              }}
            />,
          ] : []),
        ])}
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
