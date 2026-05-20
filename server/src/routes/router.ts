import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as http from 'node:http';
import type { IncomingMessage } from 'node:http';
import * as svc from '../bacnetService';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

type ProxyResult = {
  statusCode: number;
  contentType: string | null;
  rawText: string;
  parsed: unknown;
};

function getRouterIp(req: Request): string {
  const override = typeof req.query['ip'] === 'string' ? req.query['ip'].trim() : null;
  if (override) return override;
  const ip = svc.getConverterIp();
  if (!svc.isConnected() || !ip) throw new Error('No router connected');
  return ip;
}

function proxyGet(ip: string, path: string): Promise<ProxyResult> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: ip,
        port: 80,
        path,
        headers: {
          Origin: `http://${ip}`,
          Referer: `http://${ip}/`,
        },
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const rawText = Buffer.concat(chunks).toString('utf8');
          const statusCode = res.statusCode ?? 0;
          const contentType = (res.headers['content-type'] ?? null) as string | null;

          if (statusCode >= 400) {
            reject(new Error(`HTTP ${statusCode}${rawText ? `: ${rawText}` : ''}`));
            return;
          }

          let parsed: unknown = rawText;
          if ((contentType ?? '').includes('json')) {
            try {
              parsed = rawText ? JSON.parse(rawText) : null;
            } catch {
              parsed = rawText;
            }
          } else {
            try {
              parsed = rawText ? JSON.parse(rawText) : null;
            } catch {
              parsed = rawText;
            }
          }

          resolve({ statusCode, contentType, rawText, parsed });
        });
      }
    );

    req.setTimeout(4000, () => req.destroy(new Error('ETIMEDOUT')));
    req.on('error', reject);
  });
}

// GET /api/router/status
// Check whether the router console is reachable and return ui_info.json if so.
router.get('/status', async (req: Request, res: Response) => {
  try {
    const ip = getRouterIp(req);
    const result = await proxyGet(ip, '/ui_views/ui_info.json');
    res.json({
      reachable: true,
      converterIp: ip,
      raw: result.parsed,
    });
  } catch (err) {
    res.json({
      reachable: false,
      error: String(err instanceof Error ? err.message : err),
    });
  }
});

// GET /api/router/diagnostics
router.get('/diagnostics', async (req: Request, res: Response) => {
  try {
    const ip = getRouterIp(req);
    const result = await proxyGet(ip, '/ui_views/diagnostics.json');
    respondProxyResult(res, result);
  } catch (err) {
    sendRouterError(res, err);
  }
});

// GET /api/router/settings/bacnet
router.get('/settings/bacnet', async (req: Request, res: Response) => {
  try {
    const ip = getRouterIp(req);
    const result = await proxyGet(ip, '/ui_views/bac_settings.json');
    respondProxyResult(res, result);
  } catch (err) {
    sendRouterError(res, err);
  }
});

// GET /api/router/settings/wifi
router.get('/settings/wifi', async (req: Request, res: Response) => {
  try {
    const ip = getRouterIp(req);
    const result = await proxyGet(ip, '/ui_views/wifi_settings.json');
    respondProxyResult(res, result);
  } catch (err) {
    sendRouterError(res, err);
  }
});

// GET /api/router/settings/ble
router.get('/settings/ble', async (req: Request, res: Response) => {
  try {
    const ip = getRouterIp(req);
    const result = await proxyGet(ip, '/ui_views/ble_settings.json');
    respondProxyResult(res, result);
  } catch (err) {
    sendRouterError(res, err);
  }
});

// POST /api/router/upload
// Accept fw_update as multipart/form-data and re-post it to the router's OTA path.
router.post('/upload', upload.single('fw_update'), async (req: Request, res: Response) => {
  try {
    const ip = getRouterIp(req);
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'fw_update file required' });
      return;
    }

    const safeName = sanitizeFilename(file.originalname || 'firmware.bin');
    const form = new FormData();
    form.append('fw_update', new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }), safeName);

    const upstream = await fetch(`http://${ip}/upload/${encodeURIComponent(safeName)}`, {
      method: 'POST',
      headers: {
        Origin: `http://${ip}`,
        Referer: `http://${ip}/`,
      },
      body: form,
    });

    const contentType = upstream.headers.get('content-type') ?? 'text/plain';
    const bodyText = await upstream.text();

    res.status(upstream.status).type(contentType).send(bodyText);
  } catch (err) {
    sendRouterError(res, err);
  }
});

