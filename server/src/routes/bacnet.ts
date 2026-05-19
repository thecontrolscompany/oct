import { Router, Request, Response } from 'express';
import * as svc from '../bacnetService';

const router = Router();

// GET /api/bacnet/defaults — return device defaults (TL-CWCVT-0)
router.get('/defaults', (_req: Request, res: Response) => {
  res.json(svc.CWCVT_DEFAULTS);
});

// POST /api/bacnet/connect
// Body: { ip?: string, prefix?: number, networkNumber?: number }
// All fields optional — omitted values fall back to TL-CWCVT-0 defaults
router.post('/connect', (req: Request, res: Response) => {
  const body = req.body as { ip?: string; prefix?: number; networkNumber?: number };
  const ip            = body.ip            ?? svc.CWCVT_DEFAULTS.ip;
  const cidr          = body.prefix        ?? svc.CWCVT_DEFAULTS.prefix;
  const netNum        = body.networkNumber ?? svc.CWCVT_DEFAULTS.networkNumber;
  try {
    svc.connect(ip, cidr, netNum);
    res.json({
      status: 'connected', ip,
      subnetBroadcast: svc.getSubnetBroadcast(),
      networkNumber: svc.getNetworkNumber(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/bacnet/connect — disconnect
router.delete('/connect', (_req: Request, res: Response) => {
  svc.disconnect();
  res.json({ status: 'disconnected' });
});

// GET /api/bacnet/status — connection status
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    connected: svc.isConnected(),
    converterIp: svc.getConverterIp(),
    subnetBroadcast: svc.getSubnetBroadcast(),
    networkNumber: svc.getNetworkNumber(),
    deviceCount: svc.getDevices().length,
  });
});

// GET /api/bacnet/cwcvt/group/:group — fetch a CWCVT diagnostics group using the
// converter's same-origin headers. Useful for reading mstp-dev-list directly.
router.get('/cwcvt/group/:group', async (req: Request, res: Response) => {
  const group = routeParam(req, 'group');
  const ip = svc.getConverterIp();
  if (!svc.isConnected() || !ip) {
    res.status(400).json({ error: 'Not connected. POST /api/bacnet/connect first.' });
    return;
  }

  try {
    const cwcvtRes = await fetch(`http://${ip}/data/group/${encodeURIComponent(group)}`, {
      headers: {
        Origin: `http://${ip}`,
        Referer: `http://${ip}/`,
      },
    });

    const text = await cwcvtRes.text();
    if (!cwcvtRes.ok) {
      res.status(cwcvtRes.status).json({ error: text });
      return;
    }

    const parsed = JSON.parse(text) as {
      content?: Array<{ key: string; value: unknown }>;
    };

    res.json({
      group,
      content: parsed.content ?? [],
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/bacnet/cwcvt/node/:node/resolve — try to promote a downstream CWCVT
// node into a concrete BACnet device using common JCI device-ID patterns.
router.get('/cwcvt/node/:node/resolve', async (req: Request, res: Response) => {
  const node = parseInt(routeParam(req, 'node'), 10);
  const ip = svc.getConverterIp();
  if (!svc.isConnected() || !ip) {
    res.status(400).json({ error: 'Not connected. POST /api/bacnet/connect first.' });
    return;
  }
  if (!Number.isFinite(node) || node < 0) {
    res.status(400).json({ error: 'Invalid node' });
    return;
  }

  const suffix = String(node).padStart(3, '0');
  const candidates = Array.from(new Set<number>([
    node,
    Number(`72${suffix}`),
    Number(`73${suffix}`),
    Number(`76${suffix}`),
  ])).filter(n => Number.isFinite(n) && n >= 0);

  try {
    for (const candidate of candidates) {
      const found = await svc.discoverRange(candidate, candidate, 2500).then(devices => devices[0] ?? null);
      if (found) {
        res.json({
          node,
          candidateDeviceIds: candidates,
          device: found,
        });
        return;
      }
    }

    res.json({
      node,
      candidateDeviceIds: candidates,
      device: null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/bacnet/discover — subnet broadcast WHO-IS, returns devices after timeout
// Body: { timeoutMs?: number }  (default 5000; use 10000 for larger subnets)
router.post('/discover', async (req: Request, res: Response) => {
  if (!svc.isConnected()) {
    res.status(400).json({ error: 'Not connected. POST /api/bacnet/connect first.' });
    return;
  }
  const timeoutMs = Math.min((req.body as { timeoutMs?: number })?.timeoutMs ?? 5000, 30000);
  try {
    const devices = await svc.discover(timeoutMs);
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/bacnet/devices — cached device list
router.get('/devices', (_req: Request, res: Response) => {
  res.json(svc.getDevices());
});

// POST /api/bacnet/direct — add a device by direct IP address (unicast WHO-IS)
// Use when you know a device's IP and don't need subnet broadcast.
// Body: { ip: string, timeoutMs?: number }
router.post('/direct', async (req: Request, res: Response) => {
  const { ip, timeoutMs } = req.body as { ip: string; timeoutMs?: number };
  if (!ip) { res.status(400).json({ error: 'ip required' }); return; }
  if (!svc.isConnected()) {
    // Auto-connect using the target IP itself as the converter address
    try { svc.connect(ip); } catch (err) {
      res.status(500).json({ error: String(err) }); return;
    }
  }
  try {
    const device = await svc.discoverDirect(ip, timeoutMs ?? 4000);
    if (!device) {
      res.status(404).json({ error: `No BACnet device responded at ${ip}` });
      return;
    }
    res.json(device);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/bacnet/devices/:deviceId/objects — read object list from device
router.get('/devices/:deviceId/objects', async (req: Request, res: Response) => {
  const deviceId = parseInt(routeParam(req, 'deviceId'), 10);
  const devices = svc.getDevices();
  const device = devices.find(d => d.deviceId === deviceId);
  if (!device) { res.status(404).json({ error: 'Device not in discovered list' }); return; }

  try {
    const objects = await svc.readObjectList(device.address, deviceId);
    // Enrich with names
    const enriched = await Promise.all(
      objects.map(async obj => {
        try {
          const name = await svc.readProperty(device.address, obj.type, obj.instance, svc.PROP.OBJECT_NAME);
          return { ...obj, typeName: svc.OBJECT_TYPE_NAME[obj.type] ?? `T${obj.type}`, name };
        } catch {
          return { ...obj, typeName: svc.OBJECT_TYPE_NAME[obj.type] ?? `T${obj.type}`, name: null };
        }
      })
    );
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/bacnet/devices/:deviceId/objects/:type/:instance — read key properties
router.get('/devices/:deviceId/objects/:type/:instance', async (req: Request, res: Response) => {
  const deviceId = parseInt(routeParam(req, 'deviceId'), 10);
  const objType = parseInt(routeParam(req, 'type'), 10);
  const objInstance = parseInt(routeParam(req, 'instance'), 10);
  const device = svc.getDevices().find(d => d.deviceId === deviceId);
  if (!device) { res.status(404).json({ error: 'Device not found' }); return; }

  try {
    const props = await svc.readMultiple(device.address, objType, objInstance, [
      svc.PROP.OBJECT_NAME,
      svc.PROP.DESCRIPTION,
      svc.PROP.PRESENT_VALUE,
      svc.PROP.UNITS,
      svc.PROP.STATUS_FLAGS,
      svc.PROP.RELIABILITY,
      svc.PROP.OUT_OF_SERVICE,
    ]);
    res.json({
      deviceId,
      objectType: objType,
      objectInstance: objInstance,
      typeName: svc.OBJECT_TYPE_NAME[objType] ?? `T${objType}`,
      ...props,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/bacnet/devices/:deviceId/objects/:type/:instance/present-value
router.put('/devices/:deviceId/objects/:type/:instance/present-value', async (req: Request, res: Response) => {
  const deviceId = parseInt(routeParam(req, 'deviceId'), 10);
  const objType = parseInt(routeParam(req, 'type'), 10);
  const objInstance = parseInt(routeParam(req, 'instance'), 10);
  const { value, bacnetType } = req.body as { value: unknown; bacnetType: number };

  if (value === undefined || bacnetType === undefined) {
    res.status(400).json({ error: 'value and bacnetType required' });
    return;
  }

  const device = svc.getDevices().find(d => d.deviceId === deviceId);
  if (!device) { res.status(404).json({ error: 'Device not found' }); return; }

  try {
    await svc.writeProperty(device.address, objType, objInstance, svc.PROP.PRESENT_VALUE, bacnetType, value);
    res.json({ written: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function routeParam(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default router;
