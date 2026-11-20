import json
import os
import sys
from pathlib import Path

import soundfile
from kokoro_onnx import Kokoro

LINES = {
    "title": "Meet irsim. Design boards that live in your repository.",
    "canvas": "Every screen of your app, on one canvas.",
    "comments": "Comment on a board, then send it to your coding agent.",
    "agent": "Your agent edits the board, and replies in the thread.",
    "approve": "Happy with it? Approve, and your agent builds it in the app.",
    "variants": "Ask for variants. Compare them side by side, and choose one.",
    "sections": "Group boards into sections, and tidy them in one click.",
    "play": "Play any board, at any screen size.",
    "search": "Find any board in a keystroke.",
    "end": "irsim is open source. Install it in one line.",
}

home = Path.home() / ".cache" / "kokoro"
model = os.environ.get("KOKORO_MODEL", str(home / "kokoro-v1.0.onnx"))
voices = os.environ.get("KOKORO_VOICES", str(home / "voices-v1.0.bin"))
voice = os.environ.get("TRAILER_VOICE", "af_heart")

outdir = Path(sys.argv[1]).resolve()
outdir.mkdir(parents=True, exist_ok=True)

kokoro = Kokoro(model, voices)
manifest = {}
for key, text in LINES.items():
    audio, rate = kokoro.create(text.replace("irsim", "ersim"), voice=voice, speed=1.0, lang="en-us")
    path = outdir / f"voice-{key}.wav"
    soundfile.write(str(path), audio, rate)
    manifest[key] = {"file": str(path), "seconds": len(audio) / rate}

(outdir / "voice.json").write_text(json.dumps(manifest, indent=2))
