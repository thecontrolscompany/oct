import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import * as bacnet from '../bacnetService';

const router = Router();

const TEMPLATES_DIR = process.env.TEMPLATES_DIR ?? 'C:\\CCT\\Controller Config Tool - CCT (New)\\Controller Configuration Tool (CCT)\\Controller Configuration Tool (CCT)\\AttributeTemplates';

router.get('/templates', (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(TEMPLATES_DIR)) { res.json([]); return; }
    const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.xml'));
    res.json(files.map(f => ({ name: path.basename(f, '.xml'), filename: f })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/templates/:name', (req: Request, res: Response) => {
  try {
    const parsed = parseTemplate(routeParam(req, 'name'));
    res.json(parsed);
  } catch (err) {
    console.error('GET /api/commissioning/templates/:name error:', err);
    res.status(String(err).includes('Template not found') ? 404 : 500).json({ error: String(err) });
  }
});

router.get('/live/:deviceId/:name', async (req: Request, res: Response) => {
  const deviceId = parseInt(routeParam(req, 'deviceId'), 10);
  const device = bacnet.getDevices().find(d => d.deviceId === deviceId);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  try {
    const parsed = parseTemplate(routeParam(req, 'name'));
    const points = await Promise.all(parsed.attributes.map(async (attr, index) => {
      const objectType = parseOptionalInt(attr.bacnetClass);
      const objectInstance = parseOptionalInt(attr.bacnetId);
      const propertyId = parseOptionalInt(attr.propertyId) ?? bacnet.PROP.PRESENT_VALUE;

      const row = {
        index,
        ...attr,
        objectType,
        objectTypeName: objectType !== null ? (bacnet.OBJECT_TYPE_NAME[objectType] ?? `T${objectType}`) : null,
        objectInstance,
        liveValue: null as unknown,
        writable: propertyId === bacnet.PROP.PRESENT_VALUE,
        error: null as string | null,
      };

      if (objectType === null || objectInstance === null) {
        return { ...row, error: 'Template point is missing BACnet object mapping' };
      }

      try {
        const liveValue = await bacnet.readProperty(device.address, objectType, objectInstance, propertyId);
        return { ...row, liveValue };
      } catch (err) {
        return { ...row, error: String(err) };
      }
    }));

    res.json({
      name: parsed.name,
      device: {
        deviceId: device.deviceId,
        address: device.address,
        name: device.name ?? null,
        modelName: device.modelName ?? null,
      },
      points,
    });
  } catch (err) {
    console.error('GET /api/commissioning/live/:deviceId/:name error:', err);
    res.status(String(err).includes('Template not found') ? 404 : 500).json({ error: String(err) });
  }
});

router.get('/io/:deviceId', async (req: Request, res: Response) => {
  const deviceId = parseInt(routeParam(req, 'deviceId'), 10);
  const device = bacnet.getDevices().find(d => d.deviceId === deviceId);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  try {
    const objects = await bacnet.readObjectList(device.address, deviceId);
    const ioObjects = objects.filter(obj =>
      obj.type === bacnet.OBJECT_TYPE.ANALOG_INPUT ||
      obj.type === bacnet.OBJECT_TYPE.BINARY_INPUT ||
      obj.type === bacnet.OBJECT_TYPE.MULTI_STATE_INPUT ||
      obj.type === bacnet.OBJECT_TYPE.ANALOG_OUTPUT ||
      obj.type === bacnet.OBJECT_TYPE.BINARY_OUTPUT ||
      obj.type === bacnet.OBJECT_TYPE.MULTI_STATE_OUTPUT
    );

    const points = await Promise.all(ioObjects.map(async obj => {
      try {
        const props = await bacnet.readMultiple(device.address, obj.type, obj.instance, [
          bacnet.PROP.OBJECT_NAME,
          bacnet.PROP.DESCRIPTION,
          bacnet.PROP.PRESENT_VALUE,
          bacnet.PROP.UNITS,
          bacnet.PROP.OUT_OF_SERVICE,
          bacnet.PROP.RELIABILITY,
        ]);
        return {
          type: obj.type,
          typeName: bacnet.OBJECT_TYPE_NAME[obj.type] ?? `T${obj.type}`,
          instance: obj.instance,
          name: props[bacnet.PROP.OBJECT_NAME] ?? null,
          description: props[bacnet.PROP.DESCRIPTION] ?? null,
          presentValue: props[bacnet.PROP.PRESENT_VALUE] ?? null,
          units: props[bacnet.PROP.UNITS] ?? null,
          outOfService: props[bacnet.PROP.OUT_OF_SERVICE] ?? null,
          reliability: props[bacnet.PROP.RELIABILITY] ?? null,
        };
      } catch (err) {
        return {
          type: obj.type,
          typeName: bacnet.OBJECT_TYPE_NAME[obj.type] ?? `T${obj.type}`,
          instance: obj.instance,
          name: null,
          description: null,
          presentValue: null,
          units: null,
          outOfService: null,
          reliability: null,
          error: String(err),
        };
      }
    }));

    res.json({
      deviceId,
      inputs: points.filter(p =>
        p.type === bacnet.OBJECT_TYPE.ANALOG_INPUT ||
        p.type === bacnet.OBJECT_TYPE.BINARY_INPUT ||
        p.type === bacnet.OBJECT_TYPE.MULTI_STATE_INPUT
      ),
      outputs: points.filter(p =>
        p.type === bacnet.OBJECT_TYPE.ANALOG_OUTPUT ||
        p.type === bacnet.OBJECT_TYPE.BINARY_OUTPUT ||
        p.type === bacnet.OBJECT_TYPE.MULTI_STATE_OUTPUT
      ),
    });
  } catch (err) {
    console.error('GET /api/commissioning/io/:deviceId error:', err);
    res.status(500).json({ error: String(err) });
  }
});

function firstAttr(parent: Element, tagName: string, attr: string): string | null {
  const child = (parent as unknown as XmlElement).getElementsByTagName(tagName).item(0) as XmlElement | null;
  return child?.getAttribute(attr) ?? null;
}

function parseTemplate(name: string) {
  const filename = name.endsWith('.xml') ? name : `${name}.xml`;
  const filePath = path.join(TEMPLATES_DIR, filename);
  if (!fs.existsSync(filePath)) throw new Error('Template not found');

  const xmlText = fs.readFileSync(filePath, 'utf-8');
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const attrNodes = doc.getElementsByTagName('Attribute');
  const attributes: Array<{
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
  }> = [];

  for (let i = 0; i < attrNodes.length; i++) {
    const attr = attrNodes.item(i) as XmlElement | null;
    if (!attr) continue;

    const moduleName = firstAttr(attr, 'Module', 'Name');
    const elementName = firstAttr(attr, 'Element', 'Name');
    const bacOid = attr.getElementsByTagName('BacOid').item(0) as XmlElement | null;
    const objectEl = attr.getElementsByTagName('object').item(0) as XmlElement | null;
    const propEl = objectEl?.getElementsByTagName('property').item(0) as XmlElement | null;
    const dataEl = propEl?.getElementsByTagName('data').item(0) as XmlElement | null;

    let valueType: 'float' | 'enum' = 'float';
    let defaultValue = '0.0';
    let enumSet: string | null = null;
    let enumText: string | null = null;

    const floatEl = dataEl?.getElementsByTagName('float').item(0) as XmlElement | null;
    const enumEl = dataEl?.getElementsByTagName('enum').item(0) as XmlElement | null;

    if (floatEl) {
      defaultValue = floatEl.textContent?.trim() ?? '0.0';
    } else if (enumEl) {
      enumSet = enumEl.getAttribute('set');
      const contentEl = enumEl.getElementsByTagName('content').item(0) as XmlElement | null;
      const textEl = enumEl.getElementsByTagName('text').item(0) as XmlElement | null;
      defaultValue = contentEl?.textContent?.trim() ?? enumEl.textContent?.trim() ?? '0';
      enumText = textEl?.textContent?.trim() ?? null;
      valueType = 'enum';
    }

    attributes.push({
      module: moduleName,
      element: elementName,
      objectRef: objectEl?.getAttribute('ref') ?? null,
      propertyId: propEl?.getAttribute('id') ?? '85',
      bacnetClass: bacOid?.getAttribute('Class') ?? null,
      bacnetId: bacOid?.getAttribute('Id') ?? null,
      jciClass: bacOid?.getAttribute('JciClass') ?? null,
      valueType,
      defaultValue,
      enumSet,
      enumText,
    });
  }

  const deviceEl = doc.getElementsByTagName('Device').item(0) as XmlElement | null;
  const device = deviceEl ? {
    address: deviceEl.getAttribute('Address'),
    instance: deviceEl.getAttribute('Instance'),
    name: deviceEl.getAttribute('Name'),
  } : null;

  return { name, attributes, device };
}

function parseOptionalInt(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function routeParam(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

type XmlElement = Element & {
  textContent?: string | null;
  getAttribute: (name: string) => string | null;
  getElementsByTagName: (name: string) => { item: (index: number) => Element | null };
};

export default router;
