#!/usr/bin/env python3
"""Narrate each article in content/ to audio/<slug>.mp3 with Kokoro.

Voice: am_michael, lang en-us, speed 1.0 (kokoro-onnx). Readable text is the
title, the lede, and the body. Image captions and citation sections (Sources,
Further reading, and the like) are left out. A sha256 of that text is stored
in audio/manifest.json and in the MP3 comment; an article is synthesized
again only when the text changes.

Kokoro models are downloaded into .cache/kokoro (or $KOKORO_DIR) from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
and are not committed. Failures are per article: existing MP3s are kept,
and the process exits 0 so a deploy can continue without audio.
"""
import argparse, hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile, urllib.request, wave
ROOT = pathlib.Path(__file__).parent
SRC, AUDIO = ROOT / "content", ROOT / "audio"
MANIFEST = AUDIO / "manifest.json"
MODEL_DIR = pathlib.Path(os.environ.get("KOKORO_DIR", ROOT / ".cache" / "kokoro"))
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
VOICE, LANG, SPEED = "am_michael", "en-us", 1.0
BITRATE = "80k"
LUFS = -16
# Included in the hash so a voice or loudness change regenerates every file.
HASH_SALT = f"kokoro-v1|{VOICE}|{LANG}|{SPEED}|lufs={LUFS}|bitrate={BITRATE}"
SKIP_HEADINGS = {
    "sources", "source", "further reading", "references", "reference",
    "bibliography", "works cited", "citations", "citation",
}
IMG = re.compile(r'^!\[(.*?)\]\((\S+?)(?:\s+"(.*)")?\)$')
ABBREV = re.compile(
    r"(?:\b(?:St|Mt|Mr|Mrs|Ms|Dr|Prof|Gen|Col|Lt|Capt|Rev|Fr|Jr|Sr|vs|etc|c|ca|cf|fl|r|d|b|no|vol|ed|eds|trans|approx|e\.g|i\.e|[A-Z])\.)$"
)
MAX_CHARS = 480

def plain(t):
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    t = re.sub(r"(?<!\*)\*(.+?)\*(?!\*)", r"\1", t)
    t = re.sub(r"\[(.+?)\]\((https?://[^)]+)\)", r"\1", t)
    t = re.sub(r"\[(?:\d+[\d,\s–-]*|citation needed|note \d+|[a-z])\]", "", t, flags=re.I)
    t = t.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    t = t.replace("—", ", ").replace("–", "-").replace("…", "...")
    return re.sub(r"\s+", " ", t).strip()

def parse(path):
    txt = path.read_text(encoding="utf-8")
    _, fm, body = txt.split("---", 2)
    meta = {k.strip(): v.strip() for k, v in (l.split(":", 1) for l in fm.strip().splitlines() if ":" in l)}
    meta["body"] = body
    return meta

def skip_heading(title):
    return plain(title).lower().strip(" .:") in SKIP_HEADINGS

def blocks_for(meta):
    """Title, lede, then body blocks. ('heading'|'para'|'item', text)."""
    blocks = [("heading", plain(meta["title"]))]
    summary = plain(meta.get("summary", ""))
    if summary: blocks.append(("para", summary))
    para, items, skip, fig = [], [], False, False
    def flush():
        if para:
            text = plain(" ".join(para))
            if text: blocks.append(("para", text))
            para.clear()
        if items:
            for item in items:
                text = plain(item)
                if text: blocks.append(("item", text))
            items.clear()
    for line in meta["body"].splitlines():
        s = line.strip()
        if fig:
            fig = False
            if re.fullmatch(r"\*[^*].*\*", s or ""):
                continue
        if s.startswith("## "):
            flush()
            skip = skip_heading(s[3:])
            if not skip:
                text = plain(s[3:])
                if text: blocks.append(("heading", text))
            continue
        if skip or not s: 
            if not s: flush()
            continue
        if IMG.match(s):
            flush(); fig = True; continue
        if s.startswith("- "):
            if para: flush()
            items.append(s[2:])
        else:
            if items: flush()
            para.append(s)
    flush()
    return blocks

def split_sentences(text):
    raw = re.sub(r'([.!?…]["\'”’)\]]*)\s+(?=["“\'‘(]?[A-Z0-9])', "\\1\n", text).split("\n")
    parts = []
    for p in raw:
        prev = parts[-1] if parts else ""
        if prev and ABBREV.search(prev): parts[-1] = prev + " " + p
        else: parts.append(p)
    return [p.strip() for p in parts if p.strip()]

