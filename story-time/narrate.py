#!/usr/bin/env python3
"""Narrate a story folder with the Chatterbox "Heart" voice.

Usage (must run inside the Chatterbox venv):
    /workspace/tts/venv-expr/bin/python narrate.py stories/2026-10-21-my-story [--force] [--only p03,cover]

Makes one MP3 per page (plus cover.mp3 reading the title and end.mp3), as named in story.json.
Every clip is checked with faster-whisper; any clip that drops words is regenerated with a new seed.

Voice settings (approved by the owner): reference wav ref-heart.wav, exaggeration 0.8, cfg_weight 0.3,
sentence chunks <= 160 chars joined with 0.35 s pauses, ffmpeg loudnorm I=-16, mono 96 kbps MP3.
"""
import argparse, difflib, json, os, re, subprocess, sys, tempfile, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REF_WAV = os.environ.get('NARRATE_REF', '/workspace/tts/ref-heart.wav')
WHISPER_PY = os.environ.get('NARRATE_WHISPER_PY', sys.executable)  # faster-whisper lives in venv-expr too
EXAGGERATION, CFG_WEIGHT, PAUSE_S, MAX_CHUNK = 0.8, 0.3, 0.35, 160
MIN_MATCH = 0.90   # fraction of the page's words that must be heard, in order
MAX_TRIES = 4


def chunk(text):
    sents = re.findall(r'[^.!?]+[.!?]+["”]?\s*', text) or [text]
    rest = text[sum(len(s) for s in sents):].strip()
    if rest:
        sents.append(rest)
    chunks, cur = [], ''
    for s in sents:
        if len(cur) + len(s) > MAX_CHUNK and cur:
            chunks.append(cur.strip()); cur = ''
        cur += s
    if cur.strip():
        chunks.append(cur.strip())
    return chunks


SAME = {'hick': 'hic', 'hiccup': 'hic', 'good': 'good', 'okay': 'ok'}


def words(t):
    t = t.lower().replace('’', "'").replace('good night', 'goodnight').replace('good-night', 'goodnight')
    return [SAME.get(w, w) for w in re.findall(r"[a-z0-9']+", t)]


def match_score(ref, heard):
    r, h = words(ref), words(heard)
    if not r:
        return 1.0
    sm = difflib.SequenceMatcher(None, r, h, autojunk=False)
    return sum(b.size for b in sm.get_matching_blocks()) / len(r)


def transcribe(paths):
    out = subprocess.run([WHISPER_PY, str(HERE / 'tools' / 'verify_audio.py'), *map(str, paths)],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out.split('@@JSON@@', 1)[1])


class Voice:
    def __init__(self):
        import torch
        from chatterbox.tts import ChatterboxTTS
        torch.set_num_threads(int(os.environ.get('NARRATE_THREADS', '8')))
        self.torch = torch
        t = time.time()
        self.m = ChatterboxTTS.from_pretrained(device='cpu')
        self.m.prepare_conditionals(REF_WAV, exaggeration=EXAGGERATION)
        print(f'model loaded in {time.time()-t:.1f}s', flush=True)

    def render(self, text, mp3, seed):
        import torchaudio as ta
        torch, m = self.torch, self.m
        torch.manual_seed(seed)
        parts = []
        for c in chunk(text):
            parts += [m.generate(c, exaggeration=EXAGGERATION, cfg_weight=CFG_WEIGHT),
                      torch.zeros(1, int(m.sr * PAUSE_S))]
        wav = torch.cat(parts, dim=1)
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            tmp = f.name
        ta.save(tmp, wav, m.sr)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
                        '-ac', '1', '-ar', '24000', '-b:a', '96k', str(mp3)], check=True)
        os.unlink(tmp)
        return wav.shape[-1] / m.sr


def clips_for(story):
    clips = []
    if story.get('cover', {}).get('audio'):
        clips.append(('cover', story['cover'].get('text') or story['title'], story['cover']['audio']))
    for i, p in enumerate(story['pages'], 1):
        if p.get('audio'):
            clips.append((f'p{i:02d}', p['text'], p['audio']))
    if story.get('end', {}).get('audio'):
        clips.append(('end', story['end'].get('text', 'The end.'), story['end']['audio']))
    return clips


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder')
    ap.add_argument('--force', action='store_true', help='re-record clips that already exist')
    ap.add_argument('--only', default='', help='comma list of clip ids (cover,p01,...,end)')
    ap.add_argument('--no-verify', action='store_true')
    ap.add_argument('--verify-only', action='store_true', help='check existing clips, re-record only bad ones')
    a = ap.parse_args()
    folder = Path(a.folder).resolve()
    story = json.loads((folder / 'story.json').read_text())
    only = set(filter(None, a.only.split(',')))
    todo = [c for c in clips_for(story)
            if (not only or c[0] in only) and (a.force or only or a.verify_only or not (folder / c[2]).exists())]
    if not todo:
        print('nothing to narrate'); return
    t0 = time.time()
    voice = None
    seeds = {cid: 0 for cid, _, _ in todo}
    best = {}
    pending = todo
    for attempt in range(1, MAX_TRIES + 1):
        for cid, text, fn in pending:
            if attempt == 1 and a.verify_only:
                continue
            voice = voice or Voice()
            t = time.time()
            dur = voice.render(text, folder / fn if attempt == 1 else folder / f'.try-{fn}', seeds[cid])
            print(f'[{attempt}] {cid}: {dur:.1f}s audio in {time.time()-t:.1f}s', flush=True)
        if a.no_verify:
            break
        paths = [folder / (fn if attempt == 1 else f'.try-{fn}') for _, _, fn in pending]
        heard = transcribe(paths)
        retry = []
        for (cid, text, fn), p in zip(pending, paths):
            s = match_score(text, heard[str(p)])
            print(f'    verify {cid}: {s:.0%}  "{heard[str(p)]}"', flush=True)
            if attempt > 1:
                if s > best[cid]:
                    os.replace(p, folder / fn)
                    best[cid] = s
                else:
                    p.unlink()
            else:
                best[cid] = s
            if best[cid] < MIN_MATCH:
                seeds[cid] += 1
                retry.append((cid, text, fn))
        pending = retry
        if not pending:
            break
    bad = {c: f'{s:.0%}' for c, s in best.items() if s < MIN_MATCH}
    print(f'done in {time.time()-t0:.0f}s' + (f'; still below {MIN_MATCH:.0%}: {bad}' if bad else '; all clips verified'))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
