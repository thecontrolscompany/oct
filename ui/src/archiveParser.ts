import JSZip from 'jszip';
import type { CafObject, DbexportObject, NavNode, ParsedCaf, ParsedDbexport, ReferenceHit } from '@oct/shared';
import { CLASS_NAMES, UNIT_LABELS } from './data/jciDictionary';

export type LoadedArchive =
  | { type: 'caf'; data: ParsedCaf; name: string }
  | { type: 'dbexport'; data: ParsedDbexport; name: string };

const REF_ATTR_RE = /\b(?:ref|reference|target|source|objectref|objectRef)\s*=\s*"([^"]+)"/gi;
const REF_TAG_RE = /<(?:ref|reference|target|source|objectref|objectRef)>([^<]+)<\/(?:ref|reference|target|source|objectref|objectRef)>/gi;
const REF_TOKEN_RE = /(?:[A-Za-z][A-Za-z0-9._-]*:)?[A-Za-z0-9_$-]+(?:[\/.][A-Za-z0-9_$-]+)+/g;

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function getTextContent(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

function getParentRef(ref: string): string | null {
  const lastSlash = ref.lastIndexOf('/');
  const lastDot = ref.lastIndexOf('.');
  const lastSep = Math.max(lastSlash, lastDot);
  if (lastSep <= 0) return null;
  return ref.substring(0, lastSep);
}

function makeClassName(classid: number): string {
  return CLASS_NAMES[classid] ?? `Class${classid}`;
}

function makeUnitLabel(unitId: number | null): string | null {
  if (unitId === null) return null;
  return UNIT_LABELS[unitId] ?? `unit${unitId}`;
}

function getOptionalAttr(el: Element, names: string[]): string | null {
  for (const name of names) {
    const value = el.getAttribute(name);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function buildReferenceHits(xml: string, referringItem: string, referringAttr: string, source: string, sourcePath = source, referringPath = referringItem): ReferenceHit[] {
  const hits: ReferenceHit[] = [];
  const seen = new Set<string>();
  const push = (candidate: string) => {
    const target = candidate.trim().replace(/[\s,;.)\]]+$/, '');
    if (!target) return;
    if (!target.includes('/') && !target.includes(':') && !target.startsWith('$')) return;
    const key = `${target}|${referringItem}|${referringAttr}|${source}|${sourcePath}|${referringPath}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ target, referringItem, referringAttr, source, sourcePath, referringPath });
  };

  let match: RegExpExecArray | null;
  REF_ATTR_RE.lastIndex = 0;
  while ((match = REF_ATTR_RE.exec(xml)) !== null) push(match[1]);
  REF_TAG_RE.lastIndex = 0;
  while ((match = REF_TAG_RE.exec(xml)) !== null) push(match[1]);
  REF_TOKEN_RE.lastIndex = 0;
  while ((match = REF_TOKEN_RE.exec(xml)) !== null) push(match[0]);
  return hits;
}

function collectHitsFromNode(node: Node, context: { referringItem: string; referringAttr: string; source: string; sourcePath: string; referringPath: string }): ReferenceHit[] {
  const hits: ReferenceHit[] = [];
  const seen = new Set<string>();
  const serializer = new XMLSerializer();

  const xml = serializer.serializeToString(node);
  for (const hit of buildReferenceHits(xml, context.referringItem, context.referringAttr, context.source, context.sourcePath, context.referringPath)) {
    const key = `${hit.target}|${hit.referringItem}|${hit.referringAttr}|${hit.source}|${hit.sourcePath ?? ''}|${hit.referringPath ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      hits.push(hit);
    }
  }
  return hits;
}

function parseArchiveXml(xml: string, engineRef: string, sourceName: string): { objects: DbexportObject[]; references: ReferenceHit[] } {
  const doc = new DOMParser().parseFromString(stripBom(xml), 'text/xml');
  const objectEls = Array.from(doc.getElementsByTagName('object'));
  const objects: DbexportObject[] = [];
  const references: ReferenceHit[] = [];

  for (const el of objectEls) {
    const ref = el.getAttribute('ref') ?? '';
    const classid = parseInt(el.getAttribute('classid') ?? '0', 10) || 0;
    const objectid = parseInt(el.getAttribute('objectid') ?? '0', 10) || 0;
    const createdAt = getOptionalAttr(el, ['created', 'createdAt', 'creationTime', 'creationDate']);
    const modifiedAt = getOptionalAttr(el, ['modified', 'modifiedAt', 'lastModified', 'updated', 'timestamp']);

    let tag = '';
    let description = '';
    let unitsId: number | null = null;
    let defaultValue: number | null = null;
    let bacoidType: number | null = null;
    let bacoidInstance: number | null = null;

    const propEls = Array.from(el.getElementsByTagName('property'));
    for (const prop of propEls) {
      if (prop.parentNode !== el) continue;
      const pid = parseInt(prop.getAttribute('id') ?? '0', 10);
      const dataEl = prop.getElementsByTagName('data')[0] ?? null;
      if (!dataEl) continue;

      switch (pid) {
        case 28:
          description = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null);
          break;
        case 117: {
          const e = dataEl.getElementsByTagName('enum')[0];
          if (e) unitsId = parseInt(e.textContent ?? '0', 10);
          break;
        }
        case 2390:
          tag = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null);
          break;
        case 3113: {
          const f = dataEl.getElementsByTagName('float')[0];
          if (f) defaultValue = parseFloat(f.textContent ?? '0');
          break;
        }
        case 75: {
          const b = dataEl.getElementsByTagName('BACoid')[0];
          if (b) {
            bacoidType = parseInt(b.getAttribute('id') ?? '0', 10);
            bacoidInstance = parseInt(b.textContent ?? '0', 10);
          }
          break;
        }
      }

      const attrName = `Property ${pid}`;
      references.push(...collectHitsFromNode(prop, {
        referringItem: ref,
        referringAttr: attrName,
        source: sourceName,
        sourcePath: sourceName,
        referringPath: `${ref}/${attrName}`,
      }));
    }

    objects.push({
      ref,
      classid,
      className: makeClassName(classid),
      objectid,
      tag,
      description,
      units: makeUnitLabel(unitsId),
      unitsId,
      defaultValue,
      bacoidType,
      bacoidInstance,
      createdAt,
      modifiedAt,
      engineRef,
    });
  }

  return { objects, references };
}