def pack(text, limit=MAX_CHARS):
    out, cur = [], ""
    pending = split_sentences(text) or [text]
    sentences = []
    for sent in pending:
        while len(sent) > limit:
            cut = sent.rfind(", ", 0, limit)
            if cut < 80: cut = sent.rfind(" ", 0, limit)
            if cut < 40: cut = limit
            head, sent = sent[:cut].strip(" ,"), sent[cut:].strip(" ,")
            if head: sentences.append(head)
        if sent: sentences.append(sent)
    for sent in sentences:
        if cur and len(cur) + 1 + len(sent) > limit:
            out.append(cur); cur = sent
        else:
            cur = (cur + " " + sent).strip() if cur else sent
    if cur: out.append(cur)
    return out

def chunks_for(blocks):
    """(text, seconds of silence after this chunk)."""
    pause = {"heading": 0.34, "para": 0.42, "item": 0.26}
    out = []
    for kind, text in blocks:
        if kind == "heading" and text[-1:] not in ".!?": text += "."
        parts = pack(text)
        for i, part in enumerate(parts):
            last = i == len(parts) - 1
            out.append((part, pause.get(kind, 0.3) if last else 0.16))
    if out:
        text, _ = out[-1]
        out[-1] = (text, 0.2)
    return out

def script_hash(blocks):
    body = "\n".join(f"{kind}\t{text}" for kind, text in blocks)
    return hashlib.sha256((HASH_SALT + "\n" + body).encode()).hexdigest()

def load_manifest():
    if not MANIFEST.exists(): return {"voice": VOICE, "lang": LANG, "speed": SPEED, "articles": {}}
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"voice": VOICE, "lang": LANG, "speed": SPEED, "articles": {}}
    data.setdefault("articles", {})
    return data

def save_manifest(manifest):
    AUDIO.mkdir(parents=True, exist_ok=True)
    manifest["voice"], manifest["lang"], manifest["speed"] = VOICE, LANG, SPEED
    tmp = MANIFEST.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(MANIFEST)

def comment_hash(mp3):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format_tags=comment", "-of", "default=nw=1:nk=1", str(mp3)],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    return out.removeprefix("sha256:") if out.startswith("sha256:") else None

def cached_hash(manifest, slug, mp3):
    if not mp3.is_file() or mp3.stat().st_size < 1000: return None
    entry = manifest.get("articles", {}).get(slug) or {}
    return entry.get("sha256") or comment_hash(mp3)

def download(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and dest.stat().st_size > 1_000_000: return
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"downloading {url}", flush=True)
    urllib.request.urlretrieve(url, tmp)
    if tmp.stat().st_size < 1_000_000: raise RuntimeError(f"download too small: {url}")
    tmp.replace(dest)

def load_kokoro():
    download(MODEL_URL, MODEL_DIR / "kokoro-v1.0.onnx")
    download(VOICES_URL, MODEL_DIR / "voices-v1.0.bin")
    from kokoro_onnx import Kokoro
    return Kokoro(str(MODEL_DIR / "kokoro-v1.0.onnx"), str(MODEL_DIR / "voices-v1.0.bin"))

def synth_text(kokoro, text):
    import numpy as np
    def once(piece):
        audio, sr = kokoro.create(piece, voice=VOICE, speed=SPEED, lang=LANG, sentence_pause=0.22, clause_pause=0.1)
        return np.asarray(audio, dtype=np.float32).reshape(-1), int(sr)
    try:
        return once(text)
    except Exception as first:
        parts = split_sentences(text)
        if len(parts) <= 1: raise first
        print(f"    retrying in {len(parts)} sentences after: {first}", flush=True)
        pieces, sr = [], None
        for part in parts:
            audio, rate = once(part)
            if sr is None: sr = rate
            elif rate != sr: raise RuntimeError(f"sample rate changed from {sr} to {rate}")
            pieces.append(audio)
            pieces.append(np.zeros(int(sr * 0.18), dtype=np.float32))
        return np.concatenate(pieces), sr

def synthesize(kokoro, chunks):
    import numpy as np
    pieces, sr = [], None
    for i, (text, pause) in enumerate(chunks, 1):
        print(f"    chunk {i}/{len(chunks)} ({len(text)} chars)", flush=True)
        audio, rate = synth_text(kokoro, text)
        if sr is None: sr = rate
        elif rate != sr: raise RuntimeError(f"sample rate changed from {sr} to {rate}")
        pieces.append(audio)
        if pause: pieces.append(np.zeros(int(round(sr * pause)), dtype=np.float32))
    if not pieces: raise RuntimeError("nothing to say")
    return np.concatenate(pieces), sr

