import type { PlaybackStatus } from ".";

let mainWindow: Window;
let status: PlaybackStatus;
let playPauseButton: HTMLButtonElement;
let loopButton: HTMLButtonElement;
let progress: HTMLSpanElement;

export function initControls() {
  document.querySelector("style#pageSelection").innerHTML =
    ".main{display:none;}";
  if (window.opener) {
    mainWindow = window.opener;
    addEventListener("message", (e) => {
      if (e.data.type === "status") {
        playbackStatusUpdate(e.data.data);
      }
    });
    addEventListener("DOMContentLoaded", (e) => {
      opener.postMessage({ type: "statusUpdate" });
      playPauseButton = document.querySelector("button#playPause");
      loopButton = document.querySelector("button#loop");
      progress = document.querySelector("span#progress");

      playPauseButton.addEventListener("click", (e) => {
        if (status) {
          if (status.playing)
            mainWindow.postMessage({ type: "command", data: "pause" });
          else mainWindow.postMessage({ type: "command", data: "play" });
        }
      });
      loopButton.addEventListener("click", (e) => {
        if (status) {
          if (status.looping)
            mainWindow.postMessage({ type: "command", data: "unloop" });
          else mainWindow.postMessage({ type: "command", data: "loop" });
        }
      });

      let fileReader = new FileReader();
      fileReader.onload = (e) => {
        let data = e.target.result as ArrayBuffer;
        let file = new Uint8Array(data);
        mainWindow.postMessage(
          { type: "transferFile", data: file },
          { transfer: [file.buffer] },
        );
      };

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
    });
    setInterval(() => {
      if (!window.opener) {
        window.close();
      }
    }, 1000);
  } else {
    leave();
  }
}

function formatTime(timeMs: number) {
  let seconds = Math.floor(timeMs / 1000) % 60;
  let minutes = Math.floor(timeMs / 1000 / 60);
  return minutes + ":" + seconds.toString().padStart(2, "0");
}

function playbackStatusUpdate(newStatus: PlaybackStatus) {
  status = newStatus;
  progress.innerHTML =
    formatTime(newStatus.currentTime) +
    "/" +
    formatTime(newStatus.completedTime);
  loopButton.innerHTML = newStatus.looping
    ? "Disable looping"
    : "Enable looping";
  playPauseButton.innerHTML = newStatus.playing ? "Pause" : "Play";
}

const leave = location.replace.bind(null, "?");
