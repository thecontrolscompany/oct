import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { IoPoint } from '../api';

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
  isTrending: (deviceId: number, objectType: number, objectInstance: number) => boolean;
  togglePoint: (point: TrendPointDescriptor) => void;
  clearHistory: () => void;
  removePoint: (key: string) => void;
  removeAll: () => void;
};

const SHORT_WINDOWS = [
  { label: '30s', ms: 30_000 },
  { label: '1m', ms: 60_000 },
] as const;

const MAX_TREND_AGE_MS = 60_000;
const MAX_TREND_SAMPLES = 32;

export default function QuickTrendPane() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [pointFilter, setPointFilter] = useState<'all' | 'inputs' | 'outputs'>('all');
  const [search, setSearch] = useState('');
  const qc = useQueryClient();
  const trendManager = useQuickTrendManager();

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

  useEffect(() => {
    if (!devices.length) {
      setSelectedDeviceId(null);
      return;
    }

    setSelectedDeviceId(current => current !== null && devices.some(device => device.deviceId === current)
      ? current
      : devices[0].deviceId);
  }, [devices]);

  const selectedDevice = devices.find(device => device.deviceId === selectedDeviceId) ?? null;

  const discoverMutation = useMutation({
    mutationFn: () => api.bacnet.discover(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bacnet', 'devices'] }),
  });

  const { data: ioData, isLoading: loadingIo, error: ioError } = useQuery({
    queryKey: ['quick-trend', 'io', selectedDeviceId],
    queryFn: () => api.deviceIo(selectedDeviceId!),
    enabled: selectedDeviceId !== null,
    refetchInterval: 7_000,
  });

  const filteredPoints = useMemo(() => {
    if (!ioData) return [];
    const points = pointFilter === 'inputs'
      ? ioData.inputs
      : pointFilter === 'outputs'
        ? ioData.outputs
        : [...ioData.inputs, ...ioData.outputs];

    if (!search.trim()) return points;
    const q = search.trim().toLowerCase();
    return points.filter(point =>
      `${point.typeName} ${point.instance} ${formatVal(point.name)} ${formatVal(point.description)}`
        .toLowerCase()
        .includes(q)
    );
  }, [ioData, pointFilter, search]);

  if (!status?.connected) {
    return (
      <div className="content">
        <div className="empty-state">
          <div className="icon">📈</div>
          <p>Connect to the BACnet/IP network first, then use Quick Trend for short troubleshooting sessions.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
      <div style={{ width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>Controllers ({devices.length})</span>
          <button
            className="btn btn-ghost"
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
            style={{ fontSize: 11, padding: '3px 8px', whiteSpace: 'nowrap' }}
          >
            {discoverMutation.isPending ? 'Scanning…' : '🔍 Scan'}
          </button>
        </div>

        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-dim)' }}>
          Session-only troubleshooting. Add points from any device, watch 30-second or 1-minute trends, then disconnect and everything clears.
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {devices.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12 }}>
              No devices discovered yet. Run a scan to populate the controller list.
            </div>
          ) : devices.map(device => (
            <div
              key={device.deviceId}
              className={`tree-node${selectedDeviceId === device.deviceId ? ' selected' : ''}`}
              onClick={() => setSelectedDeviceId(device.deviceId)}
            >
              <span className="node-icon">🎛️</span>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div className="node-label">{device.name ?? `Device ${device.deviceId}`}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{device.modelName ?? device.address}</div>
              </div>
              <span className="node-type-badge">{device.deviceId}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="card" style={{ margin: 16, marginBottom: 0 }}>
            <div className="card-header">
              Point Browser
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
                {selectedDevice ? `${selectedDevice.name ?? `Device ${selectedDevice.deviceId}`} · ${selectedDevice.address}` : 'Select a controller'}
              </span>
            </div>
            <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {(['all', 'inputs', 'outputs'] as const).map(mode => (
                <button
                  key={mode}
                  className={`btn ${pointFilter === mode ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '3px 10px' }}
                  onClick={() => setPointFilter(mode)}
                >
                  {mode === 'all' ? 'All Points' : mode === 'inputs' ? 'Inputs' : 'Outputs'}
                </button>
              ))}
              <input
                type="search"
                placeholder="Search points…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  marginLeft: 'auto',
                  minWidth: 220,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '5px 10px',
                  color: 'var(--text)',
                  fontSize: 12,
                }}
              />
            </div>
          </div>

          <div className="card" style={{ margin: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div className="card-header">
              Available Points
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
                {filteredPoints.length} point(s)
              </span>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              {loadingIo && <div className="loading">Reading inputs and outputs…</div>}
              {ioError && <div className="error-msg">Error: {String(ioError)}</div>}
              {!loadingIo && !ioError && (
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
                    {filteredPoints.map(point => (
                      <PointRow
                        key={`${selectedDeviceId}-${point.type}-${point.instance}`}
                        deviceId={selectedDeviceId}
                        point={point}
                        trendManager={trendManager}
                      />
                    ))}
                    {filteredPoints.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ color: 'var(--text-dim)', padding: 16 }}>
                          No points matched the current filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div style={{ width: 420, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <QuickTrendPanel trendManager={trendManager} />
        </div>
      </div>
    </div>
  );
}

function PointRow({
  deviceId,
  point,
  trendManager,
}: {
  deviceId: number | null;
  point: IoPoint;
  trendManager: TrendManager;
}) {
  const isTrending = deviceId !== null && trendManager.isTrending(deviceId, point.type, point.instance);

  return (
    <tr>
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
          className={`btn ${isTrending ? 'btn-primary' : 'btn-ghost'}`}
          style={{ padding: '3px 10px' }}
          disabled={deviceId === null}
          onClick={() => {
            if (deviceId === null) return;
            trendManager.togglePoint({
              deviceId,
              objectType: point.type,
              objectInstance: point.instance,
              label: typeof point.name === 'string' && point.name.trim() ? point.name : `${point.typeName}-${point.instance}`,
              subtitle: `Device ${deviceId} · ${point.typeName}-${point.instance}`,
              units: stringifyTrendUnit(point.units),
            });
          }}
        >
          {isTrending ? 'Trending' : 'Trend'}
        </button>
      </td>
    </tr>
  );
}

function QuickTrendPanel({ trendManager }: { trendManager: TrendManager }) {
  const [windowMs, setWindowMs] = useState<number>(60_000);

  return (
    <>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Quick Trend</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {trendManager.series.length} tracked point(s) · {trendManager.connected ? 'live' : 'idle'}
          </div>
        </div>
      </div>

      <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {SHORT_WINDOWS.map(option => (
          <button
            key={option.label}
            className={`btn ${windowMs === option.ms ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '3px 10px' }}
            onClick={() => setWindowMs(option.ms)}
          >
            {option.label}
          </button>
        ))}
        <button
          className="btn btn-ghost"
          style={{ marginLeft: 'auto', padding: '3px 10px' }}
          disabled={trendManager.series.length === 0}
          onClick={trendManager.clearHistory}
        >
          Clear
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

      <div style={{ overflowY: 'auto', flex: 1, padding: 12 }}>
        {trendManager.series.length === 0 ? (
          <div className="trend-empty">
            Add points from any controller to build a temporary troubleshooting trend. History is kept only for this live session.
          </div>
        ) : (
          <div className="trend-grid" style={{ gridTemplateColumns: '1fr' }}>
            {trendManager.series.map(series => (
              <QuickTrendTile key={series.key} series={series} windowMs={windowMs} onRemove={() => trendManager.removePoint(series.key)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function QuickTrendTile({
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
          <div className="trend-metric-value">{latest ? formatTrendReading(latest.presentValue, series.units) : 'Waiting…'}</div>
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
    </div>
  );
}

function useQuickTrendManager(): TrendManager {
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
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
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
          // ignore malformed websocket messages
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
  }, [subscriptionSignature]);

  return {
    series,
    connected,
    isTrending: (deviceId, objectType, objectInstance) =>
      series.some(item => item.deviceId === deviceId && item.objectType === objectType && item.objectInstance === objectInstance),
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

function makeTrendKey(deviceId: number, objectType: number, objectInstance: number): string {
  return `${deviceId}:${objectType}:${objectInstance}`;
}

function formatVal(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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
  return `${Math.round(seconds / 60)}m ago`;
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
