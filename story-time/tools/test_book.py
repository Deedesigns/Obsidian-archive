"""Open-book (landscape spread) + page-flip + narration-sequence checks with screenshots.
Run: /workspace/.pw-venv/bin/python tools/test_book.py"""
import functools, http.server, json, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'screenshots'; OUT.mkdir(exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}/'
story = json.loads((ROOT / 'stories/index.json').read_text())[0]
URL = BASE + story['url']
errors, fails = [], []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

# speed narration up 8x and log every clip that starts playing
FAST = """(() => { const op = HTMLMediaElement.prototype.play; window.__plays = [];
  HTMLMediaElement.prototype.play = function () { this.playbackRate = 8; window.__plays.push(this.getAttribute('src'));
    return op.call(this); }; })();"""
LAYOUT = """() => { const vw = innerWidth, vh = innerHeight, bad = [];
  if (document.documentElement.scrollWidth > vw || document.documentElement.scrollHeight > vh) bad.push('page scrolls');
  document.querySelectorAll('.page').forEach(p => { const r = p.getBoundingClientRect();
    if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) bad.push('page ' + p.dataset.i + ' off screen ' + JSON.stringify([r.left, r.top, r.right, r.bottom]));
    const t = p.querySelector('.txt'); if (t && t.scrollHeight > t.clientHeight + 2) bad.push('text overflows on ' + p.dataset.i);
    const pic = p.querySelector('.pic'); if (pic && pic.clientHeight < p.clientHeight * 0.4) bad.push('picture squeezed on ' + p.dataset.i);
    if (t) bad.push('font ' + p.dataset.i + '=' + getComputedStyle(t).fontSize + ' pic ' + pic.clientWidth + 'x' + pic.clientHeight); });
  document.querySelectorAll('.nav,.play,.mode,.icon-btn').forEach(b => { const r = b.getBoundingClientRect();
    if (r.width && (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1)) bad.push('button off screen ' + b.className); });
  return bad; }"""
state = lambda pg: pg.evaluate('window.__reader.state()')
def wait_idle(pg, ms=3000):
    t = time.time()
    while state(pg)['busy'] and time.time() - t < ms / 1000: pg.wait_for_timeout(50)

