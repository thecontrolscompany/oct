import type {
  EnumSetDetail,
  EnumSetSummary,
  ParsedCaf,
  ParsedDbexport,
} from '@oct/shared';

export interface CctItem {
  ItemId: string;
  Name: string;
  ItemTypeId: number;   // 9=Folder, 15=Typical, 21=Package(controller)
  ParentItemId: string | null;
}

export interface CctItemDetail extends CctItem {
  LibraryItemId: string | null;
  ports: CctPort[];
  children: CctItem[];
}

export interface CctPort {
  PortId: string;
  Name: string;
  PortTypeId: number;
  ActualSignalId: number | null;
}

export interface CctAttribute {
  ValueId: string;
  DescribedObjectId: string;
  DescribedObjectTypeId: string;
  AttributeId: string;
  AttributeName: string;
  MetasysAttributeNumber: number | null;
  ValueString: string | null;
  ValueString1: string | null;
  swDataTypeId: number | null;
  ArrayIndex: number | null;
  LevelIndex: number | null;
  SystemOfUnits: string | null;
}

export interface PackageIo {
  universalInputs: number;
  analogInputs: number;
  binaryInputs: number;
  universalOutputs: number;
  analogOutputs: number;
  binaryOutputs: number;
  relayOutputs: number;
}

export interface PackageSummary {
  name: string;
  version: string;
  description: string;
  regionCategory: string;
  deviceType: string;
  io: PackageIo;
  features: { n2: boolean; sa: boolean; fcb: boolean; rtc: boolean };
  maxObjects: number;
  firmwareVersion: string;
  buildDate: string;
  filename: string;
}

export interface PackageDetail extends PackageSummary {
  primitives: string[];
  commPorts: Array<{
    name: string;
    label: string;
    portType: string;
    baudRate: string;
    minAddr: number;
    maxAddr: number;
    networkAddress: number;
  }>;
}

export type { ArchiveProperty, CafObject, DbexportObject, EnumSetDetail, EnumSetSummary, NavNode, ParsedCaf, ParsedDbexport, ReferenceHit } from '@oct/shared';

export interface PerspectiveSummary {
  name: string;
  filename: string;
}

export interface PerspectivePanel {
  name: string;
  widgetType: string;
  criteriaType: string | null;
  column: string | null;
  bacoidIds: number[];
}

export interface PerspectiveDetail {
  name: string;
  applicationPanels: PerspectivePanel[];
  featureTabs: Array<{ name: string; widgetType: string }>;
}

export interface CommissioningTemplate {
  name: string;
  filename: string;
}

export interface TemplateDetail {
  name: string;
  attributes: TemplateAttribute[];
  device: { address: string | null; instance: string | null; name: string | null } | null;
}

export interface TemplateAttribute {
  module: string | null;
  element: string | null;
  objectRef: string | null;
  propertyId: string | null;
  bacnetClass: string | null;
  bacnetId: string | null;
  jciClass: string | null;
  valueType: 'float' | 'enum';
  defaultValue: string;
  enumSet: string | null;
  enumText: string | null;
}

export interface LiveCommissioningPoint extends TemplateAttribute {
  index: number;
  objectType: number | null;
  objectTypeName: string | null;
  objectInstance: number | null;
  liveValue: unknown;
  writable: boolean;
  error: string | null;
}

export interface LiveCommissioningDetail {
  name: string;
  device: {
    deviceId: number;
    address: string;
    name: string | null;
    modelName: string | null;
  };
  points: LiveCommissioningPoint[];
}

export interface IoPoint {
  type: number;
  typeName: string;
  instance: number;
  name: unknown;
  description: unknown;
  presentValue: unknown;
  units: unknown;
  outOfService: unknown;
  reliability: unknown;
  error?: string;
}

export interface DeviceIoDetail {
  deviceId: number;
  inputs: IoPoint[];
  outputs: IoPoint[];
}

export interface BacnetDevice {
  address: string;
  deviceId: number;
  maxApdu: number;
  vendorId: number;
  name?: string;
  modelName?: string;
  firmwareRevision?: string;
}

export interface BacnetObject {
  type: number;
  instance: number;
  typeName: string;
  name: string | null;
}

export interface BacnetObjectDetail {
  deviceId: number;
  objectType: number;
  objectInstance: number;
  typeName: string;
  [propId: number]: unknown;
}

export interface BacnetStatus {
  connected: boolean;
  converterIp: string | null;
  subnetBroadcast: string | null;
  networkNumber: number | null;
  deviceCount: number;
}

export interface ArchiveTableCount {
  name: string;
  rowCount: number;
}

export interface ArchiveProcedureInfo {
  name: string;
  prefix: 'spu' | 'spws' | 'fnu' | 'other';
}

export interface ArchiveSummary {
  database: string;
  tables: ArchiveTableCount[];
  procedureCounts: Array<{ prefix: string; count: number }>;
  procedures: ArchiveProcedureInfo[];
}

export interface ArchiveNameMapRefreshResult {
  database: string;
  classMapCount: number;
  globalNameCount: number;
  byClassPath: string;
  globalPath: string;
}

import { API_BASE } from './connection';
const BASE = API_BASE;

async function safeJson<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) throw new Error(`Backend unreachable (HTTP ${res.status})`);
  return res.json();
}

