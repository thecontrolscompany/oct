import { useQuery } from '@tanstack/react-query';
import type { RouterStatus, OscvtApi } from '../OscvtApp';

interface Props {
  deviceIp:   string;
  connected:  boolean;
  status:     RouterStatus | undefined;
  api:        OscvtApi;
  ipInput:    string;
  setIpInput: (v: string) => void;
  onConnect:  (ip: string) => void;
}

const DIAG_ROWS = [
  { key: 'mstp-dev-cnt',   label: 'MS/TP Device Count' },
  { key: 'mstp-loop-time', label: 'Token Loop Time (ms)' },
  { key: 'frame-err',      label: 'Framing Errors' },
  { key: 'mstp-drop-cnt',  label: 'Dropped Tokens' },
  { key: 'b-a-baud',      label: 'Active Baud Rate' },
  { key: 'polarity',       label: 'RS-485 Polarity' },
  { key: 'protocol',       label: 'Detected Protocol' },
  { key: 'mstp-tx-f',     label: 'MS/TP Tx Failures' },
  { key: 'bip-tx-f',      label: 'BACnet/IP Tx Failures' },
  { key: 'mstp-rx-cnt',   label: 'MS/TP Rx Bytes' },
  { key: 'mstp-msgs',     label: 'APDU Rate' },
  { key: 'mstp-m2w',      label: 'MS/TP → Wi-Fi APDU' },
  { key: 'mstp-w2m',      label: 'Wi-Fi → MS/TP APDU' },
];

export default function LivePane({ deviceIp, connected, status, api, ipInput, setIpInput, onConnect }: Props) {
  const { data: diag, dataUpdatedAt } = useQuery({
    queryKey: ['oscvt', 'diagnostics', deviceIp],
    queryFn:  api.diagnostics,
    enabled:  connected,
    refetchInterval: 5_000,
  });

  const raw = (diag ?? {}) as Record<string, unknown>;
  const get = (key: string) => raw[key] != null ? String(raw[key]) : '—';
  const updated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  return (
    <>
      <div className="ov-connect-bar">
        <span className="ov-connect-label">Router IP</span>
        <input
          className="ov-ip-input"
          value={ipInput}
          onChange={e => setIpInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onConnect(ipInput)}
          placeholder="192.168.142.1"
          spellCheck={false}
        />
        <button className="ov-btn ov-btn-primary" onClick={() => onConnect(ipInput)}>
          Connect
        </button>
        <span className={`ov-status-dot ${connected ? 'on' : 'off'}`} style={{ marginLeft: 4 }} />
        <span className={`ov-status-text${connected ? ' on' : ''}`}>
          {connected ? `Connected · ${deviceIp}` : 'Not connected — connect to OSCVT Wi-Fi first, then enter 192.168.142.1'}
        </span>
      </div>

      {connected && (
        <>
          <div className="ov-stat-grid">
            <Stat label="Protocol"   value={get('protocol') !== '—' ? get('protocol') : 'BACnet MS/TP'} sub="Auto-detected" />
            <Stat label="Baud Rate"  value={get('b-a-baud')} sub="bps" />
            <Stat label="Polarity"   value={get('polarity') !== '—' ? get('polarity') : 'Normal'} sub="" />
            <Stat label="Devices"    value={get('mstp-dev-cnt')} sub="MS/TP nodes" />
            <Stat label="Token Loop" value={get('mstp-loop-time')} sub="ms" />
            <Stat label="Frame Err"  value={get('frame-err')} sub="total" />
          </div>

          <div className="ov-card">
            <div className="ov-card-header">
              Live Diagnostics
              {updated && <span style={{ fontWeight: 400, fontSize: 11, color: '#5f6f82', textTransform: 'none', letterSpacing: 0 }}>Updated {updated}</span>}
            </div>
            <div className="ov-card-body" style={{ padding: 0 }}>
              <table className="ov-table">
                <thead><tr><th>Metric</th><th>Key</th><th>Value</th></tr></thead>
                <tbody>
                  {DIAG_ROWS.map(({ key, label }) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td className="mono dim">{key}</td>
                      <td className="mono">{get(key)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ov-card">
            <div className="ov-card-header">Device Info</div>
            <div className="ov-card-body" style={{ padding: 0 }}>
              <table className="ov-table">
                <tbody>
                  <tr><td style={{ fontWeight: 500 }}>IP</td><td className="mono">{deviceIp}</td></tr>
                  <tr><td style={{ fontWeight: 500 }}>Firmware</td><td className="mono">{String(status?.raw?.['fw-ver'] ?? status?.raw?.['version'] ?? '—')}</td></tr>
                  <tr><td style={{ fontWeight: 500 }}>Model</td><td className="mono">{String(status?.raw?.['model'] ?? '—')}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!connected && (
        <div className="ov-card">
          <div className="ov-card-header">How to connect</div>
          <div className="ov-card-body">
            <ol style={{ paddingLeft: 20, lineHeight: 2, fontSize: 13, color: 'var(--text-dim)' }}>
              <li>Connect your laptop to the OSCVT Wi-Fi AP (SSID: OSCVT-XXXXXX)</li>
              <li>Start the local OCT server (start.bat) on that same laptop</li>
              <li>Enter <span className="mono" style={{ color: 'var(--accent)' }}>192.168.142.1</span> above and click Connect</li>
              <li>Live diagnostics will appear once the device responds</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="ov-stat">
      <div className="ov-stat-label">{label}</div>
      <div className="ov-stat-value">{value}</div>
      {sub && <div className="ov-stat-sub">{sub}</div>}
    </div>
  );
}
