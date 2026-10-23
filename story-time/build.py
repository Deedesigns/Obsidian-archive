#!/usr/bin/env python3
"""Rebuild the Story Time site from the story folders.

    python3 build.py

Scans stories/YYYY-MM-DD-slug/story.json and writes:
  * stories/index.json              list of all stories, newest first
  * stories/<folder>/index.html     the picture-book reader for each story
  * index.html                      home page: newest story big on top + library grid
  * stickers.html                   sticker collection (stars and stickers live in the browser)
  * rewards.html                    full-screen star and chest page after The End
Only the standard library is needed. All links are relative, so the folder works on GitHub Pages as is.
"""
import datetime, hashlib, html, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STORIES = ROOT / 'stories'
SITE_NAME = 'Story Time'
FOLDER_RE = re.compile(r'^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$')


def load():
    out, problems = [], []
    for d in sorted(STORIES.iterdir()):
        if not (d.is_dir() and FOLDER_RE.match(d.name)):
            continue
        f = d / 'story.json'
        if not f.exists():
            problems.append(f'{d.name}: no story.json'); continue
        try:
            s = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            problems.append(f'{d.name}: bad JSON ({e})'); continue
        s.setdefault('date', d.name[:10])
        if not s.get('title') or not s.get('pages'):
            problems.append(f'{d.name}: needs a title and pages'); continue
        s.setdefault('cover', {})
        s['cover'].setdefault('image', s['pages'][0].get('image'))
        missing = []
        for item in [s['cover'], *s['pages'], s.get('end', {})]:
            for k in ('image', 'audio'):
                if item.get(k) and not (d / item[k]).exists():
                    missing.append(item[k])
        if missing:
            problems.append(f'{d.name}: missing files {missing}')
            if any(not (d / p.get("image", "")).is_file() for p in s['pages']):
                continue   # don't publish a story with missing pictures
            # missing audio is OK: the reader just waits / lets you read it yourself
        s['folder'] = d.name
        out.append(s)
    out.sort(key=lambda s: (s['date'], s['folder']), reverse=True)
    return out, problems


def asset_version():
    """Short hash of the shared CSS/JS so browsers (and GitHub Pages caches) pick up reader changes right away."""
    h = hashlib.sha1()
    for f in ('assets/style.css', 'assets/reader.js', 'assets/sky.js',
              'assets/rewards.css', 'assets/rewards.js', 'assets/stickers.js'):
        h.update((ROOT / f).read_bytes())
    for f in sorted((ROOT / 'assets' / 'stickers').glob('*.svg')):
        h.update(f.name.encode())
        h.update(f.read_bytes())
    return h.hexdigest()[:8]


V = asset_version()


def e(x):
    return html.escape(str(x), quote=True)


def nice_date(iso):
    d = datetime.date.fromisoformat(iso)
    return d.strftime('%A, %B ') + str(d.day)


HEAD = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="{theme}">
<title>{title}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📖</text></svg>">
<link rel="stylesheet" href="{css}?v={v}">
{extra}
</head>'''


def reader_html(s):
    data = {k: s[k] for k in ('title', 'date', 'cover', 'pages') if k in s}
    if s.get('end'):
        data['end'] = s['end']
    if s.get('layout'):
        data['layout'] = s['layout']
    blob = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
    return HEAD.format(v=V, theme='#2c2a5a', title=e(s['title']) + ' · ' + SITE_NAME, css='../../assets/style.css',
                       extra=f'<link rel="stylesheet" href="../../assets/rewards.css?v={V}">') + f'''
<body class="reader">
<div class="sky" aria-hidden="true"></div>
<header class="bar">
  <a class="icon-btn" href="../../index.html" aria-label="All stories">🏠</a>
  <div class="title">{e(s['title'])}</div>
  <button class="mode" id="mode" aria-pressed="true" aria-label="Read to me"><span class="sw"></span><span class="lbl">Read to me</span></button>
</header>
<main class="stage" id="stage" aria-live="polite"></main>
<nav class="controls">
  <button class="nav" id="prev" aria-label="Previous page">&#10094;</button>
  <div><button class="play" id="play" aria-label="Play">&#9654;</button></div>
  <button class="nav" id="next" aria-label="Next page">&#10095;</button>
