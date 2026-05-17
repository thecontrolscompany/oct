import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CafObject, DbexportObject, ReferenceHit } from '../api';
import type { ReferenceIndex } from '@oct/shared';
import type { GraphicResolver } from '../archiveParser';
import TreeGlyph from './TreeGlyph';

type AnyObject = CafObject | DbexportObject;

export const GRAPHIC_CLASS_IDS = new Set([344, 357, 717, 844]);

type GraphicFamily = 'facility' | 'silverlight' | 'legacy';

const CLASS_LABEL: Record<number, string> = {
  344: 'Legacy Graphic',
  357: 'Graphic Binding',
  717: 'Graphic',
  844: 'Facility Graphic',
};

function displayName(o: AnyObject): string {
  return o.tag || o.description || `${o.className} #${o.objectid}`;
}

function getBindingFileName(o: AnyObject): string | null {
  return 'bindingFileName' in o ? ((o as DbexportObject).bindingFileName ?? null) : null;
}

function getGraphicFamily(o: AnyObject): GraphicFamily {
  const fileName = getBindingFileName(o)?.toLowerCase() ?? '';
  const ref = o.ref.toLowerCase();
  if (ref.includes('$facilitygraphics') || fileName.endsWith('.json')) return 'facility';
  if (fileName.endsWith('.xaml') || ref.includes('.xaml')) return 'silverlight';
  return 'legacy';
}

function graphicFamilyLabel(family: GraphicFamily): string {
  switch (family) {
    case 'facility':
      return 'Facility Graphics';
    case 'silverlight':
      return 'Silverlight Graphics';
    case 'legacy':
      return 'Legacy Graphics';
  }
}

export function buildGraphicTagMap(objects: AnyObject[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const o of objects) {
    if (GRAPHIC_CLASS_IDS.has(o.classid)) m.set(o.ref, displayName(o));
  }
  return m;
}

interface GraphicTreeNode {
  key: string;
  label: string;
  ref: string | null;
  classid: number | null;
  className: string;
  graphic: AnyObject | null;
  family?: GraphicFamily;
  children: GraphicTreeNode[];
}

function parseGraphicRef(ref: string): { engine: string; segments: string[] } {
  const colonIdx = ref.indexOf(':');
  const after = colonIdx >= 0 ? ref.slice(colonIdx + 1) : ref;
  const slashIdx = after.indexOf('/');
  if (slashIdx < 0) return { engine: after, segments: [] };
  return { engine: after.slice(0, slashIdx), segments: after.slice(slashIdx + 1).split('.').filter(Boolean) };
}

function categorizeGraphicSegment(seg: string): { label: string; kind: string } {
  if (seg === 'Graphics') return { label: 'Graphics', kind: 'graphics' };
  if (seg === '$FacilityGraphics') return { label: 'Facility Graphics', kind: 'graphics' };
  if (/^\d+$/i.test(seg)) return { label: `Group ${seg}`, kind: 'group' };
  if (/^\d{8}-\d{6}-[\w]+$/i.test(seg)) return { label: seg, kind: 'graphic' };
  return { label: seg, kind: 'group' };
}

function buildGraphicHierarchy(objects: AnyObject[]): GraphicTreeNode[] {
  const roots = new Map<GraphicFamily, GraphicTreeNode>();

  for (const obj of objects) {
    if (!GRAPHIC_CLASS_IDS.has(obj.classid)) continue;
    const { engine, segments } = parseGraphicRef(obj.ref);
    if (!engine) continue;
    const family = getGraphicFamily(obj);
    const familyLabel = graphicFamilyLabel(family);

    let node = roots.get(family);
    if (!node) {
      node = {
        key: family,
        label: familyLabel,
        ref: null,
        classid: null,
        className: familyLabel,
        graphic: null,
        family,
        children: [],
      };
      roots.set(family, node);
    }

    let engineNode = node.children.find(entry => entry.key === `${family}#engine#${engine}`);
    if (!engineNode) {
      engineNode = {
        key: `${family}#engine#${engine}`,
        label: engine,
        ref: null,
        classid: null,
        className: 'Engine',
        graphic: null,
        children: [],
      };
      node.children.push(engineNode);
    }

    const segmentOffset =
      family === 'facility'
        ? (segments[0] === '$FacilityGraphics' ? 1 : 0)
        : (segments[0] === 'Graphics' ? 1 : 0);

    if (segments.length <= segmentOffset) {
      engineNode.graphic = obj;
      engineNode.ref = obj.ref;
      engineNode.classid = obj.classid;
      engineNode.className = obj.className;
      continue;
    }

    let current = engineNode;
    let keyPath = engineNode.key;
    for (let i = segmentOffset; i < segments.length; i += 1) {
      const seg = segments[i];
      keyPath = `${keyPath}#${seg}`;
      let child = current.children.find(entry => entry.key === keyPath);
      if (!child) {
        const cat = i === segmentOffset ? categorizeGraphicSegment(seg) : null;
        child = {
          key: keyPath,
          label: cat?.label ?? seg,
          ref: null,
          classid: null,
          className: cat?.kind ?? 'group',
          graphic: null,
          children: [],
        };
        current.children.push(child);
      }
      current = child;
      if (i === segments.length - 1) {
        current.graphic = obj;
        current.ref = obj.ref;
        current.classid = obj.classid;
        current.className = obj.className;
        if (/^\d+$/i.test(current.label) || /^\d{8}-\d{6}-[\w]+$/i.test(current.label)) {
        current.label = displayName(obj);
      }
    }
  }
  }

  const sortNodes = (nodes: GraphicTreeNode[]): GraphicTreeNode[] =>
    nodes
      .sort((a, b) => {
        const aWeight = a.graphic ? 2 : a.children.length > 0 ? 1 : 0;
        const bWeight = b.graphic ? 2 : b.children.length > 0 ? 1 : 0;
        if (aWeight !== bWeight) return aWeight - bWeight;
        return a.label.localeCompare(b.label, undefined, { numeric: true });
      })
      .map(node => ({
        ...node,
        children: sortNodes(node.children),
      }));

  return sortNodes(
    [...roots.values()].sort((a, b) => {
      const order: Record<GraphicFamily, number> = { facility: 0, silverlight: 1, legacy: 2 };
      const aKey = a.family ? order[a.family] : 99;
      const bKey = b.family ? order[b.family] : 99;
      if (aKey !== bKey) return aKey - bKey;
      return a.label.localeCompare(b.label, undefined, { numeric: true });
    }),
  );
}

