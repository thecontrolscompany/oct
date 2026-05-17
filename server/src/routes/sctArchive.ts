import { Router, Request, Response } from 'express';
import { listArchiveSummary, refreshArchiveNameMaps } from '../sctArchive';

const router = Router();

router.get('/summary', async (_req: Request, res: Response) => {
  try {
    res.json(listArchiveSummary());
  } catch (err) {
    console.error('GET /api/sct-archive/summary error:', err);
    res.status(500).json({ error: String(err) });
  }
});

router.post('/refresh-name-maps', async (_req: Request, res: Response) => {
  try {
    res.json(await refreshArchiveNameMaps());
  } catch (err) {
    console.error('POST /api/sct-archive/refresh-name-maps error:', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
