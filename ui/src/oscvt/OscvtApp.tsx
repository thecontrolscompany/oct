import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import OverviewPane   from './panes/OverviewPane';
import HardwarePane   from './panes/HardwarePane';
import OperationPane  from './panes/OperationPane';
import FirmwarePane   from './panes/FirmwarePane';
import LivePane       from './panes/LivePane';

const TABS = ['overview', 'hardware', 'operation', 'firmware', 'live'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = {
  overview:  'Overview',
  hardware:  'Hardware',
  operation: 'Operation',
  firmware:  'Firmware',
  live:      'Live Device',
};

const STORED_IP_KEY = 'oscvt-device-ip';
function storedIp() {
  try { return localStorage.getItem(STORED_IP_KEY) || '192.168.142.1'; } catch { return '192.168.142.1'; }
}

export interface RouterStatus {
  reachable:    boolean;
  converterIp?: string;
  raw?:         Record<string, unknown>;
  error?:       string;
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
  const [tab, setTab]           = useState<Tab>('overview');
  const [ipInput, setIpInput]   = useState(storedIp);
  const [deviceIp, setDeviceIp] = useState(storedIp);

  const api = makeApi(deviceIp);

  const { data: status } = useQuery({
    queryKey: ['oscvt', 'status', deviceIp],
    queryFn:  api.status,
    refetchInterval: 10_000,
    enabled: tab === 'live' && !!deviceIp,
  });

  const connected = status?.reachable ?? false;

  const handleConnect = (ip: string) => {
    const trimmed = ip.trim();
    if (!trimmed) return;
    try { localStorage.setItem(STORED_IP_KEY, trimmed); } catch { /* */ }
    setDeviceIp(trimmed);
  };

  return (
    <div className="ov-layout">
      <header className="ov-topbar">
        <div className="ov-topbar-left">
          <span className="ov-logo">OSCVT</span>
          <a className="ov-back" href="/">← OCT</a>
        </div>
        <div className="ov-topbar-title">Open Source Converter</div>
        <div className="ov-topbar-right">
          {tab === 'live' && (
            <>
              <span className={`ov-status-dot ${connected ? 'on' : 'off'}`} />
              <span>{connected ? `${deviceIp}` : 'Not connected'}</span>
            </>
          )}
        </div>
      </header>

      <div className="ov-tabs">
        {TABS.map(t => (
          <button
            key={t}
            className={`ov-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="ov-content">
        {tab === 'overview'   && <OverviewPane />}
        {tab === 'hardware'   && <HardwarePane />}
        {tab === 'operation'  && <OperationPane />}
        {tab === 'firmware'   && (
          <FirmwarePane
            deviceIp={deviceIp} connected={connected} api={api}
            ipInput={ipInput} setIpInput={setIpInput} onConnect={handleConnect}
          />
        )}
        {tab === 'live'       && (
          <LivePane
            deviceIp={deviceIp} connected={connected} status={status} api={api}
            ipInput={ipInput} setIpInput={setIpInput} onConnect={handleConnect}
          />
        )}
      </div>
    </div>
  );
}