</nav>
<div class="trail" id="trail" role="progressbar" aria-label="Adventure progress" aria-valuemin="0"></div>
<script id="story" type="application/json">{blob}</script>
<script src="../../assets/sky.js?v={V}"></script>
<script src="../../assets/stickers.js?v={V}"></script>
<script src="../../assets/rewards.js?v={V}"></script>
<script src="../../assets/reader.js?v={V}"></script>
</body></html>
'''


EMBLEM = '''<svg class="emblem" viewBox="0 0 120 130" aria-hidden="true">
  <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe58a"/><stop offset="1" stop-color="#ff9a1a"/></linearGradient>
  <linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a44c8"/><stop offset="1" stop-color="#15124f"/></linearGradient></defs>
  <path d="M60 4 112 22v40c0 32-22 54-52 64C30 116 8 94 8 62V22Z" fill="url(#sg)" stroke="#8a3a00" stroke-width="4"/>
  <path d="M60 16 100 30v32c0 25-17 43-40 52-23-9-40-27-40-52V30Z" fill="url(#sb)"/>
  <circle cx="34" cy="44" r="2" fill="#fff"/><circle cx="88" cy="52" r="2.4" fill="#bff3ff"/><circle cx="80" cy="34" r="1.6" fill="#fff"/><circle cx="40" cy="80" r="1.8" fill="#ffe58a"/>
  <g transform="rotate(35 60 62)">
    <path d="M60 30c10 8 14 20 14 34H46c0-14 4-26 14-34Z" fill="#f2f5ff" stroke="#8a3a00" stroke-width="2.5"/>
    <circle cx="60" cy="50" r="5" fill="#3ad7ff" stroke="#8a3a00" stroke-width="2"/>
    <path d="M46 56l-8 12h8Zm28 0 8 12h-8Z" fill="#ff4d2e" stroke="#8a3a00" stroke-width="2"/>
    <path d="M50 66h20l-4 8h-12Z" fill="#ffc53d"/><path d="M53 74h14l-7 16Z" fill="#ff7a1a"/>
  </g>
</svg>'''

# Same polygon as rewards.js STAR, and the same chest drawing as rewards.js CHEST.
_STAR = '32,4 39.2,24.2 60.5,25.6 44.2,39.2 49.2,60 32,48.6 14.8,60 19.8,39.2 3.5,25.6 24.8,24.2'
_CHEST = (
    '<span class="hsp-chest"><svg class="chest-svg" viewBox="0 0 160 148" aria-hidden="true">'
    '<ellipse class="chest-aura" cx="80" cy="126" rx="56" ry="11" fill="#7af6ff"/>'
    '<g class="chest-lid">'
    '<path d="M32 74V58C32 32 128 32 128 58v16Z" fill="#3d348f" stroke="#ffd56a" stroke-width="4" stroke-linejoin="round"/>'
    '<path d="M46 68c0-16 68-16 68 0" fill="none" stroke="#7af6ff" stroke-width="3" stroke-linecap="round"/>'
    '<circle cx="80" cy="52" r="6" fill="#ffc53d" stroke="#1a1038" stroke-width="2"/>'
    '</g><g class="chest-base">'
    '<rect x="26" y="70" width="108" height="48" rx="10" fill="#2a226e" stroke="#ffd56a" stroke-width="4"/>'
    '<rect x="26" y="86" width="108" height="10" fill="#ffc53d"/>'
    '<rect x="70" y="70" width="20" height="48" fill="#e8b23a"/>'
    '<circle cx="80" cy="102" r="7" fill="#3ad7ff" stroke="#1a1038" stroke-width="2"/>'
    '<circle cx="80" cy="102" r="2.6" fill="#fff"/>'
    '</g></svg></span>'
)
CORNER_STICKERS = (
    '<a class="corner-stickers btn blue" data-fly-target href="stickers.html" aria-label="My Stickers">'
    '<svg class="corner-stickers-icon" viewBox="0 0 48 48" aria-hidden="true">'
    '<path d="M11 5h26a5 5 0 0 1 5 5v18L28 43H11a5 5 0 0 1-5-5V10a5 5 0 0 1 5-5Z" fill="#fff6d0" stroke="#0d3f96" stroke-width="3.2" stroke-linejoin="round"/>'
    f'<g transform="translate(9.5 7.5) scale(.42)"><polygon points="{_STAR}" fill="#ffc53d" stroke="#b77400" stroke-width="5.5" stroke-linejoin="round"/></g>'
    '<path d="M42 28H33a5 5 0 0 0-5 5v10Z" fill="#ffe58a" stroke="#0d3f96" stroke-width="3.2" stroke-linejoin="round"/>'
    '</svg></a>'
)


def star_card_html():
    slot = (
        '<span class="star" data-slot="{i}">'
        f'<svg viewBox="0 0 64 64" aria-hidden="true"><polygon points="{_STAR}"/></svg></span>'
    )
    row = '<i class="hsp-link"></i>'.join(slot.format(i=i) for i in range(3)) + '<i class="hsp-link hsp-link-end"></i>'
    return (
        '<a class="hsp hsp-a" href="rewards.html" aria-label="0 of 3 stars. Open my stars">'
        f'<span class="hsp-row">{row}</span>{_CHEST}</a>'
    )


def home_html(stories):
    body = ''
    if stories:
        t = stories[0]
        today = datetime.date.today().isoformat()
        label = "Tonight's Adventure" if t['date'] == today else 'Newest Adventure'
        href = f"stories/{t['folder']}/index.html"
        body += f'''<a class="today" href="{href}">
  <div class="art"><img src="stories/{t['folder']}/{e(t['cover']['image'])}" alt=""></div>
  <div><span class="badge" data-date="{t['date']}">🌙 {label}</span>
    <h2>{e(t['title'])}</h2>
    <p>{e(t.get('summary', ''))}</p>
    <span class="btn start-adv">🚀 Start the Adventure!</span></div>
