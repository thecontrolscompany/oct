import { Router, Request, Response } from 'express';
import { getPool } from '../db';

const router = Router();
const FDB = '[FDB_Control_10_8___Firmware_12_0]';

// GET /api/fdb/definitions — all item definitions (controllers + modules)
router.get('/definitions', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const filter = req.query.q ? `WHERE d.Name LIKE @q` : '';
    const request = pool.request();
    if (req.query.q) request.input('q', `%${req.query.q}%`);
    const result = await request.query(`
      SELECT
        d.ItemDefinitionId,
        d.Name,
        d.ClassId,
        d.MajorVersion,
        d.MinorVersion,
        d.IsTypical,
        c.BacnetClassId,
        c.Category,
        c.IsUserCreatable
      FROM ${FDB}.dbo.tblItemDefinition d
      LEFT JOIN ${FDB}.dbo.tblMetasysClassInformation c ON c.InternalClass = d.ClassId
      ${filter}
      ORDER BY d.Name
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /api/fdb/definitions error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/fdb/definitions/:classId — definition + attributes for one class
router.get('/definitions/:classId', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const classId = parseInt(routeParam(req, 'classId'), 10);
    const defResult = await pool.request()
      .input('classId', classId)
      .query(`
        SELECT
          d.ItemDefinitionId,
          d.Name,
          d.ClassId,
          d.MajorVersion,
          d.MinorVersion,
          c.BacnetClassId,
          c.Category,
          c.MinimumInput,
          c.MaximumInput,
          c.IsVariableInput,
          c.BACnetExposed
        FROM ${FDB}.dbo.tblItemDefinition d
        LEFT JOIN ${FDB}.dbo.tblMetasysClassInformation c ON c.InternalClass = d.ClassId
        WHERE d.ClassId = @classId
      `);

    if (!defResult.recordset.length) {
      res.status(404).json({ error: 'Definition not found' });
      return;
    }

    const attrResult = await pool.request()
      .input('classId', classId)
      .query(`
        SELECT
          a.AttributeId,
          a.Name AS AttributeName,
          a.MetasysAttributeNumber,
          a.MemberSequence,
          dt.Name AS DataTypeName
        FROM ${FDB}.dbo.tblAttribute a
        JOIN ${FDB}.dbo.tblDescribedObjectDefinition dod ON dod.DescribedObjectDefinitionId = a.DescribedObjectDefinitionId
        JOIN ${FDB}.dbo.tblItemDefinition id2 ON id2.ItemDefinitionId = dod.ItemDefinitionId AND id2.ClassId = @classId
        LEFT JOIN ${FDB}.dbo.tblDataType dt ON dt.DataTypeId = a.DataTypeId
        WHERE a.IsTypical = 0
        ORDER BY a.MemberSequence, a.Name
      `);

    res.json({
      ...defResult.recordset[0],
      attributes: attrResult.recordset,
    });
  } catch (err) {
    console.error('GET /api/fdb/definitions/:classId error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/fdb/enums — all enum sets with member counts
router.get('/enums', async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT s.EnumSetId, s.Name, COUNT(m.EnumMemberId) AS MemberCount
      FROM ${FDB}.dbo.tblEnumSet s
      LEFT JOIN ${FDB}.dbo.tblEnumMember m ON m.EnumSetId = s.EnumSetId
      GROUP BY s.EnumSetId, s.Name
      ORDER BY s.Name
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/fdb/enums/:setId — all members for one enum set
router.get('/enums/:setId', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const setId = parseInt(routeParam(req, 'setId'), 10);
    const [setResult, membersResult] = await Promise.all([
      pool.request().input('setId', setId)
        .query(`SELECT EnumSetId, Name FROM ${FDB}.dbo.tblEnumSet WHERE EnumSetId = @setId`),
      pool.request().input('setId', setId)
        .query(`SELECT EnumMemberId, Name FROM ${FDB}.dbo.tblEnumMember WHERE EnumSetId = @setId ORDER BY EnumMemberId`),
    ]);
    if (!setResult.recordset.length) { res.status(404).json({ error: 'Enum set not found' }); return; }
    res.json({ ...setResult.recordset[0], members: membersResult.recordset });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function routeParam(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default router;
