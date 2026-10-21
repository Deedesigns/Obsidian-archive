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

## Images and diagrams
Put image files in `static/images/` (the whole `static/` folder is copied into `public/` on build). In an article, put an image on its own line:
```
![Alt text describing the image](images/my-photo.jpg)
*Caption text. Photo: Author Name, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Example.jpg).*
```
The italic line directly under the image becomes the caption. You can also write `![alt](images/file.jpg "Caption")`. Paths are relative to `static/` (so `images/x.jpg` means `static/images/x.jpg`); full `https://` URLs also work. Resize photos to about 1200px wide (JPEG, quality ~80) and use SVG for diagrams.

**Image-credit rule:** use only openly licensed or public-domain images (e.g. Wikimedia Commons: CC0, PD, CC BY, CC BY-SA), check the license on the file's own Commons page, and credit every photo in its caption with the author, license (linked) and "via Wikimedia Commons" (linked to the file page). Original diagrams are credited "Diagram: Obsidian Archive". No AI-generated images and no unlicensed images from elsewhere on the web.

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

## Narration
`narrate.py` writes one MP3 per article to `audio/<slug>.mp3` (Kokoro voice `am_michael`, English, mono, about 80 kbps, loudness-normalized to −16 LUFS). It reads the title, lede and body, and skips image captions plus the Sources / Further reading sections. `audio/manifest.json` stores a hash of that text; an MP3 is regenerated only when the article text changes. Commit the `audio/` files. Do not commit `.cache/kokoro/` (the ONNX model and voices file, downloaded on demand).

`python3 build.py` copies those MP3s into the site. When one exists, the article page shows a **Listen to this article** player (play/pause, scrubber, speed 0.75×–1.5×, duration) just under the date line. The browser Web Speech button is only the fallback for an article with no MP3.

On every push to `main` that isn't only an `audio/` change, GitHub Actions installs Kokoro, narrates anything new or edited, commits the MP3s back with `[skip ci]`, then builds and deploys. A TTS failure still deploys the site; that article simply keeps its previous file, or falls back to the browser button if it never had one. A new daily page needs nothing extra in `content/` — the next push narrates it.

## Listen (read-aloud) button
Articles **without** an MP3 get a **Listen** control (Play/Pause, Stop, speed 0.75×–1.5×, voice picker) that reads the title, lede and body aloud using the reader's own browser (Web Speech API `speechSynthesis`; free, no API keys). It skips the nav, category tag, date line, image captions, footer and citation markers like `[1]`, reads in sentence-sized chunks so long pages don't cut off, and highlights/scrolls to the paragraph being read. It hides itself in browsers without speech support, and it hides itself when the narration player is present.
- Code: `static/listen.js` + `static/listen.css`, included from the shared `page()` template in `build.py`. The narration player adds `static/player.js` on pages that have an MP3. Nothing to add in `content/*.md`.
- The browser script attaches to `<article class="prose">` and inserts the control right after `<p class="meta">`. Keep that markup (and the `listen.*` lines in `page()`) if you ever change the template.
- Daily pages only need the usual `content/` file (+ images). Do **not** replace `build.py`, `narrate.py` or `static/` with an older copy, or the player disappears.
