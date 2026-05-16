/**
 * MS/TP serial transport — ASHRAE 135 Annex H
 *
 * Two modes:
 *   passive — listen-only sniffer; never transmits, never takes the token.
 *             Safe on any live bus. Good for diagnostics.
 *   active  — joins the token ring as a BACnet master node.
 *             Required for WHO-IS / read-property commands.
 */
import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';

// ─── MS/TP constants ──────────────────────────────────────────────────────────

export const MSTP_PREAMBLE_55 = 0x55;
export const MSTP_PREAMBLE_FF = 0xFF;
export const MSTP_BROADCAST   = 0xFF;

export const FRAME_TYPE: Record<number, string> = {
  0x00: 'Token',
  0x01: 'Poll-for-Master',
  0x02: 'Reply-to-Poll-for-Master',
  0x03: 'Test-Request',
  0x04: 'Test-Response',
  0x05: 'BACnet-Data-Expecting-Reply',
  0x06: 'BACnet-Data-Not-Expecting-Reply',
  0x07: 'Reply-Postponed',
};

export const BACNET_PDU_TYPE: Record<number, string> = {
  0x00: 'BACnet-Confirmed-Req',
  0x10: 'BACnet-Unconfirmed-Req',
  0x20: 'BACnet-Simple-Ack',
  0x30: 'BACnet-Complex-Ack',
  0x40: 'BACnet-Segment-Ack',
  0x50: 'BACnet-Error',
  0x60: 'BACnet-Reject',
  0x70: 'BACnet-Abort',
};

export const UNCONFIRMED_SERVICE: Record<number, string> = {
  0: 'I-Am',
  1: 'I-Have',
  8: 'Who-Is',
  9: 'Who-Has',
  5: 'Unconfirmed-COV-Notification',
  6: 'Unconfirmed-Event-Notification',
};

export const CONFIRMED_SERVICE: Record<number, string> = {
  12: 'Read-Property',
  15: 'Write-Property',
  14: 'Read-Property-Multiple',
  16: 'Write-Property-Multiple',
  4:  'Create-Object',
  11: 'Delete-Object',
  7:  'Add-List-Element',
  8:  'Remove-List-Element',
  26: 'Subscribe-COV',
  13: 'Read-Range',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MstpFrame {
  ts: number;           // timestamp ms
  frameType: number;
  frameTypeName: string;
  dst: number;
  src: number;
  dataLength: number;
  headerCrcOk: boolean;
  dataCrcOk: boolean | null;
  data: number[];
  bacnet?: {
    npduVersion: number;
    pduTypeName: string;
    serviceName: string | null;
    invokeId?: number;
    deviceId?: number;   // from I-Am
    vendorId?: number;   // from I-Am
  };
}

export interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  vendorId?: string;
  productId?: string;
}

export type SerialMode = 'passive' | 'active';

// ─── CRC helpers (ASHRAE 135 Annex H) ────────────────────────────────────────

function crc8(data: Buffer | number[], crc = 0xff): number {
  for (const b of data) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x80) crc = ((crc << 1) ^ 0x07) & 0xff;
      else            crc = (crc << 1) & 0xff;
    }
  }
  return crc ^ 0x55;
}

function crc16(data: Buffer | number[], crc = 0xffff): number {
  for (const b of data) {
    let temp = (b ^ (crc & 0xff)) & 0xff;
    for (let i = 0; i < 8; i++) {
      if (temp & 0x01) temp = ((temp >>> 1) ^ 0xa001) & 0xffff;
      else             temp = (temp >>> 1) & 0xffff;
    }
    crc = ((crc >>> 8) ^ temp) & 0xffff;
  }
  return (~crc) & 0xffff;
}

// ─── MS/TP Parser ─────────────────────────────────────────────────────────────

export class MstpParser extends EventEmitter {
  private buf = Buffer.alloc(0);

  push(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
    this.parse();
  }

  private parse(): void {
    while (this.buf.length >= 2) {
      // Scan for preamble 0x55 0xFF
      const p55 = this.buf.indexOf(MSTP_PREAMBLE_55);
      if (p55 < 0) { this.buf = Buffer.alloc(0); return; }
      if (this.buf[p55 + 1] !== MSTP_PREAMBLE_FF) {
        this.buf = this.buf.slice(p55 + 1);
        continue;
      }

      // Need at least 8 bytes for header (2 preamble + 6 header bytes)
      if (this.buf.length - p55 < 8) break;

      const base = p55 + 2;
      const frameType   = this.buf[base];
      const dst         = this.buf[base + 1];
      const src         = this.buf[base + 2];
      const dataLength  = (this.buf[base + 3] << 8) | this.buf[base + 4];
      const headerCrc   = this.buf[base + 5];

      // Validate header CRC over bytes [frameType, dst, src, lenHi, lenLo]
      const expectedHCrc = crc8(this.buf.slice(base, base + 5));
      const headerCrcOk = (headerCrc === expectedHCrc);

      if (!headerCrcOk) {
        // Bad header — advance past this preamble and keep scanning
        this.buf = this.buf.slice(p55 + 1);
        continue;
      }

      // Check we have the full frame
      const totalLen = 8 + dataLength + (dataLength > 0 ? 2 : 0);
      if (this.buf.length - p55 < totalLen) break;

      const dataStart = base + 6;
      const rawData = [...this.buf.slice(dataStart, dataStart + dataLength)];

      let dataCrcOk: boolean | null = null;
      if (dataLength > 0) {
        const dataCrcLo = this.buf[dataStart + dataLength];
        const dataCrcHi = this.buf[dataStart + dataLength + 1];
        const dataCrcExpected = crc16(rawData);
        dataCrcOk = (dataCrcLo === (dataCrcExpected & 0xff) &&
                     dataCrcHi === ((dataCrcExpected >> 8) & 0xff));
      }

      const frame: MstpFrame = {
        ts: Date.now(),
        frameType,
        frameTypeName: FRAME_TYPE[frameType] ?? `Proprietary(${frameType})`,
        dst,
        src,
        dataLength,
        headerCrcOk,
        dataCrcOk,
        data: rawData,
      };

      // Decode BACnet NPDU/APDU if this is a data frame
      if ((frameType === 0x05 || frameType === 0x06) && dataLength >= 2 && dataCrcOk) {
        frame.bacnet = decodeBacnet(rawData);
      }

      this.emit('frame', frame);
      this.buf = this.buf.slice(p55 + totalLen);
    }
  }
}

