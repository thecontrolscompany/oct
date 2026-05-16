import { getPool } from '../db';

// Classid → human-readable name
// Source: M4-CGE09090-11.0.4.9 Primitives.xml + common JCI Metasys classes
export const CLASS_NAMES: Record<number, string> = {
  128: 'Standard', 141: 'JCI MV', 155: 'Trend Log', 161: 'JCI Calendar',
  163: 'JCI AI', 164: 'JCI AO', 165: 'JCI AV', 166: 'JCI BI', 167: 'JCI BO', 168: 'JCI BV',
  173: 'Broadcast Mgmt', 194: 'FEC', 213: 'Supervisor Status', 218: 'Event Log',
  231: 'Object Runtime', 239: 'BO HW Output', 240: 'AI HW Input', 241: 'AO HW Output',
  242: 'BI HW Input', 243: 'CI HW Input', 251: 'PAO', 252: 'PID', 259: 'DAO',
  263: 'JCI Schedule', 266: 'EWMA', 292: 'IP Network Port', 307: 'MSTP Master',
  313: 'JCI Notification', 523: 'ZN-T Setpoint', 524: 'Occupancy Mode',
  526: 'Input Float Block', 527: 'Output Float Block', 528: 'Input Enum Block',
  529: 'Output Enum Block', 530: 'Input Boolean Block', 531: 'Output Boolean Block',
  532: 'Summer/Winter Comp', 533: 'Lighting Control', 536: 'Control Activity',
  538: 'Last Value', 539: 'Reliability Check', 540: 'State Selection',
  541: 'FSM', 543: 'Command Hierarchy', 546: 'Line Segment', 551: 'Float Constant',
  552: 'Boolean Constant', 555: 'Control Point', 556: 'Sensor', 558: 'Timer',
  559: 'Boolean Primitive', 560: 'Comparison', 561: 'Math', 562: 'Mux',
  563: 'ABH', 564: 'DP', 565: 'ENTH', 566: 'RH', 567: 'WB', 568: 'Enum Constant',
  569: 'Rate Limiter', 570: 'Flow', 571: 'Sequencer', 573: 'Span', 574: 'Latch',
  575: 'Control Sequence', 579: 'MSC Pre Processor', 580: 'Multi-Stage Controller',
  581: 'Free Cooling', 582: 'PID Pre Process', 584: 'PVDC', 585: 'Standards Table',
  587: 'Statistic', 591: 'Totalization', 592: 'Pass Through', 593: 'Text',
  595: 'Execution Status', 598: 'RIOM Dev', 612: 'Box Flow Test', 614: 'Reliability Merge',
  627: 'Net Sensor Device', 628: 'Net Sensor AI', 631: 'VAV Balancer',
  632: 'Variable Speed Drive', 633: 'Dual Duct Endpoint', 634: 'Address',
  640: 'RDDEV', 670: 'RIO DEV', 671: 'RAI', 672: 'RAO', 673: 'RBI', 674: 'RBO',
  701: 'Device Enable', 702: 'Equipment Interlock', 704: 'Device Alarm',
  705: 'Capacity Calc', 706: 'Load Calc', 707: 'Blocking Protection',
  708: 'Pump Selector', 709: 'Chiller Selector', 715: 'Analog Override Check',
  716: 'Binary Override Check', 721: 'Lead Compensator', 724: 'Cooling Tower',
  745: 'Tower Selector', 768: 'Heat Exchanger Selector', 776: 'Expression',
  779: 'Fault Manager', 798: 'Global Sequencer', 862: 'IP_FEC', 880: 'Moving Avg Filter',
  910: 'SA Bus Device', 916: 'Device Stager', 917: 'Boiler Stager', 918: 'Chiller Stager',
};

const UNIT_ENUM_SET_ID = 507;

const FALLBACK_UNITS: Record<number, string> = {
  17: 'deg C', 20: 'deg F', 27: '% RH', 28: '%',
  29: 'ft/min', 31: 'm/s', 36: 'amps',
  47: 'W', 48: 'kW', 49: 'MW',
  50: 'BTU/hr', 51: 'kBTU/hr',
  58: 'in wc', 64: 'deg F', 65: 'kWh', 73: 'seconds',
  82: 'cm', 83: 'm', 84: 'cfm', 98: '%',
  105: 'cfm', 113: 'psi', 115: 'Pa', 116: 'kPa',
  118: 'in H2O', 122: 'rpm', 131: 'hr', 132: 'min', 133: 's',
  158: 'deg F', 159: 'deg C', 175: 'no-units',
};

let unitMapCache: Record<number, string> | null = null;

export async function getUnitMap(): Promise<Record<number, string>> {
  if (unitMapCache) return unitMapCache;
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT EnumMemberId, Name
      FROM [FDB_Control_10_8___Firmware_12_0].dbo.tblEnumMember
      WHERE EnumSetId = ${UNIT_ENUM_SET_ID}
      ORDER BY EnumMemberId
    `);
    unitMapCache = Object.fromEntries(
      result.recordset.map((row: { EnumMemberId: number; Name: string }) => [row.EnumMemberId, row.Name])
    );
    return unitMapCache;
  } catch {
    unitMapCache = { ...FALLBACK_UNITS };
    return unitMapCache;
  }
}

export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}