// POST /api/router/settings
// Write a settings group back to the router.
// Body: { group: string, values: Record<string, unknown> }
// The router accepts a POST to /data/group/:group with JSON key/value pairs.
// The write method was determined by observing network traffic from the
// device web UI — no source code was copied.
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const ip = getRouterIp(req);
    const { group, values } = req.body as { group?: string; values?: Record<string, unknown> };
    if (!group || !values) {
      res.status(400).json({ error: 'group and values required' });
      return;
    }
    const upstream = await fetch(`http://${ip}/data/group/${encodeURIComponent(group)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin:  `http://${ip}`,
        Referer: `http://${ip}/`,
      },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify(values),
    });
    const text = await upstream.text();
    res.status(upstream.status).json({ ok: upstream.ok, response: text });
  } catch (err) {
    sendRouterError(res, err);
  }
});

// POST /api/router/command
// Send a named command to the router.
// Body: { command: string }
// Known commands: mstp-clear-stats, ble-clear-stats, restart
router.post('/command', async (req: Request, res: Response) => {
  try {
    const ip = getRouterIp(req);
    const { command } = req.body as { command?: string };
    if (!command) {
      res.status(400).json({ error: 'command required' });
      return;
    }
    const ALLOWED = new Set(['mstp-clear-stats', 'ble-clear-stats', 'mstp-force-baud', 'restart']);
    if (!ALLOWED.has(command)) {
      res.status(400).json({ error: `Unknown command: ${command}. Allowed: ${[...ALLOWED].join(', ')}` });
      return;
    }
    const upstream = await fetch(`http://${ip}/data/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin:  `http://${ip}`,
        Referer: `http://${ip}/`,
      },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ command }),
    });
    const text = await upstream.text();
    res.status(upstream.status).json({ ok: upstream.ok, response: text });
  } catch (err) {
    sendRouterError(res, err);
  }
});

// GET /api/router/captures
// List PCAP capture files available on the router SD card.
// Proxies /sd_card/mstp_captures/ — returns raw HTML from the device
// which contains download links; also parses out filenames if possible.
router.get('/captures', async (req: Request, res: Response) => {
  try {
    const ip = getRouterIp(req);
    const result = await proxyGet(ip, '/sd_card/mstp_captures/');
    // Return raw HTML so the client can render download links,
    // and attempt to extract a structured file list from the HTML.
    const files = extractPcapFiles(String(result.rawText), ip);
    res.json({ html: result.rawText, files });
  } catch (err) {
    sendRouterError(res, err);
  }
});

// POST /api/router/captures/toggle
// Enable or disable PCAP capture on the router.
// Body: { enabled: boolean }
router.post('/captures/toggle', async (req: Request, res: Response) => {
  try {
    const ip = getRouterIp(req);
    const { enabled } = req.body as { enabled?: boolean };
    if (enabled === undefined) {
      res.status(400).json({ error: 'enabled (boolean) required' });
      return;
    }
    const upstream = await fetch(`http://${ip}/data/group/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin:  `http://${ip}`,
        Referer: `http://${ip}/`,
      },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ 'sd_m_log': enabled ? 'Enabled' : 'Disabled' }),
    });
    const text = await upstream.text();
    res.status(upstream.status).json({ ok: upstream.ok, enabled, response: text });
  } catch (err) {
    sendRouterError(res, err);
  }
});

function respondProxyResult(res: Response, result: ProxyResult): void {
  if ((result.contentType ?? '').includes('json')) {
    res.json(result.parsed);
    return;
  }

  if (typeof result.parsed === 'string') {
    res.type(result.contentType ?? 'text/plain').send(result.parsed);
    return;
  }

  res.json(result.parsed);
}

function sendRouterError(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'No router connected') {
    res.status(503).json({ error: 'No router connected' });
    return;
  }
  if (message === 'ETIMEDOUT') {
    res.status(502).json({ error: 'Router request timed out' });
    return;
  }
  res.status(502).json({ error: message });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/]/g, '_').trim() || 'firmware.bin';
}

type PcapFile = { name: string; url: string; size?: string };

function extractPcapFiles(html: string, ip: string): PcapFile[] {
  const files: PcapFile[] = [];
  // Match anchor tags whose href ends in .pcap or .pcapng
  const linkRe = /<a\s+[^>]*href="([^"]*\.pcap(?:ng)?)"[^>]*>([^<]*)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1];
    const label = m[2].trim();
    const name = label || href.split('/').pop() || href;
    // href may be absolute or relative; build a full URL through our proxy
    const encodedPath = href.startsWith('/') ? href : `/sd_card/mstp_captures/${href}`;
    const url = `http://${ip}${encodedPath}`;
    files.push({ name, url });
  }
  return files;
}

export default router;
