import { useQuery } from '@tanstack/react-query';
import type { RouterStatus, OscvtApi } from '../OscvtApp';

interface Props {
  deviceIp:  string;
  connected: boolean;
  status:    RouterStatus | undefined;
  api:       OscvtApi;
}

type Accent = 'blue' | 'green' | 'amber' | 'red' | 'slate';

export default function Dashboard({ deviceIp, connected, status, api }: Props) {
  const { data: diag } = useQuery({
    queryKey: ['oscvt', 'diagnostics', deviceIp],
    queryFn:  api.diagnostics,
    enabled:  connected,
    refetchInterval: 5_000,
  });

  const raw = diag as Record<string, unknown> | null | undefined;
  const get = (key: string) => raw?.[key] != null ? String(raw[key]) : '—';
  const errCount = Number(raw?.['frame-err'] ?? 0);

  if (!connected) {
    return (
      <div className="ov-empty">
        <div className="ov-empty-icon">◉</div>
        <div className="ov-empty-title">No device connected</div>
        <div className="ov-empty-body">
          Enter the OSCVT IP address in the header and click Connect.
        </div>
      </div>
    );
  }

  return (
    <div className="ov-dashboard">
      <div className="ov-stat-row">
        <StatCard label="Protocol"     value={get('protocol') !== '—' ? get('protocol') : 'BACnet MS/TP'} sub="Auto-detected"            accent="blue" />
        <StatCard label="Baud Rate"    value={get('b-a-baud')}                                             sub="bps"                       accent="blue" />
        <StatCard label="Polarity"     value={get('polarity') !== '—' ? get('polarity') : 'Normal'}        sub="UART invert if needed"     accent="green" />
        <StatCard label="Devices"      value={get('mstp-dev-cnt')}                                         sub="MS/TP nodes on bus"        accent="green" />
        <StatCard label="Token Loop"   value={get('mstp-loop-time')}                                       sub="ms"                        accent="amber" />
        <StatCard label="Frame Errors" value={get('frame-err')}                                            sub="total framing errors"      accent={errCount > 0 ? 'red' : 'slate'} />
      </div>

      <div className="ov-dash-grid">
        <section className="ov-card">
          <div className="ov-card-header">Bus Health</div>
          <div className="ov-card-body">
            <MetricRow label="MS/TP Rx Bytes"        value={get('mstp-rx-cnt')} />
            <MetricRow label="APDU Rate"             value={get('mstp-msgs')} />
            <MetricRow label="Broadcast Rate"        value={get('mstp-bcasts')} />
            <MetricRow label="MS/TP → Wi-Fi APDU"   value={get('mstp-m2w')} />
            <MetricRow label="Wi-Fi → MS/TP APDU"   value={get('mstp-w2m')} />
            <MetricRow label="Dropped Tokens"        value={get('mstp-drop-cnt')} />
            <MetricRow label="MS/TP Tx Failures"     value={get('mstp-tx-f')} />
            <MetricRow label="BACnet/IP Tx Failures" value={get('bip-tx-f')} />
          </div>
        </section>

        <section className="ov-card">
          <div className="ov-card-header">Device</div>
          <div className="ov-card-body">
            <MetricRow label="IP"       value={deviceIp} mono />
            <MetricRow label="Firmware" value={String(status?.raw?.['fw-ver'] ?? status?.raw?.['version'] ?? '—')} />
            <MetricRow label="Model"    value={String(status?.raw?.['model'] ?? 'OSCVT Pro')} />
            <MetricRow label="Uptime"   value={get('uptime')} />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: Accent }) {
  return (
    <div className={`ov-stat-card ov-stat-${accent}`}>
      <div className="ov-stat-label">{label}</div>
      <div className="ov-stat-value">{value}</div>
      <div className="ov-stat-sub">{sub}</div>
    </div>
  );
}

function MetricRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="ov-metric-row">
      <span className="ov-metric-label">{label}</span>
      <span className={`ov-metric-value${mono ? ' mono' : ''}`}>{value}</span>
    </div>
  );
}
