import BacnetClient from 'bacstack';

// BACnet property IDs (ASHRAE 135 standard)
export const PROP = {
  OBJECT_NAME: 77,
  DESCRIPTION: 28,
  PRESENT_VALUE: 85,
  UNITS: 117,
  STATUS_FLAGS: 111,
  RELIABILITY: 103,
  OUT_OF_SERVICE: 81,
  OBJECT_LIST: 76,
  VENDOR_NAME: 121,
  MODEL_NAME: 70,
  FIRMWARE_REVISION: 44,
  APPLICATION_SOFTWARE_VERSION: 12,
  PROTOCOL_VERSION: 98,
  MAX_APDU: 62,
};

export const OBJECT_TYPE = {
  ANALOG_INPUT: 0,
  ANALOG_OUTPUT: 1,
  ANALOG_VALUE: 2,
  BINARY_INPUT: 3,
  BINARY_OUTPUT: 4,
  BINARY_VALUE: 5,
  DEVICE: 8,
  MULTI_STATE_INPUT: 13,
  MULTI_STATE_OUTPUT: 14,
  MULTI_STATE_VALUE: 19,
};

export const OBJECT_TYPE_NAME: Record<number, string> = {
  0: 'AI', 1: 'AO', 2: 'AV', 3: 'BI', 4: 'BO', 5: 'BV',
  8: 'DEV', 13: 'MSI', 14: 'MSO', 19: 'MSV',
};

export interface DiscoveredDevice {
  address: string;
  deviceId: number;
  maxApdu: number;
  vendorId: number;
  name?: string;
  modelName?: string;
  firmwareRevision?: string;
}

// Compute IPv4 directed broadcast from an address + CIDR prefix (default /24)
export function subnetBroadcast(ip: string, prefix = 24): string {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some(isNaN)) throw new Error(`Invalid IP: ${ip}`);
  const ipInt = (octets[0] << 24 | octets[1] << 16 | octets[2] << 8 | octets[3]) >>> 0;
  const hostBits = 32 - prefix;
  // Fill host portion with 1s
  const broadcastInt = (ipInt | ((1 << hostBits) - 1)) >>> 0;
  return [
    (broadcastInt >>> 24) & 0xff,
    (broadcastInt >>> 16) & 0xff,
    (broadcastInt >>> 8)  & 0xff,
     broadcastInt         & 0xff,
  ].join('.');
}

// TL-CWCVT-0 / MAP adapter defaults
export const CWCVT_DEFAULTS = {
  ip: '192.168.142.1',
  port: 47808,
  networkNumber: 65001,
  prefix: 24,
};

let client: BacnetClient | null = null;
let converterIp: string | null = null;
let subnetBcast: string | null = null;
let networkNumber: number | null = null;
const discoveredDevices = new Map<number, DiscoveredDevice>();

export function getConverterIp() { return converterIp; }
export function getSubnetBroadcast() { return subnetBcast; }
export function getNetworkNumber() { return networkNumber; }
export function isConnected() { return client !== null && converterIp !== null; }

export function connect(ip: string, prefix = 24, netNum?: number): void {
  if (client) { client.close(); client = null; }
  networkNumber = netNum ?? null;
  converterIp = ip;
  subnetBcast = subnetBroadcast(ip, prefix);
  discoveredDevices.clear();

  // Use the subnet broadcast so the bacstack socket can send directed broadcasts
  client = new BacnetClient({ apduTimeout: 6000, broadcastAddress: subnetBcast });

  client.on('iAm', (device) => {
    if (!discoveredDevices.has(device.deviceId)) {
      discoveredDevices.set(device.deviceId, {
        address: device.address,
        deviceId: device.deviceId,
        maxApdu: device.maxApdu,
        vendorId: device.vendorId,
      });
    }
  });

  client.on('error', (err) => {
    console.error('BACnet error:', err.message);
  });
}

