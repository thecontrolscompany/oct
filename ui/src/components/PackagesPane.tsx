import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { PackageSummary } from '../api';

// I/O summary chip
function IoChip({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  return (
    <span style={{
      display: 'inline-block', marginRight: 4, padding: '1px 5px',
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 3, fontSize: 11, color: 'var(--text-dim)',
    }}>
      {label}:{count}
    </span>
  );
}

function FeatureTag({ label, active }: { label: string; active: boolean }) {
  if (!active) return null;
  return (
    <span style={{
      display: 'inline-block', marginRight: 4, padding: '1px 5px',
      background: 'var(--accent)', borderRadius: 3,
      fontSize: 10, color: '#fff', fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

function IoBar({ io }: { io: PackageSummary['io'] }) {
  return (
    <span>
      <IoChip label="UI" count={io.universalInputs} />
      <IoChip label="AI" count={io.analogInputs} />
      <IoChip label="BI" count={io.binaryInputs} />
      <IoChip label="UO" count={io.universalOutputs} />
      <IoChip label="AO" count={io.analogOutputs} />
      <IoChip label="BO" count={io.binaryOutputs} />
      <IoChip label="RO" count={io.relayOutputs} />
    </span>
  );
}

function DetailPanel({ filename }: { filename: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['package-detail', filename],
    queryFn: () => api.packages.detail(filename),
    staleTime: Infinity,
  });

  if (isLoading) return <div style={{ padding: 12, color: 'var(--text-dim)' }}>Loading…</div>;
  if (error || !data) return <div style={{ padding: 12, color: 'var(--error)' }}>Failed to load</div>;

  return (
    <div style={{ padding: '8px 12px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
      {/* Comm ports */}
      {data.commPorts.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4 }}>COMM PORTS</div>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-dim)' }}>
                <th style={{ textAlign: 'left', padding: '2px 8px 2px 0' }}>Label</th>
                <th style={{ textAlign: 'left', padding: '2px 8px' }}>Addr Range</th>
                <th style={{ textAlign: 'left', padding: '2px 8px' }}>Network #</th>
                <th style={{ textAlign: 'left', padding: '2px 0' }}>Baud</th>
              </tr>
            </thead>
            <tbody>
              {data.commPorts.map((p, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '3px 8px 3px 0', color: 'var(--text)' }}>{p.label || p.name}</td>
                  <td style={{ padding: '3px 8px', color: 'var(--text-dim)' }}>{p.minAddr}–{p.maxAddr}</td>
                  <td style={{ padding: '3px 8px', color: 'var(--accent)', fontFamily: 'Consolas, monospace' }}>{p.networkAddress || '—'}</td>
                  <td style={{ padding: '3px 0', color: 'var(--text-dim)' }}>{p.baudRate || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Primitives */}
      {data.primitives.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4 }}>
            SUPPORTED LOGIC BLOCKS ({data.primitives.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {data.primitives.map(p => (
              <span key={p} style={{
                fontSize: 10, padding: '1px 5px',
                background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
                borderRadius: 3, color: 'var(--text)',
              }}>
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PackagesPane() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAllVersions, setShowAllVersions] = useState(false);

  const { data: packages, isLoading, error } = useQuery({
    queryKey: ['packages'],
    queryFn: api.packages.list,
    staleTime: Infinity,
  });

  const { data: allVersions } = useQuery({
    queryKey: ['packages-all-versions'],
    queryFn: api.packages.allVersions,
    staleTime: Infinity,
    enabled: showAllVersions,
  });

  const filtered = (packages ?? []).filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.regionCategory.toLowerCase().includes(q)
    );
  });

  const toggle = (filename: string) => {
    setExpanded(prev => prev === filename ? null : filename);
  };

  if (isLoading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-dim)', textAlign: 'center' }}>
        Scanning packages…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: 'var(--error)' }}>
        Error: {String(error)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <input
          type="text"
          placeholder="Filter by model, description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 320 }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {filtered.length} of {packages?.length ?? 0} models
        </span>
        <button
          className={`btn btn-ghost${showAllVersions ? ' active' : ''}`}
          style={{ fontSize: 11 }}
          onClick={() => setShowAllVersions(v => !v)}
        >
          All versions
        </button>
      </div>

      {/* All-versions panel */}
      {showAllVersions && allVersions && (
        <div style={{
          padding: '6px 12px', borderBottom: '1px solid var(--border)',
          background: 'var(--sidebar-bg)', fontSize: 11, maxHeight: 140, overflowY: 'auto',
        }}>
          <span style={{ color: 'var(--text-dim)', marginRight: 8 }}>All installed versions:</span>
          {allVersions.map((v, i) => (
            <span key={i} style={{ marginRight: 12, color: 'var(--text)' }}>
              {v.name} <span style={{ color: 'var(--accent)' }}>{v.version}</span>
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--sidebar-bg)', zIndex: 1 }}>
            <tr style={{ color: 'var(--text-dim)', fontSize: 11 }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', width: 140 }}>Model</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>Description</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', width: 200 }}>I/O</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', width: 100 }}>Features</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', width: 90 }}>Firmware</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(pkg => (
              <>
                <tr
                  key={pkg.filename}
                  onClick={() => toggle(pkg.filename)}
                  style={{
                    cursor: 'pointer',
                    borderBottom: expanded === pkg.filename ? 'none' : '1px solid var(--border)',
                    background: expanded === pkg.filename ? 'var(--sidebar-bg)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (expanded !== pkg.filename) (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; }}
                  onMouseLeave={e => { if (expanded !== pkg.filename) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <td style={{ padding: '6px 8px', fontFamily: 'Consolas, monospace', color: 'var(--accent)', fontWeight: 600 }}>
                    <span style={{ marginRight: 5, color: 'var(--text-dim)', fontSize: 10 }}>
                      {expanded === pkg.filename ? '▾' : '▸'}
                    </span>
                    {pkg.name}
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--text)' }}>
                    {pkg.description}
                    {pkg.regionCategory && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-dim)' }}>({pkg.regionCategory})</span>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <IoBar io={pkg.io} />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <FeatureTag label="N2" active={pkg.features.n2} />
                    <FeatureTag label="SA" active={pkg.features.sa} />
                    <FeatureTag label="FCB" active={pkg.features.fcb} />
                    <FeatureTag label="RTC" active={pkg.features.rtc} />
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'Consolas, monospace' }}>
                    {pkg.firmwareVersion}
                  </td>
                </tr>
                {expanded === pkg.filename && (
                  <tr key={`${pkg.filename}-detail`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <DetailPanel filename={pkg.filename} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
            No packages match "{search}"
          </div>
        )}
      </div>
    </div>
  );
}
