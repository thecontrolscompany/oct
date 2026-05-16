import { Router, Request, Response } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import fs from 'fs';
import { CLASS_NAMES, getUnitMap, stripBom } from './jciDictionary';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export interface ParsedCaf {
  controller: {
    ref: string;
    modelName: string;
    appVersion: string;
    description: string;
    tag: string;
    objectId: number;
    ip: string | null;
  };
  objects: ParsedObject[];
  stats: Array<{ className: string; classid: number; count: number }>;
}

export interface ParsedObject {
  ref: string;
  parentRef: string | null;
  classid: number;
  className: string;
  objectid: number;
  tag: string;
  description: string;
  shortTag: string;
  units: string | null;
  unitsId: number | null;
  defaultValue: number | null;
  bacoidType: number | null;
  bacoidInstance: number | null;
}

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

function parseCafXml(xml: string, unitMap: Record<number, string>): ParsedCaf {
  const doc = new DOMParser().parseFromString(stripBom(xml), 'text/xml');
  const objectEls = doc.getElementsByTagName('object');

  const objects: ParsedObject[] = [];
  const classCounts = new Map<number, number>();
  let controller: ParsedCaf['controller'] | null = null;

  for (let i = 0; i < objectEls.length; i++) {
    const el = objectEls[i];
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
      const prop = propEls[j];
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
    }

    classCounts.set(classid, (classCounts.get(classid) ?? 0) + 1);

    const parsed: ParsedObject = {
      ref, parentRef: getParentRef(ref),
      classid, className, objectid,
      tag, description, shortTag,
      units: unitsId !== null ? (unitMap[unitsId] ?? `unit${unitsId}`) : null,
      unitsId,
      defaultValue,
      bacoidType, bacoidInstance,
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
    stats,
  };
}

async function loadCaf(buffer: Buffer): Promise<ParsedCaf> {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find(e => e.entryName.endsWith('.xml'));
  if (!entry) throw new Error('No XML file found inside .caf');
  return parseCafXml(zip.readAsText(entry), await getUnitMap());
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
