import { useQuery } from '@tanstack/react-query';
import type { OscvtApi } from '../OscvtApp';

interface Props {
  deviceIp:  string;
  connected: boolean;
  api:       OscvtApi;
}

interface MstpDevice {
  mac:           number;
  deviceId?:     number;
  name?:         string;
  responseTimeMs?: number;
  errors?:       number;
}

function parseDeviceList(raw: unknown): MstpDevice[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item, i) => {
      if (typeof item === 'number') return { mac: item };
      if (typeof item === 'object' && item !== null) {
        const r = item as Record<string, unknown>;
        return {
          mac:           Number(r['mstp_mac'] ?? r['mac'] ?? i),
          deviceId:      r['bacnet_device_id'] != null ? Number(r['bacnet_device_id']) : undefined,
          name:          r['name'] as string | undefined,
          responseTimeMs: r['response_time_ms'] != null ? Number(r['response_time_ms']) : undefined,
          errors:        r['framing_errors'] != null ? Number(r['framing_errors']) : undefined,
        };
      }
      return { mac: i };
    });
  }
  if (typeof raw === 'string') {
    return raw.split(/[\s,]+/).filter(Boolean).map((s, i) => ({ mac: parseInt(s, 10) || i }));
  }
  return [];
}

function str(v: unknown) { return v != null ? String(v) : '—'; }
function num(v: unknown) { return v != null ? Number(v) : 0; }

export default function BusPane({ deviceIp, connected, api }: Props) {
  const { data: diag, isLoading } = useQuery({
    queryKey: ['oscvt', 'diagnostics', deviceIp],
    queryFn:  api.diagnostics,
    enabled:  connected,
    refetchInterval: 5_000,
  });

  if (!connected) {
    return (
      <div className="ov-empty">
        <div className="ov-empty-icon">◎</div>
        <div className="ov-empty-title">No device connected</div>
        <div className="ov-empty-body">Connect to the OSCVT to see the MS/TP bus.</div>
      </div>
    );
  }

  const raw = diag as Record<string, unknown> | null | undefined;
  const devices = parseDeviceList(raw?.['mstp-dev-list']);

  return (
    <div className="ov-bus-shell">
      <section className="ov-card">
        <div className="ov-card-header">
          MS/TP Bus
          <span className="ov-badge">{str(raw?.['mstp-dev-cnt'])} nodes</span>
        </div>
        <div className="ov-card-body">
          <div className="ov-bus-metrics">
            <BusMetric label="Token Loop"    value={str(raw?.['mstp-loop-time'])} unit="ms" />
            <BusMetric label="Frame Errors"  value={str(raw?.['frame-err'])}      warn={num(raw?.['frame-err']) > 0} />
            <BusMetric label="Dropped"       value={str(raw?.['mstp-drop-cnt'])}  warn={num(raw?.['mstp-drop-cnt']) > 0} />
            <BusMetric label="Active Baud"   value={str(raw?.['b-a-baud'])}       unit="bps" />
          </div>
        </div>
      </section>

      <section className="ov-card">
        <div className="ov-card-header">Nodes</div>
        <div className="ov-card-body np">
          {isLoading ? (
            <div className="ov-table-empty">Loading…</div>
          ) : devices.length === 0 ? (
            <div className="ov-table-empty">
              No device list returned. Run WHO-IS from OCT Live Devices to populate the bus.
            </div>
          ) : (
            <table className="ov-table">
              <thead>
                <tr>
                  <th>MAC</th>
                  <th>BACnet ID</th>
                  <th>Name</th>
                  <th>Resp (ms)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(d => (
                  <tr key={d.mac}>
                    <td className="mono">{d.mac}</td>
                    <td className="mono">{d.deviceId ?? '—'}</td>
                    <td>{d.name ?? '—'}</td>
                    <td className="mono">{d.responseTimeMs != null ? d.responseTimeMs : '—'}</td>
                    <td>
                      <span className={`ov-node-pill ${d.errors ? 'warn' : 'ok'}`}>
                        {d.errors ? `${d.errors} err` : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function BusMetric({ label, value, unit, warn }: { label: string; value: string; unit?: string; warn?: boolean }) {
  return (
    <div className={`ov-bus-metric${warn ? ' warn' : ''}`}>
      <div className="ov-bus-metric-label">{label}</div>
      <div className="ov-bus-metric-value">
        {value}
        {unit && <span className="ov-unit"> {unit}</span>}
      </div>
    </div>
  );
}
