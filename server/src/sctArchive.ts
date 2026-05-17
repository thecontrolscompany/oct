import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

export const SCT_ARCHIVE_DB = process.env.CCT_ARCHIVE_DB ?? 'DaytonaState';
const outByClassPath = path.resolve(__dirname, '../../shared/archiveAttributeNamesByClass.json');
const outGlobalPath = path.resolve(__dirname, '../../shared/archiveAttributeNames.json');

export interface ArchiveTableCount {
  name: string;
  rowCount: number;
}

export interface ArchiveProcedureInfo {
  name: string;
  prefix: 'spu' | 'spws' | 'fnu' | 'other';
}

export interface ArchiveSummary {
  database: string;
  tables: ArchiveTableCount[];
  procedureCounts: Array<{ prefix: string; count: number }>;
  procedures: ArchiveProcedureInfo[];
}

export interface ArchiveNameMapRefreshResult {
  database: string;
  classMapCount: number;
  globalNameCount: number;
  byClassPath: string;
  globalPath: string;
}

type NameRow = { classId?: number | null; attributeId: number; attributeName: string; hitCount: number };

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

export function runSql(query: string): string {
  const result = spawnSync('sqlcmd', [
    '-S', 'localhost',
    '-E',
    '-d', SCT_ARCHIVE_DB,
    '-b',
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

export function parseRows(output: string): string[][] {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split('|'));
}

function rowsToCounts(rows: string[][]): ArchiveTableCount[] {
  return rows
    .map(([name, rowCount]) => ({ name: name ?? '', rowCount: parseInt(rowCount ?? '0', 10) || 0 }))
    .filter(row => row.name.length > 0);
}

function rowsToProcedureInfo(rows: string[][]): ArchiveProcedureInfo[] {
  return rows
    .map(([name, prefix]) => ({
      name: name ?? '',
      prefix: (prefix === 'spu' || prefix === 'spws' || prefix === 'fnu' ? prefix : 'other') as ArchiveProcedureInfo['prefix'],
    }))
    .filter(row => row.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function listArchiveSummary(): ArchiveSummary {
  const tableRows = parseRows(runSql(`
    SET NOCOUNT ON;
    SELECT 'Item' AS Name, COUNT(*) AS Cnt FROM dbo.[Item]
    UNION ALL SELECT 'Value', COUNT(*) FROM dbo.[Value]
    UNION ALL SELECT 'Property', COUNT(*) FROM dbo.[Property]
    UNION ALL SELECT 'ViewProperty', COUNT(*) FROM dbo.[ViewProperty]
    UNION ALL SELECT 'Attribute', COUNT(*) FROM dbo.[Attribute]
    UNION ALL SELECT 'ItemDefinition', COUNT(*) FROM dbo.[ItemDefinition]
    UNION ALL SELECT 'ItemDef_Attrib', COUNT(*) FROM dbo.[ItemDef_Attrib];
  `));

  const procedureCountRows = parseRows(runSql(`
    SET NOCOUNT ON;
    SELECT 'spu' AS Prefix, COUNT(*) AS Cnt FROM sys.procedures WHERE name LIKE 'spu[_]%'
    UNION ALL SELECT 'spws', COUNT(*) FROM sys.procedures WHERE name LIKE 'spws[_]%'
    UNION ALL SELECT 'fnu', COUNT(*) FROM sys.objects WHERE name LIKE 'fnu[_]%' AND type IN ('FN','TF','IF')
    UNION ALL SELECT 'other', COUNT(*) FROM sys.objects WHERE name NOT LIKE 'spu[_]%' AND name NOT LIKE 'spws[_]%' AND name NOT LIKE 'fnu[_]%' AND type IN ('P','FN','TF','IF');
  `));

  const procedureRows = parseRows(runSql(`
    SET NOCOUNT ON;
    SELECT
      name,
      CASE
        WHEN name LIKE 'spu[_]%' THEN 'spu'
        WHEN name LIKE 'spws[_]%' THEN 'spws'
        WHEN name LIKE 'fnu[_]%' THEN 'fnu'
        ELSE 'other'
      END AS Prefix
    FROM sys.objects
    WHERE type IN ('P','FN','TF','IF')
      AND (name LIKE 'spu[_]%' OR name LIKE 'spws[_]%' OR name LIKE 'fnu[_]%')
    ORDER BY name;
  `));

  return {
    database: SCT_ARCHIVE_DB,
    tables: rowsToCounts(tableRows),
    procedureCounts: procedureCountRows.map(([prefix, count]) => ({
      prefix: prefix ?? 'other',
      count: parseInt(count ?? '0', 10) || 0,
    })),
    procedures: rowsToProcedureInfo(procedureRows),
  };
}

export async function refreshArchiveNameMaps(): Promise<ArchiveNameMapRefreshResult> {
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

  return {
    database: SCT_ARCHIVE_DB,
    classMapCount: Object.keys(outputByClass).length,
    globalNameCount: Object.keys(outputGlobal).length,
    byClassPath: outByClassPath,
    globalPath: outGlobalPath,
  };
}
