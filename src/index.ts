import {
  registerAllChunks,
  registerAllListParsers,
  extractImportantFromParsed,
  AVIDescriptor,
  strlListReader,
  FrameData,
} from "./avi";
import { ListChunk, chunkRegistration, listRegistration } from "./riff";

registerAllChunks(chunkRegistration);
registerAllListParsers(listRegistration);

declare type PlaybackStatus = {
  playing: boolean;
  currentTime: number;
  completedTime: number;
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
  constructor(canvas: HTMLImageElement) {
    this.#canvas = canvas;
    this.doPlayback = this.doPlayback.bind(this);
    this.#statusCb = () => {};
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
      this.#currentDescriptor.hdrl.mainHeader.totalFrames *
      this.#currentDescriptor.hdrl.mainHeader.microSecPerFrame /
      1000;
    this.seek(0);
  }
  displayFrameByTime(currentTimeMs: number) {
    const frameNum = Math.floor(
      currentTimeMs /
        (this.#currentDescriptor.hdrl.mainHeader.microSecPerFrame / 1000)
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
      this.#statusCb({
        completedTime: this.#completedTime,
        currentTime: this.#playbackTime,
        playing: false
      });
      return;
    }
    if (this.#lastTimestamp) {
      this.#statusCb({
        completedTime: this.#completedTime,
        currentTime: this.#playbackTime,
        playing: true
      });
      const delta = timestamp - this.#lastTimestamp; // in ms
      this.#playbackTime += delta;
      if (!this.displayFrameByTime(this.#playbackTime)) {
        this.#playbackTime = 0; // do not use seek -> stays on last frame, but play starts from start
        if (!this.loop) {
          this.doStop = true;
          this.#lastTimestamp = undefined;
          this.#statusCb({
            completedTime: this.#completedTime,
            currentTime: this.#completedTime,
            playing: false
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
      this.#statusCb({
        completedTime: this.#completedTime,
        currentTime: this.#playbackTime,
        playing: false
      });
    }
  }

  playPause() {
    if (this.doStop) {
      this.startPlayback();
    } else {
      this.stopPlayback();
    }
  }

  setStatusCallback(cb: (e: PlaybackStatus) => void) {
    this.#statusCb = cb;
  }
}

let canvas: HTMLImageElement;
let player: VideoPlayer;
window.addEventListener("DOMContentLoaded", () => {
  canvas = document.querySelector("img#contentFrame");
  player = new VideoPlayer(canvas);
  (window as any).player = player;
  let fileReader = new FileReader();
  fileReader.onload = (e) => {
    let data = e.target.result as ArrayBuffer;
    let mainChunk = new ListChunk(new Uint8Array(data), true);
    player.loadFile(extractImportantFromParsed(mainChunk));
  };

  // Add event handler for changing input file
  document
    .querySelector("input[type=file]#filePicker")
    .addEventListener("change", (e) => {
      let files = (e.target as HTMLInputElement).files;
      if (files.length === 1) {
        fileReader.abort();
        let file = files[0];
        fileReader.readAsArrayBuffer(file);
      }
    });

  const playPauseButton = document.querySelector("button#playPause");
  playPauseButton
    .addEventListener("click", player.playPause.bind(player));
  
  const progressInfo = document.querySelector("span#progressInfo");

  function formatTime(timeMs: number) {
    let seconds = Math.floor(timeMs/1000) % 60;
    let minutes = Math.floor(timeMs/1000/60);
    return minutes+":"+seconds.toString().padStart(2, "0");
  }

  player.setStatusCallback((e) => {
    playPauseButton.innerHTML = e.playing ? "Pause" : "Play"
    progressInfo.innerHTML = formatTime(e.currentTime) + "/" + formatTime(e.completedTime);
  })
});
