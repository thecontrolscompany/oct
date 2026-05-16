import { Router, Request, Response } from 'express';
import * as svc from '../bacnetService';

const router = Router();

// JCI proprietary BACnet property IDs (Metasys attribute numbers used as property IDs)
const MSTP_PROPS = {
  JCI_MAC_ADDRESS:               2858,
  SA_BUS_MAC_ADDRESS:            3645,
  SUPERVISOR_MAC_ADDRESS:        3652,
  LOST_TOKEN:                    2892,
  TOKEN_LOOP_TIME:               2893,
  MAX_TOKEN_LOOP_TIME:           2894,
  TOKEN_FRAMES_RXED:             2868,
  TOKEN_FRAMES_TXED:             2867,
  ACTIVE_NODE_TABLE:             64646,
  ACTIVE_NODE_TABLE_CHANGE_CTR:  64647,
  ACTIVE_NODE_TABLE_STATUS:      64645,
  SA_BUS_AVG_TOKEN_LOOP_TIME:    12158,
  SA_BUS_COV_RCV_PER_MIN:        12159,
  SA_BUS_WRITES_PER_MIN:         12160,
  SA_BUS_PERFORMANCE:            12157,
  MSTP_BAUD_RATE:                2173,
  ACTIVE_BAUD_RATE:              2861,
  BAUD_RATE_SELECTION:           2860,
  MSTP_BUS_TYPE:                 2589,
  FC_BUS_COMM_MODE:              4400,
  MSTP_APDU_LENGTH:              1751,
  INTERNODE_COMM_TIMER:          845,
};

const SA_BUS_PERF_LABELS: Record<number, string> = {
  0: 'Good', 1: 'Marginal', 2: 'Poor', 3: 'Failed', 4: 'Unknown',
};

const MSTP_BAUD_LABELS: Record<number, string> = {
  0: '9600', 1: '19200', 2: '38400', 3: '76800',
};

export interface MstpDevice {
  address: string;
  deviceId: number;
  name: string | undefined;
  modelName: string | undefined;
  responseTimeMs: number;
}

export interface MstpNodeStats {
  address: string;
  deviceId: number;
  name: string | undefined;
  jciMac: number | null;
  saBusMac: number | null;
  supervisorMac: number | null;
  lostToken: number | null;
  tokenLoopTimeMs: number | null;
  maxTokenLoopTimeMs: number | null;
  tokenFramesRxed: number | null;
  tokenFramesTxed: number | null;
  saBusPerfLabel: string | null;
  saBusAvgTokenLoopTimeMs: number | null;
  saBusCovPerMin: number | null;
  saBusWritesPerMin: number | null;
  mstpBaudLabel: string | null;
  activeBaudLabel: string | null;
  mstpApduLength: number | null;
  internodeCommTimer: number | null;
  activeNodeTable: number[] | null;
  activeNodeTableStatus: number | null;
  health: 'good' | 'marginal' | 'poor' | 'unknown';
}

