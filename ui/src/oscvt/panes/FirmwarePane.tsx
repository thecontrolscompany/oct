import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { OscvtApi } from '../OscvtApp';

interface Props {
  deviceIp:  string;
  connected: boolean;
  api:       OscvtApi;
}

export default function FirmwarePane({ deviceIp, connected, api }: Props) {
  const [file,   setFile]   = useState<File | null>(null);
  const [result, setResult] = useState<string>('');

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');
      const resp = await api.uploadFirmware(file);
      const body = await resp.text();
      return `HTTP ${resp.status} — ${body || 'No response body'}`;
    },
    onSuccess: r  => setResult(r),
    onError:   err => setResult(String(err)),
  });

  return (
    <div className="ov-firmware-shell">
      <section className="ov-card">
        <div className="ov-card-header">OTA Firmware Update</div>
        <div className="ov-card-body">
          {!connected && (
            <div className="ov-warn-box">Connect to the device before uploading firmware.</div>
          )}

          <div className="ov-fw-info">
            <div className="ov-fw-row"><span>Target</span>         <span className="mono">{deviceIp}</span></div>
            <div className="ov-fw-row"><span>Upload endpoint</span><span className="mono">/upload/&lt;filename&gt;</span></div>
            <div className="ov-fw-row"><span>Field name</span>     <span className="mono">fw_update</span></div>
            <div className="ov-fw-row"><span>Method</span>         <span className="mono">POST multipart/form-data</span></div>
          </div>

          <div className="ov-drop-zone">
            <input
              type="file"
              accept=".bin"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(''); }}
            />
            {file && (
              <div className="ov-selected-file">
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}
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
      </section>

      <section className="ov-card">
        <div className="ov-card-header">Firmware Portal</div>
        <div className="ov-card-body">
          <div className="ov-fw-info">
            <div className="ov-fw-row"><span>Latest release</span><span className="mono dim">—</span></div>
            <div className="ov-fw-row"><span>Repository</span>    <span className="mono dim">GitHub (TBD)</span></div>
          </div>
          <p className="ov-body-dim">
            Firmware releases will be listed here once the OSCVT firmware repository is published.
            Downloads will link directly to the GitHub release and can be flashed to the device above.
          </p>
        </div>
      </section>
    </div>
  );
}
