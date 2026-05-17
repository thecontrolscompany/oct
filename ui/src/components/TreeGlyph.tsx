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
      return 'M2 4.1C2 3.49 2.49 3 3.1 3h2.94l1.08 1.07h3.74c.61 0 1.12.5 1.12 1.12v5.08c0 .61-.5 1.12-1.12 1.12H3.1c-.61 0-1.1-.51-1.1-1.12V4.1Zm1.28.15v5.96c0 .11.09.2.2.2h7.94c.11 0 .2-.09.2-.2V5.37c0-.1-.09-.18-.2-.18H7.12l-1.08-1.08H3.48c-.11 0-.2.04-.2.14Z';
    case 'engine':
      return 'M2.6 3.1h8.8l1.2 1.2v6.6H2.6Zm1.05 1.1v5.6h7.9V5.35l-.76-.75Zm1.15.75h4.9v1H4.8Zm0 1.85h4.9v1H4.8Zm0 1.85h3.15v1H4.8Z';
    case 'bus':
      return 'M2.2 6.1h9.6v1H8.9v2.25h2.8v1H7.9V7.1H5.45v3.25H3.05v-1h1.3V7.1H2.2Zm0 4.05h1.05v1H2.2Zm9.6 0h1.05v1H11.8Z';
    case 'equipment':
      return 'M2.7 3.15h8.6l1.15 1.15v6.55H2.7Zm1.02 1.1v5.4h7.76V5.2H4.92Zm.95.95h5.86v1H5.87Zm0 1.85h4.1v1H5.87Z';
    case 'point':
      return 'M7 2.85A4.15 4.15 0 1 0 7 11.15 4.15 4.15 0 0 0 7 2.85Zm0 1.22a2.93 2.93 0 1 1 0 5.86 2.93 2.93 0 0 1 0-5.86Zm0 1.55a1.38 1.38 0 1 0 0 2.76 1.38 1.38 0 0 0 0-2.76Zm-4.1 1.37h1.15v1H2.9Zm7.95 0H12v1h-1.15ZM6.5 3.05h1v1.15h-1Zm0 7.35h1v1.15h-1Z';
    case 'package':
      return 'M3 4.15 7 2.55l4 1.6v6.7L7 12.45l-4-1.6Zm1.15.78v4.88l2.85 1.1 2.85-1.1V4.93L7 6.05Zm2.85-2.05 2.32.95-2.32.95-2.32-.95Z';
    case 'typical':
      return 'M2.85 3.25h8.3v7.15h-8.3Zm1.1 1.1v4.95h6.1V4.35Zm.72.9h4.65v1H4.67Zm0 1.9h4.65v1H4.67Z';
    case 'document':
    default:
      return 'M4 2.85h4.55L12 6.1v5.05c0 .97-.79 1.75-1.75 1.75H4.1c-.97 0-1.75-.78-1.75-1.75V4.6c0-.96.69-1.75 1.65-1.75Zm4.12 1.1v2.05h2.05ZM3.65 4.55v6.45c0 .16.13.29.29.29h6.24a.29.29 0 0 0 .29-.29V7.05H7.45V4.55Z';
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
      width="15"
      height="15"
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, color }}
    >
      <rect x="0.5" y="0.5" width="13" height="13" rx="3" fill={fill} stroke="currentColor" strokeOpacity="0.16" />
      <path d={pathFor(kind)} fill="currentColor" />
    </svg>
  );
}
