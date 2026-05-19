import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { HAS_API_HOST, wsUrl } from '../connection';
import type {
  BacnetDevice,
  BacnetObject,
  CommissioningTemplate,
  IoPoint,
  LiveCommissioningPoint,
  ParsedCaf,
  PerspectiveDetail,
  PerspectivePanel,
  PerspectiveSummary,
} from '../api';
import MstpDiagnostics from './MstpDiagnostics';

export default function LivePane() {
  const [liveTab, setLiveTab] = useState<'devices' | 'mstp'>('devices');
  const [selectedDevice, setSelectedDevice] = useState<BacnetDevice | null>(null);
  const [selectedObj, setSelectedObj] = useState<BacnetObject | null>(null);
  const [selectedDownstreamNode, setSelectedDownstreamNode] = useState<number | null>(null);
  const [directIp, setDirectIp] = useState('');
  const [directError, setDirectError] = useState('');
  const qc = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ['bacnet', 'status'],
    queryFn: api.bacnet.status,
    refetchInterval: 5_000,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['bacnet', 'devices'],
    queryFn: api.bacnet.devices,
    enabled: status?.connected ?? false,
    refetchInterval: 15_000,
  });

  const { data: cwcvtMstp } = useQuery({
    queryKey: ['bacnet', 'cwcvt', 'mstp-diag'],
    queryFn: () => api.bacnet.cwcvtGroup('mstp-diag'),
    enabled: status?.connected ?? false,
    refetchInterval: 10_000,
  });

  const downstreamNodes = useMemo(
    () => parseDownstreamNodes(cwcvtMstp?.content.find(x => x.key === 'mstp-dev-list')?.value),
    [cwcvtMstp]
  );
  const downstreamCount = downstreamNodes.length;

  useEffect(() => {
    window.__cctDevices = devices;
  }, [devices]);

  const discoverMutation = useMutation({
    mutationFn: () => api.bacnet.discover(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bacnet', 'devices'] }),
  });

  const directMutation = useMutation({
    mutationFn: (ip: string) => api.bacnet.directConnect(ip),
    onSuccess: (device) => {
      qc.invalidateQueries({ queryKey: ['bacnet', 'devices'] });
      setDirectIp('');
      setDirectError('');
      setSelectedDevice(device);
      setSelectedDownstreamNode(null);
    },
    onError: (err) => setDirectError(String(err)),
  });

  if (!status?.connected) {
    return (
      <div className="content">
        <div className="empty-state">
          <div className="icon">📡</div>
          <p>Enter the TL-CWCVT-0 IP address above and click Connect</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="tabs">
        <div className={`tab${liveTab === 'devices' ? ' active' : ''}`} onClick={() => setLiveTab('devices')}>
          Live Devices
        </div>
        <div className={`tab${liveTab === 'mstp' ? ' active' : ''}`} onClick={() => setLiveTab('mstp')}>
          MS/TP Diagnostics
        </div>
      </div>

      {liveTab === 'mstp' && <MstpDiagnostics />}

      {liveTab === 'devices' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ width: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>Devices ({devices.length})</span>
              <button
                className="btn btn-ghost"
                onClick={() => discoverMutation.mutate()}
                disabled={discoverMutation.isPending}
                style={{ fontSize: 11, padding: '3px 8px', whiteSpace: 'nowrap' }}
              >
                {discoverMutation.isPending ? 'Scanning…' : '🔍 Subnet'}
              </button>
            </div>

            {cwcvtMstp && (
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-dim)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>CWCVT MS/TP</div>
                <div>Count: {String(cwcvtMstp.content.find(x => x.key === 'mstp-dev-cnt')?.value ?? '—')}</div>
                <div>List: {String(cwcvtMstp.content.find(x => x.key === 'mstp-dev-list')?.value ?? '—')}</div>
                {downstreamCount > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Behind CWCVT</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {downstreamNodes.map(node => {
                        const liveDevice = devices.find(d => d.deviceId === node);
                        const active = selectedDownstreamNode === node;
                        return (
                          <button
                            key={node}
                            type="button"
                            onClick={() => {
                              setSelectedDownstreamNode(node);
                              if (liveDevice) {
                                setSelectedDevice(liveDevice);
                                setSelectedObj(null);
                              } else {
                                setSelectedDevice(null);
                                setSelectedObj(null);
                              }
                            }}
                            style={{
                              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                              background: active ? 'var(--surface2)' : 'var(--bg)',
                              color: 'var(--text)',
                              borderRadius: 999,
                              padding: '3px 8px',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                            title={liveDevice ? `${liveDevice.name ?? `Device ${node}`}` : `Downstream node ${node}`}
                          >
                            Node {node}{liveDevice ? ' · live' : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Direct IP…"
                value={directIp}
                onChange={e => { setDirectIp(e.target.value); setDirectError(''); }}
                onKeyDown={e => e.key === 'Enter' && directIp && directMutation.mutate(directIp)}
                style={{
                  flex: 1,
                  background: 'var(--bg)',
                  border: `1px solid ${directError ? 'var(--danger)' : 'var(--border)'}`,
                  borderRadius: 4,
                  padding: '4px 8px',
                  color: 'var(--text)',
                  fontSize: 12,
                }}
              />
              <button
                className="btn btn-primary"
                disabled={!directIp || directMutation.isPending}
                onClick={() => directMutation.mutate(directIp)}
                style={{ fontSize: 11, padding: '3px 8px', whiteSpace: 'nowrap' }}
              >
                {directMutation.isPending ? '…' : '→'}
              </button>
            </div>

            {directError && <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--danger)' }}>{directError}</div>}

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {devices.length === 0 ? (
                <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12 }}>
                  Click Discover to find BACnet devices on the MS/TP bus.
                </div>
              ) : devices.map(d => (
                <div
                  key={d.deviceId}
                  className={`tree-node${selectedDevice?.deviceId === d.deviceId ? ' selected' : ''}`}
                  onClick={() => {
                    setSelectedDevice(d);
                    setSelectedDownstreamNode(downstreamNodes.includes(d.deviceId) ? d.deviceId : null);
                    setSelectedObj(null);
                  }}
                >
                  <span className="node-icon">🎛️</span>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div className="node-label">{d.name ?? `Device ${d.deviceId}`}</div>
                    {d.modelName && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{d.modelName}</div>}
                  </div>
                  <span className="node-type-badge">{d.deviceId}</span>
                </div>
              ))}
            </div>
          </div>

          {selectedDevice ? (
            <DeviceDetail device={selectedDevice} selectedObj={selectedObj} onSelectObj={setSelectedObj} />
          ) : selectedDownstreamNode !== null ? (
            <div className="content" style={{ flex: 1 }}>
              <div className="empty-state">
                <div className="icon">🌿</div>
                <p>Downstream node {selectedDownstreamNode} is visible behind CWCVT, but OCT does not yet have a routed BACnet identity for it.</p>
                <p style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 520, lineHeight: 1.5 }}>
                  That means the converter is reporting the node on its bus, but the node has not been promoted into the flat BACnet device list yet.
                  We can still track it here and use it as the next target for routed discovery.
                </p>
              </div>
            </div>
          ) : (
            <div className="content" style={{ flex: 1 }}>
              <div className="empty-state"><div className="icon">🔌</div><p>Select a device</p></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseDownstreamNodes(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map(v => Number(v))
      .filter(v => Number.isFinite(v) && v >= 0);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? [value] : [];
  }

  if (typeof value !== 'string') return [];

  return value
    .split(/[,\s]+/)
    .map(v => Number(v.trim()))
    .filter(v => Number.isFinite(v) && v >= 0);
}

const PROP = { PRESENT_VALUE: 85, STATUS_FLAGS: 111, UNITS: 117, DESCRIPTION: 28 };

type TrendReading = {
  ts: number;
  presentValue: unknown;
  statusFlags: unknown;
  outOfService: unknown;
};

type TrendSeries = {
  key: string;
  deviceId: number;
  objectType: number;
  objectInstance: number;
  label: string;
  subtitle: string;
  units: string | null;
  samples: TrendReading[];
};

type TrendPointDescriptor = {
  deviceId: number;
  objectType: number;
  objectInstance: number;
  label: string;
  subtitle: string;
  units?: string | null;
};

type TrendManager = {
  series: TrendSeries[];
  connected: boolean;
  isTrending: (objectType: number | null, objectInstance: number | null) => boolean;
  togglePoint: (point: TrendPointDescriptor) => void;
  clearHistory: () => void;
  removePoint: (key: string) => void;
  removeAll: () => void;
};

const MAX_TREND_SAMPLES = 360;
const MAX_TREND_AGE_MS = 30 * 60 * 1000;
const DEFAULT_TREND_WINDOW_MS = 5 * 60 * 1000;

function DeviceDetail({
  device, selectedObj, onSelectObj,
}: {
  device: BacnetDevice;
  selectedObj: BacnetObject | null;
  onSelectObj: (o: BacnetObject) => void;
}) {
  const [detailTab, setDetailTab] = useState<'objects' | 'commissioning' | 'io'>('objects');
  const [filterType, setFilterType] = useState('');
  const trendManager = useTrendManager(device);

  const { data: objects = [], isLoading } = useQuery({
    queryKey: ['bacnet', 'objects', device.deviceId],
    queryFn: () => api.bacnet.objects(device.deviceId),
  });

  const filtered = filterType ? objects.filter(o => o.typeName === filterType) : objects;
  const types = [...new Set(objects.map(o => o.typeName))].sort();

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
      <div className="tabs">
        <div className={`tab${detailTab === 'objects' ? ' active' : ''}`} onClick={() => setDetailTab('objects')}>
          Object Browser
        </div>
        <div className={`tab${detailTab === 'commissioning' ? ' active' : ''}`} onClick={() => setDetailTab('commissioning')}>
          Commissioning
        </div>
        <div className={`tab${detailTab === 'io' ? ' active' : ''}`} onClick={() => setDetailTab('io')}>
          Inputs / Outputs
        </div>
      </div>

      {detailTab === 'objects' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                className={`btn btn-ghost${!filterType ? ' btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => setFilterType('')}
              >
                All
              </button>
              {types.map(t => (
                <button
                  key={t}
                  className={`btn btn-ghost${filterType === t ? ' btn-primary' : ''}`}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => setFilterType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {isLoading ? <div className="loading">Loading objects…</div> : filtered.map(obj => (
                <div
                  key={`${obj.type}-${obj.instance}`}
                  className={`tree-node${selectedObj?.type === obj.type && selectedObj?.instance === obj.instance ? ' selected' : ''}`}
                  onClick={() => onSelectObj(obj)}
                >
                  <span className="tag tag-blue" style={{ fontSize: 10, padding: '1px 5px', flexShrink: 0 }}>{obj.typeName}</span>
                  <span className="node-label" style={{ fontSize: 12 }}>{obj.name ?? `${obj.typeName}:${obj.instance}`}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{obj.instance}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {selectedObj
              ? <ObjectDetail device={device} obj={selectedObj} />
              : <div className="content"><div className="empty-state"><div className="icon">📋</div><p>Select an object</p></div></div>
            }
          </div>
        </div>
      )}

      {detailTab === 'commissioning' && <LiveCommissioningTab device={device} trendManager={trendManager} />}
      {detailTab === 'io' && <InputsOutputsTab device={device} trendManager={trendManager} />}
    </div>
  );
}

function LiveCommissioningTab({ device, trendManager }: { device: BacnetDevice; trendManager: TrendManager }) {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [cafPath, setCafPath] = useState('C:\\Users\\TimothyCollins\\dev\\cct\\CAFs\\upload.caf');
  const [selectedPerspective, setSelectedPerspective] = useState('VAVSD-Damper Control');
  const [selectedAppRef, setSelectedAppRef] = useState<string | null>(null);
  const [selectedFeatureTab, setSelectedFeatureTab] = useState('Parameters');
  const qc = useQueryClient();

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ['commissioning', 'templates'],
    queryFn: api.commissioningTemplates,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['commissioning', 'live', device.deviceId, selectedTemplate],
    queryFn: () => api.liveCommissioning(device.deviceId, selectedTemplate),
    enabled: !!selectedTemplate,
    refetchInterval: 7_000,
  });

  const { data: perspectives = [] } = useQuery({
    queryKey: ['perspectives'],
    queryFn: api.perspectives.list,
    enabled: HAS_API_HOST,
  });

  const { data: referenceCaf, isLoading: loadingCaf, error: cafError } = useQuery({
    queryKey: ['caf', 'path', cafPath],
    queryFn: () => api.caf.parsePath(cafPath),
    enabled: HAS_API_HOST && !!cafPath.trim(),
  });

  const { data: perspectiveDetail, isLoading: loadingPerspective, error: perspectiveError } = useQuery({
    queryKey: ['perspective', selectedPerspective],
    queryFn: () => api.perspectives.detail(selectedPerspective),
    enabled: HAS_API_HOST && !!selectedPerspective,
  });

  const appLayout = referenceCaf && perspectiveDetail
    ? buildApplicationLayout(referenceCaf, perspectiveDetail)
    : null;
  const applicationRegions = appLayout ? groupApplicationPanels(appLayout.panels) : null;

  const selectedAppObject = appLayout && selectedAppRef
    ? appLayout.objectMap.get(selectedAppRef) ?? null
    : null;

  const featureTabs = perspectiveDetail?.featureTabs ?? [];

  useEffect(() => {
    if (!featureTabs.length) {
      setSelectedFeatureTab('Parameters');
      return;
    }

    setSelectedFeatureTab(current => {
      if (current === 'Parameters' || featureTabs.some(tab => tab.name === current)) return current;
      return 'Parameters';
    });
  }, [featureTabs]);

  if (loadingTemplates) return <div className="loading">Loading templates…</div>;

  return (
    <div className="content" style={{ overflow: 'auto' }}>
      <div className="card">
        <div className="card-header">
          Live Application Commissioning
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
            Device {device.deviceId} · {device.name ?? device.modelName ?? 'Unnamed device'}
          </span>
        </div>
        <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {templates.map((template: CommissioningTemplate) => (
            <button
              key={template.name}
              className={`btn${selectedTemplate === template.name ? ' btn-primary' : ' btn-ghost'}`}
              style={{ fontSize: 12 }}
              onClick={() => setSelectedTemplate(template.name)}
            >
              {template.name}
            </button>
          ))}
        </div>
      </div>

      <TrendPanel trendManager={trendManager} title="Commissioning Trends" />

      <div className="card">
        <div className="card-header">Reference Application Layout</div>
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
              {perspectives.map((perspective: PerspectiveSummary) => (
                <option key={perspective.name} value={perspective.name}>{perspective.name}</option>
              ))}
            </select>
          </div>
        </div>
        {!HAS_API_HOST && (
          <div className="card-body" style={{ color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Commissioning preview is disabled here because this deployment does not have a configured backend API.
          </div>
        )}
        {(loadingCaf || loadingPerspective) && <div className="card-body" style={{ color: 'var(--text-dim)' }}>Loading reference layout…</div>}
        {HAS_API_HOST && cafError && <div className="card-body" style={{ color: 'var(--danger)' }}>CAF error: {String(cafError)}</div>}
        {HAS_API_HOST && perspectiveError && <div className="card-body" style={{ color: 'var(--danger)' }}>Perspective error: {String(perspectiveError)}</div>}
      </div>

      {appLayout && (
        <>
          <div className="card">
            <div className="card-header">
              Application
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
                {referenceCaf?.controller.tag ?? 'CAF'} · {perspectiveDetail?.name}
              </span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="commission-shell">
                <div className="commission-mode-row">
                  <button className="commission-mode-tab commission-mode-tab-active">Control</button>
                  <button className="commission-mode-tab">Logic</button>
                </div>

                {applicationRegions && (
                  <div className="commission-workbench">
                    <div className="commission-side-column">
                      {applicationRegions.inputs.map(panel => (
                        <ApplicationPanel
                          key={panel.name}
                          panel={panel}
                          selectedRef={selectedAppRef}
                          onSelect={setSelectedAppRef}
                          variant="side"
                        />
                      ))}
                    </div>

                    <div className="commission-logic-column">
                      <div className="commission-logic-grid">
                        {applicationRegions.logic.map(panel => (
                          <ApplicationPanel
                            key={panel.name}
                            panel={panel}
                            selectedRef={selectedAppRef}
                            onSelect={setSelectedAppRef}
                            variant="logic"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="commission-side-column">
                      {applicationRegions.outputs.map(panel => (
                        <ApplicationPanel
                          key={panel.name}
                          panel={panel}
                          selectedRef={selectedAppRef}
                          onSelect={setSelectedAppRef}
                          variant="side"
                        />
                      ))}
                    </div>
                  </div>
                )}
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
              selectedAppObject ? (
                <ApplicationParameters device={device} layout={appLayout} object={selectedAppObject} trendManager={trendManager} />
              ) : (
                <div className="card-body" style={{ color: 'var(--text-dim)' }}>
                  Select an application block above to view its parameters and mapped live values.
                </div>
              )
            ) : (
              <div className="card-body" style={{ color: 'var(--text-dim)' }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedFeatureTab}</div>
                This feature view is not wired up yet, but the tab layout now mirrors the original CCT workflow.
              </div>
            )}
          </div>
        </>
      )}

      {!selectedTemplate && (
        <div className="empty-state">
          <div className="icon">📋</div>
          <p>Select a commissioning template to read live values from the device.</p>
        </div>
      )}

      {isLoading && <div className="loading">Reading live commissioning points…</div>}
      {error && <div className="error-msg">Error: {String(error)}</div>}

      {data && (
        <>
          <div className="card">
            <div className="card-body" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <MiniStat label="Template" value={data.name} />
              <MiniStat label="Points" value={data.points.length} />
              <MiniStat label="Readable" value={data.points.filter(p => !p.error).length} />
              <MiniStat label="Writable" value={data.points.filter(p => p.writable && p.objectType !== null).length} />
              <button
                className="btn btn-ghost"
                style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }}
                onClick={() => qc.invalidateQueries({ queryKey: ['commissioning', 'live', device.deviceId, selectedTemplate] })}
              >
                ↻ Refresh
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">Template Points</div>
            <table className="attr-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Element</th>
                  <th>Point</th>
                  <th>Default</th>
                  <th>Live Value</th>
                  <th>Trend</th>
                  <th>Write</th>
                </tr>
              </thead>
              <tbody>
                {data.points.map(point => (
                  <CommissioningPointRow key={point.index} device={device} point={point} trendManager={trendManager} />
                ))}
              </tbody>
            </table>
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
  panel: { name: string; items: CafAppObject[] };
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

function ApplicationParameters({
  device,
  layout,
  object,
  trendManager,
}: {
  device: BacnetDevice;
  layout: ApplicationLayout;
  object: CafAppObject;
  trendManager: TrendManager;
}) {
  const descendants = layout.childrenMap.get(object.ref) ?? [];
  const parameters = descendants.filter(candidate =>
    candidate.ref !== object.ref &&
    (candidate.defaultValue !== null || candidate.units !== null || candidate.classid === 526 || candidate.classid === 527 || candidate.classid === 528 || candidate.classid === 529 || candidate.classid === 530 || candidate.classid === 531)
  );

  return (
    <div className="card-body">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>{displayAppName(object)}</div>
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{object.description || object.ref}</div>
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
            <th>Live Value</th>
            <th>Standard Name</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {parameters.length === 0 ? (
            <tr><td colSpan={5} style={{ color: 'var(--text-dim)', padding: 12 }}>No parameter children found for this application object.</td></tr>
          ) : parameters.map(param => (
            <ApplicationParameterRow key={param.ref} device={device} object={param} trendManager={trendManager} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApplicationParameterRow({
  device,
  object,
  trendManager,
}: {
  device: BacnetDevice;
  object: CafAppObject;
  trendManager: TrendManager;
}) {
  const canReadLive = object.bacoidType !== null && object.bacoidInstance !== null;
  const { data } = useQuery({
    queryKey: ['bacnet', 'object', device.deviceId, object.bacoidType, object.bacoidInstance, 'commission-param'],
    queryFn: () => api.bacnet.objectDetail(device.deviceId, object.bacoidType!, object.bacoidInstance!),
    enabled: canReadLive,
    refetchInterval: 7_000,
  });

  const liveValue = data?.[PROP.PRESENT_VALUE];
  const isTrending = trendManager.isTrending(object.bacoidType, object.bacoidInstance);

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 500 }}>{object.tag || object.shortTag || object.className}</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{object.ref}</div>
      </td>
      <td className="attr-value">{object.defaultValue !== null ? String(object.defaultValue) : '—'}</td>
      <td className="attr-value">{canReadLive ? formatVal(liveValue) : '—'}</td>
      <td>{object.description || object.shortTag || '—'}</td>
      <td>
        {canReadLive ? (
          <button
            className={`btn ${isTrending ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '3px 10px' }}
            onClick={() => trendManager.togglePoint({
              deviceId: device.deviceId,
              objectType: object.bacoidType!,
              objectInstance: object.bacoidInstance!,
              label: object.tag || object.shortTag || object.className,
              subtitle: `${object.className} · ${object.ref}`,
              units: object.units,
            })}
          >
            {isTrending ? 'Trending' : 'Trend'}
          </button>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>
        )}
      </td>
    </tr>
  );
}

function CommissioningPointRow({
  device,
  point,
  trendManager,
}: {
  device: BacnetDevice;
  point: LiveCommissioningPoint;
  trendManager: TrendManager;
}) {
  const [editValue, setEditValue] = useState('');
  const [writing, setWriting] = useState(false);
  const qc = useQueryClient();
  const isTrending = trendManager.isTrending(point.objectType, point.objectInstance);
  const canTrend = point.objectType !== null && point.objectInstance !== null;

  async function handleWrite() {
    if (!point.writable || point.objectType === null || point.objectInstance === null || !editValue.trim()) return;
    setWriting(true);
    try {
      const parsedValue = point.valueType === 'enum' ? parseInt(editValue, 10) : parseFloat(editValue);
      if (Number.isNaN(parsedValue)) throw new Error('Enter a numeric BACnet value');
      await api.bacnet.writeValue(
        device.deviceId,
        point.objectType,
        point.objectInstance,
        parsedValue,
        point.valueType === 'enum' ? 9 : 4,
      );
      setEditValue('');
      await qc.invalidateQueries({ queryKey: ['commissioning', 'live', device.deviceId] });
      await qc.invalidateQueries({ queryKey: ['commissioning', 'io', device.deviceId] });
      await qc.invalidateQueries({ queryKey: ['bacnet', 'object', device.deviceId, point.objectType, point.objectInstance] });
    } catch (err) {
      alert(`Write failed: ${err}`);
    } finally {
      setWriting(false);
    }
  }

  const pointLabel = point.objectTypeName && point.objectInstance !== null
    ? `${point.objectTypeName}-${point.objectInstance}`
    : 'Unmapped';

  return (
    <tr>
      <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{point.module ?? '—'}</td>
      <td>
        <div style={{ fontWeight: 500 }}>{point.element ?? '—'}</div>
        {point.objectRef && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{point.objectRef}</div>}
      </td>
      <td className="attr-value">{pointLabel}</td>
      <td className="attr-value">
        {point.valueType === 'enum' && point.enumText ? `${point.enumText} (${point.defaultValue})` : point.defaultValue}
      </td>
      <td>
        {point.error
          ? <span style={{ color: 'var(--danger)', fontSize: 11 }}>{point.error}</span>
          : <span className="attr-value">{formatVal(point.liveValue)}</span>}
      </td>
      <td>
        {canTrend ? (
          <button
            className={`btn ${isTrending ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '3px 10px' }}
            onClick={() => trendManager.togglePoint({
              deviceId: device.deviceId,
              objectType: point.objectType!,
              objectInstance: point.objectInstance!,
              label: point.element ?? point.module ?? `${point.objectTypeName}-${point.objectInstance}`,
              subtitle: `${point.objectTypeName}-${point.objectInstance}${point.objectRef ? ` · ${point.objectRef}` : ''}`,
            })}
          >
            {isTrending ? 'Trending' : 'Trend'}
          </button>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>
        )}
      </td>
      <td>
        {point.writable && point.objectType !== null && point.objectInstance !== null ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              placeholder={String(point.liveValue ?? point.defaultValue)}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleWrite()}
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '4px 8px',
                color: 'var(--text)',
                width: 110,
                fontSize: 12,
              }}
            />
            <button className="btn btn-primary" disabled={!editValue.trim() || writing} onClick={handleWrite}>
              {writing ? '…' : 'Write'}
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Read only</span>
        )}
      </td>
    </tr>
  );
}

function InputsOutputsTab({ device, trendManager }: { device: BacnetDevice; trendManager: TrendManager }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['commissioning', 'io', device.deviceId],
    queryFn: () => api.deviceIo(device.deviceId),
    refetchInterval: 7_000,
  });

  if (isLoading) return <div className="loading">Reading device inputs and outputs…</div>;
  if (error) return <div className="error-msg">Error: {String(error)}</div>;
  if (!data) return null;

  return (
    <div className="content" style={{ overflow: 'auto' }}>
      <TrendPanel trendManager={trendManager} title="I/O Trends" />

      <div className="card">
        <div className="card-body" style={{ display: 'flex', gap: 16 }}>
          <MiniStat label="Inputs" value={data.inputs.length} />
          <MiniStat label="Outputs" value={data.outputs.length} />
          <MiniStat label="Total I/O" value={data.inputs.length + data.outputs.length} />
        </div>
      </div>

      <IoSection title="Inputs" points={data.inputs} trendManager={trendManager} deviceId={device.deviceId} />
      <IoSection title="Outputs" points={data.outputs} trendManager={trendManager} deviceId={device.deviceId} />
    </div>
  );
}

function IoSection({
  title,
  points,
  trendManager,
  deviceId,
}: {
  title: string;
  points: IoPoint[];
  trendManager: TrendManager;
  deviceId: number;
}) {
  return (
    <div className="card">
      <div className="card-header">{title} ({points.length})</div>
      {points.length === 0 ? (
        <div className="card-body" style={{ color: 'var(--text-dim)' }}>
          No {title.toLowerCase()} reported by the device.
        </div>
      ) : (
        <table className="attr-table">
          <thead>
            <tr>
              <th>Point</th>
              <th>Name</th>
              <th>Present Value</th>
              <th>Units</th>
              <th>Status</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {points.map(point => (
              <tr key={`${point.type}-${point.instance}`}>
                <td className="attr-value">{point.typeName}-{point.instance}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{formatVal(point.name)}</div>
                  {point.description != null && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{formatVal(point.description)}</div>}
                </td>
                <td className="attr-value">{formatVal(point.presentValue)}</td>
                <td>{formatVal(point.units)}</td>
                <td>
                  {point.error
                    ? <span style={{ color: 'var(--danger)' }}>{point.error}</span>
                    : `${point.outOfService ? 'Out of service' : 'Online'}${point.reliability ? ` · ${formatVal(point.reliability)}` : ''}`}
                </td>
                <td>
                  <button
                    className={`btn ${trendManager.isTrending(point.type, point.instance) ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ padding: '3px 10px' }}
                    onClick={() => trendManager.togglePoint({
                      deviceId,
                      objectType: point.type,
                      objectInstance: point.instance,
                      label: typeof point.name === 'string' && point.name.trim() ? point.name : `${point.typeName}-${point.instance}`,
                      subtitle: `${point.typeName}-${point.instance}`,
                      units: stringifyTrendUnit(point.units),
                    })}
                  >
                    {trendManager.isTrending(point.type, point.instance) ? 'Trending' : 'Trend'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ObjectDetail({ device, obj }: { device: BacnetDevice; obj: BacnetObject }) {
  const [editValue, setEditValue] = useState('');
  const [writing, setWriting] = useState(false);
  const qc = useQueryClient();

  const qKey = ['bacnet', 'object', device.deviceId, obj.type, obj.instance];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: qKey,
    queryFn: () => api.bacnet.objectDetail(device.deviceId, obj.type, obj.instance),
    refetchInterval: 7_000,
  });

  async function handleWrite() {
    if (!editValue) return;
    setWriting(true);
    try {
      await api.bacnet.writeValue(device.deviceId, obj.type, obj.instance, parseFloat(editValue), 4);
      setEditValue('');
      await qc.invalidateQueries({ queryKey: qKey });
    } catch (err) {
      alert(`Write failed: ${err}`);
    } finally {
      setWriting(false);
    }
  }

  const presentValue = data?.[PROP.PRESENT_VALUE];
  const description = data?.[PROP.DESCRIPTION];

  return (
    <div className="content" style={{ overflow: 'auto' }}>
      {isLoading && <div className="loading">Reading object…</div>}
      {error && <div className="error-msg">Error: {String(error)}</div>}
      {data && (
        <>
          <div className="card">
            <div className="card-header">
              <span className="tag tag-blue">{obj.typeName}</span>
              {obj.name}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
                inst. {obj.instance} · Device {device.deviceId}
                <button
                  className="btn btn-ghost"
                  style={{ marginLeft: 8, fontSize: 11, padding: '1px 8px' }}
                  onClick={() => refetch()}
                >
                  ↻
                </button>
              </span>
            </div>
            <div className="card-body">
              {description != null && <div style={{ marginBottom: 12, color: 'var(--text-dim)', fontSize: 12 }}>{String(description)}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>Present Value</div>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Consolas, monospace', color: 'var(--accent)' }}>
                    {presentValue !== undefined ? String(presentValue) : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                  <input
                    type="text"
                    placeholder="New value"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleWrite()}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 10px', color: 'var(--text)', width: 120 }}
                  />
                  <button className="btn btn-primary" disabled={!editValue || writing} onClick={handleWrite}>
                    {writing ? 'Writing…' : 'Write'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">All Properties</div>
            <table className="attr-table">
              <thead><tr><th>Property ID</th><th>Value</th></tr></thead>
              <tbody>
                {Object.entries(data)
                  .filter(([k]) => !Number.isNaN(Number(k)))
                  .map(([propId, val]) => (
                    <tr key={propId}>
                      <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                        {PROP_NAMES[Number(propId)] ?? `#${propId}`}
                      </td>
                      <td className="attr-value">{formatVal(val)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const PROP_NAMES: Record<number, string> = {
  77: 'Object Name',
  28: 'Description',
  85: 'Present Value',
  117: 'Units',
  111: 'Status Flags',
  103: 'Reliability',
  81: 'Out of Service',
};

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-box" style={{ minWidth: 120 }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

function TrendPanel({ trendManager, title }: { trendManager: TrendManager; title: string }) {
  const [windowMs, setWindowMs] = useState(DEFAULT_TREND_WINDOW_MS);

  return (
    <div className="card">
      <div className="card-header">
        {title}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
          {trendManager.series.length} point(s) · 7s live poll · {trendManager.connected ? 'socket online' : 'socket idle'}
        </span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[5, 15, 30].map(minutes => {
            const value = minutes * 60 * 1000;
            return (
              <button
                key={minutes}
                className={`btn ${windowMs === value ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '3px 10px' }}
                onClick={() => setWindowMs(value)}
              >
                {minutes} min
              </button>
            );
          })}
          <button
            className="btn btn-ghost"
            style={{ marginLeft: 'auto', padding: '3px 10px' }}
            disabled={trendManager.series.length === 0}
            onClick={trendManager.clearHistory}
          >
            Clear History
          </button>
          <button
            className="btn btn-ghost"
            style={{ padding: '3px 10px' }}
            disabled={trendManager.series.length === 0}
            onClick={trendManager.removeAll}
          >
            Remove All
          </button>
        </div>

        {trendManager.series.length === 0 ? (
          <div className="trend-empty">
            Add points from the tables below to build a rolling live trend for troubleshooting and PID tuning.
          </div>
        ) : (
          <div className="trend-grid">
            {trendManager.series.map(series => (
              <TrendTile key={series.key} series={series} windowMs={windowMs} onRemove={() => trendManager.removePoint(series.key)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TrendTile({
  series,
  windowMs,
  onRemove,
}: {
  series: TrendSeries;
  windowMs: number;
  onRemove: () => void;
}) {
  const endTs = Date.now();
  const startTs = endTs - windowMs;
  const samples = series.samples.filter(sample => sample.ts >= startTs);
  const latest = samples[samples.length - 1] ?? series.samples[series.samples.length - 1] ?? null;
  const numericValues = samples
    .map(sample => coerceTrendNumber(sample.presentValue))
    .filter((value): value is number => value !== null);
  const isNumeric = numericValues.length === samples.length && samples.length > 0;
  const path = buildTrendPath(samples, startTs, endTs, isNumeric);

  return (
    <div className="trend-tile">
      <div className="trend-tile-header">
        <div>
          <div className="trend-title">{series.label}</div>
          <div className="trend-subtitle">{series.subtitle}</div>
        </div>
        <button className="btn btn-ghost" style={{ padding: '3px 10px' }} onClick={onRemove}>
          Remove
        </button>
      </div>

      <div className="trend-metrics">
        <div>
          <div className="trend-metric-label">Latest</div>
          <div className="trend-metric-value">
            {latest ? formatTrendReading(latest.presentValue, series.units) : 'Waiting…'}
          </div>
        </div>
        <div>
          <div className="trend-metric-label">Samples</div>
          <div className="trend-metric-value">{samples.length}</div>
        </div>
        <div>
          <div className="trend-metric-label">Updated</div>
          <div className="trend-metric-value">{latest ? formatTrendAge(latest.ts) : '—'}</div>
        </div>
      </div>

      <div className="trend-chart">
        {samples.length === 0 ? (
          <div className="trend-chart-empty">Waiting for the next BACnet poll…</div>
        ) : (
          <svg viewBox="0 0 360 110" preserveAspectRatio="none" aria-label={`${series.label} trend`}>
            {[0, 1, 2, 3].map(index => {
              const y = 12 + index * 28;
              return <line key={index} x1="12" y1={y} x2="348" y2={y} className="trend-grid-line" />;
            })}
            {[0, 1, 2, 3].map(index => {
              const x = 12 + index * 112;
              return <line key={index} x1={x} y1="12" x2={x} y2="96" className="trend-grid-line trend-grid-line-vertical" />;
            })}
            {path && <path d={path} className="trend-path" />}
            {latest && (
              <circle
                cx={latestPointX(latest.ts, startTs, endTs)}
                cy={latestPointY(samples, latest.presentValue, isNumeric)}
                r="4"
                className="trend-point"
              />
            )}
          </svg>
        )}
      </div>

      <div className="trend-footer">
        {samples.length === 0 ? (
          <span>No samples in the selected window.</span>
        ) : isNumeric ? (
          <span>
            Range {formatVal(Math.min(...numericValues))} to {formatVal(Math.max(...numericValues))}
            {series.units ? ` ${series.units}` : ''}
          </span>
        ) : (
          <span>States: {[...new Set(samples.map(sample => formatVal(sample.presentValue)))].join(', ')}</span>
        )}
        {latest?.outOfService ? <span>Out of service</span> : <span>In service</span>}
      </div>
    </div>
  );
}

type CafAppObject = ParsedCaf['objects'][number];

type ApplicationLayout = {
  panels: Array<{ name: string; items: CafAppObject[] }>;
  objectMap: Map<string, CafAppObject>;
  childrenMap: Map<string, CafAppObject[]>;
};

type ApplicationRegions = {
  inputs: Array<{ name: string; items: CafAppObject[] }>;
  logic: Array<{ name: string; items: CafAppObject[] }>;
  outputs: Array<{ name: string; items: CafAppObject[] }>;
};

function buildApplicationLayout(caf: ParsedCaf, perspective: PerspectiveDetail): ApplicationLayout {
  const objectMap = new Map<string, CafAppObject>(caf.objects.map(object => [object.ref, object]));
  const childrenMap = new Map<string, CafAppObject[]>();

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

function resolvePanelObjects(panel: PerspectivePanel, objects: CafAppObject[]): CafAppObject[] {
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

function matchesUiColumn(column: string, object: CafAppObject): boolean {
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

function hasInputLikeName(object: CafAppObject): boolean {
  const name = `${object.tag} ${object.shortTag} ${object.description}`.toUpperCase();
  return name.includes('-SP') || name.includes('MODE') || name.includes('STATUS') || name.includes('LOCKOUT');
}

function hasOutputLikeName(object: CafAppObject): boolean {
  const name = `${object.tag} ${object.shortTag} ${object.description}`.toUpperCase();
  return name.includes('CMD') || name.includes('OUTPUT') || name.includes('%') || name.includes('CTRL') || name.includes('REQUIRED');
}

function groupApplicationPanels(panels: ApplicationLayout['panels']): ApplicationRegions {
  const inputs: ApplicationRegions['inputs'] = [];
  const logic: ApplicationRegions['logic'] = [];
  const outputs: ApplicationRegions['outputs'] = [];

  panels.forEach(panel => {
    const key = panel.name.toUpperCase();
    if (
      key.includes('INPUT')
      || key.includes('SENSOR')
    ) {
      inputs.push(panel);
      return;
    }

    if (
      key.includes('OUTPUT')
      || key.includes('CONTROL')
      || key.includes('ACTUATOR')
    ) {
      outputs.push(panel);
      return;
    }

    logic.push(panel);
  });

  return { inputs, logic, outputs };
}

function useTrendManager(device: BacnetDevice): TrendManager {
  const [series, setSeries] = useState<TrendSeries[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionRef = useRef('{"type":"unsubscribe"}');
  const subscriptionSignature = series.map(item => item.key).join('|');
  const trackedSubscriptions = series.map(item => ({
    deviceId: item.deviceId,
    objectType: item.objectType,
    objectInstance: item.objectInstance,
  }));

  useEffect(() => {
    setSeries([]);
    setConnected(false);
    wsRef.current?.close();
    wsRef.current = null;
  }, [device.deviceId]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    subscriptionRef.current = JSON.stringify(
      trackedSubscriptions.length > 0
        ? { type: 'subscribe', subscriptions: trackedSubscriptions }
        : { type: 'unsubscribe' }
    );

    if (trackedSubscriptions.length === 0) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(subscriptionRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      return;
    }

    if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
      const ws = new WebSocket(wsUrl('/ws'));
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        ws.send(subscriptionRef.current);
      };
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as {
            type: string;
            data?: Array<{
              deviceId: number;
              objectType: number;
              objectInstance: number;
              presentValue: unknown;
              statusFlags: unknown;
              outOfService: unknown;
              ts: number;
            }>;
          };
          if (message.type !== 'values' || !Array.isArray(message.data)) return;

          const incoming = new Map(
            message.data.map(item => [makeTrendKey(item.deviceId, item.objectType, item.objectInstance), item])
          );

          setSeries(prev => prev.map(item => {
            const next = incoming.get(item.key);
            if (!next) return item;

            const samples = [...item.samples, {
              ts: next.ts,
              presentValue: next.presentValue,
              statusFlags: next.statusFlags,
              outOfService: next.outOfService,
            }]
              .filter(sample => sample.ts >= Date.now() - MAX_TREND_AGE_MS)
              .slice(-MAX_TREND_SAMPLES);

            return { ...item, samples };
          }));
        } catch {
          // Ignore malformed WebSocket messages.
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (wsRef.current === ws) wsRef.current = null;
      };
      ws.onerror = () => setConnected(false);
      return;
    }

    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(subscriptionRef.current);
      setConnected(true);
    }
  }, [device.deviceId, subscriptionSignature]);

  return {
    series,
    connected,
    isTrending: (objectType, objectInstance) => {
      if (objectType === null || objectInstance === null) return false;
      return series.some(item => item.objectType === objectType && item.objectInstance === objectInstance);
    },
    togglePoint: (point) => {
      const key = makeTrendKey(point.deviceId, point.objectType, point.objectInstance);
      setSeries(prev => {
        const exists = prev.some(item => item.key === key);
        if (exists) return prev.filter(item => item.key !== key);
        return [...prev, {
          key,
          deviceId: point.deviceId,
          objectType: point.objectType,
          objectInstance: point.objectInstance,
          label: point.label,
          subtitle: point.subtitle,
          units: point.units ?? null,
          samples: [],
        }];
      });
    },
    clearHistory: () => setSeries(prev => prev.map(item => ({ ...item, samples: [] }))),
    removePoint: (key) => setSeries(prev => prev.filter(item => item.key !== key)),
    removeAll: () => setSeries([]),
  };
}

function toPerspectiveBacoid(object: CafAppObject): number | null {
  if (object.bacoidType === null || object.bacoidInstance === null) return null;
  return object.bacoidType * 4194304 + object.bacoidInstance;
}

function displayAppName(object: CafAppObject): string {
  return object.tag || object.description || object.shortTag || `${object.className} ${object.objectid}`;
}

function displayPanelItemTitle(object: CafAppObject): string {
  const candidates = [object.tag, object.description, object.shortTag]
    .map(value => value?.trim() ?? '')
    .filter(Boolean)
    .filter(value => !looksLikeCafRef(value));

  if (candidates.length > 0) return candidates[0];

  if (object.bacoidType !== null && object.bacoidInstance !== null) {
    return `${object.className} ${object.bacoidType}:${object.bacoidInstance}`;
  }

  return `${object.className} ${object.objectid}`;
}

function buildPanelItemMeta(object: CafAppObject): string {
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

function hasFriendlyPanelLabel(object: CafAppObject): boolean {
  return [object.tag, object.description, object.shortTag]
    .map(value => value?.trim() ?? '')
    .some(value => value !== '' && !looksLikeCafRef(value));
}

function shouldShowPanelItem(object: CafAppObject, variant: 'side' | 'logic'): boolean {
  if (variant === 'logic') return true;

  if (hasFriendlyPanelLabel(object)) return true;

  const isBacnetPoint = object.bacoidType !== null && object.bacoidInstance !== null;
  const isHardwareIo = object.classid === 239 || object.classid === 240 || object.classid === 241 || object.classid === 242 || object.classid === 243 || object.classid === 671 || object.classid === 672 || object.classid === 673 || object.classid === 674;

  return isBacnetPoint && isHardwareIo;
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function makeTrendKey(deviceId: number, objectType: number, objectInstance: number): string {
  return `${deviceId}:${objectType}:${objectInstance}`;
}

function stringifyTrendUnit(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function formatTrendReading(value: unknown, units: string | null): string {
  const formatted = formatVal(value);
  if (!units || formatted === '—') return formatted;
  return `${formatted} ${units}`;
}

function formatTrendAge(ts: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

function coerceTrendNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildTrendPath(samples: TrendReading[], startTs: number, endTs: number, isNumeric: boolean): string {
  if (samples.length === 0) return '';

  const left = 12;
  const top = 12;
  const width = 336;
  const height = 84;
  const span = Math.max(1, endTs - startTs);

  const categoricalValues = [...new Set(samples.map(sample => formatVal(sample.presentValue)))];
  const numericValues = samples.map(sample => coerceTrendNumber(sample.presentValue)).filter((value): value is number => value !== null);
  const min = isNumeric ? Math.min(...numericValues) : 0;
  const max = isNumeric ? Math.max(...numericValues) : Math.max(0, categoricalValues.length - 1);
  const safeMax = min === max ? max + 1 : max;

  return samples.map((sample, index) => {
    const x = left + ((sample.ts - startTs) / span) * width;
    const yValue = isNumeric
      ? coerceTrendNumber(sample.presentValue) ?? min
      : categoricalValues.indexOf(formatVal(sample.presentValue));
    const y = top + height - ((yValue - min) / (safeMax - min)) * height;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function latestPointX(ts: number, startTs: number, endTs: number): number {
  return 12 + ((ts - startTs) / Math.max(1, endTs - startTs)) * 336;
}

function latestPointY(samples: TrendReading[], value: unknown, isNumeric: boolean): number {
  const numericValues = samples.map(sample => coerceTrendNumber(sample.presentValue)).filter((item): item is number => item !== null);
  const categoricalValues = [...new Set(samples.map(sample => formatVal(sample.presentValue)))];
  const min = isNumeric ? Math.min(...numericValues) : 0;
  const max = isNumeric ? Math.max(...numericValues) : Math.max(0, categoricalValues.length - 1);
  const safeMax = min === max ? max + 1 : max;
  const yValue = isNumeric
    ? coerceTrendNumber(value) ?? min
    : categoricalValues.indexOf(formatVal(value));
  return 12 + 84 - ((yValue - min) / (safeMax - min)) * 84;
}
