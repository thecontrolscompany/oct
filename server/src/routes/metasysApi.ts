import { Router, Request, Response } from 'express';
import https from 'https';

const router = Router();

function httpsPost(host: string, path: string, body: string, token?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname: host, port: 443, path, method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    setTimeout(() => req.destroy(new Error('timeout')), 15_000);
    req.write(data);
    req.end();
  });
}

function httpsGet(host: string, path: string, token: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host, port: 443, path, method: 'GET',
      rejectUnauthorized: false,
      headers: { Authorization: `Bearer ${token}` },
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    setTimeout(() => req.destroy(new Error('timeout')), 15_000);
    req.end();
  });
}

async function login(host: string, username: string, password: string): Promise<string> {
  const r = await httpsPost(host, '/api/v2/login', JSON.stringify({ username, password }));
  if (r.status < 200 || r.status >= 300) throw new Error(`Login failed HTTP ${r.status}: ${r.body.slice(0, 120)}`);
  const data = JSON.parse(r.body) as { accessToken?: string };
  if (!data.accessToken) throw new Error('No accessToken in login response');
  return data.accessToken;
}

async function fetchEnum(host: string, token: string, name: string): Promise<unknown> {
  const r = await httpsGet(host, `/api/v6/schemas/enums/${name}`, token);
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.body);
}

// The enum sets the dbexport-viewer project needs — in priority order
const TARGET_ENUMS = [
  'reliabilityEnumSet',
  'unitEnumSet',
  'objectCategoryEnumSet',
  'objectTypeEnumSet',
  'presentValueEnumSet',
  'systemStatusEnumSet',
  'eventStateEnumSet',
  'notifyTypeEnumSet',
  'priorityEnumSet',
  'pollingFrequencyEnumSet',
  'writePriorityEnumSet',
  'jciSystemStatusEnumSet',
];

// POST /api/metasys/capture-enums  { host, username, password, enums? }
router.post('/capture-enums', async (req: Request, res: Response) => {
  const { host, username, password, enums } = req.body as {
    host: string; username: string; password: string; enums?: string[];
  };
  if (!host || !username || !password) {
    res.status(400).json({ error: 'host, username, and password are required' });
    return;
  }
  const list = enums?.length ? enums : TARGET_ENUMS;
  try {
    const token = await login(host, username, password);
    const results: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    await Promise.all(list.map(async name => {
      try { results[name] = await fetchEnum(host, token, name); }
      catch (e) { errors[name] = String(e); }
    }));
    res.json({
      host,
      capturedAt: new Date().toISOString(),
      captured: Object.keys(results).length,
      failed: Object.keys(errors).length,
      results,
      ...(Object.keys(errors).length && { errors }),
    });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// GET /api/metasys/enum-list?host=&username=&password=
router.get('/enum-list', async (req: Request, res: Response) => {
  const { host, username, password } = req.query as Record<string, string>;
  if (!host || !username || !password) {
    res.status(400).json({ error: 'host, username, password required' });
    return;
  }
  try {
    const token = await login(host, username, password);
    const r = await httpsGet(host, '/api/v6/schemas/enums', token);
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
    res.json(JSON.parse(r.body));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

export default router;
