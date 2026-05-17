export type WinproKind = 'cfg' | 'prn' | 'asc';

export interface WinproSection {
  key: string;
  title: string;
  kind: 'header' | 'symbol' | 'preamble' | 'binary';
  startLine: number;
  lines: string[];
}

export interface WinproSymbolBlock {
  name: string;
  rawHeader: string;
  module: string | null;
  anchor: string | null;
  startLine: number;
  lines: string[];
}

export interface WinproApplicationChoice {
  prompt: string;
  answer: string;
  rawLine: string;
}

export interface WinproApplicationInfo {
  name: string;
  revision: number | null;
  questionCount: number | null;
  choices: WinproApplicationChoice[];
}

export interface WinproRecord {
  id: string;
  kind: 'section-row' | 'question' | 'symbol' | 'string';
  sectionKey: string;
  sectionTitle: string;
  label: string;
  shortName: string | null;
  longName: string | null;
  normalizedKey: string;
  startLine: number;
  lines: string[];
  fields: Record<string, string>;
}

export interface WinproRelation {
  key: string;
  recordIds: string[];
}

export interface ParsedWinpro {
  kind: WinproKind;
  name: string;
  stem: string;
  companionNames: string[];
  byteLength: number;
  lineCount: number;
  rawText: string;
  previewText: string;
  metadata: Record<string, string>;
  sections: WinproSection[];
  symbols: WinproSymbolBlock[];
  records: WinproRecord[];
  relations: WinproRelation[];
  strings: string[];
  application: WinproApplicationInfo | null;
}

export type LoadedWinpro = { type: 'winpro'; data: ParsedWinpro; name: string };

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function decodeText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return Array.from(new Uint8Array(bytes), byte => String.fromCharCode(byte)).join('');
  }
}

