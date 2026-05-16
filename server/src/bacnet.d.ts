// Minimal type shim for the 'bacstack' package (no official @types)
declare module 'bacstack' {
  interface BacnetOptions {
    apduTimeout?: number;
    interface?: string;
    port?: number;
    broadcastAddress?: string;
  }

  interface IamResult {
    address: string;
    deviceId: number;
    maxApdu: number;
    segmentation: number;
    vendorId: number;
  }

  interface PropertyValue {
    id: number;
    index: number;
    value: Array<{ type: number; value: unknown }>;
  }

  interface ReadPropertyResult {
    values: PropertyValue[];
  }

  interface ReadPropertyMultipleResult {
    values: Array<{
      objectId: { type: number; instance: number };
      values: PropertyValue[];
    }>;
  }

  type Callback<T> = (err: Error | null, result: T) => void;

  class Client {
    constructor(options?: BacnetOptions);
    whoIs(lowLimit?: number, highLimit?: number, address?: string): void;
    readProperty(
      address: string, objectId: { type: number; instance: number },
      propertyId: number, options: object, callback: Callback<ReadPropertyResult>
    ): void;
    readPropertyMultiple(
      address: string,
      propertiesArray: Array<{
        objectId: { type: number; instance: number };
        properties: Array<{ id: number }>;
      }>,
      options: object,
      callback: Callback<ReadPropertyMultipleResult>
    ): void;
    writeProperty(
      address: string, objectId: { type: number; instance: number },
      propertyId: number, values: Array<{ type: number; value: unknown }>,
      options: object, callback: Callback<void>
    ): void;
    on(event: 'iAm', listener: (device: IamResult) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    close(): void;
  }

  export = Client;
}