export function disconnect(): void {
  if (client) { client.close(); client = null; }
  converterIp = null;
  subnetBcast = null;
  discoveredDevices.clear();
}

// WHO-IS to subnet broadcast — finds all BACnet/IP devices on the WiFi network.
// Also sends a directed unicast to the TL-CWCVT-0 to flush MS/TP devices behind it.
export function discover(timeoutMs = 5000): Promise<DiscoveredDevice[]> {
  return new Promise((resolve, reject) => {
    if (!client || !converterIp) { reject(new Error('Not connected')); return; }

    const seen = new Set<number>(discoveredDevices.keys());

    // 1. Broadcast to the subnet — all BACnet/IP devices on the WiFi network respond
    client.whoIs();

    // 2. Directed unicast to the TL-CWCVT-0 — it forwards the WHO-IS to its MS/TP bus
    //    and MS/TP devices reply through it, so their I-Am originates from its IP
    client.whoIs(0, 4194303, converterIp);

    setTimeout(() => {
      const newDevices = [...discoveredDevices.values()].filter(d => !seen.has(d.deviceId));
      if (newDevices.length === 0) {
        resolve([...discoveredDevices.values()]);
        return;
      }
      Promise.all(newDevices.map(enrichDevice))
        .catch(() => null)
        .finally(() => resolve([...discoveredDevices.values()]));
    }, timeoutMs);
  });
}

function enrichDevice(device: DiscoveredDevice): Promise<void> {
  if (!client) return Promise.resolve();
  return new Promise(resolve => {
    client!.readPropertyMultiple(
      device.address,
      [{
        objectId: { type: OBJECT_TYPE.DEVICE, instance: device.deviceId },
        properties: [
          { id: PROP.OBJECT_NAME },
          { id: PROP.MODEL_NAME },
          { id: PROP.FIRMWARE_REVISION },
        ],
      }],
      {},
      (err, result) => {
        if (!err && result?.values?.[0]) {
          const props = result.values[0].values;
          for (const p of props) {
            const val = p.value?.[0]?.value;
            if (p.id === PROP.OBJECT_NAME && val) device.name = String(val);
            if (p.id === PROP.MODEL_NAME && val) device.modelName = String(val);
            if (p.id === PROP.FIRMWARE_REVISION && val) device.firmwareRevision = String(val);
          }
          discoveredDevices.set(device.deviceId, device);
        }
        resolve();
      }
    );
  });
}

export function getDevices(): DiscoveredDevice[] {
  return [...discoveredDevices.values()];
}

function removeIamListener(listener: (device: { address: string; deviceId: number; maxApdu: number; vendorId: number }) => void) {
  (client as (BacnetClient & { removeListener?: (event: string, cb: typeof listener) => void }) | null)
    ?.removeListener?.('iAm', listener);
}

// WHO-IS with specific instance range, records response time per device.
export function discoverRange(
  lowLimit: number,
  highLimit: number,
  timeoutMs = 6000
): Promise<Array<DiscoveredDevice & { responseTimeMs: number }>> {
  return new Promise((resolve, reject) => {
    if (!client || !converterIp) { reject(new Error('Not connected')); return; }

    const responseTimes = new Map<number, number>();
    const scanStart = Date.now();

    const onIam = (device: { address: string; deviceId: number; maxApdu: number; vendorId: number }) => {
      if (device.deviceId >= lowLimit && device.deviceId <= highLimit) {
        if (!responseTimes.has(device.deviceId)) {
          responseTimes.set(device.deviceId, Date.now() - scanStart);
          discoveredDevices.set(device.deviceId, {
            address: device.address,
            deviceId: device.deviceId,
            maxApdu: device.maxApdu,
            vendorId: device.vendorId,
          });
        }
      }
    };

    client.on('iAm', onIam);

    // Broadcast + directed unicast through converter
    client.whoIs(lowLimit, highLimit);
    client.whoIs(lowLimit, highLimit, converterIp!);

    setTimeout(async () => {
      removeIamListener(onIam);

      const newDevices = [...discoveredDevices.values()].filter(
        d => d.deviceId >= lowLimit && d.deviceId <= highLimit
      );

      // Enrich with name/model
      await Promise.all(newDevices.map(enrichDevice)).catch(() => null);

      resolve(
        newDevices.map(d => ({
          ...discoveredDevices.get(d.deviceId)!,
          responseTimeMs: responseTimes.get(d.deviceId) ?? -1,
        }))
      );
    }, timeoutMs);
  });
}

