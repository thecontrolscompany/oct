import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { CctItem, TemplateAttribute, CctAttribute } from '../api';
import AttributeTable from './AttributeTable';
import PortsTable from './PortsTable';

interface Props {
  item: CctItem | null;
}

const TYPE_NAME: Record<number, string> = { 9: 'Folder', 15: 'Typical', 21: 'Package' };
type DetailTab = 'all' | 'overview' | 'attributes' | 'ports' | 'commissioning';

export default function DetailPane({ item }: Props) {
  const [tab, setTab] = useState<DetailTab>('all');

  const { data: detail, isLoading: loadingDetail, error: detailError } = useQuery({
    queryKey: ['item', item?.ItemId],
    queryFn: () => api.controller(item!.ItemId),
    enabled: !!item,
  });

  const { data: attributes = [], isLoading: loadingAttributes, error: attributesError } = useQuery({
    queryKey: ['attributes', item?.ItemId],
    queryFn: () => api.attributes(item!.ItemId),
    enabled: !!item,
  });

  if (!item) {
    return (
      <div className="content">
        <div className="empty-state">
          <div className="icon">🎛️</div>
          <p>Select a controller from the sidebar</p>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'overview', label: 'Overview' },
    { id: 'attributes', label: 'Attributes' },
    { id: 'ports', label: 'Ports' },
    { id: 'commissioning', label: 'Commissioning' },
  ];

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="detail-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={`detail-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="detail-content">
        {detailError && <div className="error-msg">Error loading controller details: {String(detailError)}</div>}
        {attributesError && <div className="error-msg">Error loading attributes: {String(attributesError)}</div>}

        {tab === 'all' && (
          <div className="sct-detail-stack">
            <OverviewCard item={item} detail={detail ?? null} />
            <div className="grid-2">
              <SnapshotCard
                title="Attributes"
                subtitle={loadingAttributes ? 'Loading attributes…' : `${attributes.length.toLocaleString()} total`}
                emptyMessage="No attribute values stored for this object"
              >
                <SnapshotAttributes attributes={attributes} />
              </SnapshotCard>
              <SnapshotCard
                title="Ports"
                subtitle={loadingDetail ? 'Loading ports…' : `${detail?.ports.length ?? 0} total`}
                emptyMessage="No ports defined"
              >
                <SnapshotPorts ports={detail?.ports ?? []} />
              </SnapshotCard>
            </div>
            {item.ItemTypeId === 21 && <CommissioningActions />}
          </div>
        )}

        {tab === 'overview' && <OverviewCard item={item} detail={detail ?? null} />}
        {tab === 'attributes' && <AttributeTable objectId={item.ItemId} />}
        {tab === 'ports' && <PortsTab ports={detail?.ports ?? null} loading={loadingDetail} />}
        {tab === 'commissioning' && <CommissioningTab item={item} />}
      </div>
    </div>
  );
}

function OverviewCard({ item, detail }: { item: CctItem; detail: Awaited<ReturnType<typeof api.controller>> | null }) {
  const childCount = detail?.children.length ?? 0;
  const portCount = detail?.ports.length ?? 0;
  return (
    <div className="card">
      <div className="card-header">Controller Details</div>
      <div className="card-body">
        <div className="grid-2">
          <Stat label="Name" value={item.Name} />
          <Stat label="Type" value={TYPE_NAME[item.ItemTypeId] ?? `Type ${item.ItemTypeId}`} />
          <Stat label="Item ID" value={item.ItemId} mono />
          <Stat label="Parent ID" value={item.ParentItemId ?? '—'} mono />
          <Stat label="Children" value={String(childCount)} />
          <Stat label="Ports" value={String(portCount)} />
        </div>
      </div>
    </div>
  );
}

