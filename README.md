# Chronicle: Ancient & Lost Worlds (preview)

Scope: **only** ancient civilizations, lost civilizations and religious history.

A static history site. Content lives in `content/*.md`; `build.py` (pure Python 3, no dependencies) generates the site into `public/`.

## Layout
- `content/` – one Markdown file per article (front matter + body)
- `static/style.css` – the design
- `build.py` – generates `public/index.html`, `public/archive.html`, `public/articles/<slug>.html`, `public/category/<category>.html`
- `public/` – generated output (don't edit by hand; it's wiped on each build)
- `screenshots/` – preview screenshots

## Add the daily page
1. Create `content/YYYY-MM-DD-short-name.md`:
```
---
title: The Rosetta Stone
slug: rosetta-stone
category: Lost Civilizations
published: 2026-10-14
summary: One-sentence teaser shown on cards and as the lede.
---
## First section
Paragraph text. Supports **bold**, *italic*, [links](https://example.com) and "- " bullet lists.

## Further reading
- Author, *Book Title* (year)
```
   `category` must be exactly one of: `Ancient Civilizations`, `Lost Civilizations`, `Religious History` (defined in `CATS` in build.py; the build fails on anything else). `slug` must be unique.
2. To **update** an existing page instead, edit its file and add/change `updated: YYYY-MM-DD`. The page shows "Updated …" and moves to the top as "Today's page".
3. Rebuild: `python3 build.py`

The home page feature ("Today's page") is the most recently updated/published article.

## Daily bot routine (one page per day)
1. `ls content/` and read titles to avoid duplicates; rotate sections (Ancient → Lost → Religious) so they stay balanced.
2. Either add ONE new file `content/<today>-<slug>.md` (published: today) or revise ONE existing page (set `updated: <today>`). Never both.
3. Write 500–900 accurate words, 4–6 `##` sections, cautious dating ("about", "roughly"), and flag scholarly debates rather than stating fringe theories as fact.
4. Run `python3 build.py` and confirm it prints the article count without errors.

Ideas queue: Egypt's Old Kingdom, Hittites, Olmec, Nabataean Petra, Great Zimbabwe, Cahokia, Norte Chico, Akhenaten's religious revolution, Zoroastrianism, origins of Buddhism, Library of Nag Hammadi, Second Temple Judaism.

## Serve locally
```
cd public && python3 -m http.server 8080
```
Open http://localhost:8080/

## Screenshots
```
google-chrome --headless=new --no-sandbox --window-size=1440,2200 --screenshot=screenshots/home.png http://localhost:8080/
```
