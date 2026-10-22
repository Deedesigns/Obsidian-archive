# Story Time 📖

A static picture-book website with a new bedtime story every day. Each story is an illustrated book you flip through
page by page, with pictures in a polished 3D animated-movie style (style reference: `assets/style/style-reference-3d.jpg`), read aloud in a warm, expressive voice (Chatterbox TTS, "Heart" voice).

- `index.html` is the home page. It shows today's (newest) story big at the top and a library grid of older stories.
- `stories/<folder>/index.html` is the reader: a cover with a big **Start** button, then the pages, then **The End**.
  Swipe, tap the arrows, tap the right/left side of the page, or use the ← → keys to turn pages.
  - **Portrait** (phone upright): one page at a time; the page curls off from its right edge.
  - **Landscape** (phone turned sideways, tablet, desktop; `orientation: landscape` and at least 640 px wide): an open book.
    The cover sits alone like a closed book, then two pages side by side (p1|p2, p3|p4, …), and The End closes the book.
    Turning is a 3D page flip around the spine (CSS 3D transforms with moving shading). On short phone screens the arrows move to the sides
    and the play button moves into the top bar, so the pages get the whole height. Narration reads the left page, then the right page,
    with a glow and 🔊 on the page being read, then flips to the next spread. Rotating mid-story keeps your place.
  - With *reduce motion* switched on in the device settings, turns are a gentle fade instead. Input is ignored while a page is turning.
  **Read to me** (on by default, remembered per device) plays each page's clip and turns the page automatically when it ends.
  Switch it off to read yourself, and the play button still reads the current page. The screen stays awake while reading where supported.
  Audio starts from the Start tap, so phone autoplay rules are satisfied. `#p=3` in the URL opens a given page.

Everything is plain static files with relative links, so it works on GitHub Pages (or any static host) as is.
`.nojekyll` is included.

## Layout
```
index.html                 generated home page
assets/style.css           all styles (Fredoka font bundled in assets/fonts, SIL Open Font License)
assets/reader.js           the picture-book reader
assets/sky.js              animated night sky (stars + shooting star)
assets/style/              approved illustration style reference
stories/index.json         generated list of stories (newest first) for future apps and widgets
stories/YYYY-MM-DD-slug/
  story.json               the story (see below)
  index.html               generated reader page
  cover.webp p01.webp ...  pictures (≤1200 px, ≤300 KB)
  cover.mp3 p01.mp3 ... end.mp3   narration (mono 96 kbps, loudness -16 LUFS)
  raw/                     full-size generator originals (git-ignored)
build.py                   regenerates index.html, stories/index.json and each reader page
narrate.py                 records the per-page MP3s and verifies them with faster-whisper
make_story.py              daily pipeline helper (new / prompts / images / narrate / check / all)
make_story.md              the step-by-step daily routine
tools/verify_audio.py      whisper transcription used by narrate.py
tools/screenshot.py        local server + headless Chrome screenshots + HTTP checks
tools/test_book.py         open-book / page-flip / narration-order / rotation checks + screenshots
```

## story.json
```json
{
  "title": "Ollie Otter and the Moon's Hiccups",
  "date": "2026-10-21",
  "summary": "One sentence shown on the home page.",
  "character": "Same description used in every image prompt",
  "cover": {"text": "Ollie Otter and the Moon's Hiccups.", "image": "cover.webp", "audio": "cover.mp3", "scene": "..."},
  "pages": [{"text": "Read-aloud text.", "image": "p01.webp", "audio": "p01.mp3", "scene": "what the picture shows"}],
  "end": {"text": "The end. Sweet dreams!", "audio": "end.mp3"}
}
```
`scene` and `character` are only used for image prompts. A story missing a picture is skipped by `build.py`, with a warning.
A missing or broken audio clip doesn't break the page: the reader waits a moment, then carries on.

## Adding a story (short version)
```bash
python3 make_story.py new 2026-10-22 my-slug "My Title"     # 1. scaffold, then write story.json
python3 make_story.py prompts stories/2026-10-22-my-slug   # 2. generate pictures (cover first, then pages using the cover as reference) into raw/
python3 make_story.py all stories/2026-10-22-my-slug       # 3. webp + narration + checks + build
git add -A && git commit -m "Story: My Title"              # 4. push to GitHub Pages when a repo is set up
```
See `make_story.md` for details.

## Narration settings
`narrate.py` must run in `/workspace/tts/venv-expr` (Chatterbox + faster-whisper). It uses reference voice
`/workspace/tts/ref-heart.wav`, with exaggeration 0.8 and cfg_weight 0.3. Text is split into sentence chunks of 160 characters
or fewer, joined with 0.35 s pauses, then run through ffmpeg `loudnorm=I=-16` and saved as mono 96 kbps MP3.
These can be overridden with the environment variables `NARRATE_REF`, `NARRATE_WHISPER_PY` and `NARRATE_THREADS`.

## Local preview
```bash
python3 -m http.server 8000   # then open http://localhost:8000/
```
