import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Dashboard from './panes/Dashboard';
import BusPane from './panes/BusPane';
import SettingsPane from './panes/SettingsPane';
import DiagnosticsPane from './panes/DiagnosticsPane';
import FirmwarePane from './panes/FirmwarePane';

const TABS = ['dashboard', 'bus', 'settings', 'diagnostics', 'firmware'] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  dashboard:   'Dashboard',
  bus:         'MS/TP Bus',
  settings:    'Settings',
  diagnostics: 'Diagnostics',
  firmware:    'Firmware',
};

const STORED_IP_KEY = 'oscvt-device-ip';
function storedIp() {
  try { return localStorage.getItem(STORED_IP_KEY) || '192.168.142.1'; } catch { return '192.168.142.1'; }
}

export interface RouterStatus {
  reachable: boolean;
  converterIp?: string;
  raw?: Record<string, unknown>;
  error?: string;
}

export interface OscvtApi {
  status:         () => Promise<RouterStatus>;
  diagnostics:    () => Promise<unknown>;
  bacnetSettings: () => Promise<unknown>;
  wifiSettings:   () => Promise<unknown>;
  uploadFirmware: (file: File) => Promise<Response>;
}

export function makeApi(ip: string): OscvtApi {
  const q = `?ip=${encodeURIComponent(ip)}`;
  return {
    status:         () => fetch(`/api/router/status${q}`).then(r => r.json()) as Promise<RouterStatus>,
    diagnostics:    () => fetch(`/api/router/diagnostics${q}`).then(r => r.ok ? r.json() : null),
    bacnetSettings: () => fetch(`/api/router/settings/bacnet${q}`).then(r => r.ok ? r.json() : null),
    wifiSettings:   () => fetch(`/api/router/settings/wifi${q}`).then(r => r.ok ? r.json() : null),
    uploadFirmware: (file: File) => {
      const fd = new FormData();
      fd.append('fw_update', file, file.name);
      return fetch(`/api/router/upload${q}`, { method: 'POST', body: fd });
    },
  };
}

export default function OscvtApp() {
  const [tab, setTab]         = useState<Tab>('dashboard');
  const [ipInput, setIpInput] = useState(storedIp);
  const [deviceIp, setDeviceIp] = useState(storedIp);

  const api = makeApi(deviceIp);

  const { data: status } = useQuery({
    queryKey: ['oscvt', 'status', deviceIp],
    queryFn:  api.status,
    refetchInterval: 5_000,
    enabled: !!deviceIp,
  });

  const connected = status?.reachable ?? false;

  const handleConnect = useCallback(() => {
    const ip = ipInput.trim();
    if (!ip) return;
    try { localStorage.setItem(STORED_IP_KEY, ip); } catch { /* */ }
    setDeviceIp(ip);
  }, [ipInput]);

  return (
    <div className="ov-layout">
      <header className="ov-header">
        <div className="ov-header-top">
          <span className="ov-logo">OSCVT</span>
          <span className="ov-logo-sub">Pro</span>
          <div className="ov-header-gap" />
          <div className="ov-connect-bar">
            <span className={`ov-status-dot ${connected ? 'on' : 'off'}`} />
            <span className="ov-status-label">
              {connected ? `Connected · ${deviceIp}` : 'Not connected'}
            </span>
            <input
              className="ov-ip-input"
              value={ipInput}
              onChange={e => setIpInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
              placeholder="192.168.142.1"
              spellCheck={false}
            />
            <button className="ov-btn ov-btn-primary" onClick={handleConnect}>
              Connect
            </button>
          </div>
        </div>
        <nav className="ov-nav">
          {TABS.map(t => (
            <button
              key={t}
              className={`ov-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
      </header>

      <main className="ov-content">
        {tab === 'dashboard'   && <Dashboard    deviceIp={deviceIp} connected={connected} status={status} api={api} />}
        {tab === 'bus'         && <BusPane       deviceIp={deviceIp} connected={connected} api={api} />}
        {tab === 'settings'    && <SettingsPane  deviceIp={deviceIp} connected={connected} api={api} />}
        {tab === 'diagnostics' && <DiagnosticsPane deviceIp={deviceIp} connected={connected} api={api} />}
        {tab === 'firmware'    && <FirmwarePane  deviceIp={deviceIp} connected={connected} api={api} />}
      </main>
    </div>
  );
}