function SnapshotCard({
  title,
  subtitle,
  emptyMessage,
  children,
}: {
  title: string;
  subtitle: string;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header">
        {title}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)', textTransform: 'none', letterSpacing: 0 }}>
          {subtitle}
        </span>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        {children || (
          <div className="empty-state" style={{ height: 160 }}>
            <div className="icon">—</div>
            <p>{emptyMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SnapshotAttributes({ attributes }: { attributes: CctAttribute[] }) {
  if (!attributes.length) {
    return (
      <div className="empty-state" style={{ height: 160 }}>
        <div className="icon">📋</div>
        <p>No attribute values stored for this object</p>
      </div>
    );
  }

  const preview = attributes.slice(0, 8);
  return (
    <table className="attr-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Attribute Name</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {preview.map(attr => (
          <tr key={attr.ValueId}>
            <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>
              {attr.MetasysAttributeNumber ?? '—'}
            </td>
            <td style={{ color: 'var(--text)' }}>{attr.AttributeName}</td>
            <td className="attr-value">{attr.ValueString ?? attr.ValueString1 ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SnapshotPorts({ ports }: { ports: Awaited<ReturnType<typeof api.controller>>['ports'] }) {
  if (!ports.length) {
    return (
      <div className="empty-state" style={{ height: 160 }}>
        <div className="icon">🔌</div>
        <p>No ports defined</p>
      </div>
    );
  }

  const preview = ports.slice(0, 8);
  return (
    <table className="attr-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Signal ID</th>
        </tr>
      </thead>
      <tbody>
        {preview.map(p => (
          <tr key={p.PortId}>
            <td>{p.Name}</td>
            <td style={{ color: 'var(--text-dim)' }}>{p.PortTypeId}</td>
            <td className="attr-value">{p.ActualSignalId ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PortsTab({ ports, loading }: { ports: Awaited<ReturnType<typeof api.controller>>['ports'] | null; loading: boolean }) {
  if (loading && !ports) return <div className="loading">Loading ports…</div>;
  if (!ports) return <div className="empty-state"><div className="icon">🔌</div><p>No ports defined</p></div>;
  if (!ports.length) return <div className="empty-state"><div className="icon">🔌</div><p>No ports defined</p></div>;
  return <PortsTable ports={ports} />;
}

function CommissioningActions() {
  return (
    <div className="card">
      <div className="card-header">Commissioning Actions</div>
      <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled>Upload from Device</button>
        <button className="btn btn-primary" disabled>Download to Device</button>
        <button className="btn btn-ghost" disabled>Run Commissioning</button>
      </div>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div
        className="stat-value"
        style={{ fontSize: 13, fontFamily: mono ? 'Consolas, monospace' : undefined, wordBreak: 'break-all' }}
      >
        {value}
      </div>
    </div>
  );
}

function CommissioningTab({ item }: { item: CctItem }) {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [step, setStep] = useState(0);

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ['commissioning', 'templates'],
    queryFn: api.commissioningTemplates,
  });

  const { data: templateDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['commissioning', 'template', selectedTemplate],
    queryFn: () => api.commissioningTemplate(selectedTemplate),
    enabled: !!selectedTemplate,
  });

  if (loadingTemplates) return <div className="loading">Loading templates…</div>;

  if (templates.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">📋</div>
        <p>No commissioning templates found</p>
        <p style={{ fontSize: 11 }}>Templates should be in the AttributeTemplates folder</p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="card-header">Commissioning Templates</div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {templates.map(t => (
              <button
                key={t.name}
                className={`btn${selectedTemplate === t.name ? ' btn-primary' : ' btn-ghost'}`}
                onClick={() => { setSelectedTemplate(t.name); setStep(0); }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedTemplate && (
        loadingDetail
          ? <div className="loading">Loading template…</div>
          : templateDetail && (
            <CommissioningWizard
              item={item}
              templateName={templateDetail.name}
              attributes={templateDetail.attributes}
              step={step}
              onStep={setStep}
            />
          )
      )}
    </>
  );
}

function CommissioningWizard({
  item, templateName, attributes, step, onStep,
}: {
  item: CctItem;
  templateName: string;
  attributes: TemplateAttribute[];
  step: number;
  onStep: (s: number) => void;
}) {
  const [values, setValues] = useState<Record<number, string>>({});

  const grouped = chunkArray(attributes, 5);
  const totalSteps = grouped.length;
  const currentAttrs = grouped[step] ?? [];

  function setValue(idx: number, val: string) {
    setValues(prev => ({ ...prev, [idx]: val }));
  }

  return (
    <div className="card">
      <div className="card-header">
        {templateName}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
          Step {step + 1} of {totalSteps} · {item.Name}
        </span>
      </div>

      <div style={{ height: 3, background: 'var(--border)' }}>
        <div style={{ height: '100%', background: 'var(--accent)', width: `${((step + 1) / totalSteps) * 100}%`, transition: 'width 0.3s' }} />
      </div>

      <table className="attr-table">
        <thead>
          <tr>
            <th>Module</th>
            <th>Element</th>
            <th>Object Ref</th>
            <th>Default</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {currentAttrs.map((attr, i) => {
            const globalIdx = step * 5 + i;
            const displayDefault = attr.valueType === 'enum' && attr.enumText
              ? `${attr.enumText} (${attr.defaultValue})`
              : attr.defaultValue;
            return (
              <tr key={globalIdx}>
                <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{attr.module ?? '—'}</td>
                <td style={{ fontWeight: 500 }}>{attr.element ?? '—'}</td>
                <td style={{ fontFamily: 'Consolas, monospace', fontSize: 10, color: 'var(--text-dim)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {attr.objectRef ?? '—'}
                </td>
                <td className="attr-value">{displayDefault}</td>
                <td>
                  <input
                    type="text"
                    placeholder={attr.defaultValue}
                    value={values[globalIdx] ?? ''}
                    onChange={e => setValue(globalIdx, e.target.value)}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      padding: '3px 8px',
                      color: 'var(--text)',
                      width: 110,
                      fontSize: 12,
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ padding: '10px 16px', display: 'flex', gap: 8, borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost" disabled={step === 0} onClick={() => onStep(step - 1)}>
          ← Back
        </button>
        {step < totalSteps - 1 ? (
          <button className="btn btn-primary" onClick={() => onStep(step + 1)}>
            Next →
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => alert('Commissioning data ready — live write requires TL-CWCVT-0 connection.')}>
            Apply to Device
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center' }}>
          {Object.keys(values).length} value(s) set
        </span>
      </div>
    </div>
  );
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}