function parseNavNode(el: Element): NavNode {
  const label = el.getAttribute('label') ?? el.getAttribute('name') ?? '';
  const reference = el.getAttribute('reference') ?? el.getAttribute('ref') ?? '';
  const classid = parseInt(el.getAttribute('classid') ?? el.getAttribute('typeId') ?? '0', 10) || 0;
  const children: NavNode[] = [];

  for (const child of Array.from(el.childNodes)) {
    const tagName = (child as Element).tagName;
    if (tagName === 'node' || tagName === 'item' || tagName === 'site') {
      children.push(parseNavNode(child as Element));
    }
  }

  return { label, reference, classid, className: makeClassName(classid), children };
}

function parseNavTree(xml: string): NavNode | null {
  const doc = new DOMParser().parseFromString(stripBom(xml), 'text/xml');
  const root = doc.documentElement;
  if (!root) return null;

  for (const child of Array.from(root.childNodes)) {
    const el = child as Element;
    if (el.tagName === 'node' || el.tagName === 'item' || el.tagName === 'site') {
      return parseNavNode(el);
    }
  }

  if (root.getAttribute('label') || root.getAttribute('name')) {
    return parseNavNode(root);
  }
  return null;
}

async function loadZip(file: File): Promise<JSZip> {
  const zip = new JSZip();
  const buffer = await file.arrayBuffer();
  return zip.loadAsync(buffer);
}

async function loadText(file: File): Promise<string> {
  return file.text();
}

function isZipBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
}

function parseXmlDocument(xml: string): Document {
  const doc = new DOMParser().parseFromString(stripBom(xml), 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid XML document');
  }
  return doc;
}

