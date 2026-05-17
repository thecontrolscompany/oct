import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ARCHIVE_DB = process.env.CCT_ARCHIVE_DB ?? 'DaytonaState';
const outByClassPath = path.resolve(__dirname, '../../../shared/archiveAttributeNamesByClass.json');
const outGlobalPath = path.resolve(__dirname, '../../../shared/archiveAttributeNames.json');

type Row = {
  classId?: number | null;
  attributeId: number;
  attributeName: string;
  hitCount: number;
};

const GENERIC_ATTRIBUTE_NAMES = new Set([
  'arrayProp',
  'bitsProp',
  'booleanProp',
  'enumProp',
  'listofProp',
  'numericProp',
  'objrefProp',
  'rangeProp',
  'stringProp',
  'structProp',
  'structElementProp',
  'unitProp',
]);

function isUsableAttributeName(name: string): boolean {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return false;
  if (GENERIC_ATTRIBUTE_NAMES.has(trimmed)) return false;
  return true;
}

function runSql(query: string): string {
  const result = spawnSync('sqlcmd', [
    '-S', 'localhost',
    '-E',
    '-d', ARCHIVE_DB,
    '-W',
    '-h', '-1',
    '-s', '|',
    '-Q', query,
  ], { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `sqlcmd exited with ${result.status}`);
  }
  return result.stdout;
}

function parseRows(output: string): string[][] {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split('|'));
}

async function main() {
  console.log(`Querying ${ARCHIVE_DB} via sqlcmd...`);

  const byClassRows = parseRows(runSql(`
    SET NOCOUNT ON;
    SELECT
      CAST(idf.bacnetClassid AS int) AS ClassId,
      CAST(a.attribID AS int) AS AttributeId,
      a.attribName AS AttributeName,
      COUNT(*) AS HitCount
    FROM dbo.ItemDef_Attrib ida
    JOIN dbo.ItemDefinition idf
      ON idf.itemDefInternalID = ida.itemDefInternalID
    JOIN dbo.Attribute a
      ON a.attribID = ida.attribID
    WHERE idf.bacnetClassid IS NOT NULL
      AND a.attribName IS NOT NULL
    GROUP BY idf.bacnetClassid, a.attribID, a.attribName
    ORDER BY idf.bacnetClassid, a.attribID, COUNT(*) DESC, a.attribName;
  `));

  const globalRows = parseRows(runSql(`
    SET NOCOUNT ON;
    SELECT
      CAST(a.attribID AS int) AS AttributeId,
      a.attribName AS AttributeName,
      COUNT(*) AS HitCount
    FROM dbo.ItemDef_Attrib ida
    JOIN dbo.Attribute a
      ON a.attribID = ida.attribID
    WHERE a.attribName IS NOT NULL
    GROUP BY a.attribID, a.attribName
    ORDER BY a.attribID, COUNT(*) DESC, a.attribName;
  `));

  const groupedByClass = new Map<number, Map<number, { name: string; count: number }>>();
  for (const row of byClassRows) {
    const classId = parseInt(row[0] ?? '0', 10) || 0;
    const attributeId = parseInt(row[1] ?? '0', 10) || 0;
    const attributeName = row[2] ?? '';
    const hitCount = parseInt(row[3] ?? '0', 10) || 0;
    if (!classId || !attributeId || !isUsableAttributeName(attributeName)) continue;
    let classMap = groupedByClass.get(classId);
    if (!classMap) {
      classMap = new Map();
      groupedByClass.set(classId, classMap);
    }
    const existing = classMap.get(attributeId);
    if (!existing || hitCount > existing.count || (hitCount === existing.count && attributeName < existing.name)) {
      classMap.set(attributeId, { name: attributeName, count: hitCount });
    }
  }

  const groupedGlobal = new Map<number, { name: string; count: number }>();
  for (const row of globalRows) {
    const attributeId = parseInt(row[0] ?? '0', 10) || 0;
    const attributeName = row[1] ?? '';
    const hitCount = parseInt(row[2] ?? '0', 10) || 0;
    if (!attributeId || !isUsableAttributeName(attributeName)) continue;
    const existing = groupedGlobal.get(attributeId);
    if (!existing || hitCount > existing.count || (hitCount === existing.count && attributeName < existing.name)) {
      groupedGlobal.set(attributeId, { name: attributeName, count: hitCount });
    }
  }

  const outputByClass: Record<string, Record<string, string>> = {};
  for (const [classId, classMap] of groupedByClass.entries()) {
    const attrs: Record<string, string> = {};
    for (const [attributeId, entry] of classMap.entries()) {
      attrs[String(attributeId)] = entry.name;
    }
    outputByClass[String(classId)] = attrs;
  }

  const outputGlobal: Record<string, string> = {};
  for (const [attributeId, entry] of groupedGlobal.entries()) {
    outputGlobal[String(attributeId)] = entry.name;
  }

  fs.writeFileSync(outByClassPath, JSON.stringify(outputByClass, null, 2) + '\n', 'utf8');
  fs.writeFileSync(outGlobalPath, JSON.stringify(outputGlobal, null, 2) + '\n', 'utf8');

  console.log(`Wrote ${Object.keys(outputByClass).length} class maps to ${outByClassPath}`);
  console.log(`Wrote ${Object.keys(outputGlobal).length} global names to ${outGlobalPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
