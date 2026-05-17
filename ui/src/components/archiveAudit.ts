import type { ReferenceIndex } from '@oct/shared';
import type { CafObject, DbexportObject, ParsedCaf, ParsedDbexport } from '../api';

export type LoadedArchive =
  | { type: 'caf'; data: ParsedCaf; name: string }
  | { type: 'dbexport'; data: ParsedDbexport; name: string };

type AnyObject = CafObject | DbexportObject;

export type AuditSeverity = 'info' | 'low' | 'medium' | 'high';
export type AuditKind =
  | 'unbound-reference'
  | 'duplicate-description'
  | 'duplicate-tag'
  | 'duplicate-ref'
  | 'missing-description'
  | 'missing-tag'
  | 'orphaned-object'
  | 'reference-hotspot'
  | 'self-reference'
  | 'unreferenced-object'
  | 'suppressed-alarm'
  | 'placeholder-name'
  | 'io-missing-units';

export interface CleanupSuggestion {
  ref: string;
  label: string;
  reason: string;
  score: number;
}

export interface AuditFinding {
  id: string;
  kind: AuditKind;
  severity: AuditSeverity;
  title: string;
  summary: string;
  refs: string[];
  count: number;
  target?: string;
  source?: string;
  details?: string;
  suggestions: CleanupSuggestion[];
}

export interface AuditReport {
  findings: AuditFinding[];
  cleanupPlan: Array<{
    target: string;
    replacement: string;
    reason: string;
    score: number;
  }>;
  summary: {
    total: number;
    info: number;
    low: number;
    medium: number;
    high: number;
    unbound: number;
    duplicateDescriptions: number;
    duplicateTags: number;
    duplicateRefs: number;
    missingDescriptions: number;
    missingTags: number;
    orphans: number;
    hotspots: number;
    selfReferences: number;
    unreferenced: number;
    suppressedAlarms: number;
    placeholderNames: number;
    ioMissingUnits: number;
  };
}

export interface CleanupManifestEntry {
  target: string;
  replacement: string;
  reason: string;
  score: number;
  findingId: string;
  findingTitle: string;
  source?: string;
  action: 'repoint' | 'delete';
}

export interface RewriteChangeSummary {
  changedReferences: number;
  changedReferrers: number;
  renamedObjects: number;
  renamedParents: number;
  renamedEngines: number;
  deletedObjects: number;
  deletedReferences: number;
}

export interface RewriteResult {
  file: LoadedArchive;
  summary: RewriteChangeSummary;
  acceptedEntries: CleanupManifestEntry[];
}

const IO_CLASS_IDS = new Set([239, 240, 241, 242, 243, 671, 672, 673, 674]);
const BACNET_OBJ_CLASSES = new Set([163, 164, 165, 166, 167, 168, 141]);
const ALARMISH_RE = /(alarm|alarms|fault|warning|event)/i;
const SUPPRESS_RE = /(suppress|suppressed|disable|disabled|inhibit|bypass|silence|mute|hold ?off)/i;
const PLACEHOLDER_RE = /^(tbd|todo|temp|test|new|unnamed|unknown|object|value|point|sensor|actuator|device)(\s+.*)?$/i;

