import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface ScanDevice {
  address: string;
  deviceId: number;
  name?: string;
  modelName?: string;
  firmwareRevision?: string;
  responseTimeMs: number;
}

interface ScanResult {
  scanDurationMs: number;
  lowLimit: number;
  highLimit: number;
  count: number;
  devices: ScanDevice[];
}

interface NodeStats {
  address: string;
  deviceId: number;
  name?: string;
  jciMac: number | null;
  saBusMac: number | null;
  supervisorMac: number | null;
  lostToken: number | null;
  tokenLoopTimeMs: number | null;
  maxTokenLoopTimeMs: number | null;
  tokenFramesRxed: number | null;
  tokenFramesTxed: number | null;
  saBusPerfLabel: string | null;
  saBusAvgTokenLoopTimeMs: number | null;
  saBusCovPerMin: number | null;
  saBusWritesPerMin: number | null;
  mstpBaudLabel: string | null;
  activeBaudLabel: string | null;
  mstpApduLength: number | null;
  internodeCommTimer: number | null;
  activeNodeTable: number[] | null;
  health: 'good' | 'marginal' | 'poor' | 'unknown';
}

const HEALTH_COLOR: Record<string, string> = {
  good: 'var(--success)',
  marginal: 'var(--warning)',
  poor: 'var(--danger)',
  unknown: 'var(--text-dim)',
};

const HEALTH_ICON: Record<string, string> = {
  good: '✓', marginal: '⚠', poor: '✗', unknown: '?',
};

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export default function MstpDiagnostics() {
  const [tab, setTab] = useState<'scan' | 'health' | 'standard' | 'netport'>('scan');

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="tabs">
        {([
          ['scan',     'Bus Scanner'],
          ['health',   'JCI Node Health'],
          ['standard', 'Standard BACnet'],
          ['netport',  'Network Ports'],
        ] as const).map(([id, label]) => (
          <div key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </div>
        ))}
      </div>
      <div className="content" style={{ overflow: 'auto' }}>
        {tab === 'scan'     && <BusScanner />}
        {tab === 'health'   && <NodeHealth />}
        {tab === 'standard' && <StandardBacnet />}
        {tab === 'netport'  && <NetworkPorts />}
      </div>
    </div>
  );
}

// ─── Bus Scanner ───────────────────────────────────────────────────────────────

