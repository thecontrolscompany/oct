type GlyphKind =
  | 'folder'
  | 'engine'
  | 'bus'
  | 'equipment'
  | 'point'
  | 'package'
  | 'typical'
  | 'document';

function pathFor(kind: GlyphKind): string {
  switch (kind) {
    case 'folder':
      return 'M2 4.5C2 3.67 2.67 3 3.5 3H7l1.25 1.25H12.5C13.33 4.25 14 4.92 14 5.75v5.5c0 .83-.67 1.5-1.5 1.5h-9C2.67 12.75 2 12.08 2 11.25v-6.75Zm1.25 1V11.25c0 .14.11.25.25.25h9c.14 0 .25-.11.25-.25v-5.5a.25.25 0 0 0-.25-.25H7.73l-1.25-1.25H3.5a.25.25 0 0 0-.25.25Z';
    case 'engine':
      return 'M3 3.5h8.2L13 5.3v7.2H3zM4.2 5h6.9l.7.7v5.3H4.2zM4.8 7.2h5.7v1H4.8zm0 2h5.7v1H4.8z';
    case 'bus':
      return 'M2.75 4.5h8.5v1.25h-3v2H12v1.25H8.25v2h3v1.25h-8.5V11H6.1v-2H2.75V7.75H6.1v-2H2.75z';
    case 'equipment':
      return 'M3 4h8.6l1.4 1.4v6.6H3zM4.1 5.1V11h8V5.1H4.1Zm1.1 1.3h5.8v1.1H5.2zm0 2.1h3.8v1.1H5.2z';
    case 'point':
      return 'M7 2.75A4.25 4.25 0 1 0 7 11.25 4.25 4.25 0 0 0 7 2.75Zm0 1.35a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8Zm0 1.55a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 0 0 0-2.7Z';
    case 'package':
      return 'M3 4.25 7 2.5l4 1.75V11.5l-4 1.75-4-1.75V4.25Zm1.2.8v5.2L7 11.2l2.8-1.0V5.05L7 6.1 4.2 5.05Zm3.2.2 2.6-1.1-2.6-1.1-2.6 1.1z';
    case 'typical':
      return 'M2.8 3.5h8.4v7H2.8zM4 5h6v1.1H4zm0 1.8h6v1.1H4zm0 1.8h4.1v1.1H4z';
    case 'document':
    default:
      return 'M4 2.75h4.7L12 6.05v5.2c0 .97-.78 1.75-1.75 1.75h-6.5A1.75 1.75 0 0 1 2 11.25V4.5C2 3.53 2.78 2.75 3.75 2.75ZM8.2 3.9v2.15h2.15zM3.4 4.5v6.75c0 .2.16.35.35.35h6.5a.35.35 0 0 0 .35-.35V7H7.6V4.5Z';
  }
}

export default function TreeGlyph({
  kind,
  active = false,
}: {
  kind: GlyphKind;
  active?: boolean;
}) {
  const color = active ? '#ffffff' : '#4378b5';
  const fill = active ? 'rgba(255,255,255,0.18)' : 'rgba(67,120,181,0.12)';
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, color }}
    >
      <rect x="0.5" y="0.5" width="13" height="13" rx="3" fill={fill} />
      <path d={pathFor(kind)} fill="currentColor" />
    </svg>
  );
}
