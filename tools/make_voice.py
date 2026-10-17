"""Records the Uzbek voice prompts in src/audio/phrases.json to public/audio/uz/<id>.mp3.

Uses Microsoft's neural Uzbek voice through the `edge-tts` package (needs internet):
    python3 -m venv .venv && .venv/bin/pip install edge-tts
    .venv/bin/python tools/make_voice.py
"""
import asyncio, json, os
import edge_tts

ROOT = os.path.join(os.path.dirname(__file__), "..")
cfg = json.load(open(os.path.join(ROOT, "src/audio/phrases.json"), encoding="utf-8"))
out = os.path.join(ROOT, "public/audio/uz")
os.makedirs(out, exist_ok=True)

async def main():
    for pid, text in cfg["phrases"].items():
        path = os.path.join(out, pid + ".mp3")
        await edge_tts.Communicate(text, cfg["voice"], rate="-5%").save(path)
        print(f"{pid:24s} {os.path.getsize(path) // 1024:3d} KB  {text}")

asyncio.run(main())
