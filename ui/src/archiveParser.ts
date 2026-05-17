import JSZip from 'jszip';
import { XMLSerializer } from '@xmldom/xmldom';
import type { ArchiveProperty, CafObject, DbexportObject, NavNode, ParsedCaf, ParsedDbexport, ReferenceHit } from '@oct/shared';
import { getPropertyName as resolvePropertyName } from '@oct/shared';
import { CLASS_NAMES, UNIT_LABELS } from './data/jciDictionary';

export interface GraphicResolver {
  resolve(svgFilename: string): Promise<string | null>;
}

export async function createResolverFromBytes(bytes: ArrayBuffer): Promise<GraphicResolver> {
  const zip = await new JSZip().loadAsync(bytes);
  return {
    async resolve(svgFilename: string): Promise<string | null> {
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const n = entry.name.replace(/\\/g, '/');
        if (n === svgFilename || n.endsWith(`/${svgFilename}`)) {
          return await entry.async('string');
        }
      }
      return null;
    },
  };
}

export type LoadedArchive =
  | { type: 'caf'; data: ParsedCaf; name: string }
  | { type: 'dbexport'; data: ParsedDbexport; name: string; graphicResolver?: GraphicResolver };

const REF_ATTR_RE = /\b(?:ref|reference|target|source|objectref|objectRef)\s*=\s*"([^"]+)"/gi;
const REF_TAG_RE = /<(?:ref|reference|target|source|objectref|objectRef)>([^<]+)<\/(?:ref|reference|target|source|objectref|objectRef)>/gi;
const REF_TOKEN_RE = /(?:[A-Za-z][A-Za-z0-9._-]*:)?[A-Za-z0-9_$-]+(?:[\/.][A-Za-z0-9_$-]+)+/g;
const XML_SERIALIZER = new XMLSerializer();

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

