import {
  registerAllChunks,
  registerAllListParsers,
  extractImportantFromParsed,
  AVIDescriptor,
  strlListReader,
  FrameData,
} from "./avi";
import { initControls } from "./controls";
import { ListChunk, chunkRegistration, listRegistration } from "./riff";

registerAllChunks(chunkRegistration);
registerAllListParsers(listRegistration);

export type PlaybackStatus = {
  playing: boolean;
  currentTime: number;
  completedTime: number;
  looping: boolean;
};

class VideoPlayer {
  #currentDescriptor: AVIDescriptor;
  #videoStreams: { header: strlListReader; i: number; stream: FrameData[] }[];
  #canvas: HTMLImageElement;
  doStop: boolean;
  #lastTimestamp: DOMHighResTimeStamp;
  #playbackTime: number;
  loop: boolean;
  #completedTime: number;
  #statusCb: (e: PlaybackStatus) => void;
  #lastStatus: PlaybackStatus;
  constructor(canvas: HTMLImageElement) {
    this.#canvas = canvas;
    this.doPlayback = this.doPlayback.bind(this);
    this.#statusCb = () => {};
    this.#lastStatus = {
      completedTime: 0,
      currentTime: 0,
      looping: false,
      playing: false,
    };
  }
  loadFile(aviDescriptor: AVIDescriptor) {
    this.#currentDescriptor = aviDescriptor;
    this.doStop = true;
    this.#lastTimestamp = undefined;
    this.#videoStreams = aviDescriptor.hdrl.streams
      .map((v, i) => ({ header: v, i, stream: aviDescriptor.movi.streams[i] }))
      .filter((v) => {
        return v.header.header.type === "vids";
      });
    this.#completedTime =
      (this.#currentDescriptor.hdrl.mainHeader.totalFrames *
        this.#currentDescriptor.hdrl.mainHeader.microSecPerFrame) /
      1000;
    this.seek(0);
  }
  displayFrameByTime(currentTimeMs: number) {
    const frameNum = Math.floor(
      currentTimeMs /
        (this.#currentDescriptor.hdrl.mainHeader.microSecPerFrame / 1000),
    );
    return this.displayFrameByNum(frameNum);
  }
  displayFrameByNum(frameNumber: number) {
    if (!this.#videoStreams[0].stream[frameNumber]) return false;
    const data = this.#videoStreams[0].stream[frameNumber].data;
    const blob = new Blob([data], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    URL.revokeObjectURL(this.#canvas.src);
    this.#canvas.src = url;
    return true;
  }

  doPlayback(timestamp: DOMHighResTimeStamp) {
    if (this.doStop) {
      this.#lastTimestamp = undefined;
      this.sendStatus({
        completedTime: this.#completedTime,
        currentTime: this.#playbackTime,
        playing: false,
        looping: this.loop,
      });
      return;
    }
    if (this.#lastTimestamp) {
      this.sendStatus({
        completedTime: this.#completedTime,
        currentTime: this.#playbackTime,
        playing: true,
        looping: this.loop,
      });
      const delta = timestamp - this.#lastTimestamp; // in ms
      this.#playbackTime += delta;
      if (!this.displayFrameByTime(this.#playbackTime)) {
        this.#playbackTime = 0; // do not use seek -> image stays on last frame, but play starts from start
        if (!this.loop) {
          this.doStop = true;
          this.#lastTimestamp = undefined;
          this.sendStatus({
            completedTime: this.#completedTime,
            currentTime: this.#completedTime,
            playing: false,
            looping: this.loop,
          });
          return;
        }
      }
    }
    this.#lastTimestamp = timestamp;
    requestAnimationFrame(this.doPlayback);
  }

  startPlayback() {
    if (this.#lastTimestamp === undefined) {
      this.doStop = false;
      this.doPlayback(undefined);
    }
  }

  stopPlayback() {
    this.doStop = true;
  }

  seek(position: number) {
    this.#playbackTime = position;
    if (this.doStop) {
      this.displayFrameByTime(this.#playbackTime);
      this.sendStatus({
        completedTime: this.#completedTime,
        currentTime: this.#playbackTime,
        playing: false,
        looping: this.loop,
      });
    }
  }

  pause() {
    this.stopPlayback();
  }

  play() {
    this.startPlayback();
  }

  sendStatus(status: PlaybackStatus) {
    this.#lastStatus = status;
    this.resendStatus();
  }

  updateLoopFlag() {
    if (this.doStop) {
      this.#lastStatus.looping = this.loop;
      this.resendStatus();
    }
  }

  resendStatus() {
    this.#statusCb(this.#lastStatus);
  }

  setStatusCallback(cb: (e: PlaybackStatus) => void) {
    this.#statusCb = cb;
  }
}

function initMain() {
  let canvas: HTMLImageElement;
  let player: VideoPlayer;
  let controls: Window;
  window.addEventListener("DOMContentLoaded", () => {
    canvas = document.querySelector("img#contentFrame");
    player = new VideoPlayer(canvas);
    (window as any).player = player;

    addEventListener("message", (e) => {
      if (e.data.type === "command") {
        switch (e.data.data) {
          case "pause":
            player.pause();
            break;
          case "play":
            player.play();
            break;
          case "unloop":
            player.loop = false;
            player.updateLoopFlag();
            break;
          case "loop":
            player.loop = true;
            player.updateLoopFlag();
            break;
        }
      } else if (e.data.type === "statusUpdate") {
        player.resendStatus();
      } else if (e.data.type === "transferFile") {
        let mainChunk = new ListChunk(e.data.data, true);
        player.loadFile(extractImportantFromParsed(mainChunk));
      }
    });

    player.setStatusCallback((e) => {
      if (controls) {
        controls.postMessage({ type: "status", data: e });
      }
    });

    function openControls() {
      controls = window.open(
        "?controls",
        "controls",
        "popup width=400 height=100",
      );
    }
    window.addEventListener("dblclick", openControls);
  });
}
if (location.search === "?controls") {
  initControls();
} else {
  initMain();
}
