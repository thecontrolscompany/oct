import AdmZip from 'adm-zip';
import { XMLSerializer } from '@xmldom/xmldom';
import type { ReferenceHit } from '@oct/shared';

const REF_ATTR_RE = /\b(?:ref|reference|target|source|objectref|objectRef)\s*=\s*"([^"]+)"/gi;
const REF_TAG_RE = /<(?:ref|reference|target|source|objectref|objectRef)>([^<]+)<\/(?:ref|reference|target|source|objectref|objectRef)>/gi;
const REF_TOKEN_RE = /(?:[A-Za-z][A-Za-z0-9._-]*:)?[A-Za-z0-9_$-]+(?:[\/.][A-Za-z0-9_$-]+)+/g;
const XML_SERIALIZER = new XMLSerializer();

export interface ReferenceScanContext {
  referringItem: string;
  referringAttr: string;
  source: string;
  sourcePath?: string;
  referringPath?: string;
}

function normalizeCandidate(raw: string): string | null {
  const trimmed = raw.trim().replace(/[\s,;.)\]]+$/, '');
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) return null;
  if (!trimmed.includes('/') && !trimmed.includes(':') && !trimmed.startsWith('$')) return null;
  return trimmed;
}

export function collectReferenceHits(
  xml: string,
  referringItem: string,
  referringAttr: string,
  source: string,
  sourcePath = source,
  referringPath = referringItem,
): ReferenceHit[] {
  const hits: ReferenceHit[] = [];
  const seen = new Set<string>();

  const push = (candidate: string) => {
    const target = normalizeCandidate(candidate);
    if (!target) return;
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

function decodeBase64(text: string): Buffer | null {
  try {
    const compact = text.replace(/\s+/g, '');
    return Buffer.from(compact, 'base64');
  } catch {
    return null;
  }
}

function isZipBuffer(buffer: Buffer): boolean {
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
  const tag = String(node?.tagName ?? node?.nodeName ?? 'node');
  if (tag === 'property') {
    const pid = node?.getAttribute?.('id');
    return pid ? `property[${pid}]` : 'property';
  }
  if (tag === '#text' || tag === '#cdata-section') return tag;
  return tag;
}

function collectTextPayloadHits(
  text: string,
  context: ReferenceScanContext,
  pathSuffix: string,
  hits: ReferenceHit[],
  seen: Set<string>,
): void {
  const refPath = buildContextPath(context.referringPath ?? context.referringItem, pathSuffix);
  const sourcePath = buildContextPath(context.sourcePath ?? context.source, pathSuffix);
  const textKey = `${text.length}|${sourcePath}|${refPath}`;

  if (looksLikeXml(text)) {
    for (const hit of collectReferenceHits(
      text,
      context.referringItem,
      context.referringAttr,
      context.source,
      sourcePath,
      refPath,
    )) {
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
      const zip = new AdmZip(decoded);
      for (const entry of zip.getEntries()) {
        const lower = entry.entryName.toLowerCase();
        if (!lower.endsWith('.xml') && !lower.endsWith('.txt') && !lower.endsWith('.json')) continue;
        const entryText = zip.readAsText(entry);
        const entryPath = buildContextPath(pathSuffix, entry.entryName);
        for (const hit of collectReferenceHits(
          entryText,
          context.referringItem,
          context.referringAttr,
          `${context.source} :: ${entry.entryName}`,
          buildContextPath(context.sourcePath ?? context.source, entry.entryName),
          buildContextPath(context.referringPath ?? context.referringItem, entryPath),
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

  const decodedText = decoded.toString('utf8');
  if (looksLikeXml(decodedText)) {
    for (const hit of collectReferenceHits(
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
  } else if (textKey && decodedText.includes('<')) {
    for (const hit of collectReferenceHits(
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

export function collectReferenceHitsFromNode(node: unknown, context: ReferenceScanContext): ReferenceHit[] {
  const hits: ReferenceHit[] = [];
  const seen = new Set<string>();

  const xml = serializeNode(node);
  if (xml) {
    for (const hit of collectReferenceHits(
      xml,
      context.referringItem,
      context.referringAttr,
      context.source,
      context.sourcePath ?? context.source,
      context.referringPath ?? context.referringItem,
    )) {
      const key = `${hit.target}|${hit.referringItem}|${hit.referringAttr}|${hit.source}|${hit.sourcePath ?? ''}|${hit.referringPath ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.push(hit);
      }
    }
  }

  const walk = (current: any, pathParts: string[]) => {
    if (!current) return;
    const nodeType = current.nodeType;
    if (nodeType === 3 || nodeType === 4) {
      const text = String(current.nodeValue ?? '').trim();
      if (text) collectTextPayloadHits(text, context, pathParts.join('/'), hits, seen);
      return;
    }

    const nextParts = [...pathParts, inferNodeSegment(current)];
    const children = current.childNodes ? Array.from(current.childNodes) : [];
    for (const child of children) walk(child, nextParts);
  };

  walk(node as any, []);
  return hits;
}

export function serializeNode(node: unknown): string {
  try {
    return XML_SERIALIZER.serializeToString(node as any);
  } catch {
    return '';
  }
}
