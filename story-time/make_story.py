#!/usr/bin/env python3
"""Daily story pipeline helper. See make_story.md for the full routine.

  python3 make_story.py new 2026-10-22 bella-the-bear "Bella the Bear's Big Sneeze"   # scaffold folder + story.json
  python3 make_story.py prompts stories/2026-10-22-bella-the-bear                    # print image prompts (cover + pages)
  python3 make_story.py images  stories/2026-10-22-bella-the-bear                    # raw/*.png|jpg -> web-size .webp
  python3 make_story.py narrate stories/2026-10-22-bella-the-bear                    # per-page MP3s, whisper-verified
  python3 make_story.py check   stories/2026-10-22-bella-the-bear                    # validate story + files
  python3 make_story.py all     stories/2026-10-22-bella-the-bear                    # images + narrate + check + build
"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TTS_PY = '/workspace/tts/venv-expr/bin/python'
STYLE = ("Polished 3D animated feature film still, like a modern animated movie: cinematic warm lighting, soft glowing highlights, "
         "rich saturated colors, cute expressive characters with big eyes, epic and adventurous but gentle and cozy, never scary")
STYLE_REF = 'assets/style/style-reference-3d.jpg'   # approved style reference (boy in red cape on a baby dragon); never copy its characters
NO_TEXT = "Absolutely no text, no letters, no words in the image."
MAX_W, QUALITY, MAX_KB = 1200, 80, 300


def load(folder):
    return json.loads((Path(folder) / 'story.json').read_text())


def cmd_new(date, slug, title):
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date) or not re.fullmatch(r'[a-z0-9-]+', slug):
        sys.exit('usage: new YYYY-MM-DD lowercase-slug "Title"')
    d = ROOT / 'stories' / f'{date}-{slug}'
    d.mkdir(parents=True, exist_ok=False); (d / 'raw').mkdir()
    pages = [{'text': 'TODO page text (1-3 short sentences).', 'scene': 'TODO what the picture shows',
              'image': f'p{i:02d}.webp', 'audio': f'p{i:02d}.mp3'} for i in range(1, 10)]
    story = {'title': title, 'date': date, 'summary': 'TODO one-sentence summary for the home page.',
             'character': 'TODO main character described identically for every picture (species, size, fur colors, eyes, clothing)',
             'cover': {'text': title + '.', 'image': 'cover.webp', 'audio': 'cover.mp3', 'scene': 'TODO cover picture'},
             'pages': pages, 'end': {'text': 'The end. Sweet dreams!', 'audio': 'end.mp3'}}
    (d / 'story.json').write_text(json.dumps(story, indent=2, ensure_ascii=False) + '\n')
    print(d)


def cmd_prompts(folder):
    s = load(folder)
    ref = str(ROOT / STYLE_REF)
    items = [('cover', s['cover'].get('scene', 'book cover showing the main character'))] + \
            [(Path(p['image']).stem, p.get('scene') or p['text']) for p in s['pages']]
    for name, scene in items:
        if name == 'cover':
            refs = f'reference_image_paths = ["{ref}"]'
            like = ', rendered in the same style as the reference image'
        else:
            refs = f'reference_image_paths = ["{Path(folder).resolve()}/raw/cover.jpg (the generated cover)", "{ref}"]'
            like = ', rendered in exactly the same style as the reference images; main character identical to the one on the cover reference'
        print(f"--- {name}  (aspect 4:3; save as raw/{name}.jpg; {refs})")
        print(f"{STYLE}{like}. Main character: {s.get('character', '')}. Scene: {scene}. "
              f"Do not include the boy or dragon from the style reference. {NO_TEXT}\n")


def cmd_images(folder):
    d = Path(folder)
    s = load(d)
    targets = [s['cover']['image']] + [p['image'] for p in s['pages']]
    for t in targets:
        stem = Path(t).stem
        src = next((p for p in sorted((d / 'raw').glob(stem + '.*')) if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')), None)
        if not src:
            print('missing raw image for', t); continue
        q = QUALITY
        while True:
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(src), '-vf', f"scale='min({MAX_W},iw)':-2",
                            '-c:v', 'libwebp', '-quality', str(q), str(d / t)], check=True)
            kb = (d / t).stat().st_size // 1024
            if kb <= MAX_KB or q <= 50:
                break
            q -= 10
        print(f'{t}: {kb} KB (q{q})')


def cmd_narrate(folder, *extra):
    return subprocess.run([TTS_PY, str(ROOT / 'narrate.py'), str(folder), *extra]).returncode


def cmd_check(folder):
    d = Path(folder); s = load(d); bad = []
    if not 8 <= len(s['pages']) <= 10: bad.append(f"{len(s['pages'])} pages (aim for 8-10)")
    for i, p in enumerate(s['pages'], 1):
        if 'TODO' in p['text']: bad.append(f'page {i} still has TODO text')
        n = len(p['text'].split())
        if n > 40: bad.append(f'page {i} has {n} words (keep it to 1-3 short sentences, under ~40 words)')
    for item in [s['cover'], *s['pages'], s.get('end', {})]:
        for k in ('image', 'audio'):
            if item.get(k) and not (d / item[k]).exists(): bad.append(f'missing {item[k]}')
    for f in d.glob('*.webp'):
        if f.stat().st_size > MAX_KB * 1024: bad.append(f'{f.name} is over {MAX_KB} KB')
    print('\n'.join(bad) if bad else 'story looks good')
    return 1 if bad else 0


def main():
    if len(sys.argv) < 3: sys.exit(__doc__)
    c, a = sys.argv[1], sys.argv[2:]
    if c == 'new': return cmd_new(*a)
    if c == 'prompts': return cmd_prompts(a[0])
    if c == 'images': return cmd_images(a[0])
    if c == 'narrate': return cmd_narrate(a[0], *a[1:])
    if c == 'check': return cmd_check(a[0])
    if c == 'all':
        cmd_images(a[0])
        rc = cmd_narrate(a[0])
        rc = cmd_check(a[0]) or rc
        subprocess.run([sys.executable, str(ROOT / 'build.py')])
        return rc
    sys.exit(__doc__)


if __name__ == '__main__':
    sys.exit(main() or 0)
