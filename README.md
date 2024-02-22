# avi-mjpeg
Browser based player for avi files containing mjpeg video.

## Build
1. `yarn`
2. `yarn build`
3. Open `dist/index.html` in your browser

## Usage
Double-click to open controls popup.
Press `Open` and select your file. It can take a couple of seconds to load the file.


## Creating a playable file
You need to have ffmpeg installed. You can then just run
`ffmpeg -i input.mp4 -c:v mjpeg output.avi`, replacing `input.mp4` with your input file and `output` with the output file name. (Do not change the `.avi` extension!)