</a>'''
        body += '\n<h2 class="lib-title">🗺️ Adventure Library</h2>\n'
        if len(stories) > 1:
            body += '<div class="grid">\n' + '\n'.join(
                f'''  <a class="card" href="stories/{s['folder']}/index.html"><img loading="lazy" src="stories/{s['folder']}/{e(s['cover']['image'])}" alt=""><div class="t">{e(s['title'])}<span class="d">{nice_date(s['date'])}</span></div></a>'''
                for s in stories[1:]) + '\n</div>'
        else:
            body += '<p class="empty">🚀 A brand-new adventure lands every day. Come back tomorrow, hero!</p>'
    else:
        body = '<p class="empty">No stories yet.</p>'
    script = '''<script>
// switch the badge to "Today's story" using the visitor's own clock
(function(){var b=document.querySelector('.badge[data-date]');if(!b)return;var d=new Date();
var iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
b.textContent=b.dataset.date===iso?"🌙 Tonight's Adventure":"🌙 Newest Adventure";})();
</script>'''
    card = star_card_html()
    return HEAD.format(v=V, theme='#bfe6ff', title=SITE_NAME, css='assets/style.css',
                       extra=f'<link rel="stylesheet" href="assets/rewards.css?v={V}">') + f'''
<body class="home"><div class="sky" aria-hidden="true"></div><div class="wrap">
<header class="hero">{CORNER_STICKERS}{EMBLEM}<h1>{SITE_NAME.upper()}</h1><p>A brand-new adventure every night!</p></header>
{card}
{body}
<p class="foot">{len(stories)} {'adventure' if len(stories) == 1 else 'adventures'} so far · a new one every day</p>
</div><script src="assets/sky.js?v={V}"></script>
<script src="assets/stickers.js?v={V}"></script>
<script src="assets/rewards.js?v={V}"></script>{script}</body></html>
'''


def rewards_html():
    return HEAD.format(v=V, theme='#070b24', title='Your star · ' + SITE_NAME, css='assets/style.css',
                       extra=f'<link rel="stylesheet" href="assets/rewards.css?v={V}">') + f'''
<body class="reward-page"><div class="sky" aria-hidden="true"></div>
<main id="reward-root"></main>
<script src="assets/sky.js?v={V}"></script>
<script src="assets/stickers.js?v={V}"></script>
<script src="assets/rewards.js?v={V}"></script>
</body></html>
'''


def collection_html():
    return HEAD.format(v=V, theme='#bfe6ff', title='Sticker Stars · ' + SITE_NAME, css='assets/style.css',
                       extra=f'<link rel="stylesheet" href="assets/rewards.css?v={V}">') + f'''
<body class="home stickers-page"><div class="sky" aria-hidden="true"></div><div class="wrap">
<!-- Grown-ups: press and hold the title for 3 seconds, then confirm, to reset stars and stickers on this device. -->
<p class="stickers-nav"><a class="back-link" href="index.html">🏠 Stories</a></p>
<h1 id="sticker-title">Sticker Stars</h1>
<p class="stickers-lead" id="sticker-lead">Your space stickers</p>
<div id="sticker-grid"></div>
<p class="foot"><a class="back-text" href="index.html">Back to stories</a></p>
</div>
<script src="assets/sky.js?v={V}"></script>
<script src="assets/stickers.js?v={V}"></script>
<script src="assets/rewards.js?v={V}"></script>
</body></html>
'''


def main():
    stories, problems = load()
    for s in stories:
        (STORIES / s['folder'] / 'index.html').write_text(reader_html(s))
    # Keep catalog fields (type, genre, style) that story.json or the previous index already carried.
    prior = {}
    index_path = STORIES / 'index.json'
    if index_path.exists():
        try:
            for row in json.loads(index_path.read_text()):
                if isinstance(row, dict) and row.get('folder'):
                    prior[row['folder']] = row
        except json.JSONDecodeError:
            prior = {}
    index = []
    for s in stories:
        row = {'folder': s['folder'], 'title': s['title'], 'date': s['date'], 'summary': s.get('summary', ''),
               'cover': f"stories/{s['folder']}/{s['cover']['image']}", 'pages': len(s['pages']),
               'url': f"stories/{s['folder']}/index.html"}
        old = prior.get(s['folder'], {})
        for k in ('type', 'genre', 'style'):
            val = s.get(k) or old.get(k)
            if val:
                row[k] = val
        index.append(row)
    (STORIES / 'index.json').write_text(json.dumps(index, indent=2, ensure_ascii=False) + '\n')
    (ROOT / 'index.html').write_text(home_html(stories))
    (ROOT / 'stickers.html').write_text(collection_html())
    (ROOT / 'rewards.html').write_text(rewards_html())
    (ROOT / '.nojekyll').touch()
    print(f'built {len(stories)} stories')
    for p in problems:
        print('WARNING:', p, file=sys.stderr)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
