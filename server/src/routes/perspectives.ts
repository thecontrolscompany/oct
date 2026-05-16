import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';

const router = Router();

const PERSPECTIVES_DIR = process.env.PERSPECTIVES_DIR ?? 'C:\\CCT\\Controller Config Tool - CCT (New)\\Controller Configuration Tool (CCT)\\Controller Configuration Tool (CCT)\\Perspectives';

router.get('/', (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(PERSPECTIVES_DIR)) {
      res.json([]);
      return;
    }

    const files = fs.readdirSync(PERSPECTIVES_DIR)
      .filter(file => file.endsWith('.pml'))
      .map(file => ({ name: path.basename(file, '.pml'), filename: file }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(files);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/:name', (req: Request, res: Response) => {
  try {
    const parsed = parsePerspective(routeParam(req, 'name'));
    res.json(parsed);
  } catch (err) {
    res.status(String(err).includes('Perspective not found') ? 404 : 500).json({ error: String(err) });
  }
});

function parsePerspective(name: string) {
  const filename = name.endsWith('.pml') ? name : `${name}.pml`;
  const filePath = path.join(PERSPECTIVES_DIR, filename);
  if (!fs.existsSync(filePath)) throw new Error('Perspective not found');

  const xml = fs.readFileSync(filePath, 'utf-8');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const widgetNodes = Array.from(doc.getElementsByTagName('widget')) as XmlElement[];

  const applicationPanels: Array<{
    name: string;
    widgetType: string;
    criteriaType: string | null;
    column: string | null;
    bacoidIds: number[];
  }> = [];
  const featureTabs: Array<{ name: string; widgetType: string }> = [];

  for (const widget of widgetNodes) {
    const widgetType = widget.getAttribute('widgetType') ?? '';
    const nameAttr = widget.getAttribute('name') ?? '';
    const criteria = widget.getElementsByTagName('dataCriteria').item(0) as XmlElement | null;
    const criteriaType = criteria?.getAttribute('dataCriteriaType') ?? null;
    const columnNode = criteria?.getElementsByTagName('column').item(0) as XmlElement | null;
    const column = columnNode?.textContent?.trim() ?? null;
    const bacoidNodes = criteria ? toElementArray(criteria.getElementsByTagName('bacoid')) : [];
    const bacoidIds = bacoidNodes.map((node) => {
      const id = node.textContent?.trim() ?? '';
      return parseInt(id, 10);
    }).filter(Number.isFinite);

    if (widgetType === 'BLOCK_PANEL') {
      applicationPanels.push({
        name: nameAttr,
        widgetType,
        criteriaType,
        column,
        bacoidIds,
      });
    } else if (widgetType.endsWith('_PANEL') || widgetType.endsWith('_INFORMATION')) {
      featureTabs.push({ name: nameAttr, widgetType });
    }
  }

  return {
    name,
    applicationPanels,
    featureTabs,
  };
}

function routeParam(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

type XmlElement = Element & {
  getAttribute: (name: string) => string | null;
  getElementsByTagName: (name: string) => { item: (index: number) => Element | null; length: number; [n: number]: Element };
  textContent?: string | null;
};

function toElementArray(collection: { item: (index: number) => Element | null; length: number }): XmlElement[] {
  const out: XmlElement[] = [];
  for (let i = 0; i < collection.length; i++) {
    const item = collection.item(i) as XmlElement | null;
    if (item) out.push(item);
  }
  return out;
}

export default router;
