export interface ReferenceHit {
  target: string;
  referringItem: string;
  referringAttr: string;
  source: string;
  sourcePath?: string;
  referringPath?: string;
}

export interface ArchiveProperty {
  id: number;
  name: string;
  value: string;
  valueType: string;
}

export interface ArchiveObjectBase {
  ref: string;
  classid: number;
  className: string;
  objectid: number;
  tag: string;
  description: string;
  units: string | null;
  unitsId: number | null;
  defaultValue: number | null;
  bacoidType: number | null;
  bacoidInstance: number | null;
  createdAt?: string | null;
  modifiedAt?: string | null;
  properties: ArchiveProperty[];
}

export interface CafObject extends ArchiveObjectBase {
  parentRef: string | null;
  shortTag: string;
}

export interface DbexportObject extends ArchiveObjectBase {
  engineRef: string;
  bindingFileName?: string;
}

export interface EngineInfo {
  name: string;
  ref: string;
  modelName: string;
  firmwareRevision: string;
  ip: string | null;
  objectCount: number;
}

export interface NavNode {
  label: string;
  reference: string;
  classid: number;
  className: string;
  children: NavNode[];
}

export interface ParsedCaf {
  controller: {
    ref: string;
    modelName: string;
    appVersion: string;
    description: string;
    tag: string;
    objectId: number;
    ip: string | null;
  };
  objects: CafObject[];
  references: ReferenceHit[];
  stats: Array<{ className: string; classid: number; count: number }>;
}

export interface ParsedDbexport {
  site: NavNode | null;
  engines: EngineInfo[];
  objects: DbexportObject[];
  references: ReferenceHit[];
  stats: Array<{ className: string; classid: number; count: number }>;
}

export interface ReferenceIndex {
  byTarget: Map<string, ReferenceHit[]>;
  counts: Map<string, number>;
  totalHits: number;
}

export interface EnumSetSummary {
  EnumSetId: number;
  Name: string;
  MemberCount: number;
}

export interface EnumSetDetail {
  EnumSetId: number;
  Name: string;
  members: Array<{ EnumMemberId: number; Name: string }>;
}

export declare function buildReferenceMap(
  references: ReferenceHit[]
): Map<string, ReferenceHit[]>;

export declare function buildReferenceIndex(
  references: ReferenceHit[]
): ReferenceIndex;

export declare const PROPERTY_NAMES: Record<number, string>;

export declare function getPropertyName(
  propertyId: number,
  explicitName?: string | null,
  classId?: number | null
): string;

export declare function isGenericPropertyName(name: string | null | undefined): boolean;