function getObjects(file: LoadedArchive): AnyObject[] {
  return file.type === 'caf' ? file.data.objects : file.data.objects;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function displayName(o: AnyObject): string {
  return o.tag || o.description || o.ref;
}

function tail(ref: string): string {
  const parts = ref.split(/[\/:.]/).filter(Boolean);
  return parts[parts.length - 1] ?? ref;
}

function severityRank(severity: AuditSeverity): number {
  switch (severity) {
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

function severityCounts(findings: AuditFinding[]): AuditReport['summary'] {
  const summary = {
    total: findings.length,
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
    unbound: 0,
    duplicateDescriptions: 0,
    duplicateTags: 0,
    duplicateRefs: 0,
    missingDescriptions: 0,
    missingTags: 0,
    orphans: 0,
    hotspots: 0,
    selfReferences: 0,
    unreferenced: 0,
    suppressedAlarms: 0,
    placeholderNames: 0,
    ioMissingUnits: 0,
  };

  for (const finding of findings) {
    summary[finding.severity] += 1;
    switch (finding.kind) {
      case 'unbound-reference': summary.unbound += 1; break;
      case 'duplicate-description': summary.duplicateDescriptions += 1; break;
      case 'duplicate-tag': summary.duplicateTags += 1; break;
      case 'duplicate-ref': summary.duplicateRefs += 1; break;
      case 'missing-description': summary.missingDescriptions += 1; break;
      case 'missing-tag': summary.missingTags += 1; break;
      case 'orphaned-object': summary.orphans += 1; break;
      case 'reference-hotspot': summary.hotspots += 1; break;
      case 'self-reference': summary.selfReferences += 1; break;
      case 'unreferenced-object': summary.unreferenced += 1; break;
      case 'suppressed-alarm': summary.suppressedAlarms += 1; break;
      case 'placeholder-name': summary.placeholderNames += 1; break;
      case 'io-missing-units': summary.ioMissingUnits += 1; break;
    }
  }

  return summary;
}

function makeFinding(kind: AuditKind, severity: AuditSeverity, title: string, summary: string, refs: string[], extras: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: `${kind}:${refs.join('|')}:${summary}`,
    kind,
    severity,
    title,
    summary,
    refs,
    count: refs.length,
    suggestions: [],
    ...extras,
  };
}

function topSuggestions(target: string, objects: AnyObject[]): CleanupSuggestion[] {
  const targetNorm = normalizeText(target);
  const targetTail = tail(target).toLowerCase();
  const scored: CleanupSuggestion[] = [];

  for (const obj of objects) {
    let score = 0;
    const reasons: string[] = [];
    const refTail = tail(obj.ref).toLowerCase();
    const tag = normalizeText(obj.tag);
    const desc = normalizeText(obj.description);

    if (obj.ref.toLowerCase() === targetNorm) { score += 100; reasons.push('exact ref match'); }
    if (refTail === targetTail) { score += 90; reasons.push('matching ref leaf'); }
    if (tag === targetTail) { score += 80; reasons.push('matching tag'); }
    if (desc === targetTail) { score += 70; reasons.push('matching description'); }
    if (tag.includes(targetTail) && tag !== targetTail) { score += 40; reasons.push('tag contains target leaf'); }
    if (desc.includes(targetTail) && desc !== targetTail) { score += 30; reasons.push('description contains target leaf'); }
    if (obj.className.toLowerCase().includes(targetTail)) { score += 10; reasons.push('class name match'); }

    if (score > 0) {
      scored.push({
        ref: obj.ref,
        label: displayName(obj),
        reason: reasons.join('; '),
        score,
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref)).slice(0, 3);
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

function summarizeRefs(refs: string[]): string {
  if (refs.length === 0) return 'No objects matched';
  const shown = refs.slice(0, 4).join(', ');
  return refs.length > 4 ? `${shown}, +${refs.length - 4} more` : shown;
}

function cloneFile<T extends LoadedArchive>(file: T): T {
  return structuredClone(file);
}

function applyEntryToArchive(file: LoadedArchive, entry: CleanupManifestEntry, summary: RewriteChangeSummary): void {
  const { target, replacement } = entry;
  if (!target) return;

  if (entry.action === 'delete') {
    const objectTargets = new Set<string>([target]);
    file.data.objects = file.data.objects.filter(obj => {
      if (objectTargets.has(obj.ref)) {
        summary.deletedObjects += 1;
        return false;
      }
      return true;
    }) as typeof file.data.objects;
    const beforeRefs = file.data.references.length;
    file.data.references = file.data.references.filter(hit => hit.target !== target && hit.referringItem !== target) as typeof file.data.references;
    summary.deletedReferences += beforeRefs - file.data.references.length;
    return;
  }

  if (!replacement || target === replacement) return;

  for (const hit of file.data.references) {
    if (hit.target === target) {
      hit.target = replacement;
      summary.changedReferences += 1;
    }
    if (hit.referringItem === target) {
      hit.referringItem = replacement;
      summary.changedReferrers += 1;
    }
    if (hit.sourcePath?.includes(target)) {
      hit.sourcePath = hit.sourcePath.split(target).join(replacement);
    }
    if (hit.referringPath?.includes(target)) {
      hit.referringPath = hit.referringPath.split(target).join(replacement);
    }
  }

  for (const obj of file.data.objects) {
    if (obj.ref === target) {
      obj.ref = replacement;
      summary.renamedObjects += 1;
    }
    if ('parentRef' in obj && obj.parentRef === target) {
      obj.parentRef = replacement;
      summary.renamedParents += 1;
    }
    if ('engineRef' in obj && obj.engineRef === target) {
      obj.engineRef = replacement;
      summary.renamedEngines += 1;
    }
  }

  if ('controller' in file.data && file.data.controller.ref === target) {
    file.data.controller.ref = replacement;
  }
  if ('site' in file.data && file.data.site && file.data.site.reference === target) {
    file.data.site.reference = replacement;
  }
  if ('site' in file.data && file.data.site) {
    const walk = (node: any) => {
      if (!node) return;
      if (node.reference === target) {
        node.reference = replacement;
        summary.renamedObjects += 1;
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(file.data.site);
  }
}

export function buildArchiveAudit(file: LoadedArchive, referenceIndex: ReferenceIndex): AuditReport {
  const objects = getObjects(file);
  const objectMap = new Map(objects.map(o => [o.ref, o]));
  const findings: AuditFinding[] = [];
  const cleanupPlan: AuditReport['cleanupPlan'] = [];
  const outgoing = new Map<string, number>();

  for (const hit of file.data.references) {
    outgoing.set(hit.referringItem, (outgoing.get(hit.referringItem) ?? 0) + 1);
  }

  const duplicateRefs = groupBy(objects, o => o.ref);
  for (const [, group] of duplicateRefs) {
    if (group.length < 2) continue;
    findings.push(makeFinding(
      'duplicate-ref',
      'high',
      'Duplicate object ref',
      `${group.length.toLocaleString()} objects share the same archive reference.`,
      group.map(o => o.ref),
      { details: summarizeRefs(group.map(o => `${o.className} · ${displayName(o)}`)) },
    ));
  }

  const selfRefs = file.data.references.filter(hit => hit.target === hit.referringItem || hit.target === hit.source);
  const selfRefGroups = groupBy(selfRefs, hit => hit.referringItem);
  for (const [, group] of selfRefGroups) {
    findings.push(makeFinding(
      'self-reference',
      'medium',
      'Self-reference',
      `${group.length.toLocaleString()} reference(s) point back to the same object or source context.`,
      [group[0].referringItem],
      {
        source: group[0].source,
        details: summarizeRefs(group.map(hit => `${hit.referringAttr} → ${hit.target}`)),
      },
    ));
  }

  for (const [target, hits] of referenceIndex.byTarget.entries()) {
    if (objectMap.has(target)) continue;
    const suggestions = topSuggestions(target, objects);
    findings.push(makeFinding(
      'unbound-reference',
      'high',
      'Unbound reference',
      `${hits.length.toLocaleString()} reference(s) point to a target that does not exist in this archive.`,
      [target],
      {
        target,
        source: hits[0]?.source,
        details: summarizeRefs(hits.map(h => `${h.referringItem} · ${h.referringAttr}`)),
        suggestions,
      },
    ));

    if (suggestions.length > 0) {
      cleanupPlan.push({
        target,
        replacement: suggestions[0].ref,
        reason: suggestions[0].reason || 'best textual match',
        score: suggestions[0].score,
      });
    }
  }

  const duplicateDescriptions = groupBy(
    objects.filter(o => normalizeText(o.description)),
    o => normalizeText(o.description),
  );
  for (const [, group] of duplicateDescriptions) {
    if (group.length < 2) continue;
    findings.push(makeFinding(
      'duplicate-description',
      'medium',
      'Duplicate description',
      `${group.length.toLocaleString()} objects share description "${group[0].description}".`,
      group.map(o => o.ref),
      { details: summarizeRefs(group.map(o => `${o.className} · ${o.ref}`)) },
    ));
  }

  const duplicateTags = groupBy(
    objects.filter(o => normalizeText(o.tag)),
    o => `${o.classid}:${normalizeText(o.tag)}`,
  );
  for (const [, group] of duplicateTags) {
    if (group.length < 2) continue;
    findings.push(makeFinding(
      'duplicate-tag',
      'medium',
      'Duplicate tag',
      `${group.length.toLocaleString()} objects in class ${group[0].className} share tag "${group[0].tag}".`,
      group.map(o => o.ref),
      { details: summarizeRefs(group.map(o => o.ref)) },
    ));
  }

  const placeholderNames = objects.filter(o => PLACEHOLDER_RE.test(normalizeText(o.tag)) || PLACEHOLDER_RE.test(normalizeText(o.description)));
  for (const obj of placeholderNames.slice(0, 100)) {
    findings.push(makeFinding(
      'placeholder-name',
      'low',
      'Placeholder name',
      'The tag or description looks like a placeholder and may need a real label.',
      [obj.ref],
      { details: `${obj.className} · ${displayName(obj)}` },
    ));
  }

  const missingDescriptionsByClass = groupBy(
    objects.filter(o => !normalizeText(o.description)),
    o => `${o.classid}:${o.className}`,
  );
  for (const [, group] of missingDescriptionsByClass) {
    findings.push(makeFinding(
      'missing-description',
      'low',
      'Missing description',
      `${group.length.toLocaleString()} object(s) in ${group[0].className} have no description.`,
      group.map(o => o.ref),
      { details: summarizeRefs(group.map(o => o.ref)) },
    ));
  }

  const missingTagsByClass = groupBy(
    objects.filter(o => !normalizeText(o.tag)),
    o => `${o.classid}:${o.className}`,
  );
  for (const [, group] of missingTagsByClass) {
    findings.push(makeFinding(
      'missing-tag',
      'low',
      'Missing tag',
      `${group.length.toLocaleString()} object(s) in ${group[0].className} have no tag.`,
      group.map(o => o.ref),
      { details: summarizeRefs(group.map(o => o.ref)) },
    ));
  }

  if (file.type === 'caf') {
    const orphanGroups = groupBy(
      file.data.objects.filter(o => o.parentRef && !objectMap.has(o.parentRef)),
      o => o.parentRef ?? '',
    );
    for (const [parentRef, group] of orphanGroups) {
      findings.push(makeFinding(
        'orphaned-object',
        'high',
        'Orphaned object',
        `${group.length.toLocaleString()} CAF object(s) reference missing parent "${parentRef}".`,
        group.map(o => o.ref),
        { details: summarizeRefs(group.map(o => `${o.className} · ${o.ref}`)) },
      ));
    }
  }

  const incomingCounts = referenceIndex.counts;
  const hotspotCandidates = [...incomingCounts.entries()]
    .filter(([, count]) => count >= 8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [target, count] of hotspotCandidates) {
    findings.push(makeFinding(
      'reference-hotspot',
      'low',
      'Reference hotspot',
      `${count.toLocaleString()} object(s) reference this target.`,
      [target],
      { target, count, details: objectMap.has(target) ? displayName(objectMap.get(target)!) : 'Target is not present in the parsed archive.' },
    ));
  }

  const unreferencedGroups = groupBy(
    objects.filter(o => (incomingCounts.get(o.ref) ?? 0) === 0 && (outgoing.get(o.ref) ?? 0) === 0),
    o => `${o.classid}:${o.className}`,
  );
  for (const [, group] of unreferencedGroups) {
    if (group.length === 0) continue;
    findings.push(makeFinding(
      'unreferenced-object',
      'low',
      'Unreferenced object',
      `${group.length.toLocaleString()} object(s) in ${group[0].className} are not referenced by anything else in the archive.`,
      group.map(o => o.ref),
      { details: summarizeRefs(group.map(o => o.ref)) },
    ));
  }

  const suppressedAlarms = objects.filter(o => {
    const text = `${o.className} ${o.tag} ${o.description}`;
    return ALARMISH_RE.test(text) && SUPPRESS_RE.test(text);
  });
  for (const obj of suppressedAlarms.slice(0, 50)) {
    findings.push(makeFinding(
      'suppressed-alarm',
      'medium',
      'Suppressed alarm candidate',
      'Text suggests an alarm, inhibit, bypass, or suppression condition that should be reviewed.',
      [obj.ref],
      { details: `${obj.className} · ${displayName(obj)} · ${obj.description || '(no description)'}` },
    ));
  }

  const ioMissingUnits = objects.filter(o => (IO_CLASS_IDS.has(o.classid) || BACNET_OBJ_CLASSES.has(o.classid)) && !o.units);
  for (const obj of ioMissingUnits.slice(0, 80)) {
    findings.push(makeFinding(
      'io-missing-units',
      'low',
      'I/O object missing units',
      'This point is likely more readable with a units label.',
      [obj.ref],
      { details: `${obj.className} · ${displayName(obj)}` },
    ));
  }

  findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.kind.localeCompare(b.kind) || a.summary.localeCompare(b.summary));

  return {
    findings,
    cleanupPlan,
    summary: severityCounts(findings),
  };
}

export function exportFindingsCsv(findings: AuditFinding[]): string {
  const header = 'Severity,Kind,Count,Title,Summary,Refs,Details\n';
  const rows = findings.map(f => [
    f.severity,
    f.kind,
    f.count,
    `"${f.title.replace(/"/g, '""')}"`,
    `"${f.summary.replace(/"/g, '""')}"`,
    `"${f.refs.join('; ').replace(/"/g, '""')}"`,
    `"${(f.details ?? '').replace(/"/g, '""')}"`,
  ].join(','));
  return header + rows.join('\n');
}

export function exportCleanupCsv(plan: AuditReport['cleanupPlan']): string {
  const header = 'Target,Replacement,Score,Reason\n';
  const rows = plan.map(item => [
    `"${item.target.replace(/"/g, '""')}"`,
    `"${item.replacement.replace(/"/g, '""')}"`,
    item.score,
    `"${item.reason.replace(/"/g, '""')}"`,
  ].join(','));
  return header + rows.join('\n');
}

export function exportCleanupManifestJson(entries: CleanupManifestEntry[]): string {
  return JSON.stringify({
    createdAt: new Date().toISOString(),
    entries,
  }, null, 2);
}

export function applyCleanupManifest(file: LoadedArchive, entries: CleanupManifestEntry[]): RewriteResult {
  const next = cloneFile(file);
  const summary: RewriteChangeSummary = {
    changedReferences: 0,
    changedReferrers: 0,
    renamedObjects: 0,
    renamedParents: 0,
    renamedEngines: 0,
    deletedObjects: 0,
    deletedReferences: 0,
  };

  for (const entry of entries) {
    applyEntryToArchive(next, entry, summary);
  }

  return {
    file: next,
    summary,
    acceptedEntries: entries,
  };
}

export function buildAsBuiltReport(file: LoadedArchive, audit: AuditReport, rewrite?: RewriteResult): string {
  const lines: string[] = [];
  const active = rewrite?.file ?? file;
  lines.push('<!doctype html>');
  lines.push('<html lang="en">');
  lines.push('<head>');
  lines.push('<meta charset="utf-8" />');
  lines.push('<meta name="viewport" content="width=device-width, initial-scale=1" />');
  lines.push(`<title>As-Built Report - ${active.name}</title>`);
  lines.push('<style>');
  lines.push('body{font-family:Arial,Helvetica,sans-serif;margin:32px;color:#1f2937;line-height:1.45;}');
  lines.push('h1,h2,h3{margin:0 0 12px 0;}');
  lines.push('section{margin:0 0 28px 0;padding:16px;border:1px solid #d1d5db;border-radius:10px;}');
  lines.push('table{width:100%;border-collapse:collapse;font-size:12px;}');
  lines.push('th,td{border-bottom:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top;}');
  lines.push('.muted{color:#6b7280;font-size:12px;}');
  lines.push('</style>');
  lines.push('</head>');
  lines.push('<body>');
  lines.push(`<h1>As-Built Report</h1>`);
  lines.push(`<div class="muted">${active.name}</div>`);
  lines.push('<section>');
  lines.push('<h2>Summary</h2>');
  lines.push(`<div>Objects: ${active.data.objects.length.toLocaleString()}</div>`);
  lines.push(`<div>References: ${active.data.references.length.toLocaleString()}</div>`);
  lines.push(`<div>Findings: ${audit.summary.total.toLocaleString()}</div>`);
  if (rewrite) {
    lines.push(`<div>Applied cleanup entries: ${rewrite.acceptedEntries.length.toLocaleString()}</div>`);
    lines.push(`<div>Repointed references: ${rewrite.summary.changedReferences.toLocaleString()} · Referrers renamed: ${rewrite.summary.changedReferrers.toLocaleString()}</div>`);
    lines.push(`<div>Objects renamed: ${rewrite.summary.renamedObjects.toLocaleString()} · Parents renamed: ${rewrite.summary.renamedParents.toLocaleString()} · Engines renamed: ${rewrite.summary.renamedEngines.toLocaleString()}</div>`);
    lines.push(`<div>Objects deleted: ${rewrite.summary.deletedObjects.toLocaleString()} · References deleted: ${rewrite.summary.deletedReferences.toLocaleString()}</div>`);
  }
  lines.push('</section>');
  if (rewrite && rewrite.acceptedEntries.length > 0) {
    lines.push('<section>');
    lines.push('<h2>Applied Cleanup Manifest</h2>');
    lines.push('<table><thead><tr><th>Action</th><th>Target</th><th>Replacement</th><th>Reason</th><th>Source</th></tr></thead><tbody>');
    for (const entry of rewrite.acceptedEntries) {
      lines.push(`<tr><td>${entry.action}</td><td>${entry.target}</td><td>${entry.replacement || '—'}</td><td>${entry.reason}</td><td>${entry.source ?? ''}</td></tr>`);
    }
    lines.push('</tbody></table>');
    lines.push('</section>');
  }
  lines.push('<section>');
  lines.push('<h2>Audit Overview</h2>');
  lines.push(`<div>High: ${audit.summary.high} · Medium: ${audit.summary.medium} · Low: ${audit.summary.low}</div>`);
  lines.push(`<div>Unbound: ${audit.summary.unbound} · Orphans: ${audit.summary.orphans} · Duplicates: ${audit.summary.duplicateDescriptions + audit.summary.duplicateTags}</div>`);
  lines.push('</section>');
  lines.push('<section>');
  lines.push('<h2>Reference Hotspots</h2>');
  lines.push('<table><thead><tr><th>Target</th><th>Count</th><th>Context</th></tr></thead><tbody>');
  const hotspotFindings = audit.findings.filter(f => f.kind === 'reference-hotspot').slice(0, 20);
  for (const finding of hotspotFindings) {
    lines.push(`<tr><td>${finding.target ?? finding.refs[0] ?? ''}</td><td>${finding.count}</td><td>${finding.details ?? ''}</td></tr>`);
  }
  lines.push('</tbody></table>');
  lines.push('</section>');
  lines.push('<section>');
  lines.push('<h2>Top Findings</h2>');
  lines.push('<table><thead><tr><th>Severity</th><th>Kind</th><th>Title</th><th>Summary</th></tr></thead><tbody>');
  for (const finding of audit.findings.slice(0, 40)) {
    lines.push(`<tr><td>${finding.severity}</td><td>${finding.kind}</td><td>${finding.title}</td><td>${finding.summary}</td></tr>`);
  }
  lines.push('</tbody></table>');
  lines.push('</section>');
  lines.push('</body></html>');
  return lines.join('');
}

export function suggestRepointCandidates(target: string, objects: AnyObject[]): CleanupSuggestion[] {
  return topSuggestions(target, objects);
}
