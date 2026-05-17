import { Router, Request, Response } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import fs from 'fs';
import type { DbexportObject, EngineInfo, NavNode, ParsedDbexport, ReferenceHit } from '@oct/shared';
import { CLASS_NAMES, getUnitMap, stripBom } from './jciDictionary';
import { collectReferenceHits, serializeNode } from '../archiveAnalysis';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// ─── Nav tree parser ────────────────────────────────────────────────────────

function parseNavNode(el: any): NavNode {
  const label = el.getAttribute('label') ?? el.getAttribute('name') ?? '';
  const reference = el.getAttribute('reference') ?? el.getAttribute('ref') ?? '';
  const classid = parseInt(el.getAttribute('classid') ?? el.getAttribute('typeId') ?? '0') || 0;
  const children: NavNode[] = [];

  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i] as any;
    if (child.tagName === 'node' || child.tagName === 'item') {
      children.push(parseNavNode(child));
    }
  }

  return { label, reference, classid, className: CLASS_NAMES[classid] ?? `Class${classid}`, children };
}

function parseNavTree(xml: string): NavNode | null {
  const doc = new DOMParser().parseFromString(stripBom(xml), 'text/xml');
  // Root element varies: <nodeTree>, <navtree>, <tree> — just take first child node/item
  const root = doc.documentElement;
  if (!root) return null;

  // Try to find the first meaningful node child
  for (let i = 0; i < root.childNodes.length; i++) {
    const child = root.childNodes[i] as any;
    if (child.tagName === 'node' || child.tagName === 'item' || child.tagName === 'site') {
      return parseNavNode(child);
    }
  }
  // If the root itself looks like a node tree, parse it
  if (root.getAttribute('label') || root.getAttribute('name')) {
    return parseNavNode(root);
  }
  return null;
}

// ─── Archive object parser (same structure as .caf) ─────────────────────────

function getTextContent(el: { textContent?: string | null } | null): string {
  return el?.textContent?.trim() ?? '';
}

function parseArchiveXml(xml: string, unitMap: Record<number, string>, engineRef: string, sourceName: string): { objects: DbexportObject[]; references: ReferenceHit[] } {
  const doc = new DOMParser().parseFromString(stripBom(xml), 'text/xml');
  const objectEls = doc.getElementsByTagName('object');
  const objects: DbexportObject[] = [];
  const references: ReferenceHit[] = [];

  for (let i = 0; i < objectEls.length; i++) {
    const el = objectEls[i] as any;
    const ref = el.getAttribute('ref') ?? '';
    const classid = parseInt(el.getAttribute('classid') ?? '0') || 0;
    const objectid = parseInt(el.getAttribute('objectid') ?? '0') || 0;

    let tag = '', description = '', unitsId: number | null = null;
    let defaultValue: number | null = null;
    let bacoidType: number | null = null, bacoidInstance: number | null = null;

    const propEls = el.getElementsByTagName('property');
    for (let j = 0; j < propEls.length; j++) {
      const prop = propEls[j] as any;
      if (prop.parentNode !== el) continue;
      const pid = parseInt(prop.getAttribute('id') ?? '0');
      const dataEl = prop.getElementsByTagName('data')[0];
      if (!dataEl) continue;

      switch (pid) {
        case 28: description = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
        case 117: { const e = dataEl.getElementsByTagName('enum')[0]; if (e) unitsId = parseInt(e.textContent ?? '0'); break; }
        case 2390: tag = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
        case 3113: { const f = dataEl.getElementsByTagName('float')[0]; if (f) defaultValue = parseFloat(f.textContent ?? '0'); break; }
        case 75: {
          const b = dataEl.getElementsByTagName('BACoid')[0];
          if (b) { bacoidType = parseInt(b.getAttribute('id') ?? '0'); bacoidInstance = parseInt(b.textContent ?? '0'); }
          break;
        }
      }

      const propXml = serializeNode(prop);
      if (propXml) {
        const attrName = `Property ${pid}`;
        references.push(...collectReferenceHits(propXml, ref, attrName, sourceName));
      }
    }

    objects.push({
      ref, classid, className: CLASS_NAMES[classid] ?? `Class${classid}`, objectid,
      tag, description,
      units: unitsId !== null ? (unitMap[unitsId] ?? `unit${unitsId}`) : null,
      unitsId, defaultValue, bacoidType, bacoidInstance,
      engineRef,
    });
  }
  return { objects, references };
}

