import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wsUrl } from '../connection';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortInfo {
  path: string;
  manufacturer?: string;
  pnpId?: string;
}

interface SerialStatus {
  connected: boolean;
  path: string | null;
  baudRate: number | null;
  mode: 'passive' | 'active' | null;
  frameCount: number;
  uptimeMs: number;
}

interface BacnetInfo {
  npduVersion: number;
  pduTypeName: string;
  serviceName: string | null;
  invokeId?: number;
  deviceId?: number;
  vendorId?: number;
}

interface MstpFrame {
  ts: number;
  frameType: number;
  frameTypeName: string;
  dst: number;
  src: number;
  dataLength: number;
  headerCrcOk: boolean;
  dataCrcOk: boolean | null;
  data: number[];
  bacnet?: BacnetInfo;
}

// ─── Frame type color palette ─────────────────────────────────────────────────

const FRAME_COLOR: Record<string, string> = {
  'Token':                          '#1e3a5f',   // blue
  'Poll-for-Master':                '#1a3a1f',   // green (dim)
  'Reply-to-Poll-for-Master':       '#1a3a1f',
  'Test-Request':                   '#3a1f1a',   // amber
  'Test-Response':                  '#3a1f1a',
  'BACnet-Data-Expecting-Reply':    '#2d1b4e',   // purple
  'BACnet-Data-Not-Expecting-Reply':'#2d1b4e',
  'Reply-Postponed':                '#3a2a1a',   // orange
};

const FRAME_TEXT: Record<string, string> = {
  'Token':                          '#60a5fa',
  'Poll-for-Master':                '#4ade80',
  'Reply-to-Poll-for-Master':       '#86efac',
  'Test-Request':                   '#fbbf24',
  'Test-Response':                  '#fde68a',
  'BACnet-Data-Expecting-Reply':    '#c4b5fd',
  'BACnet-Data-Not-Expecting-Reply':'#a78bfa',
  'Reply-Postponed':                '#fb923c',
};

