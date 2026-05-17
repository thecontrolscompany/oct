"use strict";

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

module.exports = {
  buildReferenceMap,
  buildReferenceIndex,
};
