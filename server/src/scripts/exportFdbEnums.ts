import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { getPool } from '../db';

const FDB = '[FDB_Control_10_8___Firmware_12_0]';

async function main() {
  console.log('Connecting to FDB...');
  const pool = await getPool();

  console.log('Querying enum sets and members...');
  const result = await pool.request().query(`
    SELECT s.EnumSetId, s.Name AS SetName, m.EnumMemberId, m.Name AS MemberName
    FROM ${FDB}.dbo.tblEnumSet s
    LEFT JOIN ${FDB}.dbo.tblEnumMember m ON m.EnumSetId = s.EnumSetId
    ORDER BY s.Name, m.EnumMemberId
  `);

  // Group into per-set structure
  const map = new Map<number, { EnumSetId: number; Name: string; members: Array<{ EnumMemberId: number; Name: string }> }>();
  for (const row of result.recordset) {
    if (!map.has(row.EnumSetId)) {
      map.set(row.EnumSetId, { EnumSetId: row.EnumSetId, Name: row.SetName, members: [] });
    }
    if (row.EnumMemberId != null) {
      map.get(row.EnumSetId)!.members.push({ EnumMemberId: row.EnumMemberId, Name: row.MemberName });
    }
  }

  const sets = Array.from(map.values()).sort((a, b) => a.Name.localeCompare(b.Name));
  console.log(`Found ${sets.length} enum sets, ${result.recordset.length} total rows`);

  const outPath = path.resolve(__dirname, '../../../ui/src/data/fdbEnums.ts');

  const lines: string[] = [
    '// Auto-generated from FDB_Control_10_8___Firmware_12_0 — do not edit by hand',
    '// Run: npx tsx src/scripts/exportFdbEnums.ts (from server/)',
    '',
    'export interface FdbEnumSet {',
    '  EnumSetId: number;',
    '  Name: string;',
    '  members: Array<{ EnumMemberId: number; Name: string }>;',
    '}',
    '',
    `export const FDB_ENUM_SETS: FdbEnumSet[] = ${JSON.stringify(sets, null, 2)};`,
    '',
  ];

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Written to ${outPath}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
