export interface ReferenceHit {
  target: string;
  referringItem: string;
  referringAttr: string;
  source: string;
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
}

export interface CafObject extends ArchiveObjectBase {
  parentRef: string | null;
  shortTag: string;
}

export interface DbexportObject extends ArchiveObjectBase {
  engineRef: string;
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
