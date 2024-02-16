import { BufferReader } from "./bufferReader";

export class Chunk {
  buffer;
  _reader;
  chunkId;
  size;
  data;
  constructor(buffer: Uint8Array, skipJunk = false) {
    this.buffer = buffer;
    this._reader = new BufferReader(this.buffer);
    this.chunkId = this._reader.fourcc();
    this.size = this._reader.dword();
    this.data = buffer.subarray(8);
  }
  describe(n = 0) {
    return `${" ".repeat(n)}'${this.chunkId}'(${this.size})\n`;
  }
}

export class ListChunk extends Chunk {
  #skipJunk;
  listReader;
  listRead;
  listType;
  readNext() {
    if (!this._reader) return true;
    if (this._reader.ended()) {
      this.listReader.onEnd();
      this.listRead = true;
      delete this._reader;
      return true;
    }
    let nextChunkType = this._reader.fourcc();
    let nextChunkSize = this._reader.dword();
    if (!this.#skipJunk || nextChunkType !== "JUNK") {
      let newChunk = new (getConstructorForId(nextChunkType))(
        this.buffer.subarray(
          this._reader.position - 8,
          this._reader.position + nextChunkSize,
        ),
        this.#skipJunk,
      );
      this.listReader.onChunk(newChunk);
    }
    this._reader.skip(nextChunkSize + (nextChunkSize % 2));
    return false;
  }

  constructor(buffer: Uint8Array, skipJunk = false) {
    super(buffer, skipJunk);
    this.#skipJunk = skipJunk;
    this.listType = this._reader.fourcc();
    this.listRead = false;
    this.listReader = new (getListParserForId(this.listType))();
    this.listReader.onStart();
    while (!this.readNext());
  }
  describe(n = 0) {
    let val = `${" ".repeat(n)}${this.chunkId} ('${this.listType}'\n`;
    return val + this.listReader.describe(n);
  }

  findChunkByFilter(filter: (c: Chunk) => boolean): Chunk | undefined {
    if (!this.listReader.subChunks) return null;
    for (let i = 0; i < this.listReader.subChunks.length; i++) {
      const chunk = this.listReader.subChunks[i];
      if (filter(chunk)) {
        return chunk;
      }
      if (chunk instanceof ListChunk) {
        const res = chunk.findChunkByFilter(filter);
        if (res) return res;
      }
    }
    return null;
  }
}
export class DefaultListReader {
  subChunks: Chunk[];
  onStart() {
    this.subChunks = [];
  }
  onChunk(chunk: Chunk) {
    this.subChunks.push(chunk);
  }
  onEnd() {}
  describe(n = 0) {
    let val = "";
    this.subChunks.forEach((subChunk) => {
      val += subChunk.describe(n + 1);
    });
    val += `${" ".repeat(n)})\n`;
    return val;
  }
}

const listParsers: Record<string, typeof DefaultListReader> = {};

const constructors: Record<string, typeof Chunk> = {
  LIST: ListChunk,
  RIFF: ListChunk,
};

function getConstructorForId(chunkId: string) {
  return constructors[chunkId] ?? Chunk;
}

function registerChunk(chunkId: string, chunkConstructor: typeof Chunk) {
  constructors[chunkId] = chunkConstructor;
}
function unregisterChunk(chunkId: string) {
  return delete constructors[chunkId];
}

function getListParserForId(listType: string) {
  return listParsers[listType] ?? DefaultListReader;
}

function registerListParser(
  listType: string,
  listParser: typeof DefaultListReader,
) {
  listParsers[listType] = listParser;
}

function unregisterListParser(listType: string) {
  return delete listParsers[listType];
}

export const chunkRegistration = {
  current: constructors,
  register: registerChunk,
  unregister: unregisterChunk,
};
export const listRegistration = {
  current: listParsers,
  register: registerListParser,
  unregister: unregisterListParser,
};