def write_wav(path, audio, sr):
    import numpy as np
    pcm = np.clip(audio, -1, 1)
    pcm = (pcm * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(pcm.tobytes())

def loudnorm_stats(stderr):
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", stderr)
    if not m: return None
    try: data = json.loads(m.group(0))
    except json.JSONDecodeError: return None
    keys = ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")
    try:
        vals = {k: float(data[k]) for k in keys}
    except (KeyError, TypeError, ValueError):
        return None
    if any(v != v or abs(v) == float("inf") for v in vals.values()): return None
    return vals

def encode_mp3(wav, mp3, title, digest):
    probe = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(wav), "-af", f"loudnorm=I={LUFS}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    stats = loudnorm_stats(probe.stderr or "")
    if stats:
        af = (
            f"loudnorm=I={LUFS}:TP=-1.5:LRA=11:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:"
            f"measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
        )
    else:
        af = f"loudnorm=I={LUFS}:TP=-1.5:LRA=11"
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav),
        "-af", af, "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", BITRATE,
        "-metadata", f"title={title}", "-metadata", "artist=Obsidian Archive",
        "-metadata", f"comment=sha256:{digest}", str(mp3),
    ]
    subprocess.run(cmd, check=True)

def narrate_one(kokoro, meta, digest, mp3):
    chunks = chunks_for(blocks_for(meta))
    if not chunks: raise RuntimeError("no readable text")
    audio, sr = synthesize(kokoro, chunks)
    with tempfile.TemporaryDirectory() as td:
        td = pathlib.Path(td)
        wav, tmp = td / "narration.wav", td / "narration.mp3"
        write_wav(wav, audio, sr)
        encode_mp3(wav, tmp, meta["title"], digest)
        AUDIO.mkdir(parents=True, exist_ok=True)
        os.replace(tmp, mp3)
    return mp3.stat().st_size, len(audio) / sr

def articles(only):
    found = []
    for path in sorted(SRC.glob("*.md")):
        meta = parse(path)
        if only and meta["slug"] not in only: continue
        found.append(meta)
    return found

def main(argv=None):
    ap = argparse.ArgumentParser(description="Narrate Obsidian Archive articles with Kokoro.")
    ap.add_argument("slugs", nargs="*", help="only these slugs (default: every article)")
    ap.add_argument("--dry-run", action="store_true", help="print the script and hash, do not synthesize")
    args = ap.parse_args(argv)
    only = set(args.slugs)
    manifest = load_manifest()
    try:
        metas = articles(only)
    except Exception as e:
        print(f"narration: could not read articles: {e}", file=sys.stderr)
        return 0
    if not only:
        keep = {m["slug"] for m in metas}
        for slug in list(manifest.get("articles", {})):
            if slug not in keep:
                print(f"drop {slug}: article removed")
                manifest["articles"].pop(slug, None)
                (AUDIO / f"{slug}.mp3").unlink(missing_ok=True)
        for mp3 in AUDIO.glob("*.mp3"):
            if mp3.stem not in keep:
                print(f"drop file {mp3.name}")
                mp3.unlink(missing_ok=True)
        save_manifest(manifest)
    pending = []
    for meta in metas:
        blocks = blocks_for(meta)
        digest = script_hash(blocks)
        mp3 = AUDIO / f"{meta['slug']}.mp3"
        have = cached_hash(manifest, meta["slug"], mp3)
        chars = sum(len(t) for _, t in blocks)
        if args.dry_run:
            print(f"--- {meta['slug']} {chars} chars {digest[:12]} chunks={len(chunks_for(blocks))}")
            print("\n".join(t for _, t in blocks))
            print()
            continue
        if have == digest:
            print(f"cached {meta['slug']}")
            continue
        pending.append((meta, digest, mp3))
    if args.dry_run or not pending:
        if not args.dry_run: print(f"narration: {len(metas)} up to date")
        return 0
    try:
        kokoro = load_kokoro()
    except Exception as e:
        print(f"narration: TTS unavailable, site will keep any existing audio: {e}", file=sys.stderr)
        return 0
    failed = 0
    for meta, digest, mp3 in pending:
        print(f"narrate {meta['slug']}", flush=True)
        try:
            size, seconds = narrate_one(kokoro, meta, digest, mp3)
        except Exception as e:
            failed += 1
            print(f"FAILED {meta['slug']}: {e}", file=sys.stderr)
            continue
        manifest.setdefault("articles", {})[meta["slug"]] = {
            "sha256": digest, "bytes": size, "seconds": round(seconds, 2),
        }
        save_manifest(manifest)
        print(f"  wrote {mp3.name} {size/1e6:.2f} MB {seconds:.0f}s", flush=True)
    print(f"narration: generated {len(pending) - failed}, failed {failed}, cached {len(metas) - len(pending)}")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"narration: aborted: {e}", file=sys.stderr)
        sys.exit(0)
