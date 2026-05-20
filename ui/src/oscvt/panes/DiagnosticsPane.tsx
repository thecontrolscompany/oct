import { useQuery } from '@tanstack/react-query';
import type { OscvtApi } from '../OscvtApp';

interface Props {
  deviceIp:  string;
  connected: boolean;
  api:       OscvtApi;
}

const KNOWN_ROWS = [
  { key: 'mstp-dev-cnt',  label: 'MS/TP Device Count' },
  { key: 'frame-err',     label: 'Framing Errors' },
  { key: 'mstp-rx-cnt',  label: 'MS/TP Rx Bytes' },
  { key: 'mstp-msgs',    label: 'APDU Rate' },
  { key: 'mstp-bcasts',  label: 'Broadcast Rate' },
  { key: 'mstp-m2w',     label: 'MS/TP → Wi-Fi APDU' },
  { key: 'mstp-w2m',     label: 'Wi-Fi → MS/TP APDU' },
  { key: 'mstp-loop-time', label: 'Token Loop Time (ms)' },
  { key: 'mstp-drop-cnt', label: 'Dropped Tokens' },
  { key: 'mstp-tx-f',    label: 'MS/TP Tx Failures' },
  { key: 'bip-tx-f',     label: 'BACnet/IP Tx Failures' },
  { key: 'b-a-baud',     label: 'Active Baud Rate' },
  { key: 'polarity',     label: 'RS-485 Polarity' },
  { key: 'protocol',     label: 'Detected Protocol' },
];

const KNOWN_SET = new Set(KNOWN_ROWS.map(r => r.key));

export default function DiagnosticsPane({ deviceIp, connected, api }: Props) {
  const { data: diag, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['oscvt', 'diagnostics', deviceIp],
    queryFn:  api.diagnostics,
    enabled:  connected,
    refetchInterval: 5_000,
  });

  if (!connected) {
    return (
      <div className="ov-empty">
        <div className="ov-empty-icon">◈</div>
        <div className="ov-empty-title">No device connected</div>
        <div className="ov-empty-body">Connect to the OSCVT to stream live diagnostics.</div>
      </div>
    );
  }

  const raw = (diag ?? {}) as Record<string, unknown>;
  const updated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';
  const extraKeys = Object.keys(raw).filter(k => !KNOWN_SET.has(k) && k !== 'mstp-dev-list');

  return (
    <div className="ov-diag-shell">
      <section className="ov-card">
        <div className="ov-card-header">
          Live Diagnostics
          <span className="ov-badge">{isLoading ? 'Updating…' : `Updated ${updated}`}</span>
        </div>
        <div className="ov-card-body np">
          <table className="ov-table">
            <thead>
              <tr><th>Metric</th><th>Key</th><th>Value</th></tr>
            </thead>
            <tbody>
              {KNOWN_ROWS.map(({ key, label }) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td className="mono dim">{key}</td>
                  <td className="mono">{raw[key] != null ? String(raw[key]) : '—'}</td>
                </tr>
              ))}
              {extraKeys.map(key => (
                <tr key={key} className="ov-extra-row">
                  <td className="dim">—</td>
                  <td className="mono dim">{key}</td>
                  <td className="mono">{String(raw[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {raw['mstp-dev-list'] != null && (
        <section className="ov-card">
          <div className="ov-card-header">Device Address List (raw)</div>
          <div className="ov-card-body">
            <pre className="ov-pre">{JSON.stringify(raw['mstp-dev-list'], null, 2)}</pre>
          </div>
        </section>
      )}
    </div>
  );
}