function decodeBinaryText(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function extractPrintableStrings(bytes: Uint8Array, minLength = 6): string[] {
  const strings: string[] = [];
  let current = '';

  const flush = () => {
    if (current.length >= minLength) strings.push(current);
    current = '';
  };

  for (const byte of bytes) {
    const isPrintable =
      (byte >= 0x20 && byte <= 0x7e) ||
      byte === 0x09;
    if (isPrintable) {
      current += String.fromCharCode(byte);
    } else {
      flush();
    }
  }
  flush();
  return strings;
}

function formatHexPreview(bytes: Uint8Array, limit = 256): string {
  const slice = bytes.slice(0, Math.min(bytes.length, limit));
  const lines: string[] = [];
  for (let offset = 0; offset < slice.length; offset += 16) {
    const chunk = slice.slice(offset, offset + 16);
    const hex = Array.from(chunk, b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(chunk, b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join('');
    lines.push(`${offset.toString(16).padStart(4, '0')}: ${hex.padEnd(47)}  ${ascii}`);
  }
  return lines.join('\n');
}

function basenameWithoutExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function makeCompanionNames(name: string): string[] {
  const stem = basenameWithoutExtension(name);
  return ['.cfg', '.prn', '.asc']
    .map(ext => `${stem}${ext}`)
    .filter(candidate => candidate.toLowerCase() !== name.toLowerCase());
}

function normalizeKey(...values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => Boolean(value))
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
    .join(' | ')
    .replace(/\s+/g, ' ');
}

function splitTuple(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.replace(/^\(/, '').replace(/\)\s*$/, '');
  if (!inner) return [];
  return inner.split(',').map(part => part.trim());
}

function recordId(sectionKey: string, index: number): string {
  return `${sectionKey}:${index}`;
}

function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const upper = trimmed.toUpperCase();
  return (
    upper === 'PROJECT INFORMATION' ||
    upper.startsWith('APPLICATION :') ||
    upper.startsWith('SIDELOOPS :') ||
    upper.startsWith('ANALOG INPUTS') ||
    upper.startsWith('BINARY INPUTS') ||
    upper.startsWith('ANALOG OUTPUTS') ||
    upper.startsWith('BINARY OUTPUTS') ||
    upper.startsWith('PARAMETERS') ||
    upper.startsWith('APPLICATION LOGIC')
  );
}

function makeSectionKey(title: string, index: number): string {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`;
}

function parseMetadata(lines: string[]): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    if (key && value) metadata[key] = value;
  }
  return metadata;
}

function parseApplication(section: WinproSection | undefined): WinproApplicationInfo | null {
  if (!section) return null;
  const name = section.title.replace(/^APPLICATION\s*:\s*/i, '').trim();
  let revision: number | null = null;
  let questionCount: number | null = null;
  const choices: WinproApplicationChoice[] = [];
  let pendingPrompt: string | null = null;

  for (const rawLine of section.lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const revisionMatch = line.match(/^\(Revision\s+(\d+),\s*(\d+)\s+Questions?\)/i);
    if (revisionMatch) {
      revision = parseInt(revisionMatch[1], 10) || null;
      questionCount = parseInt(revisionMatch[2], 10) || null;
      continue;
    }

    if (line.startsWith('(')) continue;

    if (pendingPrompt === null) {
      pendingPrompt = line.replace(/:\s*$/, '').trim();
      continue;
    }

    const answer = line.replace(/\s+\([^)]*\)\s*$/, '').trim();
    choices.push({ prompt: pendingPrompt, answer, rawLine });
    pendingPrompt = null;
  }

  return { name, revision, questionCount, choices };
}

function parseCfgRecord(lines: string[], section: WinproSection, index: number): WinproRecord | null {
  const header = lines.find(line => line.trim().startsWith('(')) ?? null;
  if (!header) return null;
  const fields = splitTuple(header);
  const [first, second, third, fourth, fifth, sixth, seventh, eighth] = fields;
  const isParameterSection = section.title.startsWith('PARAMETERS');
  const shortName = isParameterSection ? third ?? null : fourth ?? null;
  const longName = isParameterSection ? second ?? null : second ?? null;
  const label = longName || shortName || section.title;

  const recordFields: Record<string, string> = {
    rawHeader: header,
    first: first ?? '',
    second: second ?? '',
    third: third ?? '',
    fourth: fourth ?? '',
    fifth: fifth ?? '',
    sixth: sixth ?? '',
    seventh: seventh ?? '',
    eighth: eighth ?? '',
  };

  if (section.title.startsWith('ANALOG INPUTS') || section.title.startsWith('BINARY INPUTS') || section.title.startsWith('ANALOG OUTPUTS') || section.title.startsWith('BINARY OUTPUTS')) {
    Object.assign(recordFields, {
      ioNumber: first ?? '',
      longName: second ?? '',
      originalLongName: third ?? '',
      shortName: fourth ?? '',
      pointType: fifth ?? '',
      pointNumber: sixth ?? '',
      originalNumber: seventh ?? '',
      noRef: eighth ?? '',
    });
  } else if (isParameterSection) {
    Object.assign(recordFields, {
      heading: first ?? '',
      longName: second ?? '',
      shortName: third ?? '',
      value: fourth ?? '',
      valueDisplay: fifth ?? '',
      valueMetric: sixth ?? '',
    });
  }

  return {
    id: recordId(section.key, index),
    kind: 'section-row',
    sectionKey: section.key,
    sectionTitle: section.title,
    label,
    shortName: shortName || null,
    longName: longName || null,
    normalizedKey: normalizeKey(shortName, longName, section.title),
    startLine: section.startLine,
    lines,
    fields: recordFields,
  };
}

function parsePrnSection(section: WinproSection, index: number): WinproRecord[] {
  const records: WinproRecord[] = [];
  const body = section.lines.slice(1);

  if (section.title.startsWith('ANALOG INPUTS') || section.title.startsWith('BINARY INPUTS') || section.title.startsWith('ANALOG OUTPUTS') || section.title.startsWith('BINARY OUTPUTS')) {
    for (const line of body) {
      const match = line.match(/^\s*\*\s*([AB]I|[AB]O)\s+(\d+)\s+SHORT NAME\s*:\s*(.*?)\s+LONG NAME\s*:\s*(.*?)\s*$/i);
      if (!match) continue;
      const [, pointType, pointNumber, shortName, longName] = match;
      records.push({
        id: recordId(section.key, records.length + index),
        kind: 'section-row',
        sectionKey: section.key,
        sectionTitle: section.title,
        label: longName.trim() || shortName.trim() || `${pointType} ${pointNumber}`,
        shortName: shortName.trim() || null,
        longName: longName.trim() || null,
        normalizedKey: normalizeKey(shortName, longName, `${pointType} ${pointNumber}`),
        startLine: section.startLine,
        lines: [line],
        fields: {
          pointType: pointType.toUpperCase(),
          pointNumber,
          shortName: shortName.trim(),
          longName: longName.trim(),
        },
      });
    }
  }

  if (section.title.startsWith('PARAMETERS')) {
    for (const line of body) {
      const match = line.match(/^\s*\*\s*([A-Z]+)\s+(\d+)\s+SHORT NAME\s*:\s*(.*?)\s+LONG NAME\s*:\s*(.*?)\s*$/i);
      if (!match) continue;
      const [, pointType, pointNumber, shortName, longName] = match;
      records.push({
        id: recordId(section.key, records.length + index),
        kind: 'section-row',
        sectionKey: section.key,
        sectionTitle: section.title,
        label: longName.trim() || shortName.trim() || `${pointType} ${pointNumber}`,
        shortName: shortName.trim() || null,
        longName: longName.trim() || null,
        normalizedKey: normalizeKey(shortName, longName, `${pointType} ${pointNumber}`),
        startLine: section.startLine,
        lines: [line],
        fields: {
          pointType: pointType.toUpperCase(),
          pointNumber,
          shortName: shortName.trim(),
          longName: longName.trim(),
        },
      });
    }
  }

  return records;
}

function parseQuestionAnswerRecords(section: WinproSection | undefined): WinproRecord[] {
  if (!section) return [];
  const records: WinproRecord[] = [];
  let pendingPrompt: string | null = null;
  let promptLine = section.startLine;

  for (let i = 0; i < section.lines.length; i += 1) {
    const rawLine = section.lines[i];
    const line = rawLine.trim();
    if (!line || line.startsWith('(') || line.startsWith('APPLICATION :')) continue;
    if (/^\(Revision\s+\d+,\s*\d+\s+Questions?\)/i.test(line)) continue;

    if (pendingPrompt === null) {
      pendingPrompt = line.replace(/:\s*$/, '').trim();
      promptLine = section.startLine + i;
      continue;
    }

    const answer = line.replace(/\s+\([^)]*\)\s*$/, '').trim();
    records.push({
      id: `${section.key}:qa-${records.length}`,
      kind: 'question',
      sectionKey: section.key,
      sectionTitle: section.title,
      label: pendingPrompt,
      shortName: pendingPrompt,
      longName: answer,
      normalizedKey: normalizeKey(pendingPrompt, answer),
      startLine: promptLine,
      lines: [pendingPrompt, answer],
      fields: {
        prompt: pendingPrompt,
        answer,
      },
    });
    pendingPrompt = null;
  }

  return records;
}

function parseCfgSection(section: WinproSection): WinproRecord[] {
  const records: WinproRecord[] = [];
  if (
    section.title.startsWith('ANALOG INPUTS') ||
    section.title.startsWith('BINARY INPUTS') ||
    section.title.startsWith('ANALOG OUTPUTS') ||
    section.title.startsWith('BINARY OUTPUTS') ||
    section.title.startsWith('PARAMETERS')
  ) {
    let block: string[] = [];
    const flush = () => {
      const record = parseCfgRecord(block, section, records.length);
      if (record) records.push(record);
      block = [];
    };

    for (const line of section.lines.slice(1)) {
      if (!line.trim()) {
        if (block.length) flush();
        continue;
      }

      const isBlockStart = line.startsWith('(') && block.length > 0 && !line.startsWith(' (');
      if (isBlockStart) {
        flush();
        block = [line];
        continue;
      }

      if (!block.length && line.trim().startsWith('(')) {
        block = [line];
        continue;
      }

      if (block.length) block.push(line);
    }

    if (block.length) flush();
  }
  return records;
}

function parseSymbolRecords(symbols: WinproSymbolBlock[]): WinproRecord[] {
  return symbols.map((symbol, index) => ({
    id: `symbol:${index}`,
    kind: 'symbol',
    sectionKey: 'application-logic',
    sectionTitle: 'APPLICATION LOGIC',
    label: symbol.name,
    shortName: symbol.name,
    longName: symbol.module ?? symbol.anchor ?? null,
    normalizedKey: normalizeKey(symbol.name, symbol.module, symbol.anchor),
    startLine: symbol.startLine,
    lines: symbol.lines,
    fields: {
      rawHeader: symbol.rawHeader,
      module: symbol.module ?? '',
      anchor: symbol.anchor ?? '',
    },
  }));
}

function parseAscRecords(name: string, strings: string[]): WinproRecord[] {
  return strings.map((entry, index) => ({
    id: `string:${index}`,
    kind: 'string',
    sectionKey: 'extracted-strings',
    sectionTitle: 'Extracted strings',
    label: entry,
    shortName: entry,
    longName: null,
    normalizedKey: normalizeKey(entry, basenameWithoutExtension(name)),
    startLine: index + 1,
    lines: [entry],
    fields: {
      string: entry,
    },
  }));
}

function buildRelations(records: WinproRecord[]): WinproRelation[] {
  const groups = new Map<string, WinproRecord[]>();
  for (const record of records) {
    const key = record.normalizedKey;
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, recordIds: group.map(record => record.id) }));
}

function parseStructuredText(kind: Exclude<WinproKind, 'asc'>, name: string, text: string): ParsedWinpro {
  const rawText = normalizeNewlines(text);
  const lines = rawText.split('\n');
  const sections: WinproSection[] = [];
  const symbols: WinproSymbolBlock[] = [];

  let currentSection: WinproSection | undefined;
  let currentSymbol: WinproSymbolBlock | null = null;
  let symbolIndex = 0;

  const openSection = (title: string, lineNo: number, sectionKind: WinproSection['kind']): WinproSection => {
    if (currentSymbol) {
      symbols.push(currentSymbol);
      currentSymbol = null;
    }
    if (currentSection) sections.push(currentSection);
    currentSection = { key: makeSectionKey(title, sections.length), title, kind: sectionKind, startLine: lineNo, lines: [] };
    return currentSection;
  };

  const openSymbol = (line: string, lineNo: number) => {
    if (currentSymbol) symbols.push(currentSymbol);
    const header = line.trim();
    const symbolMatch = header.match(/^SYMBOL\s+(.+)$/i);
    const rawHeader = header;
    let namePart = symbolMatch?.[1]?.trim() ?? header.replace(/^SYMBOL\s+/i, '');
    let module: string | null = null;
    let anchor: string | null = null;

    const moduleMatch = namePart.match(/\(([^)]+)\)\s*$/);
    if (moduleMatch) {
      module = moduleMatch[1].trim() || null;
      namePart = namePart.replace(/\s*\(([^)]+)\)\s*$/, '').trim();
    }

    const anchorMatch = namePart.match(/<([^>]+)>/);
    if (anchorMatch) {
      anchor = anchorMatch[1].trim() || null;
      namePart = namePart.replace(/<[^>]+>/, '').trim();
    }

    namePart = namePart
      .replace(/\[\]/g, '')
      .replace(/=\{?/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    currentSymbol = {
      name: namePart || `Symbol ${symbolIndex + 1}`,
      rawHeader,
      module,
      anchor,
      startLine: lineNo,
      lines: [line],
    };
    symbolIndex += 1;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('SYMBOL ')) {
      openSymbol(line, i + 1);
      continue;
    }

    if (isSectionHeader(line)) {
      const section = openSection(trimmed, i + 1, 'header');
      section.lines.push(line);
      continue;
    }

    if (!currentSection && !currentSymbol) {
      openSection('PREAMBLE', i + 1, 'preamble');
    }

    if (currentSymbol) {
      (currentSymbol as WinproSymbolBlock).lines.push(line);
    } else {
      (currentSection as WinproSection | undefined)?.lines.push(line);
    }
  }

  if (currentSymbol) symbols.push(currentSymbol);
  if (currentSection) sections.push(currentSection);

  const applicationIndex = lines.findIndex(line => /^\s*APPLICATION\s*:/i.test(line));
  const metadata = parseMetadata(lines.slice(0, applicationIndex >= 0 ? applicationIndex : Math.min(lines.length, 60)));
  const applicationSection = sections.find(section => section.title.startsWith('APPLICATION :'));
  const application = parseApplication(applicationSection);
  const records = sections.flatMap(section => {
    if (section.title.startsWith('APPLICATION :') || section.title.startsWith('QUESTION AND ANSWER SESSION')) {
      return parseQuestionAnswerRecords(section);
    }
    if (kind === 'cfg') {
      return parseCfgSection(section);
    }
    if (kind === 'prn') {
      return parsePrnSection(section, 0);
    }
    return [];
  }).concat(parseSymbolRecords(symbols));
  const relations = buildRelations(records);

  return {
    kind,
    name,
    stem: basenameWithoutExtension(name),
    companionNames: makeCompanionNames(name),
    byteLength: new TextEncoder().encode(rawText).length,
    lineCount: lines.length,
    rawText,
    previewText: lines.slice(0, 240).join('\n'),
    metadata,
    sections,
    symbols,
    records,
    relations,
    strings: [],
    application,
  };
}

function parseAsc(name: string, bytes: Uint8Array): ParsedWinpro {
  const rawText = decodeBinaryText(bytes);
  const strings = extractPrintableStrings(bytes, 6);
  const records = parseAscRecords(name, strings);
  return {
    kind: 'asc',
    name,
    stem: basenameWithoutExtension(name),
    companionNames: makeCompanionNames(name),
    byteLength: bytes.length,
    lineCount: rawText.split(/\r?\n/).length,
    rawText,
    previewText: formatHexPreview(bytes, 512),
    metadata: {
      'Printable strings': String(strings.length),
      'Hex preview bytes': String(Math.min(bytes.length, 512)),
    },
    sections: [
      {
        key: 'extracted-strings',
        title: 'Extracted strings',
        kind: 'binary',
        startLine: 1,
        lines: strings,
      },
    ],
    symbols: [],
    records,
    relations: buildRelations(records),
    strings,
    application: null,
  };
}

export async function parseWinproFile(file: File): Promise<LoadedWinpro> {
  const name = file.name;
  const lower = name.toLowerCase();
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (lower.endsWith('.asc')) {
    return { type: 'winpro', name, data: parseAsc(name, bytes) };
  }

  const text = decodeText(buffer);
  const kind: Exclude<WinproKind, 'asc'> = lower.endsWith('.cfg') ? 'cfg' : 'prn';
  return { type: 'winpro', name, data: parseStructuredText(kind, name, text) };
}