function BusScanner() {
  const [lowLimit, setLowLimit] = useState(0);
  const [highLimit, setHighLimit] = useState(4194303);
  const [timeoutSec, setTimeoutSec] = useState(6);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<ScanDevice | null>(null);

  const scanMutation = useMutation({
    mutationFn: () =>
      post<ScanResult>('/api/mstp/scan', { lowLimit, highLimit, timeoutMs: timeoutSec * 1000 }),
    onSuccess: (data) => { setResult(data); setSelectedDevice(null); },
  });

  // Find duplicate device IDs in the scan result
  const duplicates = result
    ? result.devices.filter((d, i, arr) => arr.findIndex(x => x.deviceId === d.deviceId) !== i)
    : [];

  return (
    <>
      <div className="card">
        <div className="card-header">WHO-IS Range Scan</div>
        <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Low Limit">
            <input type="number" min={0} max={4194303} value={lowLimit}
              onChange={e => setLowLimit(+e.target.value)} style={inputStyle} />
          </Field>
          <Field label="High Limit">
            <input type="number" min={0} max={4194303} value={highLimit}
              onChange={e => setHighLimit(+e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Timeout (s)">
            <input type="number" min={2} max={30} value={timeoutSec}
              onChange={e => setTimeoutSec(+e.target.value)} style={{ ...inputStyle, width: 70 }} />
          </Field>

          {/* Quick presets */}
          <div style={{ display: 'flex', gap: 4, alignSelf: 'flex-end' }}>
            {[
              { label: 'MS/TP 0–127', lo: 0, hi: 127 },
              { label: 'MS/TP 0–255', lo: 0, hi: 255 },
              { label: 'Full range', lo: 0, hi: 4194303 },
            ].map(p => (
              <button key={p.label} className="btn btn-ghost"
                style={{ fontSize: 11 }}
                onClick={() => { setLowLimit(p.lo); setHighLimit(p.hi); }}>
                {p.label}
              </button>
            ))}
          </div>

          <button
            className="btn btn-primary"
            disabled={scanMutation.isPending}
            onClick={() => scanMutation.mutate()}
          >
            {scanMutation.isPending ? `Scanning (${timeoutSec}s)…` : '🔍 Scan'}
          </button>
        </div>
      </div>

      {scanMutation.isError && (
        <div className="error-msg">Scan error: {String(scanMutation.error)}</div>
      )}

      {result && (
        <>
          {/* Summary bar */}
          <div className="card">
            <div className="card-body" style={{ display: 'flex', gap: 20 }}>
              <Kv label="Devices found" value={result.count} accent />
              <Kv label="Scan duration" value={`${(result.scanDurationMs / 1000).toFixed(1)}s`} />
              <Kv label="Range" value={`${result.lowLimit} – ${result.highLimit}`} />
              {duplicates.length > 0 && (
                <Kv label="⚠ Duplicate IDs" value={duplicates.length} color="var(--danger)" />
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, overflow: 'hidden' }}>
            {/* Device list */}
            <div className="card" style={{ flex: '0 0 300px', overflow: 'hidden', display: 'flex', flexDirection: 'column', marginBottom: 0 }}>
              <div className="card-header">Responding Devices</div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table className="attr-table">
                  <thead>
                    <tr>
                      <th>Instance</th>
                      <th>Name / Model</th>
                      <th>RTT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.devices
                      .slice()
                      .sort((a, b) => a.deviceId - b.deviceId)
                      .map(d => (
                        <tr
                          key={d.deviceId}
                          style={{ cursor: 'pointer', background: selectedDevice?.deviceId === d.deviceId ? 'var(--surface2)' : undefined }}
                          onClick={() => setSelectedDevice(d)}
                        >
                          <td className="attr-value">{d.deviceId}</td>
                          <td>
                            <div>{d.name ?? '—'}</div>
                            {d.modelName && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{d.modelName}</div>}
                          </td>
                          <td style={{ fontSize: 11, color: rttColor(d.responseTimeMs) }}>
                            {d.responseTimeMs >= 0 ? `${d.responseTimeMs}ms` : '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Active node bubble chart */}
            <div className="card" style={{ flex: 1, overflow: 'hidden', marginBottom: 0 }}>
              <div className="card-header">Node Map (0–127)</div>
              <div className="card-body">
                <NodeBubbleMap devices={result.devices} />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Node Health ──────────────────────────────────────────────────────────────

function NodeHealth() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<NodeStats | null>(null);

  const { data: bulk = [], isLoading, error } = useQuery({
    queryKey: ['mstp', 'bulk'],
    queryFn: () => get<NodeStats[]>('/api/mstp/stats-bulk'),
    refetchInterval: 30_000,
    enabled: true,
  });

  const detailQuery = useQuery({
    queryKey: ['mstp', 'stats', selected?.deviceId],
    queryFn: () => get<NodeStats>(`/api/mstp/stats/${selected!.deviceId}`),
    enabled: !!selected,
  });

  if (isLoading) return <div className="loading">Loading node stats…</div>;
  if (error) return <div className="error-msg">Error: {String(error)}</div>;
  if (bulk.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">📡</div>
        <p>Run a Bus Scan first to discover devices</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 16, overflow: 'hidden' }}>
      {/* Summary table */}
      <div className="card" style={{ flex: '0 0 360px', overflow: 'hidden', display: 'flex', flexDirection: 'column', marginBottom: 0 }}>
        <div className="card-header">
          All Nodes
          <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }}
            onClick={() => qc.invalidateQueries({ queryKey: ['mstp', 'bulk'] })}>
            ↻ Refresh
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table className="attr-table">
            <thead><tr><th>Health</th><th>Device</th><th>MAC</th><th>Lost Token</th><th>Baud</th></tr></thead>
            <tbody>
              {bulk.map(n => (
                <tr key={n.deviceId} style={{ cursor: 'pointer', background: selected?.deviceId === n.deviceId ? 'var(--surface2)' : undefined }}
                  onClick={() => setSelected(n)}>
                  <td>
                    <span style={{ color: HEALTH_COLOR[n.health], fontWeight: 700 }}>
                      {HEALTH_ICON[n.health]} {n.health}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{n.name ?? `Dev ${n.deviceId}`}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>ID {n.deviceId}</div>
                  </td>
                  <td className="attr-value">{n.jciMac ?? '—'}</td>
                  <td style={{ color: n.lostToken ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                    {n.lostToken ?? '—'}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{n.activeBaudLabel ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {selected ? (
          detailQuery.isLoading
            ? <div className="loading">Reading node stats…</div>
            : detailQuery.data
              ? <NodeStatsDetail stats={detailQuery.data} />
              : null
        ) : (
          <div className="empty-state"><div className="icon">🔍</div><p>Select a node for full diagnostics</p></div>
        )}
      </div>
    </div>
  );
}

function NodeStatsDetail({ stats }: { stats: NodeStats }) {
  return (
    <>
      <div className="card">
        <div className="card-header">
          <span style={{ color: HEALTH_COLOR[stats.health], fontWeight: 700, fontSize: 15 }}>
            {HEALTH_ICON[stats.health]}
          </span>
          {stats.name ?? `Device ${stats.deviceId}`}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
            ID {stats.deviceId} · {stats.address}
          </span>
        </div>
        <div className="card-body">
          <div className="grid-3">
            <Kv label="JCI MAC" value={stats.jciMac ?? '—'} accent />
            <Kv label="SA Bus MAC" value={stats.saBusMac ?? '—'} />
            <Kv label="Supervisor MAC" value={stats.supervisorMac ?? '—'} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Token Bus Statistics</div>
        <div className="card-body">
          <div className="grid-3">
            <Kv label="Lost Tokens" value={stats.lostToken ?? '—'}
              color={stats.lostToken ? (stats.lostToken > 10 ? 'var(--danger)' : 'var(--warning)') : 'var(--success)'} />
            <Kv label="Token Loop Time" value={stats.tokenLoopTimeMs !== null ? `${stats.tokenLoopTimeMs} ms` : '—'} />
            <Kv label="Max Token Loop" value={stats.maxTokenLoopTimeMs !== null ? `${stats.maxTokenLoopTimeMs} ms` : '—'}
              color={stats.maxTokenLoopTimeMs !== null && stats.maxTokenLoopTimeMs > 500 ? 'var(--warning)' : undefined} />
            <Kv label="Tokens Rx" value={stats.tokenFramesRxed ?? '—'} />
            <Kv label="Tokens Tx" value={stats.tokenFramesTxed ?? '—'} />
            <Kv label="Baud Rate" value={stats.activeBaudLabel ?? stats.mstpBaudLabel ?? '—'} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">SA Bus</div>
        <div className="card-body">
          <div className="grid-3">
            <Kv label="SA Bus Performance" value={stats.saBusPerfLabel ?? '—'}
              color={stats.saBusPerfLabel ? HEALTH_COLOR[stats.saBusPerfLabel.toLowerCase()] : undefined} />
            <Kv label="Avg Token Loop" value={stats.saBusAvgTokenLoopTimeMs !== null ? `${stats.saBusAvgTokenLoopTimeMs} ms` : '—'} />
            <Kv label="COV/min" value={stats.saBusCovPerMin ?? '—'} />
            <Kv label="Writes/min" value={stats.saBusWritesPerMin ?? '—'} />
            <Kv label="APDU Length" value={stats.mstpApduLength ?? '—'} />
            <Kv label="Internode Timer" value={stats.internodeCommTimer ?? '—'} />
          </div>
        </div>
      </div>

      {stats.activeNodeTable && stats.activeNodeTable.length > 0 && (
        <div className="card">
          <div className="card-header">Active Node Table ({stats.activeNodeTable.length} nodes)</div>
          <div className="card-body">
            <NodeBubbleMap devices={stats.activeNodeTable.map(mac => ({ deviceId: mac, responseTimeMs: 0 }))} />
          </div>
        </div>
      )}
    </>
  );
}

// ─── Standard BACnet (non-JCI) ───────────────────────────────────────────────

interface StandardDevice {
  deviceId: number;
  address: string;
  objectName: unknown;
  description: unknown;
  vendorName: unknown;
  vendorId: unknown;
  modelName: unknown;
  firmwareRevision: unknown;
  applicationSoftwareVersion: unknown;
  protocolVersion: unknown;
  protocolRevision: unknown;
  maxApduLength: unknown;
  systemStatus: unknown;
  databaseRevision: unknown;
  objectCount: number | null;
  networkPorts: Array<{
    instance: number;
    name: unknown;
    networkType: string | null;
    networkNumber: unknown;
    macAddress: unknown;
    maxMaster: unknown;
    maxInfoFrames: unknown;
    linkSpeed: unknown;
    reliability: unknown;
  }>;
}

function StandardBacnet() {
  const devices = window.__cctDevices ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(devices[0]?.deviceId ?? null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['mstp', 'standard', selectedId],
    queryFn: () => get<StandardDevice>(`/api/mstp/standard/${selectedId}`),
    enabled: selectedId !== null,
  });

  if (devices.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">📡</div>
        <p>Run a Bus Scan first to discover devices</p>
        <p style={{ fontSize: 11 }}>Works with any BACnet vendor — no JCI proprietary properties required</p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          Device
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>
            Standard ASHRAE 135 properties — vendor-neutral
          </span>
          {data && (
            <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }}
              onClick={() => refetch()}>↻ Refresh</button>
          )}
        </div>
        <div className="card-body" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {devices.map((d: { deviceId: number; name?: string }) => (
            <button key={d.deviceId}
              className={`btn${selectedId === d.deviceId ? ' btn-primary' : ' btn-ghost'}`}
              style={{ fontSize: 12 }}
              onClick={() => setSelectedId(d.deviceId)}>
              {d.name ?? `Device ${d.deviceId}`}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="loading">Reading device properties…</div>}
      {error && <div className="error-msg">Error: {String(error)}</div>}
      {data && (
        <>
          <div className="card">
            <div className="card-header">Device Identity</div>
            <div className="card-body">
              <div className="grid-3">
                <Kv label="Object Name"    value={data.objectName   ?? '—'} accent />
                <Kv label="Vendor"         value={data.vendorName   ?? '—'} />
                <Kv label="Vendor ID"      value={data.vendorId     ?? '—'} />
                <Kv label="Model Name"     value={data.modelName    ?? '—'} />
                <Kv label="Firmware"       value={data.firmwareRevision ?? '—'} />
                <Kv label="App Version"    value={data.applicationSoftwareVersion ?? '—'} />
                <Kv label="Protocol Ver."  value={data.protocolVersion  ?? '—'} />
                <Kv label="Protocol Rev."  value={data.protocolRevision ?? '—'} />
                <Kv label="Max APDU"       value={data.maxApduLength ?? '—'} />
                <Kv label="System Status"  value={data.systemStatus  ?? '—'} />
                <Kv label="DB Revision"    value={data.databaseRevision ?? '—'} />
                <Kv label="Object Count"   value={data.objectCount ?? '—'} />
              </div>
            </div>
          </div>

          {data.networkPorts.length > 0 && (
            <div className="card">
              <div className="card-header">Network Port Objects ({data.networkPorts.length})</div>
              <table className="attr-table">
                <thead>
                  <tr>
                    <th>Port</th><th>Name</th><th>Type</th><th>Net #</th>
                    <th>MAC</th><th>Max Master</th><th>Max Frames</th><th>Link Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.networkPorts.map(p => (
                    <tr key={p.instance}>
                      <td className="attr-value">{p.instance}</td>
                      <td>{p.name !== null && p.name !== undefined ? String(p.name) : '—'}</td>
                      <td>
                        {p.networkType
                          ? <span className={`tag ${p.networkType === 'MS/TP' ? 'tag-blue' : 'tag-gray'}`}>{p.networkType}</span>
                          : '—'}
                      </td>
                      <td className="attr-value">{p.networkNumber !== null && p.networkNumber !== undefined ? String(p.networkNumber) : '—'}</td>
                      <td style={{ fontFamily: 'Consolas, monospace', fontSize: 11 }}>
                        {p.macAddress !== null && p.macAddress !== undefined ? String(p.macAddress) : '—'}
                      </td>
                      <td>{p.maxMaster !== null && p.maxMaster !== undefined ? String(p.maxMaster) : '—'}</td>
                      <td>{p.maxInfoFrames !== null && p.maxInfoFrames !== undefined ? String(p.maxInfoFrames) : '—'}</td>
                      <td style={{ fontSize: 11 }}>{p.linkSpeed !== null && p.linkSpeed !== undefined ? String(p.linkSpeed) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ─── Network Ports ────────────────────────────────────────────────────────────

function NetworkPorts() {
  const devices = window.__cctDevices ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(devices[0]?.deviceId ?? null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['mstp', 'netport', selectedId],
    queryFn: () => get<{ deviceId: number; ports: object[] }>(`/api/mstp/network-port/${selectedId}`),
    enabled: selectedId !== null,
  });

  const NET_TYPE: Record<number, string> = { 0: 'Ethernet', 1: 'BACnet/IP', 2: 'MS/TP', 3: 'PTP', 4: 'ARCNET' };

  return (
    <>
      <div className="card">
        <div className="card-header">Device Selection</div>
        <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {devices.length === 0
            ? <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>No devices discovered. Run a bus scan first.</span>
            : devices.map((d: { deviceId: number; name?: string }) => (
                <button key={d.deviceId}
                  className={`btn${selectedId === d.deviceId ? ' btn-primary' : ' btn-ghost'}`}
                  style={{ fontSize: 12 }}
                  onClick={() => setSelectedId(d.deviceId)}>
                  {d.name ?? `Device ${d.deviceId}`}
                </button>
              ))
          }
        </div>
      </div>

      {isLoading && <div className="loading">Reading Network Port Objects…</div>}
      {error && <div className="error-msg">Error: {String(error)}</div>}
      {data && (
        data.ports.length === 0
          ? <div className="empty-state"><div className="icon">🔌</div><p>No Network Port Objects on this device</p></div>
          : (data.ports as Record<string, unknown>[]).map((port, i) => (
              <div key={i} className="card">
                <div className="card-header">
                  Port {port.instance as number}
                  {port.objectName != null && <span style={{ marginLeft: 8, fontWeight: 400 }}>— {String(port.objectName)}</span>}
                  {port.networkType !== null && (
                    <span className="tag tag-blue" style={{ marginLeft: 8 }}>
                      {NET_TYPE[port.networkType as number] ?? `Type ${port.networkType}`}
                    </span>
                  )}
                </div>
                <div className="card-body">
                  <div className="grid-3">
                    {[
                      ['Network Number', port.networkNumber],
                      ['MAC Address', port.macAddress],
                      ['Max Master', port.maxMaster],
                      ['Max Info Frames', port.maxInfoFrames],
                      ['Link Speed', port.linkSpeed],
                      ['Reliability', port.reliability],
                      ['Out of Service', String(port.outOfService)],
                      ['Changes Pending', String(port.changesPending)],
                    ].map(([label, val]) => (
                      <Kv key={label as string} label={label as string} value={val !== null && val !== undefined ? String(val) : '—'} />
                    ))}
                  </div>
                </div>
              </div>
            ))
      )}
    </>
  );
}

// ─── Node Bubble Map ──────────────────────────────────────────────────────────

function NodeBubbleMap({ devices }: { devices: Array<{ deviceId: number; responseTimeMs?: number }> }) {
  const active = new Map(devices.map(d => [d.deviceId, d.responseTimeMs ?? 0]));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {Array.from({ length: 128 }, (_, i) => {
        const rtt = active.get(i);
        const isActive = rtt !== undefined;
        return (
          <div
            key={i}
            title={isActive ? `MAC ${i}${rtt !== undefined && rtt >= 0 ? ` — ${rtt}ms` : ''}` : `MAC ${i} — no response`}
            style={{
              width: 28, height: 28,
              borderRadius: 6,
              background: isActive ? (rtt !== undefined ? rttBg(rtt) : 'var(--accent)') : 'var(--surface2)',
              border: `1px solid ${isActive ? 'transparent' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: isActive ? '#fff' : 'var(--border)',
              cursor: isActive ? 'default' : 'default',
              fontWeight: isActive ? 700 : 400,
            }}
          >
            {i}
          </div>
        );
      })}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

function Kv({ label, value, accent, color }: { label: string; value: unknown; accent?: boolean; color?: string }) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: 14, color: color ?? (accent ? 'var(--accent)' : undefined) }}>
        {String(value)}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '5px 10px', color: 'var(--text)', fontSize: 13, width: 110,
};

function rttColor(ms: number) {
  if (ms < 0) return 'var(--text-dim)';
  if (ms < 200) return 'var(--success)';
  if (ms < 500) return 'var(--warning)';
  return 'var(--danger)';
}

function rttBg(ms: number) {
  if (ms < 200) return '#166534';
  if (ms < 500) return '#92400e';
  return '#7f1d1d';
}

// Global type augmentation for passing device list to NetworkPorts
declare global {
  interface Window {
    __cctDevices?: Array<{ deviceId: number; name?: string }>;
  }
}
