"""Serve the site locally and take screenshots + audio/console checks.
Run: /workspace/.pw-venv/bin/python tools/screenshot.py   (needs playwright + Google Chrome)"""
import functools, http.server, json, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'screenshots'; OUT.mkdir(exist_ok=True)
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
class Quiet(H.func):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}/'
index = json.loads((ROOT / 'stories/index.json').read_text())
story = index[0]
errors, bad = [], []
sizes = {'desktop': dict(viewport={'width': 1366, 'height': 900}),
         'phone': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True),
         'phone-landscape': dict(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)}
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--autoplay-policy=no-user-gesture-required'])
    for name, opts in sizes.items():
        ctx = b.new_context(**opts); pg = ctx.new_page()
        pg.on('console', lambda m: m.type == 'error' and errors.append(f'{name}: {m.text}'))
        pg.on('pageerror', lambda e: errors.append(f'{name}: {e}'))
        pg.on('response', lambda r: r.status >= 400 and bad.append(f'{r.status} {r.url}'))
        pg.goto(BASE + 'index.html'); pg.wait_for_load_state('networkidle')
        pg.screenshot(path=OUT / f'home-{name}.png', full_page=(name == 'desktop'))
        pg.goto(BASE + story['url']); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(400)
        pg.screenshot(path=OUT / f'cover-{name}.png')
        pg.click('[data-act=start]', force=True); pg.wait_for_timeout(700)
        playing = pg.evaluate("document.getElementById('play').getAttribute('aria-label')")
        for _ in range(5): pg.click('#next'); pg.wait_for_timeout(250)
        pg.wait_for_timeout(1200)
        pg.screenshot(path=OUT / f'page5-{name}.png')
        if name in ('desktop', 'phone'):
            if name == 'desktop':   # catch a frame mid page-turn
                pg.click('#next'); pg.wait_for_timeout(350); pg.screenshot(path=OUT / 'turning-desktop.png'); pg.wait_for_timeout(900)
            for _ in range(15):
                if pg.is_disabled('#next'): break
                pg.click('#next'); pg.wait_for_timeout(150)
            pg.wait_for_timeout(1250); pg.screenshot(path=OUT / f'end-{name}.png')
        print(name, 'after Start, play button says:', playing)
        ctx.close()
    # every audio file + image must load
    req = b.new_context().request
    s = json.loads((ROOT / 'stories' / story['folder'] / 'story.json').read_text())
    files = [s['cover']['audio'], s['cover']['image'], s['end']['audio']] + [x for pgd in s['pages'] for x in (pgd['image'], pgd['audio'])]
    for f in files:
        r = req.get(BASE + f"stories/{story['folder']}/{f}")
        print(r.status, f, len(r.body()), r.headers.get('content-type'))
        if r.status != 200: bad.append(f'{r.status} {f}')
    b.close()
print('console errors:', errors or 'none'); print('bad responses:', bad or 'none')
sys.exit(1 if errors or bad else 0)