// Handles flat {"error":"msg"} and nested {"error":{"message":"msg"}} (Vercel 404 format)
function extractError(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback;
  const e = (body as Record<string, unknown>).error;
  if (typeof e === 'string' && e) return e;
  if (typeof e === 'object' && e !== null) {
    const msg = (e as Record<string, unknown>).message;
    if (typeof msg === 'string' && msg) return msg;
    const code = (e as Record<string, unknown>).code;
    if (typeof code === 'string' && code) return code;
  }
  return fallback;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) {
    const body = await safeJson<unknown>(res).catch(() => null);
    throw new Error(extractError(body, `HTTP ${res.status}`));
  }
  return safeJson<T>(res);
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const b = await safeJson<unknown>(res).catch(() => null);
    throw new Error(extractError(b, `HTTP ${res.status}`));
  }
  return safeJson<T>(res);
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await safeJson<unknown>(res).catch(() => null);
    throw new Error(extractError(b, `HTTP ${res.status}`));
  }
  return safeJson<T>(res);
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { method: 'DELETE' });
  if (!res.ok) throw new Error(res.statusText);
  return safeJson<T>(res);
}

export const api = {
  health: () => get<{
    status: string; time: string;
    bacnet: BacnetStatus;
    mstpSerial: { connected: boolean; path: string | null; baudRate: number | null; mode: string | null; frameCount: number };
  }>('/health'),

  controllers: () => get<CctItem[]>('/controllers'),
  controller: (id: string) => get<CctItemDetail>(`/controllers/${id}`),

  attributes: (id: string) => get<CctAttribute[]>(`/attributes/${id}`),
  updateAttribute: (objectId: string, attributeId: string, valueString: string) =>
    put<{ updated: number }>(`/attributes/${objectId}`, { attributeId, valueString }),

  commissioningTemplates: () => get<CommissioningTemplate[]>('/commissioning/templates'),
  commissioningTemplate: (name: string) =>
    get<TemplateDetail>(`/commissioning/templates/${encodeURIComponent(name)}`),
  liveCommissioning: (deviceId: number, name: string) =>
    get<LiveCommissioningDetail>(`/commissioning/live/${deviceId}/${encodeURIComponent(name)}`),
  deviceIo: (deviceId: number) => get<DeviceIoDetail>(`/commissioning/io/${deviceId}`),

  bacnet: {
    status: () => get<BacnetStatus>('/bacnet/status'),
    connect: (ip: string, prefix?: number, networkNumber?: number) =>
      post<{ status: string; ip: string; subnetBroadcast: string; networkNumber: number }>(
        '/bacnet/connect', { ip, prefix, networkNumber }
      ),
    defaults: () => get<{ ip: string; port: number; networkNumber: number; prefix: number }>('/bacnet/defaults'),
    disconnect: () => del<{ status: string }>('/bacnet/connect'),
    discover: (timeoutMs?: number) => post<BacnetDevice[]>('/bacnet/discover', { timeoutMs }),
    directConnect: (ip: string) => post<BacnetDevice>('/bacnet/direct', { ip }),
    devices: () => get<BacnetDevice[]>('/bacnet/devices'),
    objects: (deviceId: number) => get<BacnetObject[]>(`/bacnet/devices/${deviceId}/objects`),
    objectDetail: (deviceId: number, type: number, instance: number) =>
      get<BacnetObjectDetail>(`/bacnet/devices/${deviceId}/objects/${type}/${instance}`),
    writeValue: (deviceId: number, type: number, instance: number, value: unknown, bacnetType: number) =>
      put<{ written: boolean }>(`/bacnet/devices/${deviceId}/objects/${type}/${instance}/present-value`, { value, bacnetType }),
  },

  caf: {
    upload: async (file: File): Promise<ParsedCaf> => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(BASE + '/caf/upload', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error: string }).error ?? res.statusText);
      }
      return res.json();
    },
    parsePath: (path: string) => get<ParsedCaf>(`/caf/parse?path=${encodeURIComponent(path)}`),
  },

  dbexport: {
    upload: async (file: File): Promise<ParsedDbexport> => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(BASE + '/dbexport/upload', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error: string }).error ?? res.statusText);
      }
      return res.json();
    },
    parsePath: (path: string) => get<ParsedDbexport>(`/dbexport/parse?path=${encodeURIComponent(path)}`),
    graphic: async (filename: string): Promise<string> => {
      const res = await fetch(`${BASE}/dbexport/graphic?filename=${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
  },

  sctArchive: {
    summary: () => get<ArchiveSummary>('/sct-archive/summary'),
    refreshNameMaps: () => post<ArchiveNameMapRefreshResult>('/sct-archive/refresh-name-maps'),
  },

  perspectives: {
    list: () => get<PerspectiveSummary[]>('/perspectives'),
    detail: (name: string) => get<PerspectiveDetail>(`/perspectives/${encodeURIComponent(name)}`),
  },

  packages: {
    list: () => get<PackageSummary[]>('/packages'),
    detail: (filename: string) => get<PackageDetail>(`/packages/${encodeURIComponent(filename)}`),
    allVersions: () => get<Array<{ name: string; version: string; filename: string }>>('/packages/all-versions'),
  },
  fdb: {
    enumSets: () => get<EnumSetSummary[]>('/fdb/enums'),
    enumSet: (setId: number) => get<EnumSetDetail>(`/fdb/enums/${setId}`),
  },
};