function graphicTreeMatches(node: GraphicTreeNode, query: string): boolean {
  if (!query) return true;
  if ([node.label, node.ref ?? '', node.className].some(v => v.toLowerCase().includes(query))) return true;
  return node.children.some(child => graphicTreeMatches(child, query));
}

function graphicTreeKind(node: GraphicTreeNode): 'engine' | 'folder' | 'point' {
  if (node.graphic) return 'point';
  if (node.children.length > 0) return node.className === 'Engine' ? 'engine' : 'folder';
  return 'folder';
}

function GraphicTreeRow({
  node,
  depth,
  selectedKey,
  expanded,
  onSelect,
  onToggle,
  query,
  referenceIndex,
}: {
  node: GraphicTreeNode;
  depth: number;
  selectedKey: string | null;
  expanded: Set<string>;
  onSelect: (node: GraphicTreeNode) => void;
  onToggle: (key: string) => void;
  query: string;
  referenceIndex: ReferenceIndex;
}) {
  const isSelected = selectedKey === node.ref;
  const hasMatches = query ? graphicTreeMatches(node, query) : true;
  const visibleChildren = query ? node.children.filter(child => graphicTreeMatches(child, query)) : node.children;
  const isOpen = expanded.has(node.key) || (query ? visibleChildren.length > 0 : false);
  const kind = graphicTreeKind(node);
  const incomingCount = node.ref ? (referenceIndex.counts.get(node.ref) ?? 0) : 0;
  const familyBadge = node.family ? graphicFamilyLabel(node.family) : null;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: `5px 10px 5px ${12 + depth * 14}px`,
          cursor: 'pointer',
          background: isSelected ? 'rgba(67,120,181,0.14)' : 'transparent',
          borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
          borderBottom: '1px solid rgba(175,199,226,0.3)',
          opacity: hasMatches ? 1 : 0.45,
        }}
        onClick={() => { if (node.ref) onSelect(node); if (node.children.length) onToggle(node.key); }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <span style={{ width: 12, fontSize: 10, flexShrink: 0, textAlign: 'center', color: 'var(--text-dim)' }}>
          {node.children.length ? (isOpen ? '▾' : '▸') : ''}
        </span>
        <TreeGlyph kind={kind} active={isSelected} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.label}
        </span>
        {familyBadge && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(175,199,226,0.65)', borderRadius: 999, padding: '1px 6px' }}>
            {familyBadge}
          </span>
        )}
        {node.graphic && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(175,199,226,0.65)', borderRadius: 999, padding: '1px 6px' }}>
            {CLASS_LABEL[node.classid ?? 0] ?? 'graphic'}
          </span>
        )}
        {incomingCount > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(175,199,226,0.65)', borderRadius: 999, padding: '1px 6px' }}>
            {incomingCount} in
          </span>
        )}
      </div>
      {isOpen && visibleChildren.map(child => (
        <GraphicTreeRow
          key={child.key}
          node={child}
          depth={depth + 1}
          selectedKey={selectedKey}
          expanded={expanded}
          onSelect={onSelect}
          onToggle={onToggle}
          query={query}
          referenceIndex={referenceIndex}
        />
      ))}
    </div>
  );
}

// ─── SVG utilities ────────────────────────────────────────────────────────────

function sanitizeSvg(raw: string): string {
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
}

