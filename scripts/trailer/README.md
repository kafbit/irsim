# Trailer recorder

Records a product trailer of about 85 seconds of the real irsim canvas app, running on a small demo project called Ledgerly, with a voice over and sound effects. It writes `trailer.mp4`, `trailer.webm` and `poster.jpg`.

## Re-record

```bash
CHROME=/path/to/chrome node scripts/trailer/record.mjs --out ../landing/public/irsim
```

The run takes about 9 minutes. Most of it is the VP9 encode.

## Requirements

- `irsim` on the PATH, installed at `~/.local/share/irsim/`.
- `ffmpeg` with libx264 and libvpx-vp9.
- A Chromium or Chrome binary and `playwright-core`. No browser is downloaded.
- `uv` and the Kokoro model files `~/.cache/kokoro/kokoro-v1.0.onnx` and `~/.cache/kokoro/voices-v1.0.bin`. `voice.py` runs through `uv run --python 3.12 --with kokoro-onnx --with soundfile`, so Python 3.12 is used and no system Python is needed.

## What it does

1. Writes the Ledgerly demo boards into a temporary work directory with `demo/generate.mjs` and runs `irsim init` and `irsim serve` on a free port. The demo is a fictional invoicing app: page `App` (sections Core screens and Mobile, 6 boards) and page `Marketing` (Home, Pricing, Sign in). To preview it, run `node scripts/trailer/demo/generate.mjs <dir>` and serve that directory.
2. Registers a bridge session named `claude` (the top bar shows the first 6 characters of the session name next to the project folder name, `ledgerly`) and renews it every 8 seconds, because the session expires after 30 seconds.
3. Opens the app in headless Chromium at 1920x1080 and captures frames with CDP `Page.startScreencast` (jpeg, quality 92, every frame acknowledged).
4. Drives the real UI with a simulated pointer, keycap pills and captions from `overlay.js`. The title card and the end card are the only HTML pages.
5. Plays the agent role through `irsim bridge claim` and `irsim bridge tool`: it edits the Invoices board (the New invoice button becomes larger and solid indigo), replies in the thread, claims the approval turn, then writes the Simpler (no sidebar) and Responsive (cards in one column) variants.
6. Runs `voice.py` before the browser opens. It writes one Kokoro voice line per scene and `voice.json` with the duration of each line. The word irsim is spoken as ersim.
7. Shows a chapter title at the top left of every scene (01 Canvas, 02 Comments, 03 Agent edits, 04 Approve and build, 05 Variants, 06 Sections, 07 Play, 08 Search) and dims the page around the key moments with a labelled spotlight (Comment added, Sent to your agent, Reply in the thread, Board updated, Approve and build, Section).
8. Records a timeline of scene starts, clicks, key presses, typed characters, spotlights and chimes. `mix.mjs` synthesizes the sound effects with ffmpeg, places each voice line at its scene start and each effect at its event time, and normalizes the mix to -16 LUFS into `audio.wav`.
9. Builds an ffmpeg concat list from the per frame timestamps and runs `render.sh` (30 fps, 1920x1080, H.264 crf 20 with AAC 128k, VP9 crf 34 with Opus 96k, poster taken inside the Canvas scene).

The two scenes added for the voice version are Approve and build (the top bar button, then the toast that confirms the turn was sent) and Sections (two boards that start outside a section are selected, grouped with Shift+S, named Billing and tidied as a grid).

## Options

- `--out <dir>` output directory (required).
- `--work <dir>` scratch directory, default `$TMPDIR/irsim-trailer-work`.
- `--shots <dir>` writes debug screenshots of each step.
- `--mp4-crf <n>` and `--webm-crf <n>` quality overrides.
- `--poster-at <seconds>` poster time, default 1.2 s after the Canvas scene starts.
- Env `TRAILER_VOICE` Kokoro voice name, default `af_heart`. Env `KOKORO_MODEL` and `KOKORO_VOICES` override the model paths.
- Env `PLAYWRIGHT_CORE` path to `playwright-core/index.mjs`, env `CHROME` path to the browser binary.

## Timing

The canvas loads before recording starts.
The title card is an iframe laid over the loaded app for the longer of 3.5 s and the title voice line plus 0.5 s.
Every scene holds until its voice line has finished plus 0.5 s, so a scene never cuts the voice, and the voice never runs into the next scene.
The end card holds for the longer of 5 s and the end voice line plus 1 s.
The total is about 85 s and changes with the voice length and the speed of the UI.

## Known adaptation

In headless runs the Send button click shows the real UI but the send request did not reach the server. The script clicks the button for the visual, then posts to `/api/comments/send` itself (`deliverDrafts`).