export async function parseArchiveFile(file: File): Promise<LoadedArchive> {
  const name = file.name;
  const lower = name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (!isZipBuffer(buffer)) {
    const text = await loadText(file);
    if (!text.trim()) throw new Error('File is empty.');
    if (!lower.endsWith('.caf')) {
      throw new Error('Offline .dbexport loading expects a zipped archive.');
    }
    const doc = parseXmlDocument(text);
    const objectEls = Array.from(doc.getElementsByTagName('object'));
    if (objectEls.length === 0) {
      throw new Error('No archive objects found inside CAF XML.');
    }

    const objects: CafObject[] = [];
    const references: ReferenceHit[] = [];
    const classCounts = new Map<number, number>();
    let controller: ParsedCaf['controller'] | null = null;

    for (const el of objectEls) {
      const ref = el.getAttribute('ref') ?? '';
      const classid = parseInt(el.getAttribute('classid') ?? '0', 10) || 0;
      const objectid = parseInt(el.getAttribute('objectid') ?? '0', 10) || 0;
      const createdAt = getOptionalAttr(el, ['created', 'createdAt', 'creationTime', 'creationDate']);
      const modifiedAt = getOptionalAttr(el, ['modified', 'modifiedAt', 'lastModified', 'updated', 'timestamp']);

      let tag = '';
      let description = '';
      let shortTag = '';
      let unitsId: number | null = null;
      let defaultValue: number | null = null;
      let bacoidType: number | null = null;
      let bacoidInstance: number | null = null;
      let modelName = '';
      let appVersion = '';
      let ip: string | null = null;

      const propEls = Array.from(el.getElementsByTagName('property'));
      for (const prop of propEls) {
        if (prop.parentNode !== el) continue;
        const pid = parseInt(prop.getAttribute('id') ?? '0', 10);
        const dataEl = prop.getElementsByTagName('data')[0] ?? null;
        if (!dataEl) continue;

        switch (pid) {
          case 28: description = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
          case 31: shortTag = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
          case 70: modelName = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
          case 12: appVersion = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
          case 117: {
            const e = dataEl.getElementsByTagName('enum')[0];
            if (e) unitsId = parseInt(e.textContent ?? '0', 10);
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
              bacoidType = parseInt(b.getAttribute('id') ?? '0', 10);
              bacoidInstance = parseInt(b.textContent ?? '0', 10);
            }
            break;
          }
          case 1135: {
            const bytes = Array.from(dataEl.getElementsByTagName('unsignedByte'));
            if (bytes.length === 4) {
              ip = bytes.map(b => parseInt(b.textContent ?? '0', 10)).join('.');
            }
            break;
          }
        }

        const attrName = `Property ${pid}`;
        references.push(...collectHitsFromNode(prop, {
          referringItem: ref,
          referringAttr: attrName,
          source: name,
          sourcePath: name,
          referringPath: `${ref}/${attrName}`,
        }));
      }

      classCounts.set(classid, (classCounts.get(classid) ?? 0) + 1);
      objects.push({
        ref,
        parentRef: getParentRef(ref),
        classid,
        className: makeClassName(classid),
        objectid,
        tag,
        description,
        shortTag,
        units: makeUnitLabel(unitsId),
        unitsId,
        defaultValue,
        bacoidType,
        bacoidInstance,
        createdAt,
        modifiedAt,
      });

      if (classid === 862 && !controller) {
        controller = { ref, modelName, appVersion, description, tag, objectId: objectid, ip };
      }
    }

    const stats = [...classCounts.entries()]
      .map(([classid, count]) => ({ classid, className: makeClassName(classid), count }))
      .sort((a, b) => b.count - a.count);

    return {
      type: 'caf',
      name,
      data: {
        controller: controller ?? { ref: '?', modelName: '?', appVersion: '?', description: '?', tag: '?', objectId: 0, ip: null },
        objects,
        references,
        stats,
      },
    };
  }

  const zip = await loadZip(file);
  const entries = Object.values(zip.files);

  if (lower.endsWith('.caf')) {
    const entry = entries.find(e => !e.dir && e.name.toLowerCase().endsWith('.caf.xml'))
      ?? entries.find(e => !e.dir && e.name.toLowerCase().endsWith('.xml'));
    if (!entry) throw new Error('No XML file found inside .caf');
    const xml = await entry.async('string');
    const doc = new DOMParser().parseFromString(stripBom(xml), 'text/xml');
    const objectEls = Array.from(doc.getElementsByTagName('object'));

    const objects: CafObject[] = [];
    const references: ReferenceHit[] = [];
    const classCounts = new Map<number, number>();
    let controller: ParsedCaf['controller'] | null = null;

    for (const el of objectEls) {
      const ref = el.getAttribute('ref') ?? '';
      const classid = parseInt(el.getAttribute('classid') ?? '0', 10) || 0;
      const objectid = parseInt(el.getAttribute('objectid') ?? '0', 10) || 0;

      let tag = '';
      let description = '';
      let shortTag = '';
      let unitsId: number | null = null;
      let defaultValue: number | null = null;
      let bacoidType: number | null = null;
      let bacoidInstance: number | null = null;
      let modelName = '';
      let appVersion = '';
      let ip: string | null = null;

      const propEls = Array.from(el.getElementsByTagName('property'));
      for (const prop of propEls) {
        if (prop.parentNode !== el) continue;
        const pid = parseInt(prop.getAttribute('id') ?? '0', 10);
        const dataEl = prop.getElementsByTagName('data')[0] ?? null;
        if (!dataEl) continue;

        switch (pid) {
          case 28: description = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
          case 31: shortTag = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
          case 70: modelName = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
          case 12: appVersion = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null); break;
          case 117: {
            const e = dataEl.getElementsByTagName('enum')[0];
            if (e) unitsId = parseInt(e.textContent ?? '0', 10);
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
              bacoidType = parseInt(b.getAttribute('id') ?? '0', 10);
              bacoidInstance = parseInt(b.textContent ?? '0', 10);
            }
            break;
          }
          case 1135: {
            const bytes = Array.from(dataEl.getElementsByTagName('unsignedByte'));
            if (bytes.length === 4) {
              ip = bytes.map(b => parseInt(b.textContent ?? '0', 10)).join('.');
            }
            break;
          }
        }

        const attrName = `Property ${pid}`;
        references.push(...collectHitsFromNode(prop, {
          referringItem: ref,
          referringAttr: attrName,
          source: entry.name,
          sourcePath: entry.name,
          referringPath: `${ref}/${attrName}`,
        }));
      }

      classCounts.set(classid, (classCounts.get(classid) ?? 0) + 1);
      const parsed: CafObject = {
        ref,
        parentRef: getParentRef(ref),
        classid,
        className: makeClassName(classid),
        objectid,
        tag,
        description,
        shortTag,
        units: makeUnitLabel(unitsId),
        unitsId,
        defaultValue,
        bacoidType,
        bacoidInstance,
      };
      objects.push(parsed);

      if (classid === 862 && !controller) {
        controller = { ref, modelName, appVersion, description, tag, objectId: objectid, ip };
      }
    }

    const stats = [...classCounts.entries()]
      .map(([classid, count]) => ({ classid, className: makeClassName(classid), count }))
      .sort((a, b) => b.count - a.count);

    return {
      type: 'caf',
      name,
      data: {
        controller: controller ?? { ref: '?', modelName: '?', appVersion: '?', description: '?', tag: '?', objectId: 0, ip: null },
        objects,
        references,
        stats,
      },
    };
  }

  if (lower.endsWith('.dbexport')) {
    const navEntry = entries.find(e =>
      !e.dir && (
        e.name.toLowerCase().includes('navtree') ||
        e.name.toLowerCase().includes('nav_tree') ||
        e.name.toLowerCase() === 'navtree.xml'
      )
    );
    const site = navEntry ? parseNavTree(await navEntry.async('string')) : null;

    const archiveEntries = entries.filter(e =>
      !e.dir && (
        e.name.toLowerCase().endsWith('archive.xml') ||
        e.name.toLowerCase().endsWith('archiveobjects.xml')
      )
    );

    const objects: DbexportObject[] = [];
    const references: ReferenceHit[] = [];
    const engines: ParsedDbexport['engines'] = [];

    for (const entry of archiveEntries) {
      const zipFolder = entry.name.replace(/[/\\][^/\\]+$/, '');
      const parsed = parseArchiveXml(await entry.async('string'), zipFolder, entry.name);
      objects.push(...parsed.objects);
      references.push(...parsed.references);

      const deepRef = parsed.objects.find(o => o.ref.includes('/') && o.ref.includes(':'))?.ref ?? '';
      const properEngineRef = deepRef ? deepRef.split('/')[0] : zipFolder;
      const deviceObj = parsed.objects.find(o => o.bacoidType === 8 || o.classid === 862);
      const engineLabel = deviceObj?.tag || deviceObj?.description || properEngineRef.split(':')[1] || properEngineRef;

      engines.push({
        name: engineLabel,
        ref: properEngineRef,
        modelName: '',
        firmwareRevision: '',
        ip: null,
        objectCount: parsed.objects.length,
      });
    }

    const classCounts = new Map<number, number>();
    for (const obj of objects) classCounts.set(obj.classid, (classCounts.get(obj.classid) ?? 0) + 1);
    const stats = [...classCounts.entries()]
      .map(([classid, count]) => ({ classid, className: makeClassName(classid), count }))
      .sort((a, b) => b.count - a.count);

    return {
      type: 'dbexport',
      name,
      data: { site, engines, objects, references, stats },
    };
  }

  throw new Error('Unsupported file type. Drop a .caf or .dbexport file.');
}
