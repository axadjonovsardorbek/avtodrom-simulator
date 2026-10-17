"""Records the Uzbek voice prompts with Microsoft's neural Uzbek voices (`edge-tts`, needs internet).

  exam announcer:  src/audio/phrases.json      -> public/audio/uz/<id>.mp3
  instructor:      src/instructor/lines.json   -> public/audio/uz/ins/<mood>/<key>_<n>.mp3

    python3 -m venv .venv && .venv/bin/pip install edge-tts
    .venv/bin/python tools/make_voice.py            # everything
    .venv/bin/python tools/make_voice.py ins        # only the instructor
"""
import asyncio, json, os, sys
import edge_tts

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "public/audio/uz")

async def say(text, voice, path, **prosody):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    await edge_tts.Communicate(text, voice, **prosody).save(path)
    print(f"{os.path.relpath(path, OUT):30s} {os.path.getsize(path) // 1024:3d} KB  {text}")

async def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    if only in (None, "exam"):
        cfg = json.load(open(os.path.join(ROOT, "src/audio/phrases.json"), encoding="utf-8"))
        for pid, text in cfg["phrases"].items():
            await say(text, cfg["voice"], os.path.join(OUT, pid + ".mp3"), rate="-5%")
    if only in (None, "ins"):
        cfg = json.load(open(os.path.join(ROOT, "src/instructor/lines.json"), encoding="utf-8"))
        for key, moods in cfg["lines"].items():
            for mood, texts in moods.items():
                for i, text in enumerate(texts):
                    await say(text, cfg["voice"], os.path.join(OUT, "ins", mood, f"{key}_{i}.mp3"), **cfg["prosody"][mood])

asyncio.run(main())
