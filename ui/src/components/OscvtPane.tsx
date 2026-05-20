import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api';

type Page = 'overview' | 'settings' | 'diagnostics' | 'modes' | 'update';

type DraftState = {
  ip: string;
  prefix: string;
  networkNumber: string;
  mstpMac: string;
  mstpNet: string;
  bipPort: string;
  bipNet: string;
  devNum: string;
  bleNet: string;
  wifiSsid: string;
  wifiPassword: string;
  wifiChannel: string;
  btcvtMode: 'Disabled' | 'Enabled';
};

type ModeCard = {
  name: string;
  tag: string;
  description: string;
  documented: boolean;
};

const PAGES: Array<{ id: Page; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'settings', label: 'Settings' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'modes', label: 'Modes' },
  { id: 'update', label: 'Firmware Update' },
];

const ROUTES = [
  '/ui_framework/index.html',
  '/ui_framework/main.bundle.js',
  '/ui_views/bac_settings.json',
  '/ui_views/diagnostics.json',
  '/ui_views/help.json',
  '/ui_views/ui_info.json',
  '/ui_views/wifi_settings.json',
  '/ui_views/ble_settings.json',
  '/sd_card/mstp_captures/',
];

const BACNET_KEYS = [
  { key: 'mstp-dev-list', label: 'MS/TP Device Address List', value: 'read-only' },
  { key: 'b-a-baud', label: 'Active Baud Rate', value: 'read-only' },
  { key: 'b-c-baud', label: 'Bus-Start Baud Rate', value: '9600 / 19200 / 38400 / 76800' },
  { key: 'b-mac', label: 'MS/TP MAC', value: '0–254' },
  { key: 'mstp-net', label: 'MS/TP Network Number', value: '0–65535' },
  { key: 'bip-port', label: 'BACnet IP Port', value: '0–65535' },
  { key: 'bip-net', label: 'BACnet IP Network Number', value: '0–65535' },
  { key: 'dev-num', label: 'Device Object Identifier', value: '0–65535' },
  { key: 'ble-net', label: 'BLE Network Number', value: '0–65535' },
];

const DIAG_KEYS = [
  { label: 'MS/TP Device Count', key: 'mstp-dev-cnt' },
  { label: 'MS/TP Address List', key: 'mstp-dev-list' },
  { label: 'Framing Errors', key: 'frame-err' },
  { label: 'MS/TP Rx Bytes', key: 'mstp-rx-cnt' },
  { label: 'APDU Rate', key: 'mstp-msgs' },
  { label: 'Broadcast Rate', key: 'mstp-bcasts' },
  { label: 'MS/TP → Wireless APDU Rate', key: 'mstp-m2w' },
  { label: 'MS/TP ← Wireless APDU Rate', key: 'mstp-w2m' },
  { label: 'Token Loop Time (ms)', key: 'mstp-loop-time' },
  { label: 'Dropped Tokens', key: 'mstp-drop-cnt' },
  { label: 'MS/TP Tx Failures', key: 'mstp-tx-f' },
  { label: 'BACnet/IP Tx Failures', key: 'bip-tx-f' },
];

const WIFI_KEYS = [
  { key: 'w-ssid', label: 'AP SSID', value: 'CWCVT-B0:9B:A5' },
  { key: 'w-pw', label: 'AP Password', value: '10–64 chars' },
  { key: 'w-cfg-ch', label: 'Configured Wi-Fi Channel', value: '1–11' },
  { key: 'w-cur-ch', label: 'Current Channel', value: 'read-only' },
  { key: 'w-pwr', label: 'Max Tx Power', value: 'read-only' },
];

const NVS_KEYS = [
  'LocalAP_SSID',
  'ExtAP_SSID',
  'WiFiMode',
  'WifiCountry',
  'Net_MSTP',
  'AppModesEnabled',
  'BLE_Prod_Type',
  'BLE_Adv_Name',
  'ble_sec_win_dur',
  'ble_sec_level',
  'JCI_BG_DOWNLOAD',
];

