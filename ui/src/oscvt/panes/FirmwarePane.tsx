import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { OscvtApi } from '../OscvtApp';

interface Props {
  deviceIp:   string;
  connected:  boolean;
  api:        OscvtApi;
  ipInput:    string;
  setIpInput: (v: string) => void;
  onConnect:  (ip: string) => void;
}

export default function FirmwarePane({ deviceIp, connected, api, ipInput, setIpInput, onConnect }: Props) {
  const [file,   setFile]   = useState<File | null>(null);
  const [result, setResult] = useState<string>('');

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');
      const resp = await api.uploadFirmware(file);
      const body = await resp.text();
      return `HTTP ${resp.status} — ${body || 'No response body'}`;
    },
    onSuccess: r   => setResult(r),
    onError:   err => setResult(String(err)),
  });

  return (
    <>
      <div className="ov-card">
        <div className="ov-card-header">Firmware Status</div>
        <div className="ov-card-body">
          <div className="ov-warn">
            OSCVT firmware is under active development. The first release will be posted here and
            on the GitHub repository when the Pro hardware validation is complete.
          </div>
          <table className="ov-table">
            <thead><tr><th>Item</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>OSCVT Pro firmware (1a — BACnet routing)</td><td style={{ color: '#1e40af' }}>In development</td></tr>
              <tr><td>GitHub repository</td><td className="dim">TBD — will be public</td></tr>
              <tr><td>Latest release</td><td className="dim">—</td></tr>
              <tr><td>OTA portal (this page)</td><td style={{ color: '#166534' }}>Ready — upload form below</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="ov-fw-grid">
        <div className="ov-card">
          <div className="ov-card-header">OTA Update — Upload from Portal</div>
          <div className="ov-card-body">
            <p className="ov-note" style={{ marginBottom: 12 }}>
              Connect to the OSCVT device first, then upload a <span className="mono">.bin</span>{' '}
              firmware file. The device reboots automatically after a successful flash.
            </p>

            <div className="ov-connect-bar" style={{ marginBottom: 12 }}>
              <span className="ov-connect-label">Device IP</span>
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
              <span className={`ov-status-text${connected ? ' on' : ''}`}>
                {connected ? `Connected · ${deviceIp}` : 'Not connected'}
              </span>
            </div>

            <div className="ov-upload-zone">
              <input type="file" accept=".bin"
                onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(''); }} />
              {file && <div className="ov-selected">{file.name} ({(file.size / 1024).toFixed(1)} KB)</div>}
            </div>

            <button
              className="ov-btn ov-btn-primary"
              disabled={!file || !connected || upload.isPending}
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? 'Uploading…' : 'Upload Firmware'}
            </button>

            {result && (
              <div className={`ov-fw-result ${upload.isError ? 'err' : 'ok'}`}>{result}</div>
            )}
          </div>
        </div>

        <div className="ov-card">
          <div className="ov-card-header">Other Flash Methods</div>
          <div className="ov-card-body">
            <div className="ov-method-list">
              <div className="ov-method">
                <div className="ov-method-title">OTA from device web UI</div>
                <div className="ov-method-body">
                  Connect to the OSCVT Wi-Fi, open{' '}
                  <span className="ov-method-code">192.168.142.1</span>, navigate to Firmware
                  Update, and upload the <span className="ov-method-code">.bin</span> file directly
                  from the browser. This is the primary field update method.
                </div>
              </div>
              <div className="ov-method">
                <div className="ov-method-title">USB flash (esptool) — initial or recovery</div>
                <div className="ov-method-body">
                  Connect USB-C to a PC with esptool installed. Use this for the initial flash or if
                  OTA is unavailable. Both Pro and Mini have USB-C for flashing.
                  <br /><br />
                  <span className="ov-method-code">esptool.py --chip esp32s3 write_flash 0x0 oscvt-pro.bin</span>
                </div>
              </div>
              <div className="ov-method">
                <div className="ov-method-title">OTA from OSCVT portal (this page)</div>
                <div className="ov-method-body">
                  Use the upload form on the left when the device is reachable through the OCT
                  backend (requires local OCT server on the same network as the device).
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ov-card">
        <div className="ov-card-header">Firmware Partition Layout</div>
        <div className="ov-card-body">
          <p className="ov-note" style={{ marginBottom: 10 }}>
            The OSCVT firmware uses the ESP-IDF OTA partition scheme with two application partitions
            (ota_0 and ota_1). A successful OTA writes to the inactive partition and sets it as the
            boot target. If the new firmware fails to validate, the device rolls back to the previous
            partition on next boot.
          </p>
          <table className="ov-table">
            <thead><tr><th>Partition</th><th>Purpose</th><th>Size</th></tr></thead>
            <tbody>
              <tr><td className="mono">nvs</td><td>Settings (MAC, SSID, network numbers)</td><td>24 KB</td></tr>
              <tr><td className="mono">ota_data</td><td>Active partition selector</td><td>8 KB</td></tr>
              <tr><td className="mono">ota_0</td><td>Firmware slot A</td><td>~3.5 MB</td></tr>
              <tr><td className="mono">ota_1</td><td>Firmware slot B</td><td>~3.5 MB</td></tr>
              <tr><td className="mono">spiffs</td><td>Web UI assets (HTML, JS, CSS)</td><td>~2 MB</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
