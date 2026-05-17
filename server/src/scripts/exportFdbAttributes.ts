import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { getPool } from '../db';

const FDB = '[FDB_Control_10_8___Firmware_12_0]';
const outPath = path.resolve(__dirname, '../../../shared/metasysAttributeNamesByClass.json');

type Row = {
  ClassId: number;
  MetasysAttributeNumber: number;
  AttributeName: string;
  HitCount: number;
};

async function main() {
  console.log('Connecting to FDB...');
  const pool = await getPool();

  console.log('Querying attribute names...');
  const result = await pool.request().query(`
    SELECT
      idf.ClassId,
      a.MetasysAttributeNumber,
      a.Name AS AttributeName,
      COUNT(*) AS HitCount
    FROM ${FDB}.dbo.tblAttribute a
    JOIN ${FDB}.dbo.tblItemDefinition idf
      ON idf.ItemDefinitionId = a.DescribedObjectDefinitionId
    WHERE a.MetasysAttributeNumber IS NOT NULL
    GROUP BY idf.ClassId, a.MetasysAttributeNumber, a.Name
    ORDER BY idf.ClassId, a.MetasysAttributeNumber, COUNT(*) DESC, a.Name
  `);

  const grouped = new Map<number, Map<number, { name: string; count: number }>>();
  for (const row of result.recordset as Row[]) {
    let classMap = grouped.get(row.ClassId);
    if (!classMap) {
      classMap = new Map();
      grouped.set(row.ClassId, classMap);
    }
    const existing = classMap.get(row.MetasysAttributeNumber);
    if (!existing || row.HitCount > existing.count || (row.HitCount === existing.count && row.AttributeName < existing.name)) {
      classMap.set(row.MetasysAttributeNumber, { name: row.AttributeName, count: row.HitCount });
    }
  }

  const output: Record<string, Record<string, string>> = {};
  for (const [classId, classMap] of grouped.entries()) {
    const attrs: Record<string, string> = {};
    for (const [attrId, entry] of classMap.entries()) {
      attrs[String(attrId)] = entry.name;
    }
    output[String(classId)] = attrs;
  }

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${Object.keys(output).length} class maps to ${outPath}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
