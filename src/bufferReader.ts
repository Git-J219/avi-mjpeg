type FunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

export type BufferReaderObjectDefinition = {
  t: FunctionPropertyNames<BufferReader>;
  a?: any[];
  k?: string;
};

export class BufferReader {
  _buffer;
  position;
  constructor(buffer: Uint8Array) {
    this._buffer = buffer;
    this.position = 0;
  }
  byte() {
    return this._buffer[this.position++];
  }
  #byte_backward() {
    return this._buffer[--this.position];
  }
  int(bytes: number) {
    let value = 0;
    this.skip(bytes);
    for (let i = 0; i < bytes; i++) {
      value <<= 8;
      value += this.#byte_backward();
    }
    this.skip(bytes);
    return value;
  }
  chars(bytes: number) {
    let value = "";
    for (let i = 0; i < bytes; i++) {
      value = value + String.fromCharCode(this.byte());
    }
    return value;
  }
  skip(bytes: number) {
    this.position += bytes;
  }

  fourcc() {
    return this.chars(4);
  }

  dword() {
    return this.int(4);
  }
  word() {
    return this.int(2);
  }
  long() {
    return this.int(4);
  }

  obj(...types: BufferReaderObjectDefinition[]): any {
    const result: Record<string, any> = {};
    for (let i = 0; i < types.length; i++) {
      let singleResult = (this[types[i].t] as any)(...(types[i].a ?? []));
      if (typeof types[i].k !== "undefined") result[types[i].k] = singleResult;
    }
    return result;
  }

  ended() {
    return this.position >= this._buffer.length;
  }
}
