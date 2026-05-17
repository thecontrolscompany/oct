import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { getPool } from '../db';

const FDB = '[FDB_Control_10_8___Firmware_12_0]';
const outPath = path.resolve(__dirname, '../../../shared/metasysAttributeNames.json');

type Row = {
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
      a.MetasysAttributeNumber,
      a.Name AS AttributeName,
      COUNT(*) AS HitCount
    FROM ${FDB}.dbo.tblAttribute a
    WHERE a.MetasysAttributeNumber IS NOT NULL
    GROUP BY a.MetasysAttributeNumber, a.Name
    ORDER BY a.MetasysAttributeNumber, COUNT(*) DESC, a.Name
  `);

  const grouped = new Map<number, { name: string; count: number }>();
  for (const row of result.recordset as Row[]) {
    const existing = grouped.get(row.MetasysAttributeNumber);
    if (!existing || row.HitCount > existing.count || (row.HitCount === existing.count && row.AttributeName < existing.name)) {
      grouped.set(row.MetasysAttributeNumber, { name: row.AttributeName, count: row.HitCount });
    }
  }

  const output: Record<string, string> = {};
  for (const [attrId, entry] of grouped.entries()) {
    output[String(attrId)] = entry.name;
  }

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${Object.keys(output).length} attribute names to ${outPath}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
