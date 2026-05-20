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

function getRouterIp(): string {
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
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const ip = getRouterIp();
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
router.get('/diagnostics', async (_req: Request, res: Response) => {
  try {
    const ip = getRouterIp();
    const result = await proxyGet(ip, '/ui_views/diagnostics.json');
    respondProxyResult(res, result);
  } catch (err) {
    sendRouterError(res, err);
  }
});

// GET /api/router/settings/bacnet
router.get('/settings/bacnet', async (_req: Request, res: Response) => {
  try {
    const ip = getRouterIp();
    const result = await proxyGet(ip, '/ui_views/bac_settings.json');
    respondProxyResult(res, result);
  } catch (err) {
    sendRouterError(res, err);
  }
});

// GET /api/router/settings/wifi
router.get('/settings/wifi', async (_req: Request, res: Response) => {
  try {
    const ip = getRouterIp();
    const result = await proxyGet(ip, '/ui_views/wifi_settings.json');
    respondProxyResult(res, result);
  } catch (err) {
    sendRouterError(res, err);
  }
});

// GET /api/router/settings/ble
router.get('/settings/ble', async (_req: Request, res: Response) => {
  try {
    const ip = getRouterIp();
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
    const ip = getRouterIp();
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

// TODO: POST /api/router/settings — endpoint and body shape TBD after live write verification.

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

export default router;
