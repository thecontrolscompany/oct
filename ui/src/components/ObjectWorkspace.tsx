import type { ReactNode } from 'react';
import type { ArchiveProperty } from '@oct/shared';
import type { CctAttribute } from '../api';

export type WorkspaceKind = 'device' | 'group';

export type WorkspaceTabId =
  | 'configuration'
  | 'diagnostics'
  | 'communication'
  | 'email'
  | 'snmp'
  | 'syslog'
  | 'alarm'
  | 'trend'
  | 'security'
  | 'audit'
  | 'network'
  | 'device'
  | 'overview'
  | 'contents'
  | 'all-properties';

export interface WorkspaceTabDef {
  id: WorkspaceTabId;
  label: string;
  keywords?: string[];
}

export interface WorkspacePropertyRow {
  key: string;
  name: string;
  value: string;
  type: string;
  number: number | null;
}

export const DEVICE_TABS: WorkspaceTabDef[] = [
  { id: 'configuration', label: 'Configuration', keywords: ['name', 'description', 'model', 'version', 'location', 'firmware', 'object identifier', 'object name'] },
  { id: 'diagnostics', label: 'Diagnostics', keywords: ['diagnostic', 'status', 'fault', 'error', 'reliability', 'out of service', 'health', 'warning'] },
  { id: 'communication', label: 'Communication', keywords: ['communication', 'comm', 'bacnet', 'mstp', 'ms/tp', 'router', 'port', 'host', 'baud', 'trunk'] },
  { id: 'email', label: 'Email', keywords: ['email', 'mail', 'smtp', 'recipient', 'notification'] },
  { id: 'snmp', label: 'SNMP', keywords: ['snmp'] },
  { id: 'syslog', label: 'Syslog', keywords: ['syslog'] },
  { id: 'alarm', label: 'Alarm', keywords: ['alarm', 'event', 'acked', 'notification', 'intrinsic'] },
  { id: 'trend', label: 'Trend', keywords: ['trend', 'history', 'log', 'record', 'archive', 'sample'] },
  { id: 'security', label: 'Security', keywords: ['security', 'auth', 'password', 'certificate', 'ssl', 'tls', 'encrypt'] },
  { id: 'audit', label: 'Audit', keywords: ['audit'] },
  { id: 'network', label: 'Network', keywords: ['network', 'ip', 'mac', 'dhcp', 'broadcast', 'subnet', 'gateway', 'dns', 'address'] },
  { id: 'device', label: 'Device', keywords: ['device', 'controller', 'hardware', 'platform', 'boot', 'restart', 'power', 'name', 'model'] },
  { id: 'all-properties', label: 'All Properties' },
];

export const GROUP_TABS: WorkspaceTabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'contents', label: 'Contents' },
  { id: 'all-properties', label: 'All Properties' },
];

export function normalizeCctProperties(attributes: CctAttribute[]): WorkspacePropertyRow[] {
  return [...attributes].map(attr => ({
    key: attr.ValueId,
    name: attr.AttributeName,
    value: attr.ValueString ?? attr.ValueString1 ?? '—',
    type: attr.swDataTypeId != null ? `T${attr.swDataTypeId}` : '—',
    number: attr.MetasysAttributeNumber ?? (attr.AttributeId ? Number.parseInt(attr.AttributeId, 10) || null : null),
  }));
}

export function normalizeArchiveProperties(properties: ArchiveProperty[]): WorkspacePropertyRow[] {
  return [...properties].map(prop => ({
    key: String(prop.id),
    name: prop.name,
    value: prop.value,
    type: prop.valueType || '—',
    number: prop.id,
  }));
}

export function sortWorkspaceProperties(properties: WorkspacePropertyRow[]): WorkspacePropertyRow[] {
  return [...properties].sort((a, b) => {
    const ai = a.number ?? Number.MAX_SAFE_INTEGER;
    const bi = b.number ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

export function filterWorkspaceProperties(properties: WorkspacePropertyRow[], keywords?: string[]): WorkspacePropertyRow[] {
  if (!keywords || keywords.length === 0) return sortWorkspaceProperties(properties);
  const lowered = keywords.map(keyword => keyword.toLowerCase());
  return sortWorkspaceProperties(properties.filter(prop => {
    const hay = [prop.name, prop.value, prop.type].join(' ').toLowerCase();
    return lowered.some(keyword => hay.includes(keyword));
  }));
}

export function WorkspaceTabs({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: WorkspaceTabDef[];
  activeTab: WorkspaceTabId;
  onChange: (tab: WorkspaceTabId) => void;
}) {
  return (
    <div className="detail-tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          className={`detail-tab${activeTab === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function WorkspaceSection({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <div className="sct-detail-section">
      <div className="sct-detail-section-header">
        {title}
        {meta ? <span className="meta" style={{ marginLeft: 'auto' }}>{meta}</span> : null}
      </div>
      <div className="sct-detail-section-body">
        {children}
      </div>
    </div>
  );
}

export function WorkspacePropertiesCard({
  title,
  subtitle,
  properties,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  properties: WorkspacePropertyRow[];
  emptyMessage: string;
}) {
  return (
    <WorkspaceSection title={title} meta={subtitle}>
      {properties.length === 0 ? (
        <div className="empty-state" style={{ height: 160 }}>
          <div className="icon">—</div>
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <table className="sct-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Value</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {properties.map(prop => (
              <tr key={prop.key}>
                <td>
                  <div style={{ fontWeight: 600 }}>{prop.name}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>
                    Property {prop.number ?? '—'}
                  </div>
                </td>
                <td style={{ wordBreak: 'break-word' }}>{prop.value}</td>
                <td style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{prop.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WorkspaceSection>
  );
}