// Unicast WHO-IS to a specific IP — use for direct BACnet/IP devices.
// Returns the device if it responds, null if it doesn't.
export function discoverDirect(ip: string, timeoutMs = 4000): Promise<DiscoveredDevice | null> {
  return new Promise((resolve, reject) => {
    if (!client) { reject(new Error('Not connected')); return; }

    let found: DiscoveredDevice | null = null;

    // Temporary listener to catch the I-Am from this specific IP
    const onIam = (device: { address: string; deviceId: number; maxApdu: number; vendorId: number }) => {
      if (device.address === ip || !found) {
        found = {
          address: device.address,
          deviceId: device.deviceId,
          maxApdu: device.maxApdu,
          vendorId: device.vendorId,
        };
        discoveredDevices.set(device.deviceId, found);
      }
    };

    client.on('iAm', onIam);
    client.whoIs(0, 4194303, ip);

    setTimeout(async () => {
      removeIamListener(onIam);
      if (found) {
        await enrichDevice(found).catch(() => null);
        resolve(discoveredDevices.get(found.deviceId) ?? found);
      } else {
        resolve(null);
      }
    }, timeoutMs);
  });
}

export function readProperty(
  address: string,
  objectType: number,
  objectInstance: number,
  propertyId: number
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!client) { reject(new Error('Not connected')); return; }
    client.readProperty(
      address,
      { type: objectType, instance: objectInstance },
      propertyId,
      {},
      (err, result) => {
        if (err) { reject(err); return; }
        const vals = result.values[0]?.value ?? [];
        resolve(vals.length === 1 ? vals[0].value : vals.map(v => v.value));
      }
    );
  });
}

export function readMultiple(
  address: string,
  objectType: number,
  objectInstance: number,
  propertyIds: number[]
): Promise<Record<number, unknown>> {
  return new Promise((resolve, reject) => {
    if (!client) { reject(new Error('Not connected')); return; }
    client.readPropertyMultiple(
      address,
      [{
        objectId: { type: objectType, instance: objectInstance },
        properties: propertyIds.map(id => ({ id })),
      }],
      {},
      (err, result) => {
        if (err) { reject(err); return; }
        const out: Record<number, unknown> = {};
        const props = result.values[0]?.values ?? [];
        for (const p of props) {
          const vals = p.value ?? [];
          out[p.id] = vals.length === 1 ? vals[0].value : vals.map(v => v.value);
        }
        resolve(out);
      }
    );
  });
}

export function writeProperty(
  address: string,
  objectType: number,
  objectInstance: number,
  propertyId: number,
  bacnetType: number,
  value: unknown
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!client) { reject(new Error('Not connected')); return; }
    client.writeProperty(
      address,
      { type: objectType, instance: objectInstance },
      propertyId,
      [{ type: bacnetType, value }],
      {},
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}

export function readObjectList(
  address: string,
  deviceId: number
): Promise<Array<{ type: number; instance: number }>> {
  return new Promise((resolve, reject) => {
    if (!client) { reject(new Error('Not connected')); return; }
    client.readProperty(
      address,
      { type: OBJECT_TYPE.DEVICE, instance: deviceId },
      PROP.OBJECT_LIST,
      {},
      (err, result) => {
        if (err) { reject(err); return; }
        const list = ((result.values[0]?.value ?? []) as Array<{ value: { type: number; instance: number } }>).map(v => v.value);
        resolve(list);
      }
    );
  });
}
