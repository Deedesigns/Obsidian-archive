#!/usr/bin/env python3
"""Build the static history site from content/*.md into public/.
Each content file starts with a front-matter block:
---
title: ...
slug: ...
category: Ancient Civilizations
published: 2026-10-13
updated: 2026-10-13        (optional)
summary: one sentence
---
Body uses a tiny Markdown subset: ## headings, paragraphs, - lists, **bold**, *italic*.
Images: a line `![alt](images/file.jpg "optional caption")`; a following line in
*italics* is also used as the caption. Files live in static/images/ (copied to public/).
"""
import html, re, shutil, pathlib, datetime
ROOT = pathlib.Path(__file__).parent
SRC, OUT = ROOT / "content", ROOT / "public"
SITE = "Obsidian Archive"
CATS = {
 "Ancient Civilizations": ("ancient-civilizations", "Ⅰ", "The first cities, kingdoms and empires: Mesopotamia, Egypt, the Indus, China and beyond."),
 "Lost Civilizations": ("lost-civilizations", "Ⅱ", "Cultures that vanished, were forgotten, or were rediscovered by archaeology."),
 "Religious History": ("religious-history", "Ⅲ", "How the world's faiths, scriptures and sacred traditions began and changed."),
}
def inline(t):
    t = html.escape(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"\*(.+?)\*", r"<em>\1</em>", t)
    t = re.sub(r"\[(.+?)\]\((https?://[^)]+)\)", r'<a href="\2">\1</a>', t)
    return t
IMG = re.compile(r'^!\[(.*?)\]\((\S+?)(?:\s+"(.*)")?\)$')
def img_src(src, depth=1):
    if re.match(r"(https?:)?//", src): return src
    src = src.lstrip("/")
    if src.startswith("static/"): src = src[7:]
    return "../" * depth + "static/" + src
def figure(alt, src, cap):
    c = f"<figcaption>{inline(cap)}</figcaption>" if cap else ""
    return f'<figure><img src="{html.escape(img_src(src), quote=True)}" alt="{html.escape(alt, quote=True)}" loading="lazy">{c}</figure>'
def md(body):
    out, para, lst = [], [], []
    fig = None
    def flush():
        if para: out.append("<p>" + inline(" ".join(para)) + "</p>"); para.clear()
        if lst: out.append("<ul>" + "".join(f"<li>{inline(x)}</li>" for x in lst) + "</ul>"); lst.clear()
    def flushfig():
        nonlocal fig
        if fig: out.append(figure(*fig)); fig = None
    for line in body.splitlines():
        s = line.strip()
        m = IMG.match(s)
        if fig and not fig[2] and re.fullmatch(r"\*[^*].*\*", s):
            fig = (fig[0], fig[1], s[1:-1]); flushfig(); continue
        flushfig()
        if m: flush(); fig = (m.group(1), m.group(2), m.group(3) or ""); continue
        if not s: flush()
        elif s.startswith("## "): flush(); out.append(f"<h2>{inline(s[3:])}</h2>")
        elif s.startswith("- "):
            if para: flush()
            lst.append(s[2:])
        else:
            if lst: flush()
            para.append(s)
    flushfig(); flush(); return "\n".join(out)
def parse(p):
    txt = p.read_text(encoding="utf-8")
    _, fm, body = txt.split("---", 2)
    meta = {k.strip(): v.strip() for k, v in (l.split(":", 1) for l in fm.strip().splitlines() if ":" in l)}
    meta.setdefault("updated", meta["published"]); meta["body"] = body
    meta["words"] = len(body.split())
    if meta["category"] not in CATS: raise SystemExit(f"{p.name}: unknown category {meta['category']}")
    return meta
def fmt(d): return datetime.date.fromisoformat(d).strftime("%B %-d, %Y")
def page(title, content, depth=0):
    r = "../" * depth
    nav = "".join(f'<a href="{r}category/{s}.html">{n}</a>' for n, (s, _, _) in CATS.items())
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title>
<link rel="stylesheet" href="{r}static/style.css"></head><body>
<header class="top"><a class="brand" href="{r}index.html"><span class="sig">◈</span> Obsidian Archive</a>
<nav><a href="{r}index.html">Home</a><a href="{r}archive.html">Archive</a></nav></header>
<div class="catbar">{nav}</div>
<main>{content}</main>
<footer>{SITE} · A new page of history every day · Built {datetime.date.today():%B %-d, %Y}</footer>
</body></html>"""
def card(a, r=""):
    s, icon, _ = CATS[a["category"]]
    return f"""<a class="card" href="{r}articles/{a['slug']}.html"><span class="tag">{icon} {a['category']}</span>
