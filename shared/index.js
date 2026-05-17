"use strict";

const { PropertyIdentifier = {} } = require('bacstack/lib/enum');

const GENERIC_PROPERTY_RE = /^property\s*\d+$/i;
const PROPERTY_NAMES = buildPropertyNameMap();

function buildReferenceMap(references) {
  return buildReferenceIndex(references).byTarget;
}

function buildReferenceIndex(references) {
  const byTarget = new Map();
  const counts = new Map();
  let totalHits = 0;

  for (const hit of references || []) {
    const key = hit.target;
    const list = byTarget.get(key);
    if (list) list.push(hit);
    else byTarget.set(key, [hit]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    totalHits += 1;
  }

  return {
    byTarget,
    counts,
    totalHits,
  };
}

function buildPropertyNameMap() {
  const names = {};
  for (const [name, id] of Object.entries(PropertyIdentifier)) {
    if (typeof id !== 'number') continue;
    if (!names[id]) names[id] = humanizeEnumName(name);
  }
  return names;
}

function humanizeEnumName(name) {
  return String(name)
    .split('_')
    .filter(Boolean)
    .map(part => {
      const upper = part.toUpperCase();
      if (upper === 'IP') return 'IP';
      if (upper === 'ID') return 'ID';
      if (upper === 'UTC') return 'UTC';
      if (upper === 'N2') return 'N2';
      if (upper === 'COV') return 'COV';
      if (upper === 'APDU') return 'APDU';
      if (upper === 'BACNET') return 'BACnet';
      if (upper === 'MSTP') return 'MS/TP';
      if (/^IPV6$/.test(upper)) return 'IPv6';
      if (/^IPV4$/.test(upper)) return 'IPv4';
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function isGenericPropertyName(name) {
  return GENERIC_PROPERTY_RE.test(String(name ?? '').trim());
}

function getPropertyName(propertyId, explicitName) {
  const raw = String(explicitName ?? '').trim();
  if (raw && !isGenericPropertyName(raw)) return raw;
  return PROPERTY_NAMES[propertyId] ?? 'Unknown Property';
}

module.exports = {
  buildReferenceMap,
  buildReferenceIndex,
  PROPERTY_NAMES,
  getPropertyName,
  isGenericPropertyName,
};
