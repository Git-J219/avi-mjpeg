import { BufferReader } from "./bufferReader";
import { Chunk, chunkRegistration, listRegistration } from "./riff";
import { DefaultListReader, ListChunk } from "./riff";

function checkEnded(reader: BufferReader, chunk: string) {
  if (!reader.ended())
    throw new Error(
      `Data after expected end of chunk in ${chunk} (read ${reader.position} of ${reader._buffer.length})`,
    );
}

export class avihChunk extends Chunk {
  microSecPerFrame;
  maxBytesPerSec;
  paddingGranularity;
  flags;
  totalFrames;
  initialFrames;
  streams;
  suggestedBufferSize;
  width;
  height;
  constructor(buffer: Uint8Array, skipJunk = false) {
    super(buffer, skipJunk);
    this.microSecPerFrame = this._reader.dword();
    this.maxBytesPerSec = this._reader.dword();
    this.paddingGranularity = this._reader.dword();
    this.flags = this._reader.dword();
    this.totalFrames = this._reader.dword();
    this.initialFrames = this._reader.dword();
    this.streams = this._reader.dword();
    this.suggestedBufferSize = this._reader.dword();
    this.width = this._reader.dword();
    this.height = this._reader.dword();
    this._reader.skip(4 * 4);
    checkEnded(this._reader, "avihChunk");
    delete this._reader;
  }
  describe(n = 0) {
    return `${" ".repeat(n)}'${this.chunkId}'(${this.microSecPerFrame} us/f, ${
      this.maxBytesPerSec
    } max B/s, ${this.paddingGranularity} padding, 0x${this.flags.toString(
      16,
    )}, ${this.totalFrames} total frames, ${
      this.initialFrames
    } initial frames, ${this.streams} streams, ${
      this.suggestedBufferSize
    } suggested buffer size, ${this.width}x${this.height})\n`;
  }
}

