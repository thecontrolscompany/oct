import { Router, Request, Response } from 'express';
import { getPool } from '../db';

const router = Router();

// GET /api/spaces — space hierarchy (building/floor/zone tree)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        SpaceId,
        Name,
        ParentSpaceId,
        Sequence
      FROM tblSpace
      ORDER BY ParentSpaceId, Sequence, Name
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /api/spaces error:', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
