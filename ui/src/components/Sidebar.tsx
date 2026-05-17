import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { CctItem } from '../api';
import TreeGlyph from './TreeGlyph';

const TYPE_KIND: Record<number, 'folder' | 'typical' | 'package'> = {
  9:  'folder',
  15: 'typical',
  21: 'package',
};

const TYPE_LABEL: Record<number, string> = {
  9:  'Folder',
  15: 'Typical',
  21: 'Package',
};

const SIDEBAR_VISIBLE_TYPES = new Set([9, 15, 21]);

interface Props {
  selected: CctItem | null;
  onSelect: (item: CctItem) => void;
}

export default function Sidebar({ selected, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['controllers'],
    queryFn: api.controllers,
  });

  const visibleData = useMemo(
    () => (data ?? []).filter(item => SIDEBAR_VISIBLE_TYPES.has(item.ItemTypeId)),
    [data]
  );

  // Build tree: group items by ParentItemId
  const { roots, childMap } = useMemo(() => {
    if (!visibleData.length) return { roots: [], childMap: new Map<string, CctItem[]>() };
    const map = new Map<string, CctItem[]>();
    const roots: CctItem[] = [];
    for (const item of visibleData) {
      if (!item.ParentItemId) {
        roots.push(item);
      } else {
        const arr = map.get(item.ParentItemId) ?? [];
        arr.push(item);
        map.set(item.ParentItemId, arr);
      }
    }
    return { roots, childMap: map };
  }, [visibleData]);

  // Filter: when searching, flatten all items
  const filtered = useMemo(() => {
    if (!search || !visibleData.length) return null;
    const q = search.toLowerCase();
    return visibleData.filter(i => i.Name.toLowerCase().includes(q));
  }, [search, visibleData]);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function renderNode(item: CctItem, depth = 0): React.ReactNode {
    const children = childMap.get(item.ItemId) ?? [];
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(item.ItemId);

    return (
      <div key={item.ItemId}>
        <div
          className={`tree-node${selected?.ItemId === item.ItemId ? ' selected' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => {
            onSelect(item);
            if (hasChildren) toggle(item.ItemId);
          }}
          >
          {hasChildren
            ? <span className={`expand-arrow${isOpen ? ' open' : ''}`}>▶</span>
            : <span style={{ width: 14, flexShrink: 0 }} />
          }
          <TreeGlyph kind={TYPE_KIND[item.ItemTypeId] ?? 'document'} active={selected?.ItemId === item.ItemId} />
          <span className="node-label">{item.Name}</span>
          <span className="node-type-badge">{TYPE_LABEL[item.ItemTypeId] ?? item.ItemTypeId}</span>
        </div>
        {hasChildren && isOpen && children.map(c => renderNode(c, depth + 1))}
      </div>
    );
  }

  if (isLoading) return <div className="loading">Loading controllers…</div>;
  if (error) return (
    <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Backend offline</div>
      Start the local server to browse the controller library.
      <br /><br />
      <span style={{ fontFamily: 'Consolas, monospace', fontSize: 11, color: 'var(--border)' }}>
        cd server &amp;&amp; npm run dev
      </span>
    </div>
  );

  return (
    <>
      <div className="sidebar-search">
        <input
          type="search"
          placeholder="Search controllers…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="tree">
        {filtered
          ? filtered.map(item => (
              <div
                key={item.ItemId}
                className={`tree-node${selected?.ItemId === item.ItemId ? ' selected' : ''}`}
                onClick={() => onSelect(item)}
              >
                <TreeGlyph kind={TYPE_KIND[item.ItemTypeId] ?? 'document'} active={selected?.ItemId === item.ItemId} />
                <span className="node-label">{item.Name}</span>
                <span className="node-type-badge">{TYPE_LABEL[item.ItemTypeId] ?? item.ItemTypeId}</span>
              </div>
            ))
          : roots.map(r => renderNode(r))
        }
      </div>
    </>
  );
}
