import { useQuery } from '@tanstack/react-query';
import type { OscvtApi } from '../OscvtApp';

interface Props {
  deviceIp:  string;
  connected: boolean;
  api:       OscvtApi;
}

export default function SettingsPane({ deviceIp, connected, api }: Props) {
  const { data: bacnet, isLoading: bLoading } = useQuery({
    queryKey: ['oscvt', 'settings', 'bacnet', deviceIp],
    queryFn:  api.bacnetSettings,
    enabled:  connected,
  });

  const { data: wifi, isLoading: wLoading } = useQuery({
    queryKey: ['oscvt', 'settings', 'wifi', deviceIp],
    queryFn:  api.wifiSettings,
    enabled:  connected,
  });

  if (!connected) {
    return (
      <div className="ov-empty">
        <div className="ov-empty-icon">⚙</div>
        <div className="ov-empty-title">No device connected</div>
        <div className="ov-empty-body">Connect to the OSCVT to view settings.</div>
      </div>
    );
  }

  const b = (bacnet ?? {}) as Record<string, unknown>;
  const w = (wifi   ?? {}) as Record<string, unknown>;

  return (
    <div className="ov-settings-shell">
      <section className="ov-card">
        <div className="ov-card-header">
          BACnet Settings
          <span className="ov-read-only">Read-only — write support pending device testing</span>
        </div>
        <div className="ov-card-body">
          {bLoading ? (
            <div className="dim" style={{ fontSize: 13 }}>Loading…</div>
          ) : (
            <div className="ov-settings-grid">
              <SettingField label="MS/TP MAC"         keyName="b-mac"    value={b['b-mac']}    hint="0–254" />
              <SettingField label="MS/TP Network"     keyName="mstp-net" value={b['mstp-net']} hint="0–65535" />
              <SettingField label="BACnet/IP Port"    keyName="bip-port" value={b['bip-port']} hint="0–65535" />
              <SettingField label="BACnet/IP Network" keyName="bip-net"  value={b['bip-net']}  hint="0–65535" />
              <SettingField label="Device Object ID"  keyName="dev-num"  value={b['dev-num']}  hint="0–65535" />
              <SettingField label="BLE Network"       keyName="ble-net"  value={b['ble-net']}  hint="0–65535" />
            </div>
          )}
        </div>
      </section>

      <section className="ov-card">
        <div className="ov-card-header">
          Wi-Fi Settings
          <span className="ov-read-only">Read-only</span>
        </div>
        <div className="ov-card-body">
          {wLoading ? (
            <div className="dim" style={{ fontSize: 13 }}>Loading…</div>
          ) : (
            <div className="ov-settings-grid">
              <SettingField label="AP SSID"         keyName="w-ssid"    value={w['w-ssid']}    />
              <SettingField label="Configured Chan." keyName="w-cfg-ch"  value={w['w-cfg-ch']}  hint="1–11" />
              <SettingField label="Current Channel"  keyName="w-cur-ch"  value={w['w-cur-ch']}  hint="read-only" />
              <SettingField label="Max Tx Power"     keyName="w-pwr"     value={w['w-pwr']}     hint="read-only" />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SettingField({ label, keyName, value, hint }: {
  label:   string;
  keyName: string;
  value:   unknown;
  hint?:   string;
}) {
  return (
    <div className="ov-setting-field">
      <div className="ov-setting-label">{label}</div>
      <div className="ov-setting-key">{keyName}</div>
      <div className="ov-setting-value">{value != null ? String(value) : '—'}</div>
      {hint && <div className="ov-setting-hint">{hint}</div>}
    </div>
  );
}