// POST /api/mstp/scan
// Range scan WHO-IS across BACnet instance numbers, measure response times.
// Body: { lowLimit?: number, highLimit?: number, timeoutMs?: number }
router.post('/scan', async (req: Request, res: Response) => {
  if (!svc.isConnected()) {
    res.status(400).json({ error: 'Not connected' });
    return;
  }

  const {
    lowLimit = 0,
    highLimit = 4194303,
    timeoutMs = 6000,
  } = req.body as { lowLimit?: number; highLimit?: number; timeoutMs?: number };

  try {
    const start = Date.now();
    const devices = await svc.discoverRange(lowLimit, highLimit, timeoutMs);

    res.json({
      scanDurationMs: Date.now() - start,
      lowLimit,
      highLimit,
      count: devices.length,
      devices,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/mstp/stats/:deviceId
// Read MS/TP diagnostic properties from a specific device.
router.get('/stats/:deviceId', async (req: Request, res: Response) => {
  const deviceId = parseInt(routeParam(req, 'deviceId'), 10);
  const device = svc.getDevices().find(d => d.deviceId === deviceId);
  if (!device) {
    res.status(404).json({ error: 'Device not found — run a scan first' });
    return;
  }

  const stats: MstpNodeStats = {
    address: device.address,
    deviceId,
    name: device.name,
    jciMac: null,
    saBusMac: null,
    supervisorMac: null,
    lostToken: null,
    tokenLoopTimeMs: null,
    maxTokenLoopTimeMs: null,
    tokenFramesRxed: null,
    tokenFramesTxed: null,
    saBusPerfLabel: null,
    saBusAvgTokenLoopTimeMs: null,
    saBusCovPerMin: null,
    saBusWritesPerMin: null,
    mstpBaudLabel: null,
    activeBaudLabel: null,
    mstpApduLength: null,
    internodeCommTimer: null,
    activeNodeTable: null,
    activeNodeTableStatus: null,
    health: 'unknown',
  };

  // Read all MS/TP properties; ignore individual failures (some controllers
  // may not expose all proprietary properties)
  await Promise.allSettled(
    Object.entries(MSTP_PROPS).map(async ([, propId]) => {
      try {
        const val = await svc.readProperty(
          device.address,
          svc.OBJECT_TYPE.DEVICE,
          deviceId,
          propId
        );
        assignProp(stats, propId, val);
      } catch { /* silently skip unsupported properties */ }
    })
  );

  // Derive health from SA Bus Performance and Lost Token count
  stats.health = deriveHealth(stats);

  res.json(stats);
});

// GET /api/mstp/stats-bulk
// Read MS/TP stats from all discovered devices in parallel.
router.get('/stats-bulk', async (_req: Request, res: Response) => {
  if (!svc.isConnected()) {
    res.status(400).json({ error: 'Not connected' });
    return;
  }

  const devices = svc.getDevices();
  if (devices.length === 0) {
    res.json([]);
    return;
  }

  // Read a quick subset of the most useful stats in parallel
  const quickProps = [
    MSTP_PROPS.JCI_MAC_ADDRESS,
    MSTP_PROPS.LOST_TOKEN,
    MSTP_PROPS.TOKEN_LOOP_TIME,
    MSTP_PROPS.SA_BUS_PERFORMANCE,
    MSTP_PROPS.ACTIVE_BAUD_RATE,
  ];

  const results = await Promise.all(
    devices.map(async device => {
      const stats: Partial<MstpNodeStats> & { address: string; deviceId: number; name?: string; health: string } = {
        address: device.address,
        deviceId: device.deviceId,
        name: device.name,
        health: 'unknown',
      };

      await Promise.allSettled(
        quickProps.map(async propId => {
          try {
            const val = await svc.readProperty(
              device.address, svc.OBJECT_TYPE.DEVICE, device.deviceId, propId
            );
            assignProp(stats as MstpNodeStats, propId, val);
          } catch { /* skip */ }
        })
      );

      stats.health = deriveHealth(stats as MstpNodeStats);
      return stats;
    })
  );

  res.json(results);
});

// GET /api/mstp/network-port/:deviceId
// Read BACnet Network Port Objects (standard type 56) from a device.
// Returns the router's MS/TP port configuration if supported.
router.get('/network-port/:deviceId', async (req: Request, res: Response) => {
  const deviceId = parseInt(routeParam(req, 'deviceId'), 10);
  const device = svc.getDevices().find(d => d.deviceId === deviceId);
  if (!device) { res.status(404).json({ error: 'Device not found' }); return; }

  // Standard BACnet Network Port Object (type 56) property IDs
  const NET_PORT_PROPS = {
    OBJECT_NAME:       77,
    OBJECT_TYPE:       79,
    DESCRIPTION:       28,
    STATUS_FLAGS:      111,
    RELIABILITY:       103,
    OUT_OF_SERVICE:    81,
    NETWORK_TYPE:      427,  // 0=Ethernet, 1=BACnet/IP, 2=MSTP, 3=PTP, etc.
    PROTOCOL_LEVEL:    482,
    NETWORK_NUMBER:    425,
    LINK_SPEED:        411,
    CHANGES_PENDING:   416,
    COMMAND:           417,
    COMMAND_TIME_ARRAY: 418,
    MAX_MASTER:        64,
    MAX_INFO_FRAMES:   63,
    MAC_ADDRESS:       423,
    BACNET_IP_ADDRESS: 400,
    BACNET_IP_PORT:    412,
  };

  try {
    // First: read the object list to find Network Port Objects
    const objectList = await svc.readObjectList(device.address, deviceId);
    const netPorts = objectList.filter(o => o.type === 56);

    if (netPorts.length === 0) {
      res.json({ message: 'No Network Port Objects found on this device', ports: [] });
      return;
    }

    const ports = await Promise.all(
      netPorts.map(async port => {
        const props = await svc.readMultiple(
          device.address, 56, port.instance,
          Object.values(NET_PORT_PROPS)
        ).catch(() => ({} as Record<number, unknown>));

        return {
          instance: port.instance,
          objectName: props[NET_PORT_PROPS.OBJECT_NAME],
          networkType: props[NET_PORT_PROPS.NETWORK_TYPE],
          networkNumber: props[NET_PORT_PROPS.NETWORK_NUMBER],
          macAddress: props[NET_PORT_PROPS.MAC_ADDRESS],
          maxMaster: props[NET_PORT_PROPS.MAX_MASTER],
          maxInfoFrames: props[NET_PORT_PROPS.MAX_INFO_FRAMES],
          linkSpeed: props[NET_PORT_PROPS.LINK_SPEED],
          changesPending: props[NET_PORT_PROPS.CHANGES_PENDING],
          reliability: props[NET_PORT_PROPS.RELIABILITY],
          outOfService: props[NET_PORT_PROPS.OUT_OF_SERVICE],
        };
      })
    );

    res.json({ deviceId, ports });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- helpers ---

function assignProp(stats: MstpNodeStats, propId: number, val: unknown): void {
  const n = val !== null && val !== undefined ? Number(val) : null;
  switch (propId) {
    case MSTP_PROPS.JCI_MAC_ADDRESS:              stats.jciMac = n; break;
    case MSTP_PROPS.SA_BUS_MAC_ADDRESS:           stats.saBusMac = n; break;
    case MSTP_PROPS.SUPERVISOR_MAC_ADDRESS:       stats.supervisorMac = n; break;
    case MSTP_PROPS.LOST_TOKEN:                   stats.lostToken = n; break;
    case MSTP_PROPS.TOKEN_LOOP_TIME:              stats.tokenLoopTimeMs = n; break;
    case MSTP_PROPS.MAX_TOKEN_LOOP_TIME:          stats.maxTokenLoopTimeMs = n; break;
    case MSTP_PROPS.TOKEN_FRAMES_RXED:            stats.tokenFramesRxed = n; break;
    case MSTP_PROPS.TOKEN_FRAMES_TXED:            stats.tokenFramesTxed = n; break;
    case MSTP_PROPS.SA_BUS_AVG_TOKEN_LOOP_TIME:   stats.saBusAvgTokenLoopTimeMs = n; break;
    case MSTP_PROPS.SA_BUS_COV_RCV_PER_MIN:       stats.saBusCovPerMin = n; break;
    case MSTP_PROPS.SA_BUS_WRITES_PER_MIN:        stats.saBusWritesPerMin = n; break;
    case MSTP_PROPS.MSTP_APDU_LENGTH:             stats.mstpApduLength = n; break;
    case MSTP_PROPS.INTERNODE_COMM_TIMER:         stats.internodeCommTimer = n; break;
    case MSTP_PROPS.ACTIVE_NODE_TABLE_STATUS:     stats.activeNodeTableStatus = n; break;
    case MSTP_PROPS.SA_BUS_PERFORMANCE:
      stats.saBusPerfLabel = n !== null ? (SA_BUS_PERF_LABELS[n] ?? `${n}`) : null; break;
    case MSTP_PROPS.MSTP_BAUD_RATE:
      stats.mstpBaudLabel = n !== null ? (MSTP_BAUD_LABELS[n] ?? `${n}`) : null; break;
    case MSTP_PROPS.ACTIVE_BAUD_RATE:
      stats.activeBaudLabel = n !== null ? (MSTP_BAUD_LABELS[n] ?? `${n}`) : null; break;
    case MSTP_PROPS.ACTIVE_NODE_TABLE:
      if (Array.isArray(val)) stats.activeNodeTable = val.map(Number);
      else if (n !== null) stats.activeNodeTable = [n];
      break;
  }
}

function deriveHealth(stats: Partial<MstpNodeStats>): 'good' | 'marginal' | 'poor' | 'unknown' {
  if (stats.saBusPerfLabel === 'Failed' || stats.saBusPerfLabel === 'Poor') return 'poor';
  if (stats.saBusPerfLabel === 'Marginal') return 'marginal';
  if (stats.saBusPerfLabel === 'Good') return 'good';

  // Fallback: use lost token count
  const lost = stats.lostToken ?? 0;
  if (lost === 0) return 'good';
  if (lost < 10) return 'marginal';
  if (lost >= 10) return 'poor';
  return 'unknown';
}

// GET /api/mstp/standard/:deviceId
// Standard BACnet diagnostics — works with any vendor (no JCI proprietary props).
// Reads: vendor name, model name, firmware, app version, max APDU, protocol version,
// and all Network Port Objects (type 56) for MS/TP config.
router.get('/standard/:deviceId', async (req: Request, res: Response) => {
  const deviceId = parseInt(routeParam(req, 'deviceId'), 10);
  const device = svc.getDevices().find(d => d.deviceId === deviceId);
  if (!device) { res.status(404).json({ error: 'Device not found' }); return; }

  // Standard ASHRAE 135 device-level properties
  const STD = {
    OBJECT_NAME: 77, DESCRIPTION: 28, VENDOR_NAME: 121, VENDOR_ID: 120,
    MODEL_NAME: 70, FIRMWARE_REVISION: 44, APPLICATION_SOFTWARE_VERSION: 12,
    PROTOCOL_VERSION: 98, PROTOCOL_REVISION: 139, MAX_APDU_LENGTH_ACCEPTED: 62,
    SEGMENTATION_SUPPORTED: 107, SYSTEM_STATUS: 112, DATABASE_REVISION: 155,
    PROFILE_NAME: 168, OBJECT_LIST: 76,
  };

  try {
    const [devProps, objectList] = await Promise.all([
      svc.readMultiple(device.address, svc.OBJECT_TYPE.DEVICE, deviceId,
        Object.values(STD)).catch(() => ({} as Record<number, unknown>)),
      svc.readObjectList(device.address, deviceId).catch(() => [] as Array<{ type: number; instance: number }>),
    ]);

    const netPorts = objectList.filter(o => o.type === 56);
    const NET_PORT_PROPS = [77, 28, 111, 103, 427, 425, 423, 64, 63, 411, 416];

    const portDetails = await Promise.all(
      netPorts.map(async p => {
        const props = await svc.readMultiple(device.address, 56, p.instance, NET_PORT_PROPS)
          .catch(() => ({} as Record<number, unknown>));
        const NT: Record<number, string> = { 0: 'Ethernet', 1: 'BACnet/IP', 2: 'MS/TP', 3: 'PTP', 4: 'ARCNET', 9: 'IPv6' };
        return {
          instance: p.instance,
          name: props[77],
          description: props[28],
          networkType: props[427] !== undefined ? NT[props[427] as number] ?? `Type ${props[427]}` : null,
          networkNumber: props[425],
          macAddress: props[423],
          maxMaster: props[64],
          maxInfoFrames: props[63],
          linkSpeed: props[411],
          changesPending: props[416],
          reliability: props[103],
          statusFlags: props[111],
        };
      })
    );

    const SYSSTAT: Record<number, string> = {
      0: 'Operational', 1: 'Operational/Read-Only', 2: 'Download-Required',
      3: 'Download-In-Progress', 4: 'Non-Operational', 5: 'Backup-In-Progress',
    };

    res.json({
      deviceId,
      address: device.address,
      objectName: devProps[STD.OBJECT_NAME],
      description: devProps[STD.DESCRIPTION],
      vendorName: devProps[STD.VENDOR_NAME],
      vendorId: devProps[STD.VENDOR_ID],
      modelName: devProps[STD.MODEL_NAME],
      firmwareRevision: devProps[STD.FIRMWARE_REVISION],
      applicationSoftwareVersion: devProps[STD.APPLICATION_SOFTWARE_VERSION],
      protocolVersion: devProps[STD.PROTOCOL_VERSION],
      protocolRevision: devProps[STD.PROTOCOL_REVISION],
      maxApduLength: devProps[STD.MAX_APDU_LENGTH_ACCEPTED],
      segmentation: devProps[STD.SEGMENTATION_SUPPORTED],
      systemStatus: devProps[STD.SYSTEM_STATUS] !== undefined
        ? (SYSSTAT[devProps[STD.SYSTEM_STATUS] as number] ?? `Status ${devProps[STD.SYSTEM_STATUS]}`)
        : null,
      databaseRevision: devProps[STD.DATABASE_REVISION],
      objectCount: Array.isArray(objectList) ? objectList.length : null,
      networkPorts: portDetails,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function routeParam(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default router;