phone_l = dict(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
phone_p = dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--autoplay-policy=no-user-gesture-required'])
    def ctx(name, voice=False, **opts):
        c = b.new_context(**opts); c.add_init_script(FAST)
        if not voice: c.add_init_script("localStorage.setItem('readToMe','off')")
        pg = c.new_page()
        pg.on('console', lambda m: m.type == 'error' and errors.append(f'{name}: {m.text}'))
        pg.on('pageerror', lambda e: errors.append(f'{name}: {e}'))
        pg.on('response', lambda r: r.status >= 400 and errors.append(f'{name}: {r.status} {r.url}'))
        return c, pg

    for label, opts in [('844x390', phone_l), ('932x430', dict(phone_l, viewport={'width': 932, 'height': 430})),
                        ('desktop', dict(viewport={'width': 1366, 'height': 900})), ('tablet', dict(viewport={'width': 1180, 'height': 820}, has_touch=True))]:
        c, pg = ctx(label, **opts)
        pg.goto(URL); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(300)
        s = state(pg); check(s['spreadMode'] and s['shown'] == ['0'], f'{label}: cover alone in open-book mode {s["shown"]}')
        pg.screenshot(path=OUT / f'spread-cover-{label}.png')
        lay = pg.evaluate(LAYOUT); check(not [x for x in lay if not x.startswith('font')], f'{label}: cover layout {lay}')
        pg.goto(URL + '#p=5'); pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(300)
        s = state(pg); check(s['shown'] == ['5', '6'], f'{label}: #p=5 opens spread p05|p06 {s["shown"]}')
        lay = pg.evaluate(LAYOUT); print('   ', [x for x in lay if x.startswith('font')])
        check(not [x for x in lay if not x.startswith('font')], f'{label}: spread layout {[x for x in lay if not x.startswith("font")]}')
        pg.screenshot(path=OUT / f'spread-p05-{label}.png')
        for n in range(1, 6):   # every spread fits
            pg.goto(URL + f'#p={2*n-1}'); pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(150)
            lay = [x for x in pg.evaluate(LAYOUT) if not x.startswith('font')]
            if lay: check(False, f'{label}: spread {n} layout {lay}')
        if label == '844x390':
            pg.goto(URL + '#p=5'); pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(300)
            pg.click('#next'); pg.wait_for_timeout(60)
            pg.keyboard.press('ArrowRight'); pg.evaluate("document.getElementById('next').click()")     # ignored mid-flip
            print('    state right after extra input:', state(pg))
            wait_idle(pg); pg.click('#prev'); wait_idle(pg)
            pg.evaluate("document.getElementById('next').click()"); pg.wait_for_timeout(330); pg.screenshot(path=OUT / 'flip-mid-844x390.png')
            wait_idle(pg); s = state(pg); check(s['shown'] == ['7', '8'] and s['cur'] == 7, f'flip forward lands on p07|p08, extra input ignored {s["shown"]} cur={s["cur"]}')
            pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(330); pg.screenshot(path=OUT / 'flip-back-mid-844x390.png')
            wait_idle(pg); s = state(pg); check(s['shown'] == ['5', '6'], f'flip back to p05|p06 {s["shown"]}')
            # swipe left on the book
            pg.mouse.move(600, 200); pg.mouse.down(); pg.mouse.move(400, 205, steps=5); pg.mouse.up(); wait_idle(pg)
            s = state(pg); check(s['shown'] == ['7', '8'], f'swipe turns forward {s["shown"]}')
            pg.mouse.click(300, 200); wait_idle(pg); s = state(pg); check(s['shown'] == ['5', '6'], f'tap left page turns back {s["shown"]}')
            pg.mouse.click(560, 200); wait_idle(pg); s = state(pg); check(s['shown'] == ['7', '8'], f'tap right page turns forward {s["shown"]}')
            # to the end: closed back cover
            for _ in range(8):
                if pg.is_disabled('#next'): break
                pg.click('#next'); wait_idle(pg)
            s = state(pg); check(s['shown'] == ['11'] and pg.is_disabled('#next'), f'last spread is The End {s["shown"]}')
            pg.wait_for_timeout(1300); pg.screenshot(path=OUT / 'spread-end-844x390.png')
            lay = [x for x in pg.evaluate(LAYOUT) if not x.startswith('font')]; check(not lay, f'end layout {lay}')
            pg.click('[data-act=again]'); wait_idle(pg); check(state(pg)['shown'] == ['0'], 'Read again goes back to the cover')
        c.close()

    # narration sequence in the open book
    c, pg = ctx('audio', voice=True, **phone_l)
    pg.goto(URL); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(300)
    pg.click('[data-act=start]', force=True)
    seen, reading, t0 = [], [], time.time()
    while time.time() - t0 < 40:
        s = state(pg)
        r = pg.evaluate("Array.from(document.querySelectorAll('.half.reading')).map(e=>e.dataset.i).join(',')")
        key = (tuple(s['shown']), s['cur'], s['playing'], r)
        if not seen or seen[-1] != key: seen.append(key)
        if s['playing'] and r: reading.append((s['src'], r))
        if s['cur'] >= 4 and s['playing']: break
        pg.wait_for_timeout(60)
        if s['cur'] == 2 and s['playing'] and not (OUT / 'reading-right-844x390.png').exists(): pg.screenshot(path=OUT / 'reading-right-844x390.png')
        if s['cur'] == 1 and s['playing'] and not (OUT / 'reading-left-844x390.png').exists(): pg.screenshot(path=OUT / 'reading-left-844x390.png')
    plays = pg.evaluate('window.__plays')
    print('   plays:', plays)
    for x in seen: print('   ', x)
    check(plays[:4] == ['cover.mp3', 'p01.mp3', 'p02.mp3', 'p03.mp3'], 'reads cover, then left p01, right p02, then turns and reads p03')
    check(all(src.startswith('p%02d' % int(r)) or (src == 'cover.mp3' and r == '0') for src, r in reading), 'highlight follows the page being read')
    check(any(r == '1' for _, r in reading) and any(r == '2' for _, r in reading), 'left and right pages each highlighted')
    # rotate mid-story: portrait keeps the page being read, landscape returns to its spread
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(400)
    s = state(pg); check(not s['spreadMode'] and s['shown'] == [str(s['cur'])], f'rotate to portrait keeps page {s["cur"]} {s["shown"]}')
    pg.click('#play')  # pause
    pg.click('#next'); wait_idle(pg); cur = state(pg)['cur']
    pg.set_viewport_size({'width': 844, 'height': 390}); pg.wait_for_timeout(400)
    s = state(pg); check(s['spreadMode'] and str(cur) in s['shown'], f'rotate back to landscape shows the spread with page {cur}: {s["shown"]}')
    c.close()

    # portrait still one page with a curl turn
    c, pg = ctx('portrait', **phone_p)
    pg.goto(URL); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(300)
    s = state(pg); check(not s['spreadMode'] and s['shown'] == ['0'], 'portrait: single cover page')
    pg.screenshot(path=OUT / 'portrait-cover.png')
    pg.click('[data-act=self]', force=True); wait_idle(pg)
    for _ in range(4): pg.click('#next'); wait_idle(pg)
    s = state(pg); check(s['shown'] == ['5'] and not s['playing'], f'portrait: page 5 one page {s["shown"]}')
    lay = [x for x in pg.evaluate(LAYOUT) if not x.startswith('font')]; check(not lay, f'portrait layout {lay}')
    pg.screenshot(path=OUT / 'portrait-p05.png')
    pg.click('#next'); pg.wait_for_timeout(330); pg.screenshot(path=OUT / 'portrait-flip-mid.png'); wait_idle(pg)
    check(state(pg)['shown'] == ['6'], 'portrait: turned to page 6')
    pg.mouse.click(360, 400); wait_idle(pg); check(state(pg)['shown'] == ['7'], 'portrait: tap right edge turns')
    c.close()

    # reduced motion: fade instead of flip
    c, pg = ctx('reduced', reduced_motion='reduce', **phone_l)
    pg.goto(URL + '#p=1'); pg.reload(); pg.wait_for_load_state('networkidle')
    pg.click('#next'); pg.wait_for_timeout(100)
    n = pg.evaluate("document.querySelectorAll('.leaf').length"); check(n == 0, 'reduced motion: no 3D leaf, fades')
    wait_idle(pg); check(state(pg)['shown'] == ['3', '4'], 'reduced motion: spread changes')
    c.close()
    b.close()
print('console errors:', errors or 'none')
sys.exit(1 if errors or fails else 0)
