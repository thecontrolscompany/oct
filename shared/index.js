"use strict";

function buildReferenceMap(references) {
  const map = new Map();
  for (const hit of references || []) {
    const key = hit.target;
    const list = map.get(key);
    if (list) list.push(hit);
    else map.set(key, [hit]);
  }
  return map;
}

module.exports = {
  buildReferenceMap,
};
