import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

import spacesRouter from './routes/spaces';
import controllersRouter from './routes/controllers';
import attributesRouter from './routes/attributes';
import commissioningRouter from './routes/commissioning';
import fdbRouter from './routes/fdb';
import bacnetRouter from './routes/bacnet';
import mstpRouter from './routes/mstp';
import mstpSerialRouter from './routes/mstpSerial';
import packagesRouter from './routes/packages';
import cafRouter from './routes/caf';
import dbexportRouter from './routes/dbexport';
import sctArchiveRouter from './routes/sctArchive';
import perspectivesRouter from './routes/perspectives';
import metasysApiRouter from './routes/metasysApi';
import { isConnected, getDevices, readMultiple, PROP, OBJECT_TYPE_NAME } from './bacnetService';
import { onFrame, offFrame, getSession } from './mstpSerial';
import type { MstpFrame } from './mstpSerial';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Allow all origins in dev; restrict to CORS_ORIGINS (comma-separated) in production
const corsOrigins = process.env.CORS_ORIGINS;
app.use(cors({
  origin: corsOrigins
    ? (origin, cb) => {
        const allowed = corsOrigins.split(',').map(s => s.trim());
        if (!origin || allowed.includes(origin)) cb(null, true);
        else cb(new Error('CORS not allowed'));
      }
    : true,
  credentials: true,
}));
app.use(express.json());

app.use('/api/spaces', spacesRouter);
app.use('/api/controllers', controllersRouter);
app.use('/api/attributes', attributesRouter);
app.use('/api/commissioning', commissioningRouter);
app.use('/api/fdb', fdbRouter);
app.use('/api/bacnet', bacnetRouter);
app.use('/api/mstp', mstpRouter);
app.use('/api/mstp-serial', mstpSerialRouter);
app.use('/api/packages', packagesRouter);
app.use('/api/caf', cafRouter);
app.use('/api/dbexport', dbexportRouter);
app.use('/api/sct-archive', sctArchiveRouter);
app.use('/api/perspectives', perspectivesRouter);
app.use('/api/metasys', metasysApiRouter);

app.get('/api/health', (_req, res) => {
  const s = getSession();
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    bacnet: { connected: isConnected(), deviceCount: getDevices().length },
    mstpSerial: {
      connected: s !== null,
      path: s?.path ?? null,
      baudRate: s?.baudRate ?? null,
      mode: s?.mode ?? null,
      frameCount: s?.frameCount ?? 0,
    },
  });
});

const uiDist = path.resolve(__dirname, '../../ui/dist');
if (fs.existsSync(uiDist)) {
  app.use(express.static(uiDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(uiDist, 'index.html'));
  });
}

const httpServer = createServer(app);

// ─── WebSocket — BACnet/IP value polling + MS/TP frame streaming ──────────────

interface Subscription {
  deviceId: number;
  objectType: number;
  objectInstance: number;
}

// Track which clients want MS/TP frame streaming
const wsSubscriptions = new Map<WebSocket, Subscription[]>();
const mstpStreamClients = new Set<WebSocket>();

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  wsSubscriptions.set(ws, []);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as {
        type: string;
        subscriptions?: Subscription[];
      };
      if (msg.type === 'subscribe' && Array.isArray(msg.subscriptions)) {
        wsSubscriptions.set(ws, msg.subscriptions);
      } else if (msg.type === 'unsubscribe') {
        wsSubscriptions.set(ws, []);
      } else if (msg.type === 'mstp-stream-start') {
        mstpStreamClients.add(ws);
      } else if (msg.type === 'mstp-stream-stop') {
        mstpStreamClients.delete(ws);
      }
    } catch { /* ignore malformed */ }
  });

  ws.on('close', () => {
    wsSubscriptions.delete(ws);
    mstpStreamClients.delete(ws);
  });
});

// Forward MS/TP frames to all subscribed WebSocket clients
const mstpFrameHandler = (frame: MstpFrame) => {
  if (mstpStreamClients.size === 0) return;
  const msg = JSON.stringify({ type: 'mstp-frame', frame });
  for (const ws of mstpStreamClients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch { mstpStreamClients.delete(ws); }
    } else {
      mstpStreamClients.delete(ws);
    }
  }
};
onFrame(mstpFrameHandler);

// BACnet/IP value polling (every 7 seconds)
setInterval(async () => {
  if (!isConnected()) return;
  const devices = getDevices();
  const devMap = new Map(devices.map(d => [d.deviceId, d]));

  for (const [ws, subs] of wsSubscriptions) {
    if (ws.readyState !== WebSocket.OPEN || subs.length === 0) continue;
    const results = await Promise.all(
      subs.map(async sub => {
        const device = devMap.get(sub.deviceId);
        if (!device) return null;
        try {
          const props = await readMultiple(
            device.address, sub.objectType, sub.objectInstance,
            [PROP.PRESENT_VALUE, PROP.STATUS_FLAGS, PROP.OUT_OF_SERVICE]
          );
          return {
            deviceId: sub.deviceId,
            objectType: sub.objectType,
            objectInstance: sub.objectInstance,
            typeName: OBJECT_TYPE_NAME[sub.objectType] ?? `T${sub.objectType}`,
            presentValue: props[PROP.PRESENT_VALUE],
            statusFlags: props[PROP.STATUS_FLAGS],
            outOfService: props[PROP.OUT_OF_SERVICE],
            ts: Date.now(),
          };
        } catch { return null; }
      })
    );
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'values', data: results.filter(Boolean) })); }
      catch { wsSubscriptions.delete(ws); }
    }
  }
}, 7000);

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

httpServer.listen(PORT, () => {
  console.log(`CCT Web API listening on http://localhost:${PORT}`);
});