function decodeBacnet(data: number[]): MstpFrame['bacnet'] {
  if (data.length < 2) return undefined;

  const npduVersion = data[0]; // should be 1
  const npduControl = data[1];
  const hasSourceAddress = (npduControl & 0x08) !== 0;
  const hasDestAddress   = (npduControl & 0x20) !== 0;
  const isNetworkMsg     = (npduControl & 0x80) !== 0;

  let offset = 2;
  if (hasDestAddress) {
    const dnetLen = data[offset + 2]; // dest net (2) + len (1) + addr (dnetLen)
    offset += 3 + dnetLen;
  }
  if (hasSourceAddress) {
    const snetLen = data[offset + 2];
    offset += 3 + snetLen;
  }
  if (hasDestAddress) offset++; // hop count

  if (isNetworkMsg || offset >= data.length) {
    return { npduVersion, pduTypeName: 'Network-Layer-Message', serviceName: null };
  }

  const apduByte  = data[offset];
  const pduType   = apduByte & 0xf0;
  const pduTypeName = BACNET_PDU_TYPE[pduType] ?? `PDU(${pduType})`;

  let serviceName: string | null = null;
  let invokeId: number | undefined;
  let deviceId: number | undefined;
  let vendorId: number | undefined;

  if (pduType === 0x10 && offset + 1 < data.length) {
    // Unconfirmed request
    const svc = data[offset + 1];
    serviceName = UNCONFIRMED_SERVICE[svc] ?? `Unconfirmed(${svc})`;

    // I-Am: decode device ID and vendor ID
    if (svc === 0 && offset + 6 < data.length) {
      const o = offset + 2;
      // Application tag 12 (Object-Identifier) = 0xC4, 4 bytes value
      if (data[o] === 0xC4) {
        const raw = (data[o+1] << 24) | (data[o+2] << 16) | (data[o+3] << 8) | data[o+4];
        deviceId = raw & 0x3fffff;
      }
      // Vendor ID after max APDU (2 bytes) and segmentation (1 byte)
      if (offset + 10 < data.length) {
        const vi = offset + 9;
        if (data[vi] === 0x21) vendorId = data[vi + 1];        // context tag 3, uint8
        else if (data[vi] === 0x22) vendorId = (data[vi+1] << 8) | data[vi+2]; // uint16
      }
    }
  } else if (pduType === 0x00 && offset + 2 < data.length) {
    // Confirmed request
    invokeId = data[offset + 2];
    const svc = data[offset + 3];
    serviceName = CONFIRMED_SERVICE[svc] ?? `Confirmed(${svc})`;
  }

  return { npduVersion, pduTypeName, serviceName, invokeId, deviceId, vendorId };
}

// ─── Service singleton ────────────────────────────────────────────────────────

export interface SerialSession {
  port: SerialPort;
  parser: MstpParser;
  path: string;
  baudRate: number;
  mode: SerialMode;
  frameCount: number;
  startedAt: number;
}

let session: SerialSession | null = null;
const frameEmitter = new EventEmitter();

export function getSession() { return session; }
export function onFrame(cb: (f: MstpFrame) => void) { frameEmitter.on('frame', cb); }
export function offFrame(cb: (f: MstpFrame) => void) { frameEmitter.off('frame', cb); }

export async function listPorts(): Promise<PortInfo[]> {
  return SerialPort.list() as Promise<PortInfo[]>;
}

export async function openPort(
  path: string,
  baudRate = 38400,
  mode: SerialMode = 'passive'
): Promise<void> {
  if (session) await closePort();

  const port = new SerialPort({ path, baudRate, autoOpen: false });
  const parser = new MstpParser();

  await new Promise<void>((resolve, reject) => {
    port.open(err => err ? reject(err) : resolve());
  });

  session = { port, parser, path, baudRate, mode, frameCount: 0, startedAt: Date.now() };

  port.on('data', (chunk: Buffer) => {
    parser.push(chunk);
  });

  parser.on('frame', (frame: MstpFrame) => {
    session!.frameCount++;
    frameEmitter.emit('frame', frame);
  });

  port.on('error', (err: Error) => {
    console.error('MS/TP serial error:', err.message);
    frameEmitter.emit('error', err.message);
    session = null;
  });

  port.on('close', () => {
    frameEmitter.emit('closed');
    session = null;
  });
}

export async function closePort(): Promise<void> {
  if (!session) return;
  const p = session.port;
  session = null;
  await new Promise<void>(resolve => p.close(() => resolve()));
}
