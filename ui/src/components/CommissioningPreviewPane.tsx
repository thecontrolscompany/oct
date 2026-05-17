import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { HAS_API_HOST } from '../connection';
import type { CafObject, ParsedCaf, PerspectiveDetail, PerspectivePanel, PerspectiveSummary } from '../api';

type ApplicationLayout = {
  panels: Array<{ name: string; items: CafObject[] }>;
  objectMap: Map<string, CafObject>;
  childrenMap: Map<string, CafObject[]>;
};

type ApplicationRegions = {
  inputs: Array<{ name: string; items: CafObject[] }>;
  logic: Array<{ name: string; items: CafObject[] }>;
  outputs: Array<{ name: string; items: CafObject[] }>;
};

const DEFAULT_CAF_PATH = 'C:\\Users\\TimothyCollins\\dev\\cct\\CAFs\\upload.caf';
const DEFAULT_PERSPECTIVE = 'VAVSD-Damper Control';

export default function CommissioningPreviewPane() {
  const [cafPath, setCafPath] = useState(DEFAULT_CAF_PATH);
  const [selectedPerspective, setSelectedPerspective] = useState(DEFAULT_PERSPECTIVE);
  const [selectedAppRef, setSelectedAppRef] = useState<string | null>(null);
  const [selectedFeatureTab, setSelectedFeatureTab] = useState('Parameters');

  const { data: perspectives = [] } = useQuery({
    queryKey: ['perspectives'],
    queryFn: api.perspectives.list,
    enabled: HAS_API_HOST,
  });

  const { data: caf, isLoading: loadingCaf, error: cafError } = useQuery({
    queryKey: ['preview', 'caf', cafPath],
    queryFn: () => api.caf.parsePath(cafPath),
    enabled: HAS_API_HOST && !!cafPath.trim(),
  });

  const { data: perspective, isLoading: loadingPerspective, error: perspectiveError } = useQuery({
    queryKey: ['preview', 'perspective', selectedPerspective],
    queryFn: () => api.perspectives.detail(selectedPerspective),
    enabled: HAS_API_HOST && !!selectedPerspective,
  });

  const appLayout = caf && perspective ? buildApplicationLayout(caf, perspective) : null;
  const applicationRegions = appLayout ? groupApplicationPanels(appLayout.panels) : null;
  const selectedAppObject = appLayout && selectedAppRef ? appLayout.objectMap.get(selectedAppRef) ?? null : null;
  const featureTabs = perspective?.featureTabs ?? [];

  useEffect(() => {
    if (!featureTabs.length) {
      setSelectedFeatureTab('Parameters');
      return;
    }
    setSelectedFeatureTab(current => (
      current === 'Parameters' || featureTabs.some(tab => tab.name === current) ? current : 'Parameters'
    ));
  }, [featureTabs]);

  return (
    <div className="content" style={{ overflow: 'auto' }}>
      <div className="card">
        <div className="card-header">
          Offline Commissioning Preview
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
            CAF defaults only · no BACnet connection required
          </span>
        </div>
        <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>CAF File</div>
            <input
              type="text"
              value={cafPath}
              onChange={e => { setCafPath(e.target.value); setSelectedAppRef(null); }}
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', color: 'var(--text)', width: 420, fontSize: 12 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Perspective</div>
            <select
              value={selectedPerspective}
              onChange={e => { setSelectedPerspective(e.target.value); setSelectedAppRef(null); }}
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', color: 'var(--text)', minWidth: 240, fontSize: 12 }}
            >
              {perspectives.map((item: PerspectiveSummary) => (
                <option key={item.name} value={item.name}>{item.name}</option>
              ))}
            </select>
          </div>
        </div>
        {!HAS_API_HOST && (
          <div className="card-body" style={{ color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Commissioning preview needs a configured backend. This deployment only has the UI, so CAF and Perspective lookups are disabled here.
          </div>
        )}
        {(loadingCaf || loadingPerspective) && <div className="card-body" style={{ color: 'var(--text-dim)' }}>Loading preview…</div>}
        {HAS_API_HOST && cafError && <div className="card-body" style={{ color: 'var(--danger)' }}>CAF error: {String(cafError)}</div>}
        {HAS_API_HOST && perspectiveError && <div className="card-body" style={{ color: 'var(--danger)' }}>Perspective error: {String(perspectiveError)}</div>}
      </div>

      {caf && perspective && applicationRegions && (
        <>
          <div className="card">
            <div className="card-header">
              Application Preview
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
                {caf.controller.tag || caf.controller.modelName} · {perspective.name}
              </span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="commission-shell">
                <div className="commission-mode-row">
                  <button className="commission-mode-tab commission-mode-tab-active">Control</button>
                  <button className="commission-mode-tab">Logic</button>
                </div>

                <div className="commission-workbench">
                  <div className="commission-side-column">
                    {applicationRegions.inputs.map(panel => (
                      <ApplicationPanel key={panel.name} panel={panel} selectedRef={selectedAppRef} onSelect={setSelectedAppRef} variant="side" />
                    ))}
                  </div>

                  <div className="commission-logic-column">
                    <div className="commission-logic-grid">
                      {applicationRegions.logic.map(panel => (
                        <ApplicationPanel key={panel.name} panel={panel} selectedRef={selectedAppRef} onSelect={setSelectedAppRef} variant="logic" />
                      ))}
                    </div>
                  </div>

                  <div className="commission-side-column">
                    {applicationRegions.outputs.map(panel => (
                      <ApplicationPanel key={panel.name} panel={panel} selectedRef={selectedAppRef} onSelect={setSelectedAppRef} variant="side" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">Features</div>
            <div className="commission-feature-tabs">
              <button
                className={`commission-feature-tab${selectedFeatureTab === 'Parameters' ? ' commission-feature-tab-active' : ''}`}
                onClick={() => setSelectedFeatureTab('Parameters')}
              >
                Parameters
              </button>
              {featureTabs.map(tab => (
                <button
                  key={tab.name}
                  className={`commission-feature-tab${selectedFeatureTab === tab.name ? ' commission-feature-tab-active' : ''}`}
                  onClick={() => setSelectedFeatureTab(tab.name)}
                >
                  {tab.name}
                </button>
              ))}
            </div>

            {selectedFeatureTab === 'Parameters' ? (
              selectedAppObject && appLayout ? (
                <PreviewParameters layout={appLayout} object={selectedAppObject} />
              ) : (
                <div className="card-body" style={{ color: 'var(--text-dim)' }}>
                  Select an application block above to preview its parameters and CAF defaults.
                </div>
              )
            ) : (
              <div className="card-body" style={{ color: 'var(--text-dim)' }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedFeatureTab}</div>
                Offline preview currently wires up the Parameters tab only.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ApplicationPanel({
  panel,
  selectedRef,
  onSelect,
  variant = 'logic',
}: {
  panel: { name: string; items: CafObject[] };
  selectedRef: string | null;
  onSelect: (ref: string) => void;
  variant?: 'side' | 'logic';
}) {
  const visibleItems = panel.items.filter(item => shouldShowPanelItem(item, variant));

  return (
    <div className={`commission-panel commission-panel-${variant}`}>
      <div className="commission-panel-header">
        <span>{panel.name}</span>
        <span className="commission-panel-count">{visibleItems.length}</span>
      </div>
      <div className="commission-panel-list">
        {visibleItems.length === 0 ? (
          <div style={{ padding: 12, color: 'var(--text-dim)', fontSize: 12 }}>No mapped objects</div>
        ) : visibleItems.map(item => {
          const active = selectedRef === item.ref;
          return (
            <button
              key={item.ref}
              onClick={() => onSelect(item.ref)}
              className={`commission-panel-item${active ? ' commission-panel-item-active' : ''}`}
            >
              <div className="commission-panel-item-title">{displayPanelItemTitle(item)}</div>
              <div className="commission-panel-item-meta">{buildPanelItemMeta(item)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewParameters({ layout, object }: { layout: ApplicationLayout; object: CafObject }) {
  const descendants = layout.childrenMap.get(object.ref) ?? [];
  const parameters = descendants.filter(candidate =>
    candidate.ref !== object.ref &&
    (candidate.defaultValue !== null || candidate.units !== null || candidate.classid === 526 || candidate.classid === 527 || candidate.classid === 528 || candidate.classid === 529 || candidate.classid === 530 || candidate.classid === 531)
  );

  return (
    <div className="card-body">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>{displayAppName(object)}</div>
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{object.description || object.className}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <MiniStat label="Class" value={object.className} />
        <MiniStat label="BACoid" value={object.bacoidType !== null && object.bacoidInstance !== null ? `${object.bacoidType}:${object.bacoidInstance}` : '—'} />
        <MiniStat label="Parameters" value={parameters.length} />
      </div>

      <table className="attr-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Default Value</th>
            <th>Units</th>
            <th>Standard Name</th>
          </tr>
        </thead>
        <tbody>
          {parameters.length === 0 ? (
            <tr><td colSpan={4} style={{ color: 'var(--text-dim)', padding: 12 }}>No parameter children found for this application object.</td></tr>
          ) : parameters.map(param => (
            <tr key={param.ref}>
              <td>
                <div style={{ fontWeight: 500 }}>{param.tag || param.shortTag || param.className}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{param.className}</div>
              </td>
              <td className="attr-value">{param.defaultValue !== null ? String(param.defaultValue) : '—'}</td>
              <td>{param.units ?? '—'}</td>
              <td>{param.description || param.shortTag || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-box" style={{ minWidth: 120 }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

function buildApplicationLayout(caf: ParsedCaf, perspective: PerspectiveDetail): ApplicationLayout {
  const objectMap = new Map<string, CafObject>(caf.objects.map(object => [object.ref, object]));
  const childrenMap = new Map<string, CafObject[]>();

  caf.objects.forEach(object => {
    let current = object.parentRef;
    while (current) {
      const list = childrenMap.get(current) ?? [];
      list.push(object);
      childrenMap.set(current, list);
      current = objectMap.get(current)?.parentRef ?? null;
    }
  });

  const panels = perspective.applicationPanels.map(panel => ({
    name: panel.name,
    items: resolvePanelObjects(panel, caf.objects),
  }));

  return { panels, objectMap, childrenMap };
}

function groupApplicationPanels(panels: ApplicationLayout['panels']): ApplicationRegions {
  const inputs: ApplicationRegions['inputs'] = [];
  const logic: ApplicationRegions['logic'] = [];
  const outputs: ApplicationRegions['outputs'] = [];

  panels.forEach(panel => {
    const key = panel.name.toUpperCase();
    if (key.includes('INPUT') || key.includes('SENSOR')) {
      inputs.push(panel);
      return;
    }
    if (key.includes('OUTPUT') || key.includes('CONTROL') || key.includes('ACTUATOR')) {
      outputs.push(panel);
      return;
    }
    logic.push(panel);
  });

  return { inputs, logic, outputs };
}

function resolvePanelObjects(panel: PerspectivePanel, objects: CafObject[]): CafObject[] {
  if (panel.criteriaType === 'BACOID') {
    const targetIds = new Set(panel.bacoidIds);
    return objects.filter(object => {
      const key = toPerspectiveBacoid(object);
      return key !== null && targetIds.has(key);
    });
  }

  if (panel.criteriaType === 'UI_COLUMN' && panel.column) {
    return objects.filter(object => matchesUiColumn(panel.column!, object));
  }

  return [];
}

function matchesUiColumn(column: string, object: CafObject): boolean {
  const isNetworkPoint = object.classid >= 163 && object.classid <= 168;
  const isHardwareInput = object.classid === 240 || object.classid === 242 || object.classid === 243 || object.classid === 671 || object.classid === 673;
  const isHardwareOutput = object.classid === 239 || object.classid === 241 || object.classid === 672 || object.classid === 674;

  switch (column) {
    case 'NETWORK_INPUTS':
      return isNetworkPoint && (object.bacoidType === 0 || object.bacoidType === 2 || object.bacoidType === 3 || object.bacoidType === 5 || object.bacoidType === 13 || object.bacoidType === 19);
    case 'SENSORS':
      return isHardwareInput;
    case 'MISCELLANEOUS_INPUTS':
      return !isHardwareInput && !isNetworkPoint && hasInputLikeName(object);
    case 'NETWORK_OUTPUTS':
      return isNetworkPoint && (object.bacoidType === 1 || object.bacoidType === 4 || object.bacoidType === 14);
    case 'CONTROL_POINTS':
      return isHardwareOutput;
    case 'MISCELLANEOUS_OUTPUTS':
      return !isHardwareOutput && hasOutputLikeName(object);
    default:
      return false;
  }
}

function hasInputLikeName(object: CafObject): boolean {
  const name = `${object.tag} ${object.shortTag} ${object.description}`.toUpperCase();
  return name.includes('-SP') || name.includes('MODE') || name.includes('STATUS') || name.includes('LOCKOUT');
}

function hasOutputLikeName(object: CafObject): boolean {
  const name = `${object.tag} ${object.shortTag} ${object.description}`.toUpperCase();
  return name.includes('CMD') || name.includes('OUTPUT') || name.includes('%') || name.includes('CTRL') || name.includes('REQUIRED');
}

function toPerspectiveBacoid(object: CafObject): number | null {
  if (object.bacoidType === null || object.bacoidInstance === null) return null;
  return object.bacoidType * 4194304 + object.bacoidInstance;
}

function displayAppName(object: CafObject): string {
  return object.tag || object.description || object.shortTag || `${object.className} ${object.objectid}`;
}

function displayPanelItemTitle(object: CafObject): string {
  const candidates = [object.tag, object.description, object.shortTag]
    .map(value => value?.trim() ?? '')
    .filter(Boolean)
    .filter(value => !looksLikeCafRef(value));

  if (candidates.length > 0) return candidates[0];
  if (object.bacoidType !== null && object.bacoidInstance !== null) return `${object.className} ${object.bacoidType}:${object.bacoidInstance}`;
  return `${object.className} ${object.objectid}`;
}

function buildPanelItemMeta(object: CafObject): string {
  const parts: string[] = [];

  if (object.shortTag && !looksLikeCafRef(object.shortTag) && object.shortTag !== displayPanelItemTitle(object)) {
    parts.push(object.shortTag);
  }

  if (object.bacoidType !== null && object.bacoidInstance !== null) {
    parts.push(`BACnet ${object.bacoidType}:${object.bacoidInstance}`);
  } else {
    parts.push(object.className);
  }

  return parts.join(' · ');
}

function looksLikeCafRef(value: string): boolean {
  return /^8-1([/.].+)?$/i.test(value.trim());
}

function hasFriendlyPanelLabel(object: CafObject): boolean {
  return [object.tag, object.description, object.shortTag]
    .map(value => value?.trim() ?? '')
    .some(value => value !== '' && !looksLikeCafRef(value));
}

function shouldShowPanelItem(object: CafObject, variant: 'side' | 'logic'): boolean {
  if (variant === 'logic') return true;
  if (hasFriendlyPanelLabel(object)) return true;

  const isBacnetPoint = object.bacoidType !== null && object.bacoidInstance !== null;
  const isHardwareIo = object.classid === 239 || object.classid === 240 || object.classid === 241 || object.classid === 242 || object.classid === 243 || object.classid === 671 || object.classid === 672 || object.classid === 673 || object.classid === 674;

  return isBacnetPoint && isHardwareIo;
}
