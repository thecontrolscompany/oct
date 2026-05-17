import { useState, useCallback, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from './components/Sidebar';
import DetailPane from './components/DetailPane';
import LivePane from './components/LivePane';
import MstpSerialPane from './components/MstpSerialPane';
import PackagesPane from './components/PackagesPane';
import FileViewerPane from './components/FileViewerPane';

import CommissioningPreviewPane from './components/CommissioningPreviewPane';
import DictionaryPane from './components/DictionaryPane';
import EnumsPane from './components/EnumsPane';
import QuickTrendPane from './components/QuickTrendPane';
import type { CctItem } from './api';
import { api } from './api';
import { HAS_API_HOST } from './connection';

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

type View = 'library' | 'live' | 'quick-trend' | 'preview' | 'serial' | 'packages' | 'caf' | 'dictionary' | 'enums';
type Mode = 'online' | 'offline';

type HelpContext = {
  title: string;
  body: string;
};

const CIDR_OPTIONS = [8, 16, 24, 28, 30];

// TL-CWCVT-0 / MAP adapter defaults
const DEFAULTS = { ip: '192.168.142.1', cidr: 24, networkNumber: 65001 };

function getHelpContext(view: View, onlineMode: boolean): HelpContext {
  switch (view) {
    case 'library':
      return {
        title: 'Library',
        body: onlineMode
          ? 'Browse controllers and selected items. Use the left sidebar to pick a device, then inspect details on the right.'
          : 'The library view is only available in online mode. Switch to File Viewer or use the archive browser instead.',
      };
    case 'live':
      return {
        title: 'Live Devices',
        body: 'Monitor connected BACnet devices, read live values, and open a device to inspect points and properties.',
      };
    case 'quick-trend':
      return {
        title: 'Quick Trend',
        body: 'Choose a point to start a lightweight trend view. Use it for quick spot checks without opening the full trend workflow.',
      };
    case 'preview':
      return {
        title: 'Preview',
        body: 'Open a commissioning preview layout without a live controller connection. Useful for checking point placement and bindings.',
      };
    case 'serial':
      return {
        title: 'MS/TP Serial',
        body: 'Inspect serial bus frames, node activity, and token rotation details. Helpful when troubleshooting RS-485 networks.',
      };
    case 'packages':
      return {
        title: 'Packages',
        body: 'Browse controller package metadata and supported capabilities for the selected device or archive.',
      };
    case 'caf':
      return {
        title: 'File Viewer',
        body: onlineMode
          ? 'Open .caf or .dbexport files, explore the archive tree, and inspect graphics inline.'
          : 'Drop a .caf or .dbexport file here to browse it offline. Graphics render when the archive is loaded in the viewer.',
      };
    case 'dictionary':
      return {
        title: 'Dictionary',
        body: 'Look up BACnet and CCT terms, property names, and model mappings used throughout OCT.',
      };
    case 'enums':
      return {
        title: 'Enums',
        body: 'Inspect the enum tables and raw identifiers that OCT uses for class, property, and type mapping.',
      };
  }
}

function AppShell() {
  const [selected, setSelected]     = useState<CctItem | null>(null);
  const [deviceIp, setDeviceIp]     = useState(DEFAULTS.ip);
  const [cidr, setCidr]             = useState(DEFAULTS.cidr);
  const [netNum, setNetNum]         = useState(DEFAULTS.networkNumber);
  const [connecting, setConnecting] = useState(false);
  const [view, setView]             = useState<View>(HAS_API_HOST ? 'library' : 'caf');
  const [mode, setMode]             = useState<Mode>(HAS_API_HOST ? 'online' : 'offline');
  const [helpOpen, setHelpOpen]     = useState(false);
  const qc = useQueryClient();
  const onlineMode = mode === 'online';
  const help = getHelpContext(view, onlineMode);

  useEffect(() => {
    document.title = 'Open Configuration Tool';
  }, []);

  const handleSetMode = useCallback((m: Mode) => {
    setMode(m);
    if (m === 'offline') setView('caf');
    setHelpOpen(false);
  }, []);

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    enabled: onlineMode,
    refetchInterval: onlineMode ? 10_000 : false,
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

  useEffect(() => {
    setHelpOpen(false);
  }, [view, mode]);

  const renderModeToggle = () => (
    <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
      <button
        className="btn"
        style={{
          padding: '3px 10px',
          fontSize: 11,
          background: onlineMode ? '#fff' : 'rgba(255,255,255,0.08)',
          color: onlineMode ? 'var(--shell-blue-ink)' : 'rgba(255,255,255,0.9)',
          borderColor: onlineMode ? '#fff' : 'rgba(255,255,255,0.2)',
        }}
        onClick={() => handleSetMode('online')}
      >
        Online
      </button>
      <button
        className="btn"
        style={{
          padding: '3px 10px',
          fontSize: 11,
          background: !onlineMode ? '#fff' : 'rgba(255,255,255,0.08)',
          color: !onlineMode ? 'var(--shell-blue-ink)' : 'rgba(255,255,255,0.9)',
          borderColor: !onlineMode ? '#fff' : 'rgba(255,255,255,0.2)',
        }}
        onClick={() => handleSetMode('offline')}
      >
        Offline
      </button>
    </div>
  );

  const renderTopbarStatus = () => (
    <div className="topbar-status">
      <span className={`status-dot${onlineMode && bacnetConnected ? ' online' : ' offline'}`} />
      {onlineMode
        ? (bacnetConnected
          ? `${health?.bacnet?.converterIp} · Net ${connNetNum} · ${health?.bacnet?.deviceCount ?? 0} device(s)`
          : HAS_API_HOST
            ? 'Backend unavailable'
            : 'Offline')
        : 'Offline archive browser'}
      <button
        className="topbar-help"
        type="button"
        aria-label={`Help for ${help.title}`}
        title={help.title}
        onClick={() => setHelpOpen(open => !open)}
      >
        ?
      </button>
      {helpOpen && (
        <div className="topbar-help-popover" role="dialog" aria-label={`${help.title} help`}>
          <div className="topbar-help-popover-title">{help.title}</div>
          <div className="topbar-help-popover-body">{help.body}</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="layout">
      {onlineMode && (
        <aside className="sidebar">
          <div className="sidebar-header">Open Configuration Tool</div>
          <Sidebar onSelect={item => { setSelected(item); setView('library'); }} selected={selected} />
        </aside>
      )}

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <span className="logo">OCT</span>
            {renderModeToggle()}
          </div>
          <div className="topbar-center">
            <span className="topbar-title">Open Configuration Tool</span>
            <span className="topbar-subtitle">Offline and online archive browser</span>
          </div>
          {renderTopbarStatus()}
        </header>

        <div className="shell-tabs">
          {([
            ...(onlineMode ? [
              ['library',     'Library',      null],
              ['live',        'Live Devices', health?.bacnet?.deviceCount ? String(health.bacnet.deviceCount) : null],
              ['quick-trend', 'Quick Trend',  null],
              ['preview',     'Preview',      null],
              ['serial',      'MS/TP Serial', health?.mstpSerial?.connected ? '●' : null],
              ['packages',    'Packages',     null],
            ] as [View, string, string | null][] : []),
            ['caf',        'File Viewer',  null],
            ['dictionary', 'Dictionary',   null],
            ['enums',      'Enums',        null],
          ] as [View, string, string | null][]).map(([id, label, badge]) => (
            <button
              key={id}
              className={`tab${view === id ? ' active' : ''}`}
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

        {/* Connection bar — only shown in online mode */}
        {onlineMode && <div className="connection-bar">
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
        </div>}

        <div className="view-viewport">
          {view === 'library'  && <DetailPane item={selected} />}
          {view === 'live'     && <LivePane />}
          {view === 'quick-trend' && <QuickTrendPane />}
          {view === 'preview'  && <CommissioningPreviewPane />}
          {view === 'serial'   && <MstpSerialPane />}
          {view === 'packages'    && <PackagesPane />}
          {view === 'caf'         && <FileViewerPane mode={mode} />}
          {view === 'dictionary'  && <DictionaryPane />}
          {view === 'enums'       && <EnumsPane />}
        </div>
      </div>
    </div>
  );
}
