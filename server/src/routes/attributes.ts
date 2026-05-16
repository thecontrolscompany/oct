import { Router, Request, Response } from 'express';
import { getPool, sql } from '../db';

const router = Router();
const FDB = '[FDB_Control_10_8___Firmware_12_0]';

// GET /api/attributes/:objectId — attribute values enriched with FDB names
router.get('/:objectId', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('objectId', req.params.objectId)
      .query(`
        SELECT
          v.ValueId,
          v.DescribedObjectId,
          v.DescribedObjectTypeId,
          v.AttributeId,
          ISNULL(a.Name, '(unknown)') AS AttributeName,
          a.MetasysAttributeNumber,
          v.ValueString,
          v.ValueString1,
          v.swDataTypeId,
          v.ArrayIndex,
          v.LevelIndex,
          v.SystemOfUnits
        FROM tblValue1 v
        LEFT JOIN ${FDB}.dbo.tblAttribute a ON a.AttributeId = v.AttributeId
        WHERE v.DescribedObjectId = @objectId
        ORDER BY a.Name, v.ArrayIndex, v.LevelIndex
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /api/attributes/:objectId error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/attributes/:objectId — update a single attribute value
router.put('/:objectId', async (req: Request, res: Response) => {
  const { attributeId, valueString } = req.body as { attributeId: string; valueString: string };
  if (!attributeId || valueString === undefined) {
    res.status(400).json({ error: 'attributeId and valueString required' });
    return;
  }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('objectId', req.params.objectId)
      .input('attributeId', attributeId)
      .input('valueString', sql.NVarChar(400), valueString)
      .query(`
        UPDATE tblValue1
        SET ValueString = @valueString
        WHERE DescribedObjectId = @objectId AND AttributeId = @attributeId
      `);
    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ error: 'Attribute not found' });
      return;
    }
    res.json({ updated: result.rowsAffected[0] });
  } catch (err) {
    console.error('PUT /api/attributes/:objectId error:', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
