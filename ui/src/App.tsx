import { useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from './components/Sidebar';
import DetailPane from './components/DetailPane';
import LivePane from './components/LivePane';
import MstpSerialPane from './components/MstpSerialPane';
import PackagesPane from './components/PackagesPane';
import FileViewerPane from './components/FileViewerPane';
import CommissioningPreviewPane from './components/CommissioningPreviewPane';
import QuickTrendPane from './components/QuickTrendPane';
import type { CctItem } from './api';
import { api } from './api';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}

type View = 'library' | 'live' | 'quick-trend' | 'preview' | 'serial' | 'packages' | 'caf';

const CIDR_OPTIONS = [8, 16, 24, 28, 30];

// TL-CWCVT-0 / MAP adapter defaults
const DEFAULTS = { ip: '192.168.142.1', cidr: 24, networkNumber: 65001 };

function AppShell() {
  const [selected, setSelected]     = useState<CctItem | null>(null);
  const [deviceIp, setDeviceIp]     = useState(DEFAULTS.ip);
  const [cidr, setCidr]             = useState(DEFAULTS.cidr);
  const [netNum, setNetNum]         = useState(DEFAULTS.networkNumber);
  const [connecting, setConnecting] = useState(false);
  const [view, setView]             = useState<View>('library');
  const qc = useQueryClient();

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 10_000,
  });

  const bacnetConnected = health?.bacnet?.connected ?? false;
  const subnetBcast     = health?.bacnet?.subnetBroadcast;
  const connNetNum      = health?.bacnet?.networkNumber;

  const handleConnect = useCallback(async () => {
    if (!deviceIp) return;
    setConnecting(true);
    try {
      await api.bacnet.connect(deviceIp, cidr, netNum);
      await qc.invalidateQueries({ queryKey: ['health'] });
      setView('live');
    } catch (err) {
      alert(`Connection failed: ${err}`);
    } finally {
      setConnecting(false);
    }
  }, [deviceIp, cidr, netNum, qc]);

  const handleDisconnect = useCallback(async () => {
    await api.bacnet.disconnect();
    await qc.invalidateQueries({ queryKey: ['health'] });
    await qc.invalidateQueries({ queryKey: ['bacnet'] });
  }, [qc]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">CCT — Controller Library</div>
        <Sidebar onSelect={item => { setSelected(item); setView('library'); }} selected={selected} />
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="logo">CCT Web</span>
          <div style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
            {([
              ['library',  'Library',        null],
              ['live',     'Live Devices',   health?.bacnet?.deviceCount ? String(health.bacnet.deviceCount) : null],
              ['quick-trend', 'Quick Trend', null],
              ['preview',  'Preview',        null],
              ['serial',   'MS/TP Serial',   health?.mstpSerial?.connected ? '●' : null],
              ['packages', 'Packages',       null],
              ['caf',      'File Viewer',    null],
            ] as [View, string, string | null][]).map(([id, label, badge]) => (
              <button
                key={id}
                className={`tab${view === id ? ' active' : ''}`}
                style={{ borderRadius: 4, marginBottom: 0, border: 'none' }}
                onClick={() => setView(id)}
              >
                {label}
                {badge && (
                  <span style={{
                    marginLeft: 6,
                    background: id === 'serial' ? 'var(--success)' : 'var(--accent)',
                    color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 11,
                  }}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="topbar-status">
            <span className={`status-dot${bacnetConnected ? ' online' : ' offline'}`} />
            {bacnetConnected
              ? `${health?.bacnet?.converterIp} · Net ${connNetNum} · ${health?.bacnet?.deviceCount ?? 0} device(s)`
              : 'Offline'}
          </div>
        </header>

        {/* Connection bar */}
        <div className="connection-bar">
          <label>BACnet Router:</label>
          <input
            type="text"
            value={deviceIp}
            onChange={e => setDeviceIp(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !bacnetConnected && handleConnect()}
            disabled={bacnetConnected}
            style={{ width: 130 }}
            title="TL-CWCVT-0 IP address"
          />

          <label>/</label>
          <select
            value={cidr}
            onChange={e => setCidr(parseInt(e.target.value))}
            disabled={bacnetConnected}
            style={{
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
              padding: '4px 6px', color: 'var(--text)', fontSize: 12, width: 50,
            }}
          >
            {CIDR_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <label>Net:</label>
          <input
            type="number"
            value={netNum}
            onChange={e => setNetNum(parseInt(e.target.value))}
            disabled={bacnetConnected}
            style={{ width: 72 }}
            title="BACnet network number of the MS/TP bus"
          />

          {bacnetConnected ? (
            <button className="btn btn-ghost" onClick={handleDisconnect}>Disconnect</button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={!deviceIp || connecting}
              onClick={handleConnect}
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          )}

          <span style={{ color: 'var(--border)', margin: '0 4px' }}>|</span>

          {bacnetConnected && subnetBcast ? (
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
              broadcast{' '}
              <span style={{ color: 'var(--accent)', fontFamily: 'Consolas, monospace' }}>{subnetBcast}</span>
              {' · '}UDP 47808
            </span>
          ) : (
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
              UDP 47808 · Net {netNum}
            </span>
          )}
        </div>

        {view === 'library'  && <DetailPane item={selected} />}
        {view === 'live'     && <LivePane />}
        {view === 'quick-trend' && <QuickTrendPane />}
        {view === 'preview'  && <CommissioningPreviewPane />}
        {view === 'serial'   && <MstpSerialPane />}
        {view === 'packages' && <PackagesPane />}
        {view === 'caf'      && <FileViewerPane />}
      </div>
    </div>
  );
}