const MODES: ModeCard[] = [
  { name: 'BLE Router', tag: 'Documented', description: 'Bluetooth Low Energy bridge for the CWa mobile app.', documented: true },
  { name: 'Wi-Fi Router', tag: 'Documented', description: 'Wi-Fi AP + BACnet/IP routing for field commissioning.', documented: true },
  { name: 'MS/TP Log', tag: 'Partial', description: 'Log-focused mode for bus inspection and capture workflows.', documented: false },
  { name: 'BTCVT', tag: 'Hidden', description: 'Bluetooth Classic SPP legacy mode surfaced by the B button.', documented: false },
  { name: 'TMSTP Mesh', tag: 'Hidden', description: 'Undocumented MS/TP mesh capability discovered in firmware strings.', documented: false },
  { name: 'Mesh Router', tag: 'Hidden', description: 'Alternate mesh routing mode reserved in the app-mode mask.', documented: false },
  { name: 'Wi-Fi Router Nate', tag: 'Hidden', description: 'Unknown variant present in the app-mode list.', documented: false },
  { name: 'Factory Tester', tag: 'Internal', description: 'Validation path for RS485, BLE, and UART self-tests.', documented: false },
];

function baseDraft(): DraftState {
  return {
    ip: '192.168.142.1',
    prefix: '24',
    networkNumber: '65001',
    mstpMac: '254',
    mstpNet: '65001',
    bipPort: '47808',
    bipNet: '65001',
    devNum: '65001',
    bleNet: '65001',
    wifiSsid: 'CWCVT-B0:9B:A5',
    wifiPassword: '••••••••••',
    wifiChannel: '6',
    btcvtMode: 'Enabled',
  };
}

