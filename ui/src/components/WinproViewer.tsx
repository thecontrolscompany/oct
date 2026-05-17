import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LoadedWinpro, WinproRecord, WinproSymbolBlock } from '../winproParser';
import { WorkspacePropertiesCard, WorkspaceSection } from './ObjectWorkspace';

type WinproTab = 'overview' | 'io' | 'sections' | 'symbols' | 'records' | 'raw';

function badgeStyle(color: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 7px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    background: color,
    letterSpacing: 0.2,
  };
}

function symbolLabel(symbol: WinproSymbolBlock): string {
  const bits = [symbol.name];
  if (symbol.module) bits.push(symbol.module);
  if (symbol.anchor) bits.push(symbol.anchor);
  return bits.join(' · ');
}

function recordLabel(record: WinproRecord): string {
  const bits = [record.label];
  if (record.shortName && record.shortName !== record.label) bits.push(record.shortName);
  if (record.longName && record.longName !== record.label) bits.push(record.longName);
  return bits.filter(Boolean).join(' · ');
}

function ioPrefixForSection(title: string): string | null {
  const upper = title.toUpperCase();
  if (upper.startsWith('ANALOG INPUTS')) return 'AI';
  if (upper.startsWith('BINARY INPUTS')) return 'BI';
  if (upper.startsWith('ANALOG OUTPUTS')) return 'AO';
  if (upper.startsWith('BINARY OUTPUTS')) return 'BO';
  return null;
}

function renderKeyValueTable(entries: Array<[string, string]>) {
  return (
    <table className="sct-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '4px 8px 4px 0', color: 'var(--text-dim)', width: 180, whiteSpace: 'nowrap' }}>{key}</td>
            <td style={{ padding: '4px 0', wordBreak: 'break-word' }}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderSectionBody(title: string, lines: string[]) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{title}</div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'auto',
          fontSize: 11,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {lines.join('\n')}
      </pre>
    </div>
  );
}

