import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { CctItem } from '../api';
import PortsTable from './PortsTable';
import {
  DEVICE_TABS,
  GROUP_TABS,
  type WorkspaceKind,
  type WorkspaceTabId,
  WorkspacePropertiesCard,
  WorkspaceTabs,
  filterWorkspaceProperties,
  normalizeCctProperties,
} from './ObjectWorkspace';

interface Props {
  item: CctItem | null;
}

const TYPE_NAME: Record<number, string> = { 9: 'Folder', 15: 'Typical', 21: 'Package' };

function inferWorkspaceKind(item: CctItem): WorkspaceKind {
  return item.ItemTypeId === 9 ? 'group' : 'device';
}

export default function DetailPane({ item }: Props) {
  const workspaceKind = item ? inferWorkspaceKind(item) : 'group';
  const tabs = workspaceKind === 'device' ? DEVICE_TABS : GROUP_TABS;
  const defaultTab = tabs[0].id;
  const [tab, setTab] = useState<WorkspaceTabId>(defaultTab);

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

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab, item?.ItemId]);

  const normalizedProps = useMemo(() => normalizeCctProperties(attributes), [attributes]);
  const currentTab = tabs.find(t => t.id === tab) ?? tabs[0];
  const currentProps = useMemo(
    () => filterWorkspaceProperties(normalizedProps, currentTab?.keywords),
    [normalizedProps, currentTab],
  );

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

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <WorkspaceTabs tabs={tabs} activeTab={tab} onChange={setTab} />

      <div className="detail-content">
        {detailError && <div className="error-msg">Error loading controller details: {String(detailError)}</div>}
        {attributesError && <div className="error-msg">Error loading attributes: {String(attributesError)}</div>}

        {workspaceKind === 'device' && tab === 'configuration' && (
            <div className="sct-detail-stack">
              <OverviewCard item={item} detail={detail ?? null} />
              <WorkspacePropertiesCard
                title="Configuration Properties"
                subtitle={loadingAttributes ? 'Loading…' : `${currentProps.length.toLocaleString()} matching`}
                properties={currentProps}
                emptyMessage="No configuration-style properties matched this controller."
              />
            </div>
        )}

        {workspaceKind === 'device' && tab === 'diagnostics' && (
          <WorkspacePropertiesCard
            title="Diagnostics"
            subtitle={`${currentProps.length.toLocaleString()} matching`}
            properties={currentProps}
            emptyMessage="No diagnostic properties matched this controller."
          />
        )}

        {workspaceKind === 'device' && tab === 'communication' && (
          <WorkspacePropertiesCard
            title="Communication"
            subtitle={`${currentProps.length.toLocaleString()} matching`}
            properties={currentProps}
            emptyMessage="No communication properties matched this controller."
          />
        )}

        {workspaceKind === 'device' && tab === 'email' && (
          <WorkspacePropertiesCard title="Email" subtitle={`${currentProps.length.toLocaleString()} matching`} properties={currentProps} emptyMessage="No email-related properties matched this controller." />
        )}

        {workspaceKind === 'device' && tab === 'snmp' && (
          <WorkspacePropertiesCard title="SNMP" subtitle={`${currentProps.length.toLocaleString()} matching`} properties={currentProps} emptyMessage="No SNMP-related properties matched this controller." />
        )}

        {workspaceKind === 'device' && tab === 'syslog' && (
          <WorkspacePropertiesCard title="Syslog" subtitle={`${currentProps.length.toLocaleString()} matching`} properties={currentProps} emptyMessage="No syslog-related properties matched this controller." />
        )}

        {workspaceKind === 'device' && tab === 'alarm' && (
          <WorkspacePropertiesCard title="Alarm" subtitle={`${currentProps.length.toLocaleString()} matching`} properties={currentProps} emptyMessage="No alarm-related properties matched this controller." />
        )}

        {workspaceKind === 'device' && tab === 'trend' && (
          <WorkspacePropertiesCard title="Trend" subtitle={`${currentProps.length.toLocaleString()} matching`} properties={currentProps} emptyMessage="No trend-related properties matched this controller." />
        )}

        {workspaceKind === 'device' && tab === 'security' && (
          <WorkspacePropertiesCard title="Security" subtitle={`${currentProps.length.toLocaleString()} matching`} properties={currentProps} emptyMessage="No security-related properties matched this controller." />
        )}

        {workspaceKind === 'device' && tab === 'audit' && (
          <WorkspacePropertiesCard title="Audit" subtitle={`${currentProps.length.toLocaleString()} matching`} properties={currentProps} emptyMessage="No audit-related properties matched this controller." />
        )}

        {workspaceKind === 'device' && tab === 'network' && (
          <WorkspacePropertiesCard title="Network" subtitle={`${currentProps.length.toLocaleString()} matching`} properties={currentProps} emptyMessage="No network-related properties matched this controller." />
        )}

        {workspaceKind === 'device' && tab === 'device' && (
          <div className="sct-detail-stack">
            <OverviewCard item={item} detail={detail ?? null} />
            <div className="sct-detail-section">
              <div className="sct-detail-section-header">Ports</div>
              <div className="sct-detail-section-body">
                {loadingDetail && !detail ? <div className="loading">Loading ports…</div> : <PortsTab ports={detail?.ports ?? null} />}
              </div>
            </div>
            <WorkspacePropertiesCard
              title="Device Properties"
              subtitle={`${currentProps.length.toLocaleString()} matching`}
              properties={currentProps}
              emptyMessage="No device-oriented properties matched this controller."
            />
          </div>
        )}

        {workspaceKind === 'device' && tab === 'all-properties' && (
          <WorkspacePropertiesCard
            title="All Properties"
            subtitle={`${attributes.length.toLocaleString()} total`}
            properties={normalizedProps}
            emptyMessage="No properties stored for this object."
          />
        )}

        {workspaceKind === 'group' && tab === 'overview' && (
          <div className="sct-detail-stack">
            <OverviewCard item={item} detail={detail ?? null} />
            <div className="sct-detail-section">
              <div className="sct-detail-section-header">Summary</div>
              <div className="sct-detail-section-body">
                <table className="sct-table">
                  <tbody>
                    <tr><td style={{ width: 130, color: 'var(--text-dim)' }}>Type</td><td>{TYPE_NAME[item.ItemTypeId] ?? `Type ${item.ItemTypeId}`}</td></tr>
                    <tr><td style={{ color: 'var(--text-dim)' }}>Item ID</td><td style={{ fontFamily: 'Consolas, monospace' }}>{item.ItemId}</td></tr>
                    <tr><td style={{ color: 'var(--text-dim)' }}>Parent ID</td><td style={{ fontFamily: 'Consolas, monospace' }}>{item.ParentItemId ?? '—'}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {workspaceKind === 'group' && tab === 'contents' && (
          <div className="sct-detail-section">
            <div className="sct-detail-section-header">Contents</div>
            <div className="sct-detail-section-body">
              {detail?.children?.length ? (
                <table className="sct-table">
                  <thead>
                    <tr>
                      <th>Child</th>
                      <th>Type</th>
                      <th>ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.children.map(child => (
                      <tr key={child.ItemId}>
                        <td style={{ fontWeight: 600 }}>{child.Name}</td>
                        <td style={{ color: 'var(--text-dim)' }}>{TYPE_NAME[child.ItemTypeId] ?? `Type ${child.ItemTypeId}`}</td>
                        <td style={{ color: 'var(--text-dim)', fontFamily: 'Consolas, monospace' }}>{child.ItemId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state" style={{ height: 160 }}>
                  <div className="icon">—</div>
                  <p>No child items found.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {workspaceKind === 'group' && tab === 'all-properties' && (
          <WorkspacePropertiesCard
            title="All Properties"
            subtitle={`${attributes.length.toLocaleString()} total`}
            properties={normalizedProps}
            emptyMessage="No properties stored for this item."
          />
        )}

        {workspaceKind === 'device' && !tabs.some(t => t.id === tab) && (
          <WorkspacePropertiesCard
            title="All Properties"
            subtitle={`${attributes.length.toLocaleString()} total`}
            properties={normalizedProps}
            emptyMessage="No properties stored for this object."
          />
        )}
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

function PortsTab({ ports }: { ports: Awaited<ReturnType<typeof api.controller>>['ports'] | null }) {
  if (!ports) {
    return <div className="empty-state"><div className="icon">🔌</div><p>No ports defined</p></div>;
  }
  if (!ports.length) {
    return <div className="empty-state"><div className="icon">🔌</div><p>No ports defined</p></div>;
  }
  return <PortsTable ports={ports} />;
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
