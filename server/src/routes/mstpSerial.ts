import { Router, Request, Response } from 'express';
import * as serial from '../mstpSerial';

const router = Router();

// GET /api/mstp-serial/ports — list available COM ports
router.get('/ports', async (_req: Request, res: Response) => {
  try {
    const ports = await serial.listPorts();
    res.json(ports);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/mstp-serial/status — current session info
router.get('/status', (_req: Request, res: Response) => {
  const s = serial.getSession();
  res.json({
    connected: s !== null,
    path: s?.path ?? null,
    baudRate: s?.baudRate ?? null,
    mode: s?.mode ?? null,
    frameCount: s?.frameCount ?? 0,
    uptimeMs: s ? Date.now() - s.startedAt : 0,
  });
});

// POST /api/mstp-serial/connect — open a COM port
// Body: { path: string, baudRate?: number, mode?: 'passive' | 'active' }
router.post('/connect', async (req: Request, res: Response) => {
  const { path, baudRate = 38400, mode = 'passive' } = req.body as {
    path: string;
    baudRate?: number;
    mode?: 'passive' | 'active';
  };
  if (!path) { res.status(400).json({ error: 'path required' }); return; }

  try {
    await serial.openPort(path, baudRate, mode as serial.SerialMode);
    res.json({ connected: true, path, baudRate, mode });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/mstp-serial/connect — close the COM port
router.delete('/connect', async (_req: Request, res: Response) => {
  await serial.closePort();
  res.json({ connected: false });
});

export default router;
