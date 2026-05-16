import { Router, Request, Response } from 'express';
import { getPool } from '../db';

const router = Router();

// GET /api/controllers — full item tree (folders + typicals + packages)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        i.ItemId,
        -- Package items store name as "ModelNumber|hash" — strip the hash
        CASE
          WHEN CHARINDEX('|', i.Name) > 0
            THEN LEFT(i.Name, CHARINDEX('|', i.Name) - 1)
          ELSE i.Name
        END AS Name,
        i.ItemTypeId,
        i.ParentItemId
      FROM tblItem i
      ORDER BY i.ItemTypeId, i.Name
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /api/controllers error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/controllers/:id — single item with its child items and ports
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();

    const itemResult = await pool.request()
      .input('itemId', req.params.id)
      .query(`
        SELECT
          i.ItemId,
          CASE
            WHEN CHARINDEX('|', i.Name) > 0
              THEN LEFT(i.Name, CHARINDEX('|', i.Name) - 1)
            ELSE i.Name
          END AS Name,
          i.ItemTypeId,
          i.ParentItemId,
          i.LibraryItemId
        FROM tblItem i
        WHERE i.ItemId = @itemId
      `);

    if (!itemResult.recordset.length) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const portsResult = await pool.request()
      .input('itemId', req.params.id)
      .query(`
        SELECT
          p.PortId,
          p.Name,
          p.PortTypeId,
          p.ActualSignalId
        FROM tblPort p
        WHERE p.ItemId = @itemId
        ORDER BY p.Name
      `);

    const childrenResult = await pool.request()
      .input('itemId', req.params.id)
      .query(`
        SELECT
          i.ItemId,
          CASE
            WHEN CHARINDEX('|', i.Name) > 0
              THEN LEFT(i.Name, CHARINDEX('|', i.Name) - 1)
            ELSE i.Name
          END AS Name,
          i.ItemTypeId
        FROM tblItem i
        WHERE i.ParentItemId = @itemId
        ORDER BY i.Name
      `);

    res.json({
      ...itemResult.recordset[0],
      ports: portsResult.recordset,
      children: childrenResult.recordset,
    });
  } catch (err) {
    console.error('GET /api/controllers/:id error:', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
