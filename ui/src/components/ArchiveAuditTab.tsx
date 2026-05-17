import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { exportCleanupCsv, exportCleanupManifestJson, exportFindingsCsv, buildArchiveAudit } from './archiveAudit';
import type { LoadedArchive } from './archiveAudit';
import type { ReferenceIndex } from '@oct/shared';

function downloadText(filename: string, text: string, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}

function Badge({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 7px',
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 600,
      color: '#fff',
      background: color,
    }}>
      {children}
    </span>
  );
}

const SEVERITY_COLOR: Record<string, string> = {
  high: 'var(--error, #e55)',
  medium: '#f90',
  low: 'var(--accent)',
  info: 'var(--text-dim)',
};

const KIND_LABEL: Record<string, string> = {
  'unbound-reference': 'Unbound ref',
  'duplicate-description': 'Dup description',
  'duplicate-tag': 'Dup tag',
  'missing-description': 'No description',
  'missing-tag': 'No tag',
  'orphaned-object': 'Orphaned object',
  'reference-hotspot': 'Hotspot',
  'unreferenced-object': 'Unreferenced',
  'suppressed-alarm': 'Suppressed alarm',
  'io-missing-units': 'I/O units',
};

export default function ArchiveAuditTab({
  file,
  referenceIndex,
  onSelectObject,
  onOpenReferences,
}: {
  file: LoadedArchive;
  referenceIndex: ReferenceIndex;
  onSelectObject: (ref: string) => void;
  onOpenReferences: (target: string) => void;
}) {
  const report = useMemo(() => buildArchiveAudit(file, referenceIndex), [file, referenceIndex]);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<'all' | 'info' | 'low' | 'medium' | 'high'>('all');
  const [kind, setKind] = useState<'all' | string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Record<string, { target: string; replacement: string; reason: string; score: number; findingId: string; findingTitle: string; source?: string }>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return report.findings.filter(f => {
      if (severity !== 'all' && f.severity !== severity) return false;
      if (kind !== 'all' && f.kind !== kind) return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.summary.toLowerCase().includes(q) ||
        (f.details ?? '').toLowerCase().includes(q) ||
        f.refs.some(ref => ref.toLowerCase().includes(q))
      );
    });
  }, [report.findings, search, severity, kind]);

  const selected = filtered.find(f => f.id === selectedId) ?? filtered[0] ?? null;

  const kinds = [...new Set(report.findings.map(f => f.kind))].sort();

  const cleanupCsv = useMemo(() => exportCleanupCsv(report.cleanupPlan), [report.cleanupPlan]);
  const findingsCsv = useMemo(() => exportFindingsCsv(report.findings), [report.findings]);
  const acceptedEntries = useMemo(() => Object.values(accepted).sort((a, b) => b.score - a.score || a.target.localeCompare(b.target)), [accepted]);
  const acceptedManifest = useMemo(() => exportCleanupManifestJson(acceptedEntries), [acceptedEntries]);

  const acceptSuggestion = (findingId: string, findingTitle: string, suggestion: { ref: string; reason: string; score: number }, source?: string, target?: string) => {
    const resolvedTarget = target ?? selected?.target ?? '';
    if (!resolvedTarget) return;
    setAccepted(prev => ({
      ...prev,
      [resolvedTarget]: {
        target: resolvedTarget,
        replacement: suggestion.ref,
        reason: suggestion.reason,
        score: suggestion.score,
        findingId,
        findingTitle,
        source,
      },
    }));
  };

  const removeAccepted = (target: string) => {
    setAccepted(prev => {
      const next = { ...prev };
      delete next[target];
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>ARCHIVE AUDIT</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{file.name}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge color={SEVERITY_COLOR.high}>{report.summary.high} high</Badge>
            <Badge color={SEVERITY_COLOR.medium}>{report.summary.medium} medium</Badge>
            <Badge color={SEVERITY_COLOR.low}>{report.summary.low} low</Badge>
            <Badge color={SEVERITY_COLOR.info}>{report.summary.info} info</Badge>
            <Badge color="var(--success)">{acceptedEntries.length} accepted</Badge>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => downloadText(`${file.name.replace(/\.[^.]+$/, '')}.audit.csv`, findingsCsv)}>
              Export findings
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => downloadText(`${file.name.replace(/\.[^.]+$/, '')}.cleanup.csv`, cleanupCsv)}>
              Export cleanup plan
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => downloadText(`${file.name.replace(/\.[^.]+$/, '')}.cleanup-manifest.json`, acceptedManifest, 'application/json')}>
              Export accepted
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => copyText(acceptedManifest)}>
              Copy manifest
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setAccepted({})} disabled={acceptedEntries.length === 0}>
              Clear accepted
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--sidebar-bg)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>FINDINGS</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{report.summary.total.toLocaleString()}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--sidebar-bg)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>UNBOUND / ORPHANS</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{(report.summary.unbound + report.summary.orphans).toLocaleString()}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--sidebar-bg)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>DUPLICATES</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{(report.summary.duplicateDescriptions + report.summary.duplicateTags).toLocaleString()}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--sidebar-bg)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>REMEDIATION CANDIDATES</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{report.cleanupPlan.length.toLocaleString()}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search findings, refs, details…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 240 }}
          />
          <select value={severity} onChange={e => setSeverity(e.target.value as any)} style={{ width: 130 }}>
            <option value="all">All severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
          <select value={kind} onChange={e => setKind(e.target.value)} style={{ width: 180 }}>
            <option value="all">All checks</option>
            {kinds.map(k => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}
          </select>
          {(search || severity !== 'all' || kind !== 'all') && (
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => { setSearch(''); setSeverity('all'); setKind('all'); }}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '420px 1fr', minHeight: 0 }}>
        <div style={{ overflowY: 'auto', borderRight: '1px solid var(--border)' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 18, color: 'var(--text-dim)' }}>No findings match the current filters.</div>
          ) : (
            filtered.map(finding => {
              const active = selected?.id === finding.id;
              return (
                <button
                  key={finding.id}
                  onClick={() => setSelectedId(finding.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: active ? 'rgba(100,160,255,0.12)' : 'transparent',
                    color: 'var(--text)',
                    padding: '10px 12px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <Badge color={SEVERITY_COLOR[finding.severity]}>{finding.severity}</Badge>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{KIND_LABEL[finding.kind] ?? finding.kind}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'Consolas, monospace', color: 'var(--accent)' }}>
                      {finding.count.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{finding.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.35 }}>{finding.summary}</div>
                </button>
              );
            })
          )}
        </div>

        <div style={{ overflowY: 'auto' }}>
          {!selected ? (
            <div style={{ padding: 18, color: 'var(--text-dim)' }}>Select a finding to inspect the details and cleanup suggestions.</div>
          ) : (
            <div style={{ padding: 18, display: 'grid', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <Badge color={SEVERITY_COLOR[selected.severity]}>{selected.severity}</Badge>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{KIND_LABEL[selected.kind] ?? selected.kind}</span>
                  <span style={{ fontFamily: 'Consolas, monospace', color: 'var(--accent)' }}>{selected.count.toLocaleString()} item(s)</span>
                  {(selected.target || selected.refs[0]) && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '3px 8px', marginLeft: 'auto' }}
                      onClick={() => onOpenReferences(selected.target ?? selected.refs[0])}
                    >
                      Open refs
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{selected.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{selected.summary}</div>
                {selected.details && <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>{selected.details}</div>}
              </div>

              {selected.suggestions.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>REPOINT CANDIDATES</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Replacement</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>Reason</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px' }}>Score</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.suggestions.map(s => (
                        <tr key={s.ref} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '4px 8px 4px 0', wordBreak: 'break-all' }}>
                            <div style={{ fontFamily: 'Consolas, monospace' }}>{s.ref}</div>
                            <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>{s.label}</div>
                          </td>
                          <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{s.reason}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'Consolas, monospace' }}>{s.score}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => onSelectObject(s.ref)}>
                                Select object
                              </button>
                              <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => acceptSuggestion(selected.id, selected.title, s, selected.source, selected.target)}>
                                Accept
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {acceptedEntries.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>ACCEPTED CLEANUP MANIFEST</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Target</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>Replacement</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>Source</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px' }}>Score</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {acceptedEntries.map(entry => (
                        <tr key={entry.target} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '4px 8px 4px 0', fontFamily: 'Consolas, monospace', wordBreak: 'break-all' }}>{entry.target}</td>
                          <td style={{ padding: '4px 8px', fontFamily: 'Consolas, monospace', wordBreak: 'break-all' }}>{entry.replacement}</td>
                          <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{entry.source ?? 'n/a'}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'Consolas, monospace' }}>{entry.score}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => removeAccepted(entry.target)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>RELATED OBJECTS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.refs.map(ref => (
                    <button key={ref} className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => onSelectObject(ref)}>
                      {ref}
                    </button>
                  ))}
                </div>
              </div>

              {selected.kind === 'unbound-reference' && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  This is a cleanup candidate. Use the repoint suggestions above to map the dangling target onto a likely replacement, then export the cleanup plan for review.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