export default function WinproViewer({ file, onClose }: { file: LoadedWinpro; onClose?: () => void }) {
  const [tab, setTab] = useState<WinproTab>('overview');
  const [sectionSearch, setSectionSearch] = useState('');
  const [symbolSearch, setSymbolSearch] = useState('');
  const [recordSearch, setRecordSearch] = useState('');
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(file.data.sections[0]?.key ?? null);
  const [activeSymbolKey, setActiveSymbolKey] = useState<string | null>(file.data.symbols[0]?.rawHeader ?? null);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(file.data.records[0]?.id ?? null);

  const metaEntries = useMemo(() => {
    const entries: Array<[string, string]> = [
      ['File kind', file.data.kind.toUpperCase()],
      ['Stem', file.data.stem],
      ['Byte length', file.data.byteLength.toLocaleString()],
      ['Line count', file.data.lineCount.toLocaleString()],
      ['Sections', file.data.sections.length.toLocaleString()],
      ['Symbols', file.data.symbols.length.toLocaleString()],
      ['Records', file.data.records.length.toLocaleString()],
      ['Printable strings', file.data.strings.length.toLocaleString()],
    ];
    for (const [key, value] of Object.entries(file.data.metadata)) entries.push([key, value]);
    return entries;
  }, [file]);

  const sectionMatches = useMemo(() => {
    const q = sectionSearch.trim().toLowerCase();
    if (!q) return file.data.sections;
    return file.data.sections.filter(section =>
      section.title.toLowerCase().includes(q) ||
      section.lines.some(line => line.toLowerCase().includes(q))
    );
  }, [file.data.sections, sectionSearch]);

  const symbolMatches = useMemo(() => {
    const q = symbolSearch.trim().toLowerCase();
    if (!q) return file.data.symbols;
    return file.data.symbols.filter(symbol =>
      symbol.name.toLowerCase().includes(q) ||
      (symbol.module ?? '').toLowerCase().includes(q) ||
      (symbol.anchor ?? '').toLowerCase().includes(q) ||
      symbol.lines.some(line => line.toLowerCase().includes(q))
    );
  }, [file.data.symbols, symbolSearch]);

  const recordMatches = useMemo(() => {
    const q = recordSearch.trim().toLowerCase();
    if (!q) return file.data.records;
    return file.data.records.filter(record =>
      record.label.toLowerCase().includes(q) ||
      record.shortName?.toLowerCase().includes(q) ||
      record.longName?.toLowerCase().includes(q) ||
      record.normalizedKey.toLowerCase().includes(q) ||
      record.lines.some(line => line.toLowerCase().includes(q))
    );
  }, [file.data.records, recordSearch]);

  const activeSection = file.data.sections.find(section => section.key === activeSectionKey) ?? file.data.sections[0] ?? null;
  const activeSymbol = file.data.symbols.find(symbol => symbol.rawHeader === activeSymbolKey) ?? file.data.symbols[0] ?? null;
  const activeRecord = file.data.records.find(record => record.id === activeRecordId) ?? file.data.records[0] ?? null;
  const correlationGroups = useMemo(() => file.data.relations.map(relation => ({
    ...relation,
    records: relation.recordIds.map(id => file.data.records.find(record => record.id === id)).filter((record): record is WinproRecord => Boolean(record)),
  })), [file.data.records, file.data.relations]);

  const applicationSection = file.data.sections.find(section => section.title.startsWith('APPLICATION :')) ?? null;
  const sideloopSection = file.data.sections.find(section => section.title.toUpperCase().startsWith('SIDELOOPS')) ?? null;

  const ioGroups = useMemo(() => {
    const groups = ['ANALOG INPUTS', 'BINARY INPUTS', 'ANALOG OUTPUTS', 'BINARY OUTPUTS']
      .map(sectionPrefix => {
        const prefix = ioPrefixForSection(sectionPrefix);
        if (!prefix) return null;
        const records = file.data.records.filter(record => record.sectionTitle.toUpperCase().startsWith(sectionPrefix));
        const section = file.data.sections.find(s => s.title.toUpperCase().startsWith(sectionPrefix)) ?? null;
        return {
          title: sectionPrefix.replace('ANALOG ', 'Analog ').replace('BINARY ', 'Binary '),
          prefix,
          records,
          section,
        };
      })
      .filter((group): group is { title: string; prefix: string; records: WinproRecord[]; section: typeof applicationSection } => Boolean(group));
    return groups;
  }, [file.data.records, file.data.sections, applicationSection]);

  const applicationLines: Array<[string, string]> = file.data.application
    ? [
        ['Application', file.data.application.name],
        ['Revision', file.data.application.revision !== null ? String(file.data.application.revision) : '—'],
        ['Questions', file.data.application.questionCount !== null ? String(file.data.application.questionCount) : '—'],
        ['Choices parsed', String(file.data.application.choices.length)],
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{file.name}</div>
        <span style={badgeStyle(file.data.kind === 'asc' ? '#8a5cff' : file.data.kind === 'cfg' ? '#c97a00' : '#3366cc')}>
          {file.data.kind.toUpperCase()}
        </span>
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
          Parsed {file.data.sections.length.toLocaleString()} section{file.data.sections.length === 1 ? '' : 's'}
          {file.data.symbols.length > 0 ? ` · ${file.data.symbols.length.toLocaleString()} symbol blocks` : ''}
          {file.data.records.length > 0 ? ` · ${file.data.records.length.toLocaleString()} records` : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {onClose && (
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={onClose}>
              Close
            </button>
          )}
          {(['overview', 'io', 'sections', 'symbols', 'records', 'raw'] as WinproTab[]).map(id => (
            <button
              key={id}
              className={`tab${tab === id ? ' active' : ''}`}
              style={{ borderRadius: 4, marginBottom: 0, border: 'none', fontSize: 11, padding: '3px 10px' }}
              onClick={() => setTab(id)}
            >
              {id[0].toUpperCase() + id.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: 0 }}>
        <div style={{ borderRight: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <WorkspaceSection title="Summary" meta={`${file.data.kind.toUpperCase()} · ${file.data.byteLength.toLocaleString()} bytes`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--panel)' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase' }}>Sections</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{file.data.sections.length.toLocaleString()}</div>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--panel)' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase' }}>Records</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{file.data.records.length.toLocaleString()}</div>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--panel)' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase' }}>Symbols</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{file.data.symbols.length.toLocaleString()}</div>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--panel)' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase' }}>Strings</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{file.data.strings.length.toLocaleString()}</div>
                </div>
              </div>
            </WorkspaceSection>
            <input
              type="text"
              placeholder={tab === 'symbols' ? 'Search symbols…' : tab === 'records' ? 'Search records…' : 'Search sections…'}
              value={tab === 'symbols' ? symbolSearch : tab === 'records' ? recordSearch : sectionSearch}
              onChange={e => tab === 'symbols' ? setSymbolSearch(e.target.value) : tab === 'records' ? setRecordSearch(e.target.value) : setSectionSearch(e.target.value)}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tab === 'overview' && (
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <WorkspacePropertiesCard
                  title="Overview"
                  subtitle={`${metaEntries.length} entries`}
                  properties={metaEntries.map(([key, value], index) => ({
                    key: `${key}-${index}`,
                    name: key,
                    value,
                    type: 'Info',
                    number: index,
                  }))}
                  emptyMessage="No overview data available."
                />
                {applicationLines.length > 0 && (
                  <WorkspacePropertiesCard
                    title="Application"
                    subtitle={`${applicationLines.length} entries`}
                    properties={applicationLines.map(([key, value], index) => ({
                      key: `app-${index}`,
                      name: key,
                      value,
                      type: 'Info',
                      number: index,
                    }))}
                    emptyMessage="No application information."
                  />
                )}
                {applicationSection && (
                  <WorkspaceSection title="Question and Answer Session" meta={`${applicationSection.lines.length} lines`}>
                    <pre style={{ margin: 0, padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {applicationSection.lines.join('\n')}
                    </pre>
                  </WorkspaceSection>
                )}
                {sideloopSection && (
                  <WorkspaceSection title="Sideloops" meta={sideloopSection.lines.length ? `${sideloopSection.lines.length} lines` : 'present'}>
                    <pre style={{ margin: 0, padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {sideloopSection.lines.join('\n')}
                    </pre>
                  </WorkspaceSection>
                )}
                <WorkspaceSection title="Companions" meta={`${file.data.companionNames.length} inferred`}>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text)' }}>
                    {file.data.companionNames.length === 0
                      ? 'No companion files inferred.'
                      : file.data.companionNames.map(name => <div key={name}>{name}</div>)}
                  </div>
                </WorkspaceSection>
                {correlationGroups.length > 0 && (
                  <WorkspaceSection title="Correlations" meta={`${correlationGroups.length} grouped keys`}>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {correlationGroups.slice(0, 8).map(group => (
                        <div key={group.key} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--bg)' }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{group.key}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                            {group.records.length} linked record{group.records.length === 1 ? '' : 's'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </WorkspaceSection>
                )}
                {file.data.kind === 'asc' && (
                  <WorkspaceSection title="Extracted Strings" meta={`${file.data.strings.length} items`}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
                      Printable runs recovered from the compiled export.
                    </div>
                    <div style={{ maxHeight: 260, overflow: 'auto', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'Consolas, monospace', fontSize: 11, lineHeight: 1.45 }}>
                      {file.data.strings.length === 0
                        ? 'No printable strings found.'
                        : file.data.strings.slice(0, 80).map((s, i) => <div key={`${s}-${i}`}>{s}</div>)}
                    </div>
                  </WorkspaceSection>
                )}
              </div>
            )}

            {tab === 'io' && (
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ioGroups.map(group => (
                  <WorkspaceSection key={group.prefix} title={group.title} meta={`${group.records.length} points`}>
                    {group.section ? (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
                        {group.section.title}
                      </div>
                    ) : null}
                    {group.records.length === 0 ? (
                      <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No {group.prefix} points found in this file.</div>
                    ) : (
                      <table className="sct-table">
                        <thead>
                          <tr>
                            <th style={{ width: 120 }}>Point</th>
                            <th>Label</th>
                            <th style={{ width: 180 }}>Short Name</th>
                            <th>Long Name</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.records.map((record, index) => (
                            <tr key={record.id}>
                              <td style={{ fontFamily: 'Consolas, monospace', fontWeight: 700 }}>{group.prefix}-{index + 1}</td>
                              <td style={{ fontWeight: 600 }}>{record.label}</td>
                              <td>{record.shortName ?? '—'}</td>
                              <td>{record.longName ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </WorkspaceSection>
                ))}
              </div>
            )}

            {tab === 'sections' && (
              <div style={{ padding: 0, height: '100%', display: 'grid', gridTemplateColumns: '280px 1fr', minHeight: 0 }}>
                <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
                  {sectionMatches.length === 0 ? (
                    <div style={{ padding: 16, color: 'var(--text-dim)' }}>No matching sections.</div>
                  ) : (
                    sectionMatches.map(section => {
                      const active = activeSection?.key === section.key;
                      return (
                        <button
                          key={section.key}
                          onClick={() => setActiveSectionKey(section.key)}
                          style={{
                            width: '100%',
                            border: 'none',
                            borderBottom: '1px solid var(--border)',
                            background: active ? 'rgba(100,160,255,0.12)' : 'transparent',
                            color: 'var(--text)',
                            textAlign: 'left',
                            padding: '10px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{section.title}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                            {section.lines.length.toLocaleString()} line{section.lines.length === 1 ? '' : 's'}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                <div style={{ overflow: 'auto', padding: 16 }}>
                  {activeSection ? renderSectionBody(activeSection.title, activeSection.lines) : <div style={{ color: 'var(--text-dim)' }}>Select a section to inspect it.</div>}
                </div>
              </div>
            )}

            {tab === 'symbols' && (
              <div style={{ padding: 0, height: '100%', display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: 0 }}>
                <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
                  {symbolMatches.length === 0 ? (
                    <div style={{ padding: 16, color: 'var(--text-dim)' }}>No matching symbol blocks.</div>
                  ) : (
                    symbolMatches.map(symbol => {
                      const active = activeSymbol?.rawHeader === symbol.rawHeader;
                      return (
                        <button
                          key={symbol.rawHeader}
                          onClick={() => setActiveSymbolKey(symbol.rawHeader)}
                          style={{
                            width: '100%',
                            border: 'none',
                            borderBottom: '1px solid var(--border)',
                            background: active ? 'rgba(100,160,255,0.12)' : 'transparent',
                            color: 'var(--text)',
                            textAlign: 'left',
                            padding: '10px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 600, wordBreak: 'break-word' }}>{symbolLabel(symbol)}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{symbol.rawHeader}</div>
                        </button>
                      );
                    })
                  )}
                </div>
                <div style={{ overflow: 'auto', padding: 16 }}>
                  {activeSymbol ? renderSectionBody(activeSymbol.name, activeSymbol.lines) : <div style={{ color: 'var(--text-dim)' }}>Select a symbol block to inspect it.</div>}
                </div>
              </div>
            )}

            {tab === 'records' && (
              <div style={{ padding: 0, height: '100%', display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: 0 }}>
                <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
                  {recordMatches.length === 0 ? (
                    <div style={{ padding: 16, color: 'var(--text-dim)' }}>No matching records.</div>
                  ) : (
                    recordMatches.map(record => {
                      const active = activeRecord?.id === record.id;
                      return (
                        <button
                          key={record.id}
                          onClick={() => setActiveRecordId(record.id)}
                          style={{
                            width: '100%',
                            border: 'none',
                            borderBottom: '1px solid var(--border)',
                            background: active ? 'rgba(100,160,255,0.12)' : 'transparent',
                            color: 'var(--text)',
                            textAlign: 'left',
                            padding: '10px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 600, wordBreak: 'break-word' }}>{recordLabel(record)}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                            {record.kind} · {record.sectionTitle}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                <div style={{ overflow: 'auto', padding: 16 }}>
                  {activeRecord ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <WorkspacePropertiesCard
                        title="Record"
                        subtitle={activeRecord.sectionTitle}
                        properties={[
                          { key: 'label', name: 'Label', value: activeRecord.label, type: activeRecord.kind, number: 0 },
                          { key: 'short', name: 'Short name', value: activeRecord.shortName ?? '—', type: 'Text', number: 1 },
                          { key: 'long', name: 'Long name', value: activeRecord.longName ?? '—', type: 'Text', number: 2 },
                          { key: 'key', name: 'Key', value: activeRecord.normalizedKey || '—', type: 'Key', number: 3 },
                          { key: 'line', name: 'Start line', value: String(activeRecord.startLine), type: 'Line', number: 4 },
                        ]}
                        emptyMessage="No record details."
                      />
                      <WorkspaceSection title="Fields" meta={`${Object.keys(activeRecord.fields).length} fields`}>
                        {renderKeyValueTable(Object.entries(activeRecord.fields).map(([key, value]) => [key, value]))}
                      </WorkspaceSection>
                      <WorkspaceSection title="Source Lines" meta={`${activeRecord.lines.length} lines`}>
                        <pre style={{ margin: 0, padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {activeRecord.lines.join('\n')}
                        </pre>
                      </WorkspaceSection>
                      <WorkspaceSection title="Related Records" meta={`${correlationGroups.find(group => group.key === activeRecord.normalizedKey)?.records.length ?? 0} linked`}>
                        {correlationGroups.find(group => group.key === activeRecord.normalizedKey)?.records.filter(record => record.id !== activeRecord.id).length
                          ? correlationGroups.find(group => group.key === activeRecord.normalizedKey)!.records.filter(record => record.id !== activeRecord.id).map(record => (
                              <div key={record.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600 }}>{record.label}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{record.sectionTitle} · {record.kind}</div>
                              </div>
                            ))
                          : <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No related records in this file.</div>}
                      </WorkspaceSection>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-dim)' }}>Select a record to inspect it.</div>
                  )}
                </div>
              </div>
            )}

            {tab === 'raw' && (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
                <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>RAW PREVIEW</div>
                  <pre style={{ margin: 0, maxHeight: 280, overflow: 'auto', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {file.data.kind === 'asc' ? file.data.previewText : file.data.previewText}
                  </pre>
                </section>
                {file.data.kind !== 'asc' && (
                  <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, flex: 1, minHeight: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>FULL TEXT</div>
                    <pre style={{ margin: 0, maxHeight: '100%', overflow: 'auto', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {file.data.rawText}
                    </pre>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ overflow: 'hidden' }}>
          {tab === 'overview' && (
            <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
              <section style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>FILE SUMMARY</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{file.name}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.5 }}>
                  WinPro files are parsed into sections, application metadata, and symbol blocks so we can start decoding the legacy HVAC PRO format instead of staring at raw text.
                </div>
              </section>

              {file.data.kind !== 'asc' ? (
                <section style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>SECTION MAP</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    {file.data.sections.map(section => (
                      <div key={section.key} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--panel)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{section.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{section.lines.length.toLocaleString()} line{section.lines.length === 1 ? '' : 's'}</div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <section style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>BINARY SUMMARY</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                    The ASC export is treated as a binary companion file. We recover printable strings and a hex preview so we can start mapping its payload without assuming it is plain text.
                  </div>
                </section>
              )}
            </div>
          )}

          {tab === 'sections' && (
            <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
              {activeSection ? renderSectionBody(activeSection.title, activeSection.lines) : <div style={{ color: 'var(--text-dim)' }}>No section selected.</div>}
            </div>
          )}

          {tab === 'symbols' && (
            <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
              {activeSymbol ? renderSectionBody(activeSymbol.name, activeSymbol.lines) : <div style={{ color: 'var(--text-dim)' }}>No symbol selected.</div>}
            </div>
          )}

          {tab === 'records' && (
            <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
              {activeRecord ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <section style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>RECORD DETAIL</div>
                    {renderKeyValueTable([
                      ['Label', activeRecord.label],
                      ['Kind', activeRecord.kind],
                      ['Section', activeRecord.sectionTitle],
                      ['Key', activeRecord.normalizedKey || '—'],
                      ['Short name', activeRecord.shortName ?? '—'],
                      ['Long name', activeRecord.longName ?? '—'],
                      ['Start line', String(activeRecord.startLine)],
                    ])}
                  </section>
                  <section style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>RELATED RECORDS</div>
                    {correlationGroups.find(group => group.key === activeRecord.normalizedKey)?.records.filter(record => record.id !== activeRecord.id).length
                      ? correlationGroups.find(group => group.key === activeRecord.normalizedKey)!.records.filter(record => record.id !== activeRecord.id).map(record => (
                          <div key={record.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{record.label}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{record.sectionTitle} · {record.kind}</div>
                          </div>
                        ))
                      : <div style={{ color: 'var(--text-dim)' }}>No related records in this file.</div>}
                  </section>
                </div>
              ) : (
                <div style={{ color: 'var(--text-dim)' }}>No record selected.</div>
              )}
            </div>
          )}

          {tab === 'raw' && (
            <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
              <pre style={{ margin: 0, padding: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {file.data.rawText}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
