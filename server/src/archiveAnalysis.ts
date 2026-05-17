import { XMLSerializer } from '@xmldom/xmldom';
import type { ReferenceHit } from '@oct/shared';

const REF_ATTR_RE = /\b(?:ref|reference|target|source|objectref|objectRef)\s*=\s*"([^"]+)"/gi;
const REF_TAG_RE = /<(?:ref|reference|target|source|objectref|objectRef)>([^<]+)<\/(?:ref|reference|target|source|objectref|objectRef)>/gi;
const REF_TOKEN_RE = /(?:[A-Za-z][A-Za-z0-9._-]*:)?[A-Za-z0-9_$-]+(?:[\/.][A-Za-z0-9_$-]+)+/g;
const XML_SERIALIZER = new XMLSerializer();

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

export function serializeNode(node: unknown): string {
  try {
    return XML_SERIALIZER.serializeToString(node as any);
  } catch {
    return '';
  }
}
