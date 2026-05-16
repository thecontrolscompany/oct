import { Router, Request, Response } from 'express';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import path from 'path';
import fs from 'fs';

const router = Router();

const PACKAGES_DIR = process.env.PACKAGES_DIR ?? 'C:\\ProgramData\\Johnson Controls\\MetasysIII\\Field Controller Packages';

export interface PackageSummary {
  name: string;
  version: string;
  description: string;
  regionCategory: string;
  deviceType: string;
  io: {
    universalInputs: number;
    analogInputs: number;
    binaryInputs: number;
    universalOutputs: number;
    analogOutputs: number;
    binaryOutputs: number;
    relayOutputs: number;
  };
  features: {
    n2: boolean;
    sa: boolean;
    fcb: boolean;
    rtc: boolean;
  };
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

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

// Parse the hardware XML (<Hardware><FieldController ...>)
function parseHardwareXml(xml: string): Partial<PackageSummary & { commPorts: PackageDetail['commPorts'] }> {
  const doc = new DOMParser().parseFromString(stripBom(xml), 'text/xml');

  function text(tag: string): string {
    return doc.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
  }
  function num(tag: string): number {
    return parseInt(text(tag)) || 0;
  }
  function bool(tag: string): boolean {
    return text(tag).toLowerCase() === 'true';
  }

  const commPortEls = doc.getElementsByTagName('CommunicationPort');
  const commPorts: PackageDetail['commPorts'] = [];
  for (let i = 0; i < commPortEls.length; i++) {
    const el = commPortEls[i];
    const get = (t: string) => el.getElementsByTagName(t)[0]?.textContent?.trim() ?? '';
    commPorts.push({
      name: el.getAttribute('Name') ?? '',
      label: get('Label'),
      portType: get('PortType'),
      baudRate: get('BaudRate'),
      minAddr: parseInt(get('MinimumAvailableAddress')) || 0,
      maxAddr: parseInt(get('MaximumAvailableAddress')) || 0,
      networkAddress: parseInt(get('NetworkAddress')) || 0,
    });
  }

  return {
    description: text('Description'),
    regionCategory: text('RegionCategory'),
    deviceType: text('DeviceType'),
    io: {
      universalInputs: num('UniversalInputs'),
      analogInputs: num('AnalogInputs'),
      binaryInputs: num('BinaryInputs'),
      universalOutputs: num('UniversalOutputs'),
      analogOutputs: num('AnalogOutputs'),
      binaryOutputs: num('BinaryOutputs'),
      relayOutputs: num('RelayOutputs'),
    },
    features: {
      n2: bool('N2Enabled'),
      sa: bool('SABEnabled'),
      fcb: bool('FCBEnabled'),
      rtc: bool('RealTimeClockEnabled'),
    },
    maxObjects: num('MaxObjectCnt'),
    commPorts,
  };
}

// Parse Primitives.xml — list of supported logic block class names
function parsePrimitivesXml(xml: string): string[] {
  const doc = new DOMParser().parseFromString(stripBom(xml), 'text/xml');
  const classEls = doc.getElementsByTagName('Class');
  const names: string[] = [];
  for (let i = 0; i < classEls.length; i++) {
    const name = classEls[i].getAttribute('Name');
    if (name) names.push(name);
  }
  return names.sort();
}

// Parse meta.xml
function parseMetaXml(xml: string): { name: string; version: string; buildDate: string } {
  const doc = new DOMParser().parseFromString(stripBom(xml), 'text/xml');
  const get = (t: string) => doc.getElementsByTagName(t)[0]?.textContent?.trim() ?? '';
  return {
    name: get('Name'),
    version: get('BuildNumber'),
    buildDate: get('BuildDateTime'),
  };
}

// In-memory cache — packages dir rarely changes between server restarts
let cache: PackageSummary[] | null = null;
const detailCache = new Map<string, PackageDetail>();

function loadAllPackages(): PackageSummary[] {
  if (cache) return cache;

  if (!fs.existsSync(PACKAGES_DIR)) return [];

  const files = fs.readdirSync(PACKAGES_DIR).filter(f => f.endsWith('.zip'));
  const result: PackageSummary[] = [];

  for (const filename of files) {
    try {
      const zip = new AdmZip(path.join(PACKAGES_DIR, filename));
      const entries = zip.getEntries().map(e => e.entryName);

      const metaEntry = entries.find(e => e === 'meta.xml');
      const hwEntry = entries.find(e => e.endsWith('.xml') && e !== 'meta.xml' && e !== 'Primitives.xml' && e !== 'licenses.xml');

      if (!metaEntry || !hwEntry) continue;

      const meta = parseMetaXml(zip.readAsText(metaEntry));
      const hw = parseHardwareXml(zip.readAsText(hwEntry));

      // firmwareVersion from filename: <Name>-<version>-<buildId>.zip
      const parts = filename.replace('.zip', '').split('-');
      // version is the segment matching digits.digits.digits.digits
      const versionPart = parts.find(p => /^\d+\.\d+\.\d+/.test(p)) ?? meta.version;

      result.push({
        name: meta.name || parts.slice(0, -2).join('-'),
        version: meta.version || versionPart,
        description: hw.description ?? '',
        regionCategory: hw.regionCategory ?? '',
        deviceType: hw.deviceType ?? '',
        io: hw.io ?? { universalInputs: 0, analogInputs: 0, binaryInputs: 0, universalOutputs: 0, analogOutputs: 0, binaryOutputs: 0, relayOutputs: 0 },
        features: hw.features ?? { n2: false, sa: false, fcb: false, rtc: false },
        maxObjects: hw.maxObjects ?? 0,
        firmwareVersion: meta.version,
        buildDate: meta.buildDate,
        filename,
      });
    } catch {
      // skip malformed zips
    }
  }

  // Group by name, keep only the newest version per model
  const byName = new Map<string, PackageSummary>();
  for (const pkg of result) {
    const existing = byName.get(pkg.name);
    if (!existing || pkg.version > existing.version) {
      byName.set(pkg.name, pkg);
    }
  }

  cache = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}

function loadPackageDetail(filename: string): PackageDetail | null {
  if (detailCache.has(filename)) return detailCache.get(filename)!;

  const fullPath = path.join(PACKAGES_DIR, filename);
  if (!fs.existsSync(fullPath)) return null;

  try {
    const zip = new AdmZip(fullPath);
    const entries = zip.getEntries().map(e => e.entryName);

    const metaEntry = entries.find(e => e === 'meta.xml');
    const hwEntry = entries.find(e => e.endsWith('.xml') && e !== 'meta.xml' && e !== 'Primitives.xml' && e !== 'licenses.xml');
    const primEntry = entries.find(e => e === 'Primitives.xml');

    if (!metaEntry || !hwEntry) return null;

    const meta = parseMetaXml(zip.readAsText(metaEntry));
    const hw = parseHardwareXml(zip.readAsText(hwEntry));
    const primitives = primEntry ? parsePrimitivesXml(zip.readAsText(primEntry)) : [];

    const parts = filename.replace('.zip', '').split('-');
    const detail: PackageDetail = {
      name: meta.name || parts.slice(0, -2).join('-'),
      version: meta.version,
      description: hw.description ?? '',
      regionCategory: hw.regionCategory ?? '',
      deviceType: hw.deviceType ?? '',
      io: hw.io ?? { universalInputs: 0, analogInputs: 0, binaryInputs: 0, universalOutputs: 0, analogOutputs: 0, binaryOutputs: 0, relayOutputs: 0 },
      features: hw.features ?? { n2: false, sa: false, fcb: false, rtc: false },
      maxObjects: hw.maxObjects ?? 0,
      firmwareVersion: meta.version,
      buildDate: meta.buildDate,
      filename,
      primitives,
      commPorts: hw.commPorts ?? [],
    };

    detailCache.set(filename, detail);
    return detail;
  } catch {
    return null;
  }
}

// GET /api/packages — list all (newest version per model)
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json(loadAllPackages());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/packages/all-versions — all versions for all models
router.get('/all-versions', (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(PACKAGES_DIR)) { res.json([]); return; }
    const files = fs.readdirSync(PACKAGES_DIR).filter(f => f.endsWith('.zip'));
    const result: Array<{ name: string; version: string; filename: string }> = [];

    for (const filename of files) {
      try {
        const zip = new AdmZip(path.join(PACKAGES_DIR, filename));
        const metaEntry = zip.getEntries().find(e => e.entryName === 'meta.xml');
        if (!metaEntry) continue;
        const meta = parseMetaXml(zip.readAsText(metaEntry));
        if (meta.name) result.push({ name: meta.name, version: meta.version, filename });
      } catch { /* skip */ }
    }
    res.json(result.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/packages/:filename — full detail including primitives
router.get('/:filename', (req: Request, res: Response) => {
  const detail = loadPackageDetail(String(req.params.filename));
  if (!detail) { res.status(404).json({ error: 'Package not found' }); return; }
  res.json(detail);
});

export default router;