function formatPropertyValue(dataEl: Element): { value: string; valueType: string } {
  const children = Array.from(dataEl.children);
  if (children.length === 0) {
    const text = dataEl.textContent?.trim() ?? '';
    return { value: text, valueType: dataEl.tagName || 'text' };
  }

  const valueType = children.length === 1 ? children[0].tagName : 'compound';
  const parts = children.map(child => {
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

function collectProperties(propEls: ArrayLike<Element> | Iterable<Element>, classid: number): ArchiveProperty[] {
  const properties: ArchiveProperty[] = [];
  for (const prop of Array.from(propEls)) {
    const pid = parseInt(prop.getAttribute('id') ?? '0', 10) || 0;
    const dataEl = prop.getElementsByTagName('data')[0] ?? null;
    if (!dataEl) continue;
    const { value, valueType } = formatPropertyValue(dataEl);
    properties.push({
      id: pid,
      name: resolvePropertyName(pid, prop.getAttribute('name'), classid),
      value,
      valueType,
    });
  }
  return properties.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.id - b.id);
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

function looksLikeXml(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('<') && trimmed.includes('>');
}

function looksLikeBase64(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 64 || compact.length % 4 === 1) return false;
  return /^[A-Za-z0-9+/=]+$/.test(compact);
}

function decodeBase64(text: string): Uint8Array | null {
  try {
    const compact = text.replace(/\s+/g, '');
    const binary = atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function isZipBuffer(buffer: Uint8Array): boolean {
  return buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);
}

function buildContextPath(base: string, addition: string): string {
  if (!addition) return base;
  return base ? `${base}/${addition}` : addition;
}

function inferNodeSegment(node: any): string {
  const tag = String((node as Element | null)?.tagName ?? node.nodeName ?? 'node');
  if (tag === 'property') {
    const pid = (node as Element | null)?.getAttribute?.('id');
    return pid ? `property[${pid}]` : 'property';
  }
  if (tag === '#text' || tag === '#cdata-section') return tag;
  return tag;
}

async function collectTextPayloadHits(
  text: string,
  context: { referringItem: string; referringAttr: string; source: string; sourcePath: string; referringPath: string },
  pathSuffix: string,
  hits: ReferenceHit[],
  seen: Set<string>,
): Promise<void> {
  const refPath = buildContextPath(context.referringPath, pathSuffix);
  const sourcePath = buildContextPath(context.sourcePath, pathSuffix);
  const textKey = `${text.length}|${sourcePath}|${refPath}`;

  if (looksLikeXml(text)) {
    for (const hit of buildReferenceHits(text, context.referringItem, context.referringAttr, context.source, sourcePath, refPath)) {
      const key = `${hit.target}|${hit.referringItem}|${hit.referringAttr}|${hit.source}|${hit.sourcePath ?? ''}|${hit.referringPath ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.push(hit);
      }
    }
  }

  if (!looksLikeBase64(text)) return;

  const decoded = decodeBase64(text);
  if (!decoded || decoded.length === 0) return;

  if (isZipBuffer(decoded)) {
    try {
      const zip = await JSZip.loadAsync(decoded);
      for (const entry of Object.values(zip.files)) {
        const lower = entry.name.toLowerCase();
        if (!lower.endsWith('.xml') && !lower.endsWith('.txt') && !lower.endsWith('.json')) continue;
        const entryText = await entry.async('string');
        const entryPath = buildContextPath(pathSuffix, entry.name);
        for (const hit of buildReferenceHits(
          entryText,
          context.referringItem,
          context.referringAttr,
          `${context.source} :: ${entry.name}`,
          buildContextPath(context.sourcePath, entry.name),
          buildContextPath(context.referringPath, entryPath),
        )) {
          const key = `${hit.target}|${hit.referringItem}|${hit.referringAttr}|${hit.source}|${hit.sourcePath ?? ''}|${hit.referringPath ?? ''}`;
          if (!seen.has(key)) {
            seen.add(key);
            hits.push(hit);
          }
        }
      }
    } catch {
      // Ignore malformed nested archives.
    }
    return;
  }

  const decodedText = new TextDecoder('utf-8').decode(decoded);
  if (looksLikeXml(decodedText) || (textKey && decodedText.includes('<'))) {
    for (const hit of buildReferenceHits(
      decodedText,
      context.referringItem,
      context.referringAttr,
      `${context.source} :: decoded`,
      `${sourcePath}::decoded`,
      `${refPath}::decoded`,
    )) {
      const key = `${hit.target}|${hit.referringItem}|${hit.referringAttr}|${hit.source}|${hit.sourcePath ?? ''}|${hit.referringPath ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.push(hit);
      }
    }
  }
}

async function collectHitsFromNode(node: any, context: { referringItem: string; referringAttr: string; source: string; sourcePath: string; referringPath: string }): Promise<ReferenceHit[]> {
  const hits: ReferenceHit[] = [];
  const seen = new Set<string>();

  const xml = XML_SERIALIZER.serializeToString(node);
  for (const hit of buildReferenceHits(xml, context.referringItem, context.referringAttr, context.source, context.sourcePath, context.referringPath)) {
    const key = `${hit.target}|${hit.referringItem}|${hit.referringAttr}|${hit.source}|${hit.sourcePath ?? ''}|${hit.referringPath ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      hits.push(hit);
    }
  }

  const walk = async (current: any, pathParts: string[]): Promise<void> => {
    const nodeType = current.nodeType;
    if (nodeType === 3 || nodeType === 4) {
      const text = String(current.nodeValue ?? '').trim();
      if (text) await collectTextPayloadHits(text, context, pathParts.join('/'), hits, seen);
      return;
    }

    const nextParts = [...pathParts, inferNodeSegment(current)];
    const children = Array.from(current.childNodes ?? []);
    for (const child of children) await walk(child, nextParts);
  };

  await walk(node, []);
  return hits;
}

async function parseArchiveXml(xml: string, engineRef: string, sourceName: string): Promise<{ objects: DbexportObject[]; references: ReferenceHit[] }> {
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
    let bindingFileName: string | undefined;

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
        case 902: {
          // File Name — first <string> child inside the <struct> is the filename
          const fn = getTextContent(dataEl.getElementsByTagName('string')[0] ?? null);
          if (fn) bindingFileName = fn;
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

      const attrName = resolvePropertyName(pid, prop.getAttribute('name'), classid);
      references.push(...await collectHitsFromNode(prop, {
        referringItem: ref,
        referringAttr: attrName,
        source: sourceName,
        sourcePath: sourceName,
        referringPath: `${ref}/${attrName}`,
      }));
    }
    const properties = collectProperties(propEls, classid);

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
      properties,
      engineRef,
      bindingFileName,
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

function isZipArrayBuffer(buffer: ArrayBuffer): boolean {
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

// ─── Graphic binding JSON parser (mirrors server/src/routes/dbexport.ts) ──────
// Converts flat binding JSON keys of the form
//   "{svgElementId}${layerIndex}${bindingType}${equipmentContext}"
// into ReferenceHit entries so they enter the same reference graph as every
// other archive reference, enabling the Graphics tab and "Bound to Graphics"
// section in offline mode.

function parseGraphicBindings(
  json: string,
  bindingObjectRef: string,
  sourceFile: string,
  serverPrefix: string,
): ReferenceHit[] {
  let data: Record<string, string>;
  try { data = JSON.parse(json); } catch { return []; }

  const hits: ReferenceHit[] = [];
  const seen = new Set<string>();

  for (const [key, pointTag] of Object.entries(data)) {
    const parts = key.split('$');
    if (parts.length < 4) continue;
    const [svgElement, , bindingType, ...rest] = parts;
    const tag = pointTag.trim();
    if (!tag) continue;

    const context = rest.join('$').trim();
    let target: string;
    if (!context || context === 'null') {
      target = tag;
    } else if (context.startsWith('equipment.')) {
      const segments = context.replace(/^equipment\./, '').split('.').filter(Boolean);
      if (segments.length === 0) {
        target = tag;
      } else {
        const engineName = segments[0];
        const pathParts = segments.slice(1);
        const path = pathParts.length > 0 ? `${pathParts.join('.')}.${tag}` : tag;
        target = `${serverPrefix || 'ADS-1'}:${engineName}/${path}`;
      }
    } else {
      target = `${context}.${tag}`;
    }

    const hitKey = `${target}|${bindingObjectRef}|${bindingType}|${sourceFile}|${svgElement}`;
    if (seen.has(hitKey)) continue;
    seen.add(hitKey);
    hits.push({
      target,
      referringItem: bindingObjectRef,
      referringAttr: bindingType,
      source: sourceFile,
      sourcePath: sourceFile,
      referringPath: `${bindingObjectRef}/${svgElement}`,
    });
  }
  return hits;
}

export async function parseArchiveFile(file: File): Promise<LoadedArchive> {
  const name = file.name;
  const lower = name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (!isZipArrayBuffer(buffer)) {
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

        const attrName = resolvePropertyName(pid, prop.getAttribute('name'), classid);
      references.push(...await collectHitsFromNode(prop, {
          referringItem: ref,
          referringAttr: attrName,
          source: name,
          sourcePath: name,
          referringPath: `${ref}/${attrName}`,
        }));
      }
      const properties = collectProperties(propEls, classid);

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
        properties,
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

        const attrName = resolvePropertyName(pid, prop.getAttribute('name'), classid);
        references.push(...await collectHitsFromNode(prop, {
          referringItem: ref,
          referringAttr: attrName,
          source: entry.name,
          sourcePath: entry.name,
          referringPath: `${ref}/${attrName}`,
        }));
      }
      const properties = collectProperties(propEls, classid);

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
        properties,
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
      const parsed = await parseArchiveXml(await entry.async('string'), zipFolder, entry.name);
      objects.push(...parsed.objects);
      references.push(...parsed.references);

      // Load graphic binding JSON files for each class-357 (Graphic Binding) object
      // that has a bindingFileName extracted from property 902.
      const folder = zipFolder.replace(/\\/g, '/');
      for (const obj of parsed.objects) {
        if (obj.classid !== 357 || !obj.bindingFileName) continue;
        const bindingEntry = entries.find(e => {
          if (e.dir) return false;
          const n = e.name.replace(/\\/g, '/');
          return (
            n === `${folder}/${obj.bindingFileName}` ||
            n.endsWith(`/${obj.bindingFileName!}`) ||
            n === obj.bindingFileName
          );
        });
        if (!bindingEntry) continue;
        const serverPrefix = obj.ref.includes(':') ? obj.ref.split(':')[0] : 'ADS-1';
        references.push(
          ...parseGraphicBindings(
            await bindingEntry.async('string'),
            obj.ref,
            bindingEntry.name,
            serverPrefix,
          ),
        );
      }

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

    // Fallback: if no graphic objects came from archive.xml (e.g. a graphics-only
    // export that has no archive.xml), enumerate the hash-named SVG .json files
    // directly and synthesize class-844 objects for them.
    const hasGraphicObjects = objects.some(o => o.classid === 844 || o.classid === 717 || o.classid === 357);
    if (!hasGraphicObjects) {
      // Pattern: <folder>/<timestamp>-<hash>.json  (NOT -bindings.json or -metadata.json)
      const SVG_FILE_RE = /\d{8}-\d{6}-[\w]+\.json$/;
      const svgEntries = entries.filter(e => {
        if (e.dir) return false;
        const n = e.name.replace(/\\/g, '/');
        return SVG_FILE_RE.test(n) && !n.endsWith('-bindings.json') && !n.endsWith('-metadata.json');
      });

      const foldersSeen = new Set<string>();
      for (const entry of svgEntries) {
        const n = entry.name.replace(/\\/g, '/');
        const slash = n.lastIndexOf('/');
        const folder = slash >= 0 ? n.slice(0, slash) : '';
        const filename = slash >= 0 ? n.slice(slash + 1) : n;
        const hash = filename.replace(/\.json$/, '');
        const ref = `${folder}/$FacilityGraphics.${hash}`;
        const serverPrefix = folder.split('/')[0] || 'ADS-1';

        objects.push({
          ref,
          classid: 844,
          className: 'FacilityGraphic',
          objectid: 0,
          tag: '',
          description: hash,
          units: null, unitsId: null, defaultValue: null,
          bacoidType: null, bacoidInstance: null,
          createdAt: null, modifiedAt: null,
          properties: [],
          engineRef: folder,
          bindingFileName: filename,
        });

        // Parse the corresponding -bindings.json if present
        const bindingName = `${folder ? folder + '/' : ''}${hash}-bindings.json`;
        const bindingEntry = entries.find(e => e.name.replace(/\\/g, '/') === bindingName);
        if (bindingEntry) {
          references.push(...parseGraphicBindings(
            await bindingEntry.async('string'),
            ref,
            bindingName,
            serverPrefix,
          ));
        }

        if (!foldersSeen.has(folder)) {
          foldersSeen.add(folder);
          engines.push({ name: folder || 'Graphics', ref: folder, modelName: '', firmwareRevision: '', ip: null, objectCount: 0 });
        }
      }
      // Update objectCount now that we know how many per folder
      for (const engine of engines) {
        engine.objectCount = objects.filter(o => o.engineRef === engine.ref).length;
      }
    }

    const classCounts = new Map<number, number>();
    for (const obj of objects) classCounts.set(obj.classid, (classCounts.get(obj.classid) ?? 0) + 1);
    const stats = [...classCounts.entries()]
      .map(([classid, count]) => ({ classid, className: makeClassName(classid), count }))
      .sort((a, b) => b.count - a.count);

    // Closure over the live JSZip instance so the Graphics tab can render SVG
    // content on demand without re-uploading. The function is intentionally
    // non-serializable — IndexedDB drops it on save, and the UI shows a graceful
    // fallback ("re-upload to render") when the archive is restored from cache.
    const zipRef = zip;
    const graphicResolver: GraphicResolver = {
      async resolve(svgFilename: string): Promise<string | null> {
        for (const entry of Object.values(zipRef.files)) {
          if (entry.dir) continue;
          const n = entry.name.replace(/\\/g, '/');
          if (n === svgFilename || n.endsWith(`/${svgFilename}`)) {
            return await entry.async('string');
          }
        }
        return null;
      },
    };

    return {
      type: 'dbexport',
      name,
      data: { site, engines, objects, references, stats },
      graphicResolver,
    };
  }

  throw new Error('Unsupported file type. Drop a .caf or .dbexport file.');
}