function frameColor(name: string) {
  return FRAME_COLOR[name] ?? 'var(--surface2)';
}
function frameTextColor(name: string) {
  return FRAME_TEXT[name] ?? 'var(--text-dim)';
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}
async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error((e as { error: string }).error ?? r.statusText);
  }
  return r.json();
}
async function del<T>(url: string): Promise<T> {
  const r = await fetch(url, { method: 'DELETE' });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

// ─── Main component ───────────────────────────────────────────────────────────

const MAX_FRAMES = 500;

export default function MstpSerialPane() {
  const [frames, setFrames] = useState<MstpFrame[]>([]);
  const [paused, setPaused] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterMac, setFilterMac] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedFrame, setSelectedFrame] = useState<MstpFrame | null>(null);
  const [baudRate, setBaudRate] = useState(38400);
  const [mode, setMode] = useState<'passive' | 'active'>('passive');
  const [selectedPort, setSelectedPort] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<MstpFrame[]>([]);
  const qc = useQueryClient();

  const { data: ports = [] } = useQuery<PortInfo[]>({
    queryKey: ['mstp-serial', 'ports'],
    queryFn: () => get('/api/mstp-serial/ports'),
    refetchInterval: 3000,
  });

  const { data: status } = useQuery<SerialStatus>({
    queryKey: ['mstp-serial', 'status'],
    queryFn: () => get('/api/mstp-serial/status'),
    refetchInterval: 2000,
  });

  const connectMutation = useMutation({
    mutationFn: () => post('/api/mstp-serial/connect', { path: selectedPort, baudRate, mode }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mstp-serial', 'status'] });
      startWs();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => del('/api/mstp-serial/connect'),
    onSuccess: () => {
      stopWs();
      qc.invalidateQueries({ queryKey: ['mstp-serial', 'status'] });
    },
  });

  // Flush pending frames at 20fps to avoid thrashing React state
  useEffect(() => {
    const t = setInterval(() => {
      if (pendingRef.current.length === 0) return;
      const batch = pendingRef.current.splice(0);
      if (!paused) {
        setFrames(prev => [...prev, ...batch].slice(-MAX_FRAMES));
      }
    }, 50);
    return () => clearInterval(t);
  }, [paused]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [frames, autoScroll]);

  const startWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(wsUrl('/ws'));
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'mstp-stream-start' }));
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data) as { type: string; frame?: MstpFrame };
        if (msg.type === 'mstp-frame' && msg.frame) {
          pendingRef.current.push(msg.frame);
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => { wsRef.current = null; };
  }, []);

  const stopWs = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'mstp-stream-stop' }));
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // Auto-connect WS if port already open
  useEffect(() => {
    if (status?.connected && !wsRef.current) startWs();
  }, [status?.connected, startWs]);

  useEffect(() => () => stopWs(), [stopWs]);

  // Build frame type filter options from seen frames
  const seenTypes = [...new Set(frames.map(f => f.frameTypeName))];

  const macNum = filterMac.trim() !== '' ? parseInt(filterMac.trim()) : null;
  const filtered = frames.filter(f =>
    (!filterType || f.frameTypeName === filterType) &&
    (macNum === null || f.src === macNum || f.dst === macNum)
  );

  // Bus activity: tokens per second, unique MACs
  const tokenCount = frames.filter(f => f.frameTypeName === 'Token').length;
  const uniqueMacs = new Set([...frames.map(f => f.src), ...frames.filter(f => f.dst !== 255).map(f => f.dst)]);
  const uptimeSec = (status?.uptimeMs ?? 0) / 1000;
  const tps = uptimeSec > 0 ? (tokenCount / uptimeSec).toFixed(1) : '—';

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Connect bar */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>COM Port:</label>
        <select
          value={selectedPort}
          onChange={e => setSelectedPort(e.target.value)}
          disabled={status?.connected}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 12 }}
        >
          <option value="">— select —</option>
          {ports.map(p => (
            <option key={p.path} value={p.path}>
              {p.path}{p.manufacturer ? ` (${p.manufacturer})` : ''}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>Baud:</label>
        <select
          value={baudRate}
          onChange={e => setBaudRate(+e.target.value)}
          disabled={status?.connected}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 12 }}
        >
          {[9600, 19200, 38400, 76800].map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>Mode:</label>
        <select
          value={mode}
          onChange={e => setMode(e.target.value as 'passive' | 'active')}
          disabled={status?.connected}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 12 }}
        >
          <option value="passive">Passive (sniffer)</option>
          <option value="active">Active (master)</option>
        </select>

        {status?.connected ? (
          <button className="btn btn-ghost" onClick={() => disconnectMutation.mutate()}>Disconnect</button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={!selectedPort || connectMutation.isPending}
            onClick={() => connectMutation.mutate()}
          >
            {connectMutation.isPending ? 'Opening…' : 'Open Port'}
          </button>
        )}

        {status?.connected && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
            {status.path} · {status.baudRate} baud · {status.mode} ·{' '}
            <span style={{ color: 'var(--accent)' }}>{status.frameCount.toLocaleString()}</span> frames
          </span>
        )}

        {connectMutation.isError && (
          <span style={{ fontSize: 11, color: 'var(--danger)' }}>{String(connectMutation.error)}</span>
        )}
      </div>

      {/* Stats bar */}
      {status?.connected && (
        <div style={{ padding: '5px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 20, fontSize: 12 }}>
          <Stat label="Frames captured" value={frames.length.toLocaleString()} />
          <Stat label="Token/s" value={tps} />
          <Stat label="Active MACs" value={uniqueMacs.size} />
          <Stat label="Tokens seen" value={tokenCount} />
          <Stat label="BACnet frames" value={frames.filter(f => f.bacnet).length} />
        </div>
      )}

      {/* Filter bar */}
      <div style={{ padding: '5px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Filter:</span>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', color: 'var(--text)', fontSize: 12 }}
        >
          <option value="">All types</option>
          {seenTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>MAC:</label>
        <input
          type="number" min={0} max={255} placeholder="0–255"
          value={filterMac}
          onChange={e => setFilterMac(e.target.value)}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', color: 'var(--text)', fontSize: 12, width: 70 }}
        />

        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => { setFilterType(''); setFilterMac(''); }}>
          Clear
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => setPaused(p => !p)}>
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => setFrames([])}>
            🗑 Clear
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
            Auto-scroll
          </label>
        </div>
      </div>

      {/* Frame list + detail panel */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Frame log */}
        <div
          ref={listRef}
          style={{ flex: '0 0 580px', overflow: 'auto', fontFamily: 'Consolas, monospace', fontSize: 11 }}
        >
          {!status?.connected && frames.length === 0 && (
            <div className="empty-state">
              <div className="icon">🔌</div>
              <p>Select a COM port and click Open Port</p>
              <p style={{ fontSize: 11 }}>Passive mode is safe on a live bus — listen-only, no transmission</p>
            </div>
          )}

          {filtered.map((f, i) => (
            <div
              key={i}
              onClick={() => setSelectedFrame(f)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '2px 12px',
                cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)',
                background: selectedFrame === f ? 'var(--surface2)' : 'transparent',
              }}
            >
              <span style={{ color: 'var(--text-dim)', width: 65, flexShrink: 0 }}>
                {new Date(f.ts).toISOString().slice(11, 23)}
              </span>

              <span style={{
                background: frameColor(f.frameTypeName),
                color: frameTextColor(f.frameTypeName),
                padding: '1px 6px', borderRadius: 3, flexShrink: 0, width: 210,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {f.frameTypeName}
              </span>

              <span style={{ color: 'var(--accent)', width: 30, textAlign: 'right', flexShrink: 0 }}>
                {f.src}
              </span>
              <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>→</span>
              <span style={{ color: f.dst === 255 ? 'var(--warning)' : 'var(--text)', width: 30, flexShrink: 0 }}>
                {f.dst === 255 ? 'ALL' : f.dst}
              </span>

              {f.bacnet && (
                <span style={{ color: '#c4b5fd', marginLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.bacnet.serviceName ?? f.bacnet.pduTypeName}
                  {f.bacnet.deviceId !== undefined ? ` ID:${f.bacnet.deviceId}` : ''}
                </span>
              )}

              {(!f.headerCrcOk || f.dataCrcOk === false) && (
                <span style={{ color: 'var(--danger)', marginLeft: 'auto', flexShrink: 0 }}>⚠ CRC</span>
              )}
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div style={{ flex: 1, borderLeft: '1px solid var(--border)', overflow: 'auto', padding: 16 }}>
          {selectedFrame ? (
            <FrameDetail frame={selectedFrame} />
          ) : (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 8 }}>
              Click a frame to see details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Frame detail panel ───────────────────────────────────────────────────────

function FrameDetail({ frame }: { frame: MstpFrame }) {
  return (
    <>
      <div className="card">
        <div className="card-header" style={{ color: frameTextColor(frame.frameTypeName), background: frameColor(frame.frameTypeName) }}>
          {frame.frameTypeName}
        </div>
        <div className="card-body">
          <div className="grid-2">
            <Kv label="Timestamp"    value={new Date(frame.ts).toISOString()} />
            <Kv label="Frame Type"   value={`0x${frame.frameType.toString(16).padStart(2, '0')} (${frame.frameType})`} />
            <Kv label="Source MAC"   value={frame.src} />
            <Kv label="Destination"  value={frame.dst === 255 ? '255 (Broadcast)' : frame.dst} />
            <Kv label="Data Length"  value={frame.dataLength} />
            <Kv label="Header CRC"   value={frame.headerCrcOk ? '✓ OK' : '✗ FAIL'} color={frame.headerCrcOk ? 'var(--success)' : 'var(--danger)'} />
            {frame.dataCrcOk !== null && (
              <Kv label="Data CRC" value={frame.dataCrcOk ? '✓ OK' : '✗ FAIL'} color={frame.dataCrcOk ? 'var(--success)' : 'var(--danger)'} />
            )}
          </div>
        </div>
      </div>

      {frame.bacnet && (
        <div className="card">
          <div className="card-header">BACnet NPDU / APDU</div>
          <div className="card-body">
            <div className="grid-2">
              <Kv label="PDU Type"    value={frame.bacnet.pduTypeName} />
              <Kv label="Service"     value={frame.bacnet.serviceName ?? '—'} accent />
              {frame.bacnet.invokeId !== undefined && <Kv label="Invoke ID" value={frame.bacnet.invokeId} />}
              {frame.bacnet.deviceId !== undefined && <Kv label="Device ID" value={frame.bacnet.deviceId} accent />}
              {frame.bacnet.vendorId !== undefined && <Kv label="Vendor ID" value={frame.bacnet.vendorId} />}
            </div>
          </div>
        </div>
      )}

      {frame.dataLength > 0 && (
        <div className="card">
          <div className="card-header">Raw Data ({frame.dataLength} bytes)</div>
          <div className="card-body" style={{ fontFamily: 'Consolas, monospace', fontSize: 11, wordBreak: 'break-all' }}>
            {/* Hex dump */}
            {chunk(frame.data, 16).map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 2 }}>
                <span style={{ color: 'var(--text-dim)', width: 36 }}>
                  {(i * 16).toString(16).padStart(4, '0')}
                </span>
                <span style={{ color: 'var(--accent)', flex: '0 0 290px' }}>
                  {row.map(b => b.toString(16).padStart(2, '0')).join(' ')}
                </span>
                <span style={{ color: 'var(--text-dim)' }}>
                  {row.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <span>
      <span style={{ color: 'var(--text-dim)' }}>{label}: </span>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{String(value)}</span>
    </span>
  );
}

function Kv({ label, value, accent, color }: { label: string; value: unknown; accent?: boolean; color?: string }) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div style={{ fontSize: 13, fontFamily: 'Consolas, monospace', color: color ?? (accent ? 'var(--accent)' : 'var(--text)'), marginTop: 3 }}>
        {String(value)}
      </div>
    </div>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