<h3>{html.escape(a['title'])}</h3><p>{html.escape(a['summary'])}</p><small>{fmt(a['published'])}</small></a>"""
def main():
    arts = sorted((parse(p) for p in SRC.glob("*.md")), key=lambda a: (a["updated"], a["published"]), reverse=True)
    if OUT.exists(): shutil.rmtree(OUT)
    (OUT / "articles").mkdir(parents=True); (OUT / "category").mkdir()
    shutil.copytree(ROOT / "static", OUT / "static")
    for a in arts:
        s, icon, _ = CATS[a["category"]]
        upd = f" · Updated {fmt(a['updated'])}" if a["updated"] != a["published"] else ""
        c = f"""<div class="ahero"><div class="glyph"></div></div><article class="prose"><a class="tag" href="../category/{s}.html">{icon} {a['category']}</a>
<h1>{html.escape(a['title'])}</h1><p class="meta">Published {fmt(a['published'])}{upd} · {max(1, a['words']//220)} min read</p>
<p class="lede">{html.escape(a['summary'])}</p>{md(a['body'])}</article>"""
        (OUT / "articles" / f"{a['slug']}.html").write_text(page(a["title"], c, 1), encoding="utf-8")
    latest = arts[0] if arts else None
    feat = ""
    if latest:
        s, icon, _ = CATS[latest["category"]]
        feat = f"""<section class="feature"><div class="label">Today's page · {fmt(latest['updated'])}</div>
<span class="tag">{icon} {latest['category']}</span><h2>{html.escape(latest['title'])}</h2>
<p>{html.escape(latest['summary'])}</p><a class="btn" href="articles/{latest['slug']}.html">Read the full page →</a></section>"""
    counts = {n: sum(a["category"] == n for a in arts) for n in CATS}
    grid = "".join(f'<a class="cat" href="category/{s}.html"><span class="ico">{i}</span><h3>{n}</h3><p>{d}</p><small>{counts[n]} page{"s"*(counts[n]!=1)}</small></a>' for n, (s, i, d) in CATS.items())
    tl = "".join(f'<li class="{"l" if k%2==0 else "r"}"><div class="dot"></div><a class="tcard" href="articles/{a['slug']}.html"><time>{fmt(a['published'])}</time><span class="tag">{CATS[a['category']][1]} · {a['category']}</span><h3>{html.escape(a['title'])}</h3><p>{html.escape(a['summary'])}</p></a></li>' for k, a in enumerate(arts))
    home = f"""<section class="hero"><div class="stars"></div><div class="hin"><div class="eyebrow">Est. 2026 · A new page every dawn</div><h1>Echoes of<br><em>Forgotten</em> Worlds</h1>
<p>Ancient empires, vanished peoples and the origins of faith, retrieved from the dust one page at a time.</p>
<a class="btn" href="archive.html">Enter the archive · {len(arts)} pages</a></div><svg class="pyr" viewBox="0 0 400 200" preserveAspectRatio="none"><polygon points="200,10 390,200 10,200" fill="none" stroke="#c9a54a" stroke-width="1"/><polygon points="200,60 330,200 70,200" fill="none" stroke="#c9a54a55"/><circle cx="200" cy="10" r="4" fill="#e8c46a"/></svg></section>{feat}
<h2 class="sec"><span>Three Halls</span></h2><div class="cats">{grid}</div>
<h2 class="sec"><span>The Timeline</span></h2><ol class="timeline">{tl}</ol>"""
    (OUT / "index.html").write_text(page(SITE, home), encoding="utf-8")
    rows = "".join(f'<li><time>{fmt(a["published"])}</time><a href="articles/{a["slug"]}.html">{html.escape(a["title"])}</a><span class="tag">{CATS[a["category"]][1]} {a["category"]}</span></li>' for a in sorted(arts, key=lambda a: a["published"], reverse=True))
    (OUT / "archive.html").write_text(page("Archive · " + SITE, f'<h1 class="sec">Archive</h1><p>Every page, newest first.</p><ul class="archive">{rows}</ul>'), encoding="utf-8")
    for n, (s, i, d) in CATS.items():
        items = [a for a in arts if a["category"] == n]
        body = "".join(card(a, "../") for a in items) or "<p>No pages yet. Check back soon.</p>"
        (OUT / "category" / f"{s}.html").write_text(page(f"{n} · {SITE}", f'<h1 class="sec">{i} {n}</h1><p>{d}</p><div class="cards">{body}</div>', 1), encoding="utf-8")
    print(f"Built {len(arts)} articles into {OUT}")
if __name__ == "__main__": main()