// ─── Main parser ─────────────────────────────────────────────────────────────

async function loadDbexport(buffer: Buffer): Promise<ParsedDbexport> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const unitMap = await getUnitMap();

  // Find navtree
  const navEntry = entries.find(e =>
    e.entryName.toLowerCase().includes('navtree') ||
    e.entryName.toLowerCase().includes('nav_tree') ||
    e.entryName === 'navtree.xml'
  );
  const site = navEntry ? parseNavTree(zip.readAsText(navEntry)) : null;

  // Find all archive.xml files (one per engine folder)
  const archiveEntries = entries.filter(e =>
    e.entryName.toLowerCase().endsWith('archive.xml') ||
    e.entryName.toLowerCase().endsWith('archiveobjects.xml')
  );

  const allObjects: DbexportObject[] = [];
  const references: ReferenceHit[] = [];
  const engines: EngineInfo[] = [];

  for (const entry of archiveEntries) {
    // Use zip folder as a temporary key; real ref is derived from object refs below
    const zipFolder = entry.entryName.replace(/[/\\][^/\\]+$/, '');
    const parsed = parseArchiveXml(zip.readAsText(entry), unitMap, zipFolder, entry.entryName);
    const objects = parsed.objects;
    allObjects.push(...objects);
    references.push(...parsed.references);

    // Derive proper Metasys ref (server:engine) from object refs.
    // Zip folder names concatenate server+engine with no separator (e.g. "ADS-1NAE-18"),
    // but object refs use colon notation (e.g. "ADS-1:NAE-18/FC-1.CHWS.CLG-O").
    // Find the first object ref that contains both '/' and ':' — that's a deep object with a proper prefix.
    const deepRef = objects.find(o => o.ref.includes('/') && o.ref.includes(':'))?.ref ?? '';
    const properEngineRef = deepRef ? deepRef.split('/')[0] : zipFolder;

    // Update all objects to use the proper ref prefix
    if (properEngineRef !== zipFolder) {
      for (const o of objects) {
        if (o.engineRef === zipFolder) o.engineRef = properEngineRef;
      }
    }

    // Find device object for engine name (bacoidType=8 = BACnet Device)
    const deviceObj = objects.find(o => o.bacoidType === 8 || o.classid === 862);
    const engineLabel = deviceObj?.tag || deviceObj?.description || properEngineRef.split(':')[1] || properEngineRef;

    engines.push({
      name: engineLabel,
      ref: properEngineRef,
      modelName: '',
      firmwareRevision: '',
      ip: null,
      objectCount: objects.length,
    });
  }

  // Stats
  const classCounts = new Map<number, number>();
  for (const o of allObjects) classCounts.set(o.classid, (classCounts.get(o.classid) ?? 0) + 1);
  const stats = [...classCounts.entries()]
    .map(([classid, count]) => ({ classid, className: CLASS_NAMES[classid] ?? `Class${classid}`, count }))
    .sort((a, b) => b.count - a.count);

  return { site, engines, objects: allObjects, references, stats };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  try {
    res.json(await loadDbexport(req.file.buffer));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

router.get('/parse', async (req: Request, res: Response) => {
  const filePath = String(req.query.path ?? '');
  if (!filePath) { res.status(400).json({ error: 'path required' }); return; }
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File not found' }); return; }
  try {
    res.json(await loadDbexport(fs.readFileSync(filePath)));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

export default router;