function getSvgDimensions(svgContent: string): { width: number; height: number } {
  const vbMatch = svgContent.match(/viewBox\s*=\s*["']\s*[\d.]*\s+[\d.]*\s+([\d.]+)\s+([\d.]+)\s*["']/);
  if (vbMatch) return { width: parseFloat(vbMatch[1]), height: parseFloat(vbMatch[2]) };
  const wMatch = svgContent.match(/\bwidth\s*=\s*["']([\d.]+)["']/);
  const hMatch = svgContent.match(/\bheight\s*=\s*["']([\d.]+)["']/);
  if (wMatch && hMatch) return { width: parseFloat(wMatch[1]), height: parseFloat(hMatch[2]) };
  return { width: 1920, height: 1080 };
}

type LegacyGraphicModel = {
  document: Document;
  backgroundSvg: string;
  width: number;
  height: number;
  title: string | null;
};

function isLegacyGraphicDocument(raw: string): boolean {
  return raw.trimStart().startsWith('<GMFDocument');
}

function isLegacyGraphicZip(raw: string): boolean {
  return raw.trimStart().startsWith('<Base64Zip');
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
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

async function inflateGzipBase64ToText(text: string): Promise<string | null> {
  const bytes = decodeBase64(text);
  if (!bytes) return null;
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  } catch {
    return null;
  }
}

async function parseLegacyGraphicModel(raw: string): Promise<LegacyGraphicModel | null> {
  let source = stripBom(raw);
  if (isLegacyGraphicZip(source)) {
    const zipDoc = new DOMParser().parseFromString(source, 'text/xml');
    const base64Zip = zipDoc.querySelector('Base64Zip')?.textContent?.trim();
    if (!base64Zip) return null;
    const inflated = await inflateGzipBase64ToText(base64Zip);
    if (!inflated) return null;
    source = inflated;
  }

  const doc = new DOMParser().parseFromString(source, 'text/xml');
  if (doc.documentElement?.tagName !== 'GMFDocument') return null;
  const bgEl = doc.querySelector('backgroundImageData');
  if (!bgEl?.textContent) return null;
  const backgroundSvg = await inflateGzipBase64ToText(bgEl.textContent.trim());
  if (!backgroundSvg) return null;
  const dims = getSvgDimensions(backgroundSvg);
  const title = doc.querySelector('graph > comment')?.textContent?.trim() ?? null;
  return { document: doc, backgroundSvg, width: dims.width, height: dims.height, title };
}

function legacyLocalName(el: Element): string {
  return (el.localName || el.tagName || '').split(':').pop() || el.tagName || '';
}

function legacyUiName(node: Element): string {
  return node.querySelector('ui > name')?.textContent?.trim()
    ?? legacyAttr(node.querySelector('ui'), 'name')
    ?? '';
}

function legacyAttr(el: Element | null, name: string): string | null {
  if (!el) return null;
  const value = el.getAttribute(name);
  return value && value.trim() ? value.trim() : null;
}

function legacyNumber(el: Element | null, name: string, fallback = 0): number {
  const value = legacyAttr(el, name);
  if (!value) return fallback;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function legacyColor(value: string | null | undefined, fallback = 'none'): string {
  if (!value) return fallback;
  const v = value.trim();
  if (!v) return fallback;
  if (v.startsWith('#') || v.startsWith('rgb(') || v.startsWith('url(')) return v;
  if (/^\d+\s+\d+\s+\d+(\s+\d+)?$/.test(v)) {
    const parts = v.split(/\s+/).map(n => Number(n));
    if (parts.length >= 3) return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
  }
  return v;
}

function legacyBounds(el: Element): { x: number; y: number; width: number; height: number } {
  const x = legacyNumber(el, 'Canvas.Left', legacyNumber(el, 'x', 0));
  const y = legacyNumber(el, 'Canvas.Top', legacyNumber(el, 'y', 0));
  const width = legacyNumber(el, 'Width', legacyNumber(el, 'width', 0));
  const height = legacyNumber(el, 'Height', legacyNumber(el, 'height', 0));
  return { x, y, width, height };
}

function legacyTextContent(el: Element, fallback = ''): string {
  const text = legacyAttr(el, 'Text') ?? legacyAttr(el, 'Content') ?? fallback;
  return text;
}

function legacyNodeTarget(node: Element, objectMap: Map<string, AnyObject>): string | null {
  const candidates = [
    legacyAttr(node, 'bindingObjectNameText'),
    legacyAttr(node, 'reference'),
    legacyAttr(node, 'hyperlinkText'),
    legacyAttr(node, 'NavigateBinding'),
  ].filter((v): v is string => Boolean(v));
  for (const candidate of candidates) {
    if (objectMap.has(candidate)) return candidate;
  }
  return null;
}

function legacyUiMatches(uiName: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(uiName));
}

function legacyRenderText(
  el: Element,
  key: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: React.SVGProps<SVGTextElement> = {},
) {
  const fontSize = legacyNumber(el, 'FontSize', 14);
  const fontFamily = legacyAttr(el, 'FontFamily') ?? 'Verdana';
  const text = legacyTextContent(el);
  const fill = legacyColor(legacyAttr(el, 'Foreground') ?? legacyAttr(el, 'textColor'), '#000');
  const isBold = legacyAttr(el, 'IsBold') === 'True' || /bold/i.test(legacyAttr(el, 'font') ?? '');
  const isItalic = legacyAttr(el, 'IsItalic') === 'True' || /italic/i.test(legacyAttr(el, 'font') ?? '');
  const lines = text.split(/\r?\n/);
  const lineHeight = fontSize * 1.1;
  const startY = y + Math.max(fontSize, (height - (lines.length - 1) * lineHeight) / 2);
  const anchor = 'middle';
  return (
    <text
      key={key}
      x={x + width / 2}
      y={startY}
      fill={fill}
      fontFamily={fontFamily}
      fontSize={fontSize}
      fontWeight={isBold ? 700 : 400}
      fontStyle={isItalic ? 'italic' : 'normal'}
      textAnchor={anchor}
      dominantBaseline="middle"
      {...extra}
    >
      {lines.map((line, index) => (
        <tspan key={`${key}-line-${index}`} x={x + width / 2} dy={index === 0 ? 0 : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function legacyRenderNode(
  node: Element,
  key: string,
  objectMap: Map<string, AnyObject>,
  onSelectObject?: (ref: string) => void,
) {
  const uiName = legacyUiName(node);
  const uiNameLower = uiName.toLowerCase();
  const geometry = node.querySelector('geometry');
  const x = legacyNumber(geometry ?? node, 'x', legacyNumber(node, 'Canvas.Left', 0));
  const y = legacyNumber(geometry ?? node, 'y', legacyNumber(node, 'Canvas.Top', 0));
  const width = legacyNumber(geometry ?? node, 'width', legacyNumber(node, 'Width', 80));
  const height = legacyNumber(geometry ?? node, 'height', legacyNumber(node, 'Height', 24));
  const fill = legacyColor(legacyAttr(node.querySelector('ui'), 'fillColor') ?? legacyAttr(node, 'fillColor'), '#f5f5f5');
  const border = legacyColor(legacyAttr(node.querySelector('ui'), 'borderColor') ?? legacyAttr(node, 'borderColor'), '#222');
  const hidden = legacyAttr(node, 'hidden') === 'true' || legacyAttr(node, 'hidden') === 'True';
  const target = legacyNodeTarget(node, objectMap);
  const clickable = Boolean(target && onSelectObject);
  const text = legacyTextContent(node, legacyAttr(node, 'bindingObjectNameText') ?? '');

  const commonProps = {
    key,
    transform: `translate(${x}, ${y})`,
    opacity: hidden ? 0.75 : 1,
    style: { cursor: clickable ? 'pointer' : 'default' },
    onClick: (e: React.MouseEvent) => {
      if (!clickable || !target || !onSelectObject) return;
      e.stopPropagation();
      onSelectObject(target);
    },
    'data-oct-target': target ?? undefined,
  } as const;

  if (
    legacyUiMatches(uiName, [/JCValueDisplayNodeUI$/i, /value/i, /display/i, /readout/i]) ||
    (uiNameLower.includes('label') && uiNameLower.includes('value'))
  ) {
    return (
      <g {...commonProps}>
        <rect x={0} y={0} width={width} height={height} rx={1} ry={1} fill={fill} stroke={border} strokeWidth={1} />
        {legacyRenderText(node, `${key}-text`, 0, 0, width, height, { fill: legacyColor(legacyAttr(node.querySelector('ui'), 'textColor') ?? legacyAttr(node, 'textColor'), '#000') })}
      </g>
    );
  }

  if (legacyUiMatches(uiName, [/JCJButtonNodeUI$/i, /button/i])) {
    const drawBorder = legacyAttr(node.querySelector('ui'), 'drawBorder') !== 'false';
    return (
      <g {...commonProps}>
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          rx={2}
          ry={2}
          fill={fill}
          stroke={drawBorder ? border : 'none'}
          strokeWidth={drawBorder ? 1 : 0}
        />
        {legacyRenderText(node, `${key}-text`, 0, 0, width, height, { fill: legacyColor(legacyAttr(node.querySelector('ui'), 'textColor') ?? legacyAttr(node, 'textColor'), '#000') })}
      </g>
    );
  }

  if (legacyUiMatches(uiName, [/JCCircleNodeUI$/i, /circle/i, /lamp/i, /indicator/i, /light/i])) {
    const r = Math.min(width, height) / 2;
    return (
      <g {...commonProps}>
        <circle cx={r} cy={r} r={Math.max(1, r - 1)} fill={fill} stroke={border} strokeWidth={1} />
        {text && legacyRenderText(node, `${key}-text`, 0, 0, width, height, { fill: legacyColor(legacyAttr(node.querySelector('ui'), 'textColor') ?? legacyAttr(node, 'textColor'), '#000') })}
      </g>
    );
  }

  if (legacyUiMatches(uiName, [/JCAnimatedFanBladesNodeUI$/i, /fan/i])) {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) / 2;
    const bladeFill = legacyColor(legacyAttr(node.querySelector('ui'), 'fillColor') ?? fill, '#ff0');
    return (
      <g {...commonProps}>
        <circle cx={cx} cy={cy} r={Math.max(1, r * 0.22)} fill={border} />
        {Array.from({ length: 5 }).map((_, i) => {
          const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
          const x1 = cx + Math.cos(angle) * (r * 0.18);
          const y1 = cy + Math.sin(angle) * (r * 0.18);
          const x2 = cx + Math.cos(angle) * (r * 0.92);
          const y2 = cy + Math.sin(angle) * (r * 0.92);
          return <line key={`${key}-blade-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={bladeFill} strokeWidth={Math.max(1, r * 0.12)} strokeLinecap="round" />;
        })}
      </g>
    );
  }

  if (legacyUiMatches(uiName, [/gauge/i, /meter/i, /dial/i])) {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) / 2;
    const needleAngle = -Math.PI / 4;
    return (
      <g {...commonProps}>
        <path
          d={`M ${cx - r * 0.75} ${cy + r * 0.2} A ${r * 0.75} ${r * 0.75} 0 0 1 ${cx + r * 0.75} ${cy + r * 0.2}`}
          fill="none"
          stroke={border}
          strokeWidth={1.5}
        />
        <circle cx={cx} cy={cy} r={Math.max(1, r * 0.12)} fill={border} />
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(needleAngle) * (r * 0.72)}
          y2={cy + Math.sin(needleAngle) * (r * 0.72)}
          stroke={legacyColor(legacyAttr(node.querySelector('ui'), 'needleColor') ?? border, border)}
          strokeWidth={Math.max(1.5, r * 0.08)}
          strokeLinecap="round"
        />
      </g>
    );
  }

  if (legacyUiMatches(uiName, [/switch/i, /toggle/i])) {
    const knobOffset = legacyAttr(node.querySelector('ui'), 'isOn') === 'True' ? width * 0.55 : width * 0.08;
    return (
      <g {...commonProps}>
        <rect x={0} y={height * 0.25} width={width} height={height * 0.5} rx={height * 0.25} ry={height * 0.25} fill={fill} stroke={border} strokeWidth={1} />
        <circle cx={knobOffset + height * 0.25} cy={height * 0.5} r={height * 0.22} fill="#fff" stroke={border} strokeWidth={1} />
      </g>
    );
  }

  if (legacyUiMatches(uiName, [/triangle/i, /arrow/i])) {
    return (
      <g {...commonProps}>
        <polygon
          points={`0,${height} ${width / 2},0 ${width},${height}`}
          fill={legacyColor(legacyAttr(node.querySelector('ui'), 'fillColor') ?? fill, fill)}
          stroke={border}
          strokeWidth={1}
        />
      </g>
    );
  }

  if (legacyUiMatches(uiName, [/rectangle/i, /square/i, /border/i, /panel/i, /frame/i])) {
    return (
      <g {...commonProps}>
        <rect x={0} y={0} width={width} height={height} rx={legacyNumber(node.querySelector('ui'), 'radiusX', 0)} ry={legacyNumber(node.querySelector('ui'), 'radiusY', 0)} fill={fill} stroke={border} strokeWidth={1} />
        {text && legacyRenderText(node, `${key}-text`, 0, 0, width, height, { fill: legacyColor(legacyAttr(node.querySelector('ui'), 'textColor') ?? legacyAttr(node, 'textColor'), '#000') })}
      </g>
    );
  }

  return (
    <g {...commonProps}>
      <rect x={0} y={0} width={width} height={height} rx={1} ry={1} fill={fill} fillOpacity={0.16} stroke={border} strokeDasharray="4 3" strokeWidth={1} />
      {text && legacyRenderText(node, `${key}-text`, 0, 0, width, height, { fill: border, fontSize: Math.max(10, legacyNumber(node.querySelector('ui'), 'fontSize', 12)) })}
    </g>
  );
}

function legacyRenderPrimitive(
  el: Element,
  key: string,
  objectMap: Map<string, AnyObject>,
  onSelectObject?: (ref: string) => void,
): React.ReactNode[] {
  const local = legacyLocalName(el);
  const children = Array.from(el.children);
  const renderedChildren = children.flatMap((child, index) => legacyRenderPrimitive(child, `${key}-${legacyLocalName(child)}-${index}`, objectMap, onSelectObject));

  if (local === 'backgroundImageData' || local === 'backgroundImageType' || local === 'comment' || local === 'version') {
    return [];
  }

  if (local === 'node') {
    return [legacyRenderNode(el, key, objectMap, onSelectObject)];
  }

  if (local === 'TextBlock') {
    const b = legacyBounds(el);
    return [legacyRenderText(el, key, b.x, b.y, b.width, b.height, {})];
  }

  if (local === 'Line') {
    return [
      <line
        key={key}
        x1={legacyNumber(el, 'X1', 0)}
        y1={legacyNumber(el, 'Y1', 0)}
        x2={legacyNumber(el, 'X2', 0)}
        y2={legacyNumber(el, 'Y2', 0)}
        stroke={legacyColor(legacyAttr(el, 'Stroke'), '#000')}
        strokeWidth={legacyNumber(el, 'StrokeThickness', 1)}
      />,
    ];
  }

  if (local === 'Path') {
    const d = legacyAttr(el, 'Data') ?? legacyAttr(el, 'd') ?? '';
    return [
      <path
        key={key}
        d={d}
        fill={legacyColor(legacyAttr(el, 'Fill'), 'none')}
        stroke={legacyColor(legacyAttr(el, 'Stroke'), '#000')}
        strokeWidth={legacyNumber(el, 'StrokeThickness', 1)}
      />,
    ];
  }

  if (local === 'EllipseGeometry') {
    return [
      <ellipse
        key={key}
        cx={legacyNumber(el, 'CenterX', 0)}
        cy={legacyNumber(el, 'CenterY', 0)}
        rx={legacyNumber(el, 'RadiusX', 0)}
        ry={legacyNumber(el, 'RadiusY', 0)}
        fill={legacyColor(legacyAttr(el, 'Fill'), 'none')}
        stroke={legacyColor(legacyAttr(el, 'Stroke'), '#000')}
        strokeWidth={legacyNumber(el, 'StrokeThickness', 1)}
      />,
    ];
  }

  if (local === 'Polyline' || local === 'Polygon') {
    return [
      <g key={key}>
        {local === 'Polygon' ? (
          <polygon
            points={legacyAttr(el, 'Points') ?? ''}
            fill={legacyColor(legacyAttr(el, 'Fill'), local === 'Polygon' ? '#fff' : 'none')}
            stroke={legacyColor(legacyAttr(el, 'Stroke'), '#000')}
            strokeWidth={legacyNumber(el, 'StrokeThickness', 1)}
          />
        ) : (
          <polyline
            points={legacyAttr(el, 'Points') ?? ''}
            fill={legacyColor(legacyAttr(el, 'Fill'), 'none')}
            stroke={legacyColor(legacyAttr(el, 'Stroke'), '#000')}
            strokeWidth={legacyNumber(el, 'StrokeThickness', 1)}
          />
        )}
        {renderedChildren}
      </g>,
    ];
  }

  if (local === 'Rectangle' || local === 'BasicSquare') {
    const b = legacyBounds(el);
    return [
      <g key={key}>
        <rect
          x={b.x}
          y={b.y}
          width={b.width}
          height={b.height}
          rx={legacyNumber(el, 'RadiusX', 0)}
          ry={legacyNumber(el, 'RadiusY', 0)}
          fill={legacyColor(legacyAttr(el, 'Fill'), 'none')}
          fillOpacity={legacyAttr(el, 'Opacity') ? Number(legacyAttr(el, 'Opacity')) : undefined}
          stroke={legacyColor(legacyAttr(el, 'Stroke'), 'none')}
          strokeWidth={legacyNumber(el, 'StrokeThickness', 1)}
        />
        {renderedChildren}
      </g>,
    ];
  }

  if (local === 'Ellipse') {
    const b = legacyBounds(el);
    return [
      <g key={key}>
        <ellipse
          cx={b.x + b.width / 2}
          cy={b.y + b.height / 2}
          rx={Math.max(0.5, b.width / 2)}
          ry={Math.max(0.5, b.height / 2)}
          fill={legacyColor(legacyAttr(el, 'Fill'), 'none')}
          stroke={legacyColor(legacyAttr(el, 'Stroke'), '#000')}
          strokeWidth={legacyNumber(el, 'StrokeThickness', 1)}
        />
        {renderedChildren}
      </g>,
    ];
  }

  if (local === 'Canvas' || local.endsWith('Adapter') || local.endsWith('Module') || local.endsWith('Control') || local.startsWith('jc')) {
    const b = legacyBounds(el);
    const tx = `translate(${b.x}, ${b.y})`;
    return [
      <g key={key} transform={tx}>
        {renderedChildren.length > 0 ? renderedChildren : (
          <rect x={0} y={0} width={Math.max(1, b.width || 28)} height={Math.max(1, b.height || 28)} rx={2} ry={2} fill="rgba(0,0,0,0.02)" stroke="rgba(0,0,0,0.15)" strokeDasharray="4 3" />
        )}
      </g>,
    ];
  }

  if (renderedChildren.length > 0) {
    return [<g key={key}>{renderedChildren}</g>];
  }

  return [];
}

function LegacyGraphicStage({
  model,
  objectMap,
  onSelectObject,
}: {
  model: LegacyGraphicModel;
  objectMap: Map<string, AnyObject>;
  onSelectObject?: (ref: string) => void;
}) {
  const graphEl = model.document.querySelector('graph');
  const topologyEl = graphEl?.querySelector('topology');
  const graphChildren = useMemo(() => {
    if (!graphEl) return [];
    return Array.from(graphEl.children).flatMap((child, index) => {
      const local = legacyLocalName(child);
      if (local === 'backgroundImageData' || local === 'backgroundImageType' || local === 'topology' || local === 'ui' || local === 'comment') {
        return [];
      }
      return legacyRenderPrimitive(child, `graph-${local}-${index}`, objectMap, onSelectObject);
    });
  }, [graphEl, objectMap, onSelectObject]);

  const topologyNodes = useMemo(() => {
    if (!topologyEl) return [];
    return Array.from(topologyEl.children)
      .filter(child => legacyLocalName(child) === 'node')
      .flatMap((node, index) => legacyRenderPrimitive(node, `node-${index}`, objectMap, onSelectObject));
  }, [topologyEl, objectMap, onSelectObject]);

  return (
    <div style={{ position: 'relative', width: model.width, height: model.height }}>
      <div
        className="oct-legacy-background"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        dangerouslySetInnerHTML={{ __html: model.backgroundSvg }}
      />
      <svg
        className="oct-legacy-overlay"
        width={model.width}
        height={model.height}
        viewBox={`0 0 ${model.width} ${model.height}`}
        style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'auto' }}
      >
        {graphChildren}
        {topologyNodes}
      </svg>
    </div>
  );
}

// ─── Graphic viewer ───────────────────────────────────────────────────────────

export function GraphicViewer({
  graphic,
  bindings,
  graphicResolver,
  objectMap,
  onSelectObject,
}: {
  graphic: AnyObject;
  bindings: ReferenceHit[];
  graphicResolver?: GraphicResolver;
  objectMap: Map<string, AnyObject>;
  onSelectObject?: (ref: string) => void;
}) {
  const [graphicText, setGraphicText] = useState<string | null>(null);
  const [graphicKind, setGraphicKind] = useState<'svg' | 'legacy' | null>(null);
  const [legacyModel, setLegacyModel] = useState<LegacyGraphicModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [bindingsOpen, setBindingsOpen] = useState(false);
  const [bindingSearch, setBindingSearch] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const boundTargetMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const hit of bindings) {
      const id = hit.referringPath?.split('/').pop()?.trim();
      if (!id) continue;
      const list = map.get(id);
      if (list) list.push(hit.target);
      else map.set(id, [hit.target]);
    }
    return map;
  }, [bindings]);

  const svgFilename = getBindingFileName(graphic);
  const graphicFamily = getGraphicFamily(graphic);

  // Load graphic payload when graphic or resolver changes
  useEffect(() => {
    setGraphicText(null);
    setGraphicKind(null);
    setLegacyModel(null);
    setLoadError(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });

    if (!svgFilename) return;
    if (!graphicResolver) return;

    let cancelled = false;
    setLoading(true);
    graphicResolver.resolve(svgFilename)
      .then(async content => {
        if (cancelled) return;
        if (!content) { setLoadError('Graphic file not found in archive.'); return; }
        if (isLegacyGraphicDocument(content) || isLegacyGraphicZip(content)) {
          const model = await parseLegacyGraphicModel(content);
          if (cancelled) return;
          if (!model) {
            setLoadError('Legacy graphic payload could not be decoded.');
            return;
          }
          setGraphicKind('legacy');
          setLegacyModel(model);
          setGraphicText(content);
        } else {
          setGraphicKind('svg');
          setGraphicText(sanitizeSvg(content));
        }
      })
      .catch(err => {
        if (!cancelled) setLoadError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [svgFilename, graphicResolver]);

  // Fit-to-screen after content appears in DOM
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const dims =
      graphicKind === 'legacy' && legacyModel
        ? { width: legacyModel.width, height: legacyModel.height }
        : graphicText
          ? getSvgDimensions(graphicText)
          : null;
    if (!dims) return;
    const cW = containerRef.current.clientWidth;
    const cH = containerRef.current.clientHeight;
    if (cW <= 0 || cH <= 0) return;
    const fitZ = Math.min(cW / dims.width, cH / dims.height) * 0.95;
    setZoom(fitZ);
    setPan({ x: (cW - dims.width * fitZ) / 2, y: (cH - dims.height * fitZ) / 2 });
  }, [graphicText, graphicKind, legacyModel]);

  // Highlight bound SVG elements
  useEffect(() => {
    if (!svgContainerRef.current || graphicKind !== 'svg' || !graphicText) return;
    const container = svgContainerRef.current;

    // Collect all SVG element IDs from binding referringPaths
    const boundIds = new Set<string>();
    for (const hit of bindings) {
      const seg = hit.referringPath?.split('/').pop() ?? '';
      if (seg) boundIds.add(seg);
    }
    if (boundIds.size === 0) return;

    // Inject a style tag for the highlight if not already present
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;
    let styleTag = svgEl.querySelector('#oct-bound-style') as SVGStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElementNS('http://www.w3.org/2000/svg', 'style') as SVGStyleElement;
      styleTag.id = 'oct-bound-style';
      styleTag.textContent = '.oct-bound { filter: drop-shadow(0 0 5px rgba(255,140,0,0.9)) !important; cursor: pointer; }';
      svgEl.prepend(styleTag);
    }

    // Apply highlight class
    for (const id of boundIds) {
      try {
        const el = container.querySelector(`#${CSS.escape(id)}`);
        if (el) {
          el.classList.add('oct-bound');
          const targets = boundTargetMap.get(id);
          if (targets && targets.length > 0) {
            el.setAttribute('data-oct-bound-target', targets.join('|'));
          }
        }
      } catch {
        // Malformed ID — skip
      }
    }
  }, [graphicText, graphicKind, bindings, boundTargetMap]);

  // ─── Interaction handlers ─────────────────────────────────────────────────

  const getFitState = () => {
    if (!containerRef.current) return { zoom: 1, pan: { x: 0, y: 0 } };
    const dims =
      graphicKind === 'legacy' && legacyModel
        ? { width: legacyModel.width, height: legacyModel.height }
        : graphicText
          ? getSvgDimensions(graphicText)
          : { width: 1920, height: 1080 };
    const cW = containerRef.current.clientWidth;
    const cH = containerRef.current.clientHeight;
    const fitZ = Math.min(cW / dims.width, cH / dims.height) * 0.95;
    return { zoom: fitZ, pan: { x: (cW - dims.width * fitZ) / 2, y: (cH - dims.height * fitZ) / 2 } };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as Element | null;
    if (target?.closest?.('[data-oct-bound-target], [data-oct-target]')) return;
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  };
  const handleMouseUp = () => { isDragging.current = false; };

  const handleGraphicClick = (e: React.MouseEvent) => {
    const target = e.target as Element | null;
    const boundEl = target?.closest?.('[data-oct-bound-target], [data-oct-target]') as HTMLElement | null;
    if (!boundEl) return;
    const hitTarget =
      boundEl.dataset.octBoundTarget?.split('|')[0]?.trim() ??
      boundEl.dataset.octTarget?.trim() ??
      null;
    if (!hitTarget) return;
    if (!onSelectObject || !objectMap.has(hitTarget)) return;
    e.stopPropagation();
    onSelectObject(hitTarget);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.05, Math.min(zoom * factor, 12));
    const ratio = newZoom / zoom;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setPan(p => ({ x: mx - (mx - p.x) * ratio, y: my - (my - p.y) * ratio }));
    setZoom(newZoom);
  };

  const filteredBindings = useMemo(() => {
    const q = bindingSearch.trim().toLowerCase();
    if (!q) return bindings;
    return bindings.filter(
      h =>
        h.target.toLowerCase().includes(q) ||
        h.referringAttr.toLowerCase().includes(q) ||
        (h.referringPath ?? '').toLowerCase().includes(q),
    );
  }, [bindings, bindingSearch]);

  const handleExportGraphic = () => {
    if (!graphicText) return;

    const baseName = (svgFilename ?? displayName(graphic)).replace(/\.[^.]+$/, '');
    let exportText = graphicText;

    if (graphicKind === 'legacy' && legacyModel) {
      const parser = new DOMParser();
      const backgroundDoc = parser.parseFromString(legacyModel.backgroundSvg, 'image/svg+xml');
      const backgroundRoot = backgroundDoc.documentElement;
      const overlaySvg = svgContainerRef.current?.querySelector('svg.oct-legacy-overlay');
      if (backgroundRoot && overlaySvg) {
        const importedNodes = Array.from(overlaySvg.childNodes).map(node => backgroundDoc.importNode(node, true));
        for (const node of importedNodes) backgroundRoot.appendChild(node);
        exportText = new XMLSerializer().serializeToString(backgroundDoc);
      } else {
        exportText = legacyModel.backgroundSvg;
      }
    } else {
      const svgEl = svgContainerRef.current?.querySelector('svg');
      if (svgEl) {
        exportText = new XMLSerializer().serializeToString(svgEl);
      }
    }

    const blob = new Blob([exportText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ─── Fallback states ──────────────────────────────────────────────────────

  if (!svgFilename) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>{displayName(graphic)}</div>
          <div>No graphic file associated with this object (property 902 not found).</div>
        </div>
      </div>
    );
  }

  // Class 717 "Graphic" objects use legacy XAML/Silverlight format (.xaml files)
  // which cannot be rendered in a browser. Only class 844 Facility Graphics (.json SVG) render.
  if (svgFilename.toLowerCase().endsWith('.xaml')) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>{displayName(graphic)}</div>
          <div style={{ marginBottom: 4 }}>Legacy Silverlight graphic — cannot render in browser.</div>
          <div style={{ fontSize: 11, fontFamily: 'Consolas, monospace' }}>{svgFilename}</div>
        </div>
      </div>
    );
  }

  if (!graphicResolver) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>{displayName(graphic)}</div>
          <div style={{ marginBottom: 10 }}>Graphic rendering requires a live archive session.</div>
          <div style={{ fontSize: 11 }}>
            Drop the .dbexport file again to render graphics, or open via the online viewer.<br />
            <span style={{ fontFamily: 'Consolas, monospace' }}>{svgFilename}</span>
          </div>
          {graphicFamily === 'legacy' && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--accent)' }}>
              Legacy graphics family detected. Study target for the next renderer pass.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
        Loading {svgFilename}…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <div style={{ color: 'var(--error, #e55)', fontWeight: 600, marginBottom: 6 }}>Failed to load graphic</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'Consolas, monospace' }}>{svgFilename}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>{loadError}</div>
        </div>
      </div>
    );
  }

  if (!graphicText) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Viewer toolbar */}
      <div style={{
        padding: '4px 10px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
        background: 'var(--sidebar-bg)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName(graphic)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'Consolas, monospace' }}>
          {svgFilename}
        </span>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 7px' }} onClick={handleExportGraphic}>
            Export SVG
          </button>
          <button
            className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 7px' }}
            onClick={() => { const f = getFitState(); setZoom(f.zoom); setPan(f.pan); }}
          >
            Fit
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => setZoom(z => Math.min(z * 1.4, 12))}>+</button>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', minWidth: 38, textAlign: 'center', fontFamily: 'Consolas, monospace' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => setZoom(z => Math.max(z / 1.4, 0.05))}>−</button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>1:1</button>
        </div>
      </div>

      {/* SVG viewport */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          cursor: isDragging.current ? 'grabbing' : 'grab',
          background: '#f4f4f4',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          ref={svgContainerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            userSelect: 'none',
            pointerEvents: 'auto',
          }}
          onClick={handleGraphicClick}
        >
          {graphicKind === 'legacy' && legacyModel ? (
            <LegacyGraphicStage
              model={legacyModel}
              objectMap={objectMap}
              onSelectObject={onSelectObject}
            />
          ) : (
            <div dangerouslySetInnerHTML={{ __html: graphicText }} />
          )}
        </div>
      </div>

      {/* Collapsible bindings panel */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)' }}>
        <button
          style={{
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 12px', background: 'var(--sidebar-bg)', border: 'none', cursor: 'pointer',
            color: 'var(--text)', fontSize: 11, fontWeight: 600,
          }}
          onClick={() => setBindingsOpen(o => !o)}
        >
          <span>BOUND POINTS</span>
          <span style={{ color: 'var(--accent)', fontFamily: 'Consolas, monospace' }}>
            {bindings.length} {bindingsOpen ? '▲' : '▼'}
          </span>
        </button>

        {bindingsOpen && (
          <div style={{ maxHeight: 220, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {bindings.length > 0 && (
              <div style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Filter bindings…"
                  value={bindingSearch}
                  onChange={e => setBindingSearch(e.target.value)}
                  style={{ flex: 1, fontSize: 11 }}
                  onClick={e => e.stopPropagation()}
                />
                {bindingSearch && (
                  <button className="btn btn-ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setBindingSearch('')}>
                    Clear
                  </button>
                )}
              </div>
            )}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {bindings.length === 0 ? (
                <div style={{ padding: '10px 12px', color: 'var(--text-dim)', fontSize: 12 }}>
                  No binding data. The binding file may not have been parsed (server-side parse or re-upload required).
                </div>
              ) : filteredBindings.length === 0 ? (
                <div style={{ padding: '10px 12px', color: 'var(--text-dim)', fontSize: 12 }}>
                  No bindings match.
                </div>
              ) : (
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--sidebar-bg)' }}>
                    <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Target</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', width: 110 }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', width: 120 }}>Element</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBindings.map((hit, i) => {
                      const exists = objectMap.has(hit.target);
                      const svgElement = hit.referringPath?.split('/').pop() ?? '';
                      return (
                        <tr
                          key={i}
                          style={{ borderBottom: '1px solid var(--border)', cursor: onSelectObject && exists ? 'pointer' : 'default' }}
                          onClick={() => { if (onSelectObject && exists) onSelectObject(hit.target); }}
                          onMouseEnter={e => { if (onSelectObject && exists) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '3px 8px 3px 0', wordBreak: 'break-all' }}>
                            <span style={{ fontFamily: 'Consolas, monospace', color: exists ? 'var(--accent)' : 'var(--text-dim)' }}>
                              {hit.target}
                            </span>
                            {!exists && <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>(unresolved)</span>}
                          </td>
                          <td style={{ padding: '3px 8px', color: 'var(--text-dim)' }}>{hit.referringAttr}</td>
                          <td style={{ padding: '3px 8px', fontFamily: 'Consolas, monospace', color: 'var(--text-dim)' }}>{svgElement}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main browser component ───────────────────────────────────────────────────

interface GraphicEntry {
  graphic: AnyObject;
  bindingChild: AnyObject | null;
}

export default function GraphicsBrowser({
  objects,
  references,
  referenceIndex,
  onSelectObject,
  graphicResolver,
}: {
  objects: AnyObject[];
  references: ReferenceHit[];
  referenceIndex: ReferenceIndex;
  onSelectObject?: (ref: string) => void;
  graphicResolver?: GraphicResolver;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set());

  const objectMap = useMemo(() => new Map(objects.map(o => [o.ref, o])), [objects]);

  const graphicTreeRoots = useMemo(() => buildGraphicHierarchy(objects), [objects]);

  const outgoingMap = useMemo(() => {
    const map = new Map<string, ReferenceHit[]>();
    for (const hit of references) {
      if (!GRAPHIC_CLASS_IDS.has(objectMap.get(hit.referringItem)?.classid ?? -1)) continue;
      const list = map.get(hit.referringItem);
      if (list) list.push(hit);
      else map.set(hit.referringItem, [hit]);
    }
    return map;
  }, [references, objectMap]);

  const graphicEntries = useMemo((): GraphicEntry[] => {
    const graphics = objects.filter(o => GRAPHIC_CLASS_IDS.has(o.classid));
    return graphics
      .map(g => ({
        graphic: g,
        bindingChild: objectMap.get(`${g.ref}.bindings`) ?? null,
      }))
      .sort((a, b) => displayName(a.graphic).localeCompare(displayName(b.graphic)));
  }, [objects, objectMap]);

  const selectedEntry = useMemo(
    () => (selected ? graphicEntries.find(e => e.graphic.ref === selected) ?? null : null),
    [selected, graphicEntries],
  );

  const selectedBindings = useMemo(() => {
    if (!selectedEntry) return [];
    const bindRef = selectedEntry.bindingChild?.ref;
    if (bindRef) return outgoingMap.get(bindRef) ?? [];
    return outgoingMap.get(selectedEntry.graphic.ref) ?? [];
  }, [selectedEntry, outgoingMap]);

  const filteredTreeRoots = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return graphicTreeRoots;
    return graphicTreeRoots.filter(node => graphicTreeMatches(node, q));
  }, [graphicTreeRoots, search]);

  useEffect(() => {
    setTreeExpanded(prev => {
      if (search.trim()) {
        const next = new Set(prev);
        const walk = (nodes: GraphicTreeNode[]) => {
          for (const node of nodes) {
            if (graphicTreeMatches(node, search.trim().toLowerCase())) {
              next.add(node.key);
            }
            walk(node.children);
          }
        };
        walk(graphicTreeRoots);
        return next;
      }
      return prev;
    });
  }, [graphicTreeRoots, search]);

  useEffect(() => {
    if (selected) return;
    const firstGraphic = graphicEntries[0] ?? null;
    if (firstGraphic) setSelected(firstGraphic.graphic.ref);
  }, [graphicEntries, selected]);

  if (graphicEntries.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Graphics</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>No graphic objects in this archive</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', maxWidth: 360 }}>
            <div style={{ marginBottom: 6 }}>No Facility Graphic or Graphic objects (class 844, 717)</div>
            <div style={{ fontSize: 11 }}>
              Only .dbexport archives exported from Metasys with graphics content will have entries here.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Graphics</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {graphicEntries.length.toLocaleString()} graphic{graphicEntries.length === 1 ? '' : 's'}
        </span>
        {!graphicResolver && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>
            Re-upload to render
          </span>
        )}
        <input
          type="text"
          placeholder="Filter tree…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: 'auto', minWidth: 220 }}
        />
        {search && (
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setSearch('')}>
            Clear
          </button>
        )}
      </div>

      {/* Two-panel body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', overflow: 'hidden', minHeight: 0 }}>

        {/* Left — navigation tree */}
        <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--sidebar-bg)' }}>
          {filteredTreeRoots.length === 0 ? (
            <div style={{ padding: 18, color: 'var(--text-dim)', fontSize: 12 }}>No graphics match.</div>
          ) : (
            filteredTreeRoots.map(node => (
              <GraphicTreeRow
                key={node.key}
                node={node}
                depth={0}
                selectedKey={selected}
                expanded={treeExpanded}
                onSelect={item => {
                  if (item.ref) setSelected(item.ref);
                }}
                onToggle={key => {
                  setTreeExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
                query={search.trim().toLowerCase()}
                referenceIndex={referenceIndex}
              />
            ))
          )}
        </div>

        {/* Right — viewer */}
        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {selectedEntry ? (
            <GraphicViewer
              graphic={selectedEntry.graphic}
              bindings={selectedBindings}
              graphicResolver={graphicResolver}
              objectMap={objectMap}
              onSelectObject={onSelectObject}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13, padding: 24, textAlign: 'center' }}>
              <div>
                <div style={{ marginBottom: 6 }}>Select a graphic from the list.</div>
                <div style={{ fontSize: 11 }}>
                  {graphicResolver
                    ? 'Graphics will render inline. Bound points are highlighted in orange.'
                    : 'Re-upload or open via the online viewer to render graphics.'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