export class strhChunk extends Chunk {
  type;
  handler;
  flags;
  priority;
  language;
  initialFrames;
  scale;
  rate;
  start;
  length;
  suggestedBufferSize;
  quality;
  sampleSize;
  frame: { left: number; right: number; top: number; bottom: number };
  constructor(buffer: Uint8Array, skipJunk = false) {
    super(buffer, skipJunk);
    this.type = this._reader.fourcc();
    this.handler = this._reader.fourcc();
    this.flags = this._reader.dword();
    this.priority = this._reader.word();
    this.language = this._reader.word();
    this.initialFrames = this._reader.dword();
    this.scale = this._reader.dword();
    this.rate = this._reader.dword();
    this.start = this._reader.dword();
    this.length = this._reader.dword();
    this.suggestedBufferSize = this._reader.dword();
    this.quality = this._reader.dword();
    this.sampleSize = this._reader.dword();
    this.frame = this._reader.obj(
      { t: "word", k: "left" },
      { t: "word", k: "top" },
      { t: "word", k: "right" },
      { t: "word", k: "bottom" },
    );
    checkEnded(this._reader, "strhChunk");
    delete this._reader;
  }
  describe(n = 0) {
    return `${" ".repeat(n)}'${this.chunkId}'(${this.type} (${
      this.handler
    }), 0x${this.flags.toString(16)}, ${this.priority}, ${this.language}, ${
      this.initialFrames
    } initial frames, ${this.rate}/${this.scale} samples per second, ${
      this.start
    } start, ${this.length}, ${
      this.suggestedBufferSize
    } suggested buffer size, ${this.quality} quality, ${
      this.sampleSize
    } sample size, ${JSON.stringify(this.frame)})\n`;
  }
}
export class strfBITMAPINFOChunk extends Chunk {
  // Size 40
  biSize;
  width;
  height;
  planes;
  bitCount;
  compression: { numeric: number; fourcc: string };
  sizeImage;
  xPelsPerMeter;
  yPelsPerMeter;
  clrUsed;
  clrImportant;
  constructor(buffer: Uint8Array) {
    super(buffer, false);
    this.biSize = this._reader.dword();
    this.width = this._reader.long();
    this.height = this._reader.long();
    this.planes = this._reader.word();
    this.bitCount = this._reader.word();
    this.compression = this._reader.obj(
      { k: "numeric", t: "dword" },
      { t: "skip", a: [-4] },
      { k: "fourcc", t: "fourcc" },
    );
    this.sizeImage = this._reader.dword();
    this.xPelsPerMeter = this._reader.long();
    this.yPelsPerMeter = this._reader.long();
    this.clrUsed = this._reader.dword();
    this.clrImportant = this._reader.dword();
    checkEnded(this._reader, "strfBITMAPINFOChunk");
    delete this._reader;
  }
}
export class hdrlListReader extends DefaultListReader {
  mainHeader: avihChunk;
  #state: number;
  #streams: number;
  streams: strlListReader[];
  onStart() {
    this.#state = 0;
  }
  onChunk(chunk: Chunk) {
    switch (this.#state) {
      case 0:
        if (chunk instanceof avihChunk) {
          this.mainHeader = chunk;
          this.#streams = this.mainHeader.streams;
          this.streams = [];
          this.#state++;
        }
        return;
      case 1:
        if (
          chunk instanceof ListChunk &&
          chunk.listReader instanceof strlListReader
        ) {
          this.streams.push(chunk.listReader);
          this.#streams--;
        }
        return;
    }
  }
  onEnd() {
    if (this.#streams)
      console.warn(
        "Stream count does not match with actual count: " + this.#streams,
      );
  }
  describeStreams(n = 0) {
    let result = "";
    this.streams.forEach((v) => {
      result += v.describe(n + 1) + "\n";
    });
    return result;
  }
  describe(n = 0) {
    return `${this.mainHeader.describe(n + 1)}\n${" ".repeat(n + 1)}${
      this.streams.length
    } stream(s):\n${this.describeStreams(n)}`;
  }
}

export class strlListReader extends DefaultListReader {
  header: strhChunk;
  format: Chunk;
  #state: number;
  onStart() {
    this.#state = 0;
  }
  /**
   *
   * @param {Chunk} chunk
   */
  onChunk(chunk: Chunk) {
    switch (this.#state) {
      case 0:
        if (chunk.chunkId === "strh" && chunk instanceof strhChunk) {
          this.header = chunk;
          this.#state++;
        }
        return;
      case 1: {
        if (chunk.chunkId === "strf") {
          if (this.header.type === "vids") {
            this.format = new strfBITMAPINFOChunk(chunk.buffer);
          } else {
            this.format = chunk;
          }
          this.#state++;
        }
        return;
      }
    }
  }
  onEnd() {
    if (this.#state !== 2)
      console.warn("strlListParser finished without strh and strf");
  }
  describe(n = 0) {
    return `${this.header.describe(n + 1)}\n${
      this.format ? this.format.describe(n + 1) : ""
    }`;
  }
}

export type FrameData = {
  data: Uint8Array;
  type: string;
};

class moviListReader extends DefaultListReader {
  streams: Record<number, FrameData[]>;
  onStart() {
    this.streams = {};
  }
  onChunk(chunk: Chunk) {
    if (chunk.chunkId === "LIST" && chunk instanceof ListChunk) {
      if (chunk.listType === "rec ") {
        chunk.listReader.subChunks.forEach(this.onChunk);
      }
      return;
    }
    const streamId = +chunk.chunkId.slice(0, 2);
    const streamType = chunk.chunkId.slice(2);
    if (!this.streams[streamId]) this.streams[streamId] = [];
    this.streams[streamId].push({
      data: chunk.buffer.subarray(8),
      type: streamType,
    });
  }
  onEnd() {}
  describe(n = 0) {
    return ``;
  }
}

export function registerAllChunks(registration: typeof chunkRegistration) {
  registration.register("avih", avihChunk);
  registration.register("strh", strhChunk);
}

export function registerAllListParsers(registration: typeof listRegistration) {
  registration.register("strl", strlListReader);
  registration.register("hdrl", hdrlListReader);
  registration.register("movi", moviListReader);
}

export type AVIDescriptor = {
  hdrl: hdrlListReader;
  movi: moviListReader;
};

export function extractImportantFromParsed(riff: ListChunk) {
  const important: AVIDescriptor = {} as AVIDescriptor;
  important.hdrl = (
    riff.findChunkByFilter(
      (v) => (v as ListChunk).listReader instanceof hdrlListReader,
    ) as ListChunk
  ).listReader as hdrlListReader;
  important.movi = (
    riff.findChunkByFilter(
      (v) => (v as ListChunk).listReader instanceof moviListReader,
    ) as ListChunk
  ).listReader as moviListReader;
  return important;
}
