import { Router, Request, Response } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import fs from 'fs';
import type { ArchiveProperty, CafObject, ParsedCaf, ReferenceHit } from '@oct/shared';
import { getPropertyName as resolvePropertyName } from '@oct/shared';
import { CLASS_NAMES, getUnitMap, stripBom } from './jciDictionary';
import { collectReferenceHitsFromNode } from '../archiveAnalysis';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function getParentRef(ref: string): string | null {
  // Parent is everything before the last '/' or '.'
  const lastSlash = ref.lastIndexOf('/');
  const lastDot = ref.lastIndexOf('.');
  const lastSep = Math.max(lastSlash, lastDot);
  if (lastSep <= 0) return null;
  return ref.substring(0, lastSep);
}

function getTextContent(el: { textContent?: string | null } | null): string {
  return el?.textContent?.trim() ?? '';
}

function formatPropertyValue(dataEl: any): { value: string; valueType: string } {
  const children = Array.from((dataEl.childNodes ?? []) as any[]).filter((n: any) => n?.nodeType === 1) as any[];
  if (children.length === 0) {
    return { value: dataEl.textContent?.trim() ?? '', valueType: dataEl.tagName || 'text' };
  }

  const valueType = children.length === 1 ? children[0].tagName : 'compound';
  const parts = children.map((child: any) => {
    const text = child.textContent?.trim() ?? '';
    switch (child.tagName) {
      case 'BACoid': {
        const typeId = child.getAttribute('id') ?? '';
        return typeId ? `Type ${typeId}${text ? ` · ${text}` : ''}` : text;
      }
      case 'enum':
      case 'float':
      case 'integer':
      case 'int':
      case 'unsignedByte':
      case 'unsignedShort':
      case 'unsignedLong':
      case 'string':
        return text;
      default:
        return text ? `${child.tagName}: ${text}` : child.tagName;
    }
  }).filter(Boolean);
  return { value: parts.join(', '), valueType };
}

function collectProperties(propEls: any): ArchiveProperty[] {
  const properties: ArchiveProperty[] = [];
  for (const prop of Array.from(propEls as any[])) {
    const pid = parseInt(prop.getAttribute('id') ?? '0', 10) || 0;
    const dataEl = prop.getElementsByTagName('data')[0] ?? null;
    if (!dataEl) continue;
    const { value, valueType } = formatPropertyValue(dataEl);
    properties.push({ id: pid, name: resolvePropertyName(pid, prop.getAttribute('name')), value, valueType });
  }
  return properties.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.id - b.id);
}

function parseCafXml(xml: string, unitMap: Record<number, string>, sourceName: string): ParsedCaf {
  const doc = new DOMParser().parseFromString(stripBom(xml), 'text/xml');
  const objectEls = doc.getElementsByTagName('object');

  const objects: CafObject[] = [];
  const references: ReferenceHit[] = [];
  const classCounts = new Map<number, number>();
  let controller: ParsedCaf['controller'] | null = null;

  for (let i = 0; i < objectEls.length; i++) {
    const el = objectEls[i] as any;
    const ref = el.getAttribute('ref') ?? '';
    const classid = parseInt(el.getAttribute('classid') ?? '0');
    const objectid = parseInt(el.getAttribute('objectid') ?? '0');
    const className = CLASS_NAMES[classid] ?? `Class${classid}`;

    // Extract properties
    let tag = '', description = '', shortTag = '', unitsId: number | null = null;
    let defaultValue: number | null = null;
    let bacoidType: number | null = null, bacoidInstance: number | null = null;
    let modelName = '', appVersion = '', ip: string | null = null;

    const propEls = el.getElementsByTagName('property');
    for (let j = 0; j < propEls.length; j++) {
      const prop = propEls[j] as any;
      // Only direct-child properties (not from nested objects)
      if (prop.parentNode !== el) continue;

      const pid = parseInt(prop.getAttribute('id') ?? '0');
      const dataEl = prop.getElementsByTagName('data')[0];
      if (!dataEl) continue;

      switch (pid) {
        case 28: description = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
        case 31: shortTag = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
        case 70: modelName = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
        case 12: appVersion = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
        case 117: {
          const e = dataEl.getElementsByTagName('enum')[0];
          if (e) unitsId = parseInt(e.textContent ?? '0');
          break;
        }
        case 2390: tag = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
        case 3113: {
          const f = dataEl.getElementsByTagName('float')[0];
          if (f) defaultValue = parseFloat(f.textContent ?? '0');
          break;
        }
        case 75: {
          const b = dataEl.getElementsByTagName('BACoid')[0];
          if (b) {
            bacoidType = parseInt(b.getAttribute('id') ?? '0');
            bacoidInstance = parseInt(b.textContent ?? '0');
          }
          break;
        }
        case 1135: {
          // IP address octets
          const bytes = dataEl.getElementsByTagName('unsignedByte');
          if (bytes.length === 4) {
            ip = [bytes[0], bytes[1], bytes[2], bytes[3]]
              .map(b => parseInt(b.textContent ?? '0')).join('.');
          }
          break;
        }
      }

      const attrName = resolvePropertyName(pid, prop.getAttribute('name'));
      references.push(...collectReferenceHitsFromNode(prop, {
        referringItem: ref,
        referringAttr: attrName,
        source: sourceName,
        sourcePath: sourceName,
        referringPath: `${ref}/${attrName}`,
      }));
    }
    const properties = collectProperties(propEls);

    classCounts.set(classid, (classCounts.get(classid) ?? 0) + 1);

    const parsed: CafObject = {
      ref, parentRef: getParentRef(ref),
      classid, className, objectid,
      tag, description, shortTag,
      units: unitsId !== null ? (unitMap[unitsId] ?? `unit${unitsId}`) : null,
      unitsId,
      defaultValue,
      bacoidType, bacoidInstance,
      properties,
    };
    objects.push(parsed);

    if (classid === 862 && !controller) {
      controller = { ref, modelName, appVersion, description, tag, objectId: objectid, ip };
    }
  }

  const stats = [...classCounts.entries()]
    .map(([classid, count]) => ({ classid, className: CLASS_NAMES[classid] ?? `Class${classid}`, count }))
    .sort((a, b) => b.count - a.count);

  return {
    controller: controller ?? { ref: '?', modelName: '?', appVersion: '?', description: '?', tag: '?', objectId: 0, ip: null },
    objects,
    references,
    stats,
  };
}

async function loadCaf(buffer: Buffer): Promise<ParsedCaf> {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find(e => e.entryName.endsWith('.xml'));
  if (!entry) throw new Error('No XML file found inside .caf');
  return parseCafXml(zip.readAsText(entry), await getUnitMap(), entry.entryName);
}

// POST /api/caf/upload — multipart file upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  try {
    const result = await loadCaf(req.file.buffer);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// GET /api/caf/parse?path=... — read from local filesystem path
router.get('/parse', async (req: Request, res: Response) => {
  const filePath = String(req.query.path ?? '');
  if (!filePath) { res.status(400).json({ error: 'path query param required' }); return; }
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File not found' }); return; }
  try {
    const result = await loadCaf(fs.readFileSync(filePath));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

export default router;
