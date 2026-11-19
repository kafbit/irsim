# Trailer recorder

Records a 60 second product trailer of the real irsim canvas app, running on a small demo project called Ledgerly and writes `trailer.mp4`, `trailer.webm` and `poster.jpg`.

## Re-record

```bash
CHROME=/path/to/chrome node scripts/trailer/record.mjs --out ../landing/public/irsim
```

The run takes about 6 minutes. Most of it is the VP9 encode.

## Requirements

- `irsim` on the PATH, installed at `~/.local/share/irsim/`.
- `ffmpeg` with libx264 and libvpx-vp9.
- A Chromium or Chrome binary and `playwright-core`. No browser is downloaded.

## What it does

1. Writes the Ledgerly demo boards into a temporary work directory with `demo/generate.mjs` and runs `irsim init` and `irsim serve` on a free port. The demo is a fictional invoicing app: page `App` (sections Core screens and Mobile, 6 boards) and page `Marketing` (Home, Pricing, Sign in). To preview it, run `node scripts/trailer/demo/generate.mjs <dir>` and serve that directory.
2. Registers a bridge session named `claude` (the top bar shows the first 6 characters of the session name next to the project folder name, `ledgerly`) and renews it every 8 seconds, because the session expires after 30 seconds.
3. Opens the app in headless Chromium at 1920x1080 and captures frames with CDP `Page.startScreencast` (jpeg, quality 92, every frame acknowledged).
4. Drives the real UI with a simulated pointer, keycap pills and captions from `overlay.js`. The title card and the end card are the only HTML pages.
5. Plays the agent role through `irsim bridge claim` and `irsim bridge tool`: it edits the Invoices board (the New invoice button becomes larger and solid indigo), replies in the thread, then writes the Simpler (no sidebar) and Responsive (cards in one column) variants.
6. Builds an ffmpeg concat list from the per frame timestamps and runs `render.sh` (30 fps, 1920x1080, H.264 crf 20, VP9 crf 34, poster at 5 s).

## Options

- `--out <dir>` output directory (required).
- `--work <dir>` scratch directory, default `$TMPDIR/irsim-trailer-work`.
- `--shots <dir>` writes debug screenshots of each step.
- `--mp4-crf <n>` and `--webm-crf <n>` quality overrides.
- Env `PLAYWRIGHT_CORE` path to `playwright-core/index.mjs`, env `CHROME` path to the browser binary.

## Timing

The canvas loads before recording starts. The title card is an iframe laid over the loaded app for 3.5 s, and the end card holds for 5 s. The total is about 60 s.

## Known adaptation

In headless runs the Send button click shows the real UI but the send request did not reach the server. The script clicks the button for the visual, then posts to `/api/comments/send` itself (`deliverDrafts`).