export default function OscvtPane() {
  const [page, setPage] = useState<Page>('overview');
  const [draft, setDraft] = useState<DraftState>(() => baseDraft());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<string>('');

  const { data: routerStatus } = useQuery({
    queryKey: ['router', 'status'],
    queryFn: api.router.status,
    refetchInterval: 5_000,
  });

  const routerReachable = routerStatus?.reachable ?? false;

  const { data: diagnostics } = useQuery({
    queryKey: ['router', 'diagnostics'],
    queryFn: api.router.diagnostics,
    enabled: routerReachable,
    refetchInterval: 10_000,
  });

  const { data: bacnetSettings } = useQuery({
    queryKey: ['router', 'settings', 'bacnet'],
    queryFn: api.router.bacnetSettings,
    enabled: routerReachable,
    refetchInterval: 10_000,
  });

  const { data: wifiSettings } = useQuery({
    queryKey: ['router', 'settings', 'wifi'],
    queryFn: api.router.wifiSettings,
    enabled: routerReachable,
    refetchInterval: 10_000,
  });

  const { data: bleSettings } = useQuery({
    queryKey: ['router', 'settings', 'ble'],
    queryFn: api.router.bleSettings,
    enabled: routerReachable,
    refetchInterval: 10_000,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.router.uploadFirmware(file),
    onSuccess: result => {
      setUploadResult(`Router responded with HTTP ${result.status}`);
    },
    onError: err => {
      setUploadResult(String(err));
    },
  });

  const payloadPreview = useMemo(() => ({
    bacnet: {
      ip: draft.ip,
      prefix: Number(draft.prefix),
      networkNumber: Number(draft.networkNumber),
      'b-mac': Number(draft.mstpMac),
      'mstp-net': Number(draft.mstpNet),
      'bip-port': Number(draft.bipPort),
      'bip-net': Number(draft.bipNet),
      'dev-num': Number(draft.devNum),
      'ble-net': Number(draft.bleNet),
    },
    wifi: {
      'w-ssid': draft.wifiSsid,
      'w-pw': draft.wifiPassword,
      'w-cfg-ch': Number(draft.wifiChannel),
    },
    mode: draft.btcvtMode,
    upload: selectedFile?.name ?? null,
  }), [draft, selectedFile]);

  const routerBanner = routerStatus?.reachable
    ? `Connected to ${routerStatus.converterIp ?? 'router'}`
    : 'Router diagnostics unavailable - connect through a reachable router bridge';

  return (
    <div className="content osccvt-page">
      <div className="osccvt-shell">
        <section className="osccvt-hero card">
          <div className="osccvt-hero-copy">
            <div className="osccvt-kicker">OSCVT</div>
            <h1>Open Source Converter</h1>
            <p>
              A live UI for the connected BACnet router console: settings, diagnostics, hidden modes, and firmware upload.
            </p>
            <div className="osccvt-chip-row">
              <span className="osccvt-chip">{routerBanner}</span>
              <span className="osccvt-chip">APSTA / router mode</span>
              <span className="osccvt-chip">BTCVT hidden</span>
              <span className="osccvt-chip">Multipart OTA</span>
            </div>
          </div>

          <div className="osccvt-hero-panel">
            <div className="osccvt-panel-label">Live Router</div>
            <div className="osccvt-route-list">
              <div className="osccvt-route-row">
                <span>Status</span>
                <span className={`osccvt-route-pill ${routerReachable ? 'ready' : 'warn'}`}>{routerReachable ? 'reachable' : 'unavailable'}</span>
              </div>
              <div className="osccvt-route-row">
                <span>IP</span>
                <span className="osccvt-route-pill">{routerStatus?.converterIp ?? draft.ip}</span>
              </div>
              <div className="osccvt-route-row">
                <span>Diagnostics</span>
                <span className="osccvt-route-pill">{diagnostics ? 'loaded' : 'pending'}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="osccvt-tabs tabs">
          {PAGES.map(item => (
            <div
              key={item.id}
              className={`tab${page === item.id ? ' active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </div>
          ))}
        </div>

        <div className="osccvt-grid">
          <main className="osccvt-main">
            {page === 'overview' && (
              <>
                {!routerReachable && (
                  <section className="card osccvt-card">
                    <div className="card-header">Router Diagnostics</div>
                    <div className="card-body" style={{ color: 'var(--text-dim)', lineHeight: 1.6 }}>
                      Router diagnostics unavailable - connect through a reachable router bridge.
                    </div>
                  </section>
                )}

                <section className="card osccvt-card">
                  <div className="card-header">What OSCVT is showing</div>
                  <div className="card-body osccvt-overview-grid">
                    <StatCard label="Router" value={routerReachable ? 'Reachable' : 'Unavailable'} detail={routerBanner} />
                    <StatCard label="BACnet" value="Live" detail="BACnet settings come from the router proxy." />
                    <StatCard label="Diagnostics" value={diagnostics ? 'Loaded' : 'Waiting'} detail="Live router diagnostics surface from /api/router/diagnostics." />
                    <StatCard label="Firmware update" value="Ready" detail="File input named fw_update, delivered through the router proxy." />
                  </div>
                </section>

                <section className="card osccvt-card">
                  <div className="card-header">Live Router Snapshot</div>
                  <div className="card-body">
                    <pre className="osccvt-json">{JSON.stringify(routerStatus?.raw ?? { reachable: false }, null, 2)}</pre>
                  </div>
                </section>

                <section className="card osccvt-card">
                  <div className="card-header">Documented Routes</div>
                  <div className="card-body">
                    <div className="osccvt-pill-list">
                      {ROUTES.map(route => (
                        <span key={route} className="osccvt-mini-pill">{route}</span>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="card osccvt-card">
                  <div className="card-header">Documented Surface</div>
                  <div className="card-body osccvt-schema-grid">
                    <SchemaBlock title="BACnet Settings" subtitle="Core network and addressing controls" rows={BACNET_KEYS} accent="blue" />
                    <SchemaBlock title="Wi-Fi Settings" subtitle="Hosted AP and client connectivity" rows={WIFI_KEYS} accent="green" />
                    <SchemaBlock
                      title="Diagnostics"
                      subtitle="MS/TP, Wi-Fi, BLE, and capture metrics"
                      rows={DIAG_KEYS.slice(0, 6).map(row => ({ ...row, value: 'read-only' }))}
                      accent="amber"
                    />
                    <SchemaBlock title="NVS Keys" subtitle="Firmware state stored in ESP-IDF NVS" rows={NVS_KEYS.map(key => ({ key, label: key, value: 'stored'}))} accent="slate" />
                  </div>
                </section>
              </>
            )}

            {page === 'settings' && (
              <>
                <section className="card osccvt-card">
                  <div className="card-header">BACnet Settings</div>
                  <div className="card-body">
                    <pre className="osccvt-json">{JSON.stringify(bacnetSettings ?? { reachable: false }, null, 2)}</pre>
                  </div>
                </section>

                <section className="card osccvt-card">
                  <div className="card-header">BACnet Settings Draft</div>
                  <div className="card-body osccvt-settings-grid">
                    <SettingInput label="IP Address" keyName="ip" value={draft.ip} onChange={value => setDraft(prev => ({ ...prev, ip: value }))} />
                    <SettingInput label="CIDR Prefix" keyName="prefix" value={draft.prefix} onChange={value => setDraft(prev => ({ ...prev, prefix: value }))} />
                    <SettingInput label="Network Number" keyName="networkNumber" value={draft.networkNumber} onChange={value => setDraft(prev => ({ ...prev, networkNumber: value }))} />
                    <SettingInput label="MS/TP MAC" keyName="mstpMac" value={draft.mstpMac} onChange={value => setDraft(prev => ({ ...prev, mstpMac: value }))} helper="Documented range: 0–254" />
                    <SettingInput label="MS/TP Network" keyName="mstpNet" value={draft.mstpNet} onChange={value => setDraft(prev => ({ ...prev, mstpNet: value }))} />
                    <SettingInput label="BACnet/IP Port" keyName="bipPort" value={draft.bipPort} onChange={value => setDraft(prev => ({ ...prev, bipPort: value }))} />
                    <SettingInput label="BACnet/IP Network" keyName="bipNet" value={draft.bipNet} onChange={value => setDraft(prev => ({ ...prev, bipNet: value }))} />
                    <SettingInput label="Device Object ID" keyName="devNum" value={draft.devNum} onChange={value => setDraft(prev => ({ ...prev, devNum: value }))} />
                    <SettingInput label="BLE Network" keyName="bleNet" value={draft.bleNet} onChange={value => setDraft(prev => ({ ...prev, bleNet: value }))} />
                  </div>
                </section>

                <section className="card osccvt-card">
                  <div className="card-header">Wi-Fi Settings</div>
                  <div className="card-body">
                    <pre className="osccvt-json">{JSON.stringify(wifiSettings ?? { reachable: false }, null, 2)}</pre>
                  </div>
                </section>

                <section className="card osccvt-card">
                  <div className="card-header">BLE Settings</div>
                  <div className="card-body">
                    <pre className="osccvt-json">{JSON.stringify(bleSettings ?? { reachable: false }, null, 2)}</pre>
                  </div>
                </section>

                <section className="card osccvt-card">
                  <div className="card-header">Wi-Fi + Legacy Draft</div>
                  <div className="card-body osccvt-settings-grid">
                    <SettingInput label="AP SSID" keyName="wifiSsid" value={draft.wifiSsid} onChange={value => setDraft(prev => ({ ...prev, wifiSsid: value }))} />
                    <SettingInput label="AP Password" keyName="wifiPassword" value={draft.wifiPassword} onChange={value => setDraft(prev => ({ ...prev, wifiPassword: value }))} helper="10–64 characters, mixed complexity." />
                    <SettingInput label="Wi-Fi Channel" keyName="wifiChannel" value={draft.wifiChannel} onChange={value => setDraft(prev => ({ ...prev, wifiChannel: value }))} />
                    <SettingSelect
                      label="BTCVT Mode"
                      keyName="btcvtMode"
                      value={draft.btcvtMode}
                      onChange={value => setDraft(prev => ({ ...prev, btcvtMode: value as DraftState['btcvtMode'] }))}
                      options={['Disabled', 'Enabled']}
                      helper="Hidden legacy Bluetooth Classic SPP mode."
                    />
                  </div>
                </section>
              </>
            )}

            {page === 'diagnostics' && (
              <>
                <section className="card osccvt-card">
                  <div className="card-header">Diagnostics Surface</div>
                  <div className="card-body osccvt-diagnostic-strip">
                    <StatCard label="MS/TP bus" value="Active" detail="Device count, token loop time, frame errors, and tx failures." />
                    <StatCard label="Wi-Fi" value="Ready" detail="RSSI, current channel, and station list live here." />
                    <StatCard label="BLE" value="Ready" detail="Connection count, MTU, packet stats, and pairing failures." />
                    <StatCard label="Capture" value="SD card PCAP" detail="MSTP capture files exposed under /sd_card/mstp_captures/." />
                  </div>
                </section>

                <section className="card osccvt-card">
                  <div className="card-header">Live Diagnostics</div>
                  <div className="card-body">
                    <pre className="osccvt-json">{JSON.stringify(diagnostics ?? { reachable: false }, null, 2)}</pre>
                  </div>
                </section>

                <section className="card osccvt-card">
                  <div className="card-header">Telemetry Rows</div>
                  <div className="card-body">
                    <div className="osccvt-diagnostic-list">
                      {DIAG_KEYS.map(row => (
                        <div key={row.key} className="osccvt-diagnostic-row">
                          <div>
                            <div className="osccvt-row-label">{row.label}</div>
                            <div className="osccvt-row-key">{row.key}</div>
                          </div>
                          <span className="osccvt-row-pill">read-only</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            )}

            {page === 'modes' && (
              <section className="card osccvt-card">
                <div className="card-header">App Modes</div>
                <div className="card-body osccvt-mode-grid">
                  {MODES.map(mode => (
                    <div key={mode.name} className={`osccvt-mode-card${mode.documented ? ' documented' : ' hidden'}`}>
                      <div className="osccvt-mode-top">
                        <span className="osccvt-mode-name">{mode.name}</span>
                        <span className="osccvt-mode-tag">{mode.tag}</span>
                      </div>
                      <p>{mode.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {page === 'update' && (
              <section className="card osccvt-card">
                <div className="card-header">Firmware Update</div>
                <div className="card-body osccvt-update-shell">
                  <div className="osccvt-upload-drop">
                    <div className="osccvt-upload-icon">⬆</div>
                    <div className="osccvt-upload-copy">
                      <div className="osccvt-upload-title">Drop a firmware file</div>
                      <div className="osccvt-upload-subtitle">The firmware update endpoint accepts a file POST and maps it to <code>fw_update</code>.</div>
                    </div>
                    <input
                      type="file"
                      onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                      className="btn btn-primary"
                      disabled={!selectedFile || uploadMutation.isPending}
                      onClick={() => selectedFile && uploadMutation.mutate(selectedFile)}
                    >
                      {uploadMutation.isPending ? 'Uploading…' : (selectedFile ? 'Upload firmware' : 'Choose file')}
                    </button>
                  </div>

                  <div className="osccvt-update-notes">
                    <div className="osccvt-panel-label">Request Shape</div>
                    <pre>{`POST /upload/<filename>\nContent-Type: multipart/form-data\nfield: fw_update`}</pre>
                    <div className="osccvt-selected-file">
                      {selectedFile ? selectedFile.name : 'No firmware file selected'}
                    </div>
                    {uploadResult && <div className="osccvt-selected-file">{uploadResult}</div>}
                  </div>
                </div>
              </section>
            )}
          </main>

          <aside className="osccvt-side">
            <section className="card osccvt-card">
              <div className="card-header">Live Draft Preview</div>
              <div className="card-body">
                <pre className="osccvt-json">{JSON.stringify(payloadPreview, null, 2)}</pre>
              </div>
            </section>

            <section className="card osccvt-card">
              <div className="card-header">NVS Keys</div>
              <div className="card-body">
                <div className="osccvt-pill-list">
                  {NVS_KEYS.map(key => (
                    <span key={key} className="osccvt-mini-pill">{key}</span>
                  ))}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="osccvt-stat-card">
      <div className="osccvt-stat-label">{label}</div>
      <div className="osccvt-stat-value">{value}</div>
      <div className="osccvt-stat-detail">{detail}</div>
    </div>
  );
}

function SchemaBlock({
  title,
  subtitle,
  rows,
  accent,
}: {
  title: string;
  subtitle: string;
  rows: Array<{ key: string; label: string; value: string }>;
  accent: 'blue' | 'green' | 'amber' | 'slate';
}) {
  return (
    <div className={`osccvt-schema-block osccvt-schema-${accent}`}>
      <div className="osccvt-panel-label">{title}</div>
      <div className="osccvt-panel-subtitle">{subtitle}</div>
      <div className="osccvt-schema-rows">
        {rows.map(row => (
          <div key={row.key} className="osccvt-schema-row">
            <div>
              <div className="osccvt-row-label">{row.label}</div>
              <div className="osccvt-row-key">{row.key}</div>
            </div>
            <span className="osccvt-schema-value">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingInput({
  label,
  keyName,
  value,
  onChange,
  helper,
}: {
  label: string;
  keyName: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
}) {
  return (
    <label className="osccvt-setting">
      <span className="osccvt-setting-label">{label}</span>
      <span className="osccvt-setting-key">{keyName}</span>
      <input value={value} onChange={e => onChange(e.target.value)} />
      {helper && <span className="osccvt-setting-helper">{helper}</span>}
    </label>
  );
}

function SettingSelect({
  label,
  keyName,
  value,
  onChange,
  options,
  helper,
}: {
  label: string;
  keyName: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  helper?: string;
}) {
  return (
    <label className="osccvt-setting">
      <span className="osccvt-setting-label">{label}</span>
      <span className="osccvt-setting-key">{keyName}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
      {helper && <span className="osccvt-setting-helper">{helper}</span>}
    </label>
  );
}
