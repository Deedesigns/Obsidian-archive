# Daily story routine

Follow these steps once a day to add a new story. Everything runs on the box; nothing needs a server.
Reference story: `stories/2026-10-21-ollie-and-the-moons-hiccups/`.

## 0. Rules for the story
- For a 4-year-old: warm, silly, gentle, no scary parts, no peril that isn't solved right away, soft happy ending that winds down toward sleep.
- 8–10 pages, 1–3 short sentences per page (under ~40 words), about a 2–3 minute read. Simple words, a little repetition and fun sounds ("Hic!", "splish, splash").
- One main character, described the **same way word for word** in every picture prompt (`character` in story.json).
- Once the child's name and interests are known, keep them in mind (they can be the hero or a friend in the story).

## 1. Scaffold and write
```bash
cd /workspace/storybook-site
python3 make_story.py new 2026-10-22 bella-bear-big-sneeze "Bella Bear's Big Sneeze"
```
Edit `stories/2026-10-22-bella-bear-big-sneeze/story.json`: `title`, `summary` (1 sentence for the home page), `character`,
and for each page `text` (what's read aloud and shown) and `scene` (what the picture shows). Add or remove pages as needed,
keeping `image`/`audio` names `p01.webp`/`p01.mp3`, and so on. The cover clip reads `cover.text` (the title); `end.text` is read on the last page.

## 2. Pictures
```bash
python3 make_story.py prompts stories/2026-10-22-bella-bear-big-sneeze
```
This prints one prompt per picture, already in the house style. Generate them with the **GenerateImage** tool at aspect ratio 4:3.

**House style (all stories):** a polished 3D animated feature film look, like a modern animated movie, with cinematic warm
lighting, cute expressive characters with big eyes, epic and adventurous but never scary, and no text. The approved style
reference is `assets/style/style-reference-3d.jpg` (a boy in a red cape riding a baby dragon over a castle at night). Use it
only for style, and never copy its characters into a story.
1. Generate the **cover** first, with `reference_image_paths: ["/workspace/storybook-site/assets/style/style-reference-3d.jpg"]`.
2. Generate every page with **both** the new cover and the style reference in `reference_image_paths` (cover first), so the
   character and style stay consistent.
3. Check each picture: same character (colors, clothing), no text or letters, nothing scary, no duplicated side characters
   (say "ONE frog, ONE owl" in the prompt if needed). Regenerate any that are off.
4. Copy the results to `raw/cover.jpg`, `raw/p01.jpg`, and so on (the extension can be png, jpg or webp).
```bash
python3 make_story.py images stories/2026-10-22-bella-bear-big-sneeze   # -> cover.webp, p01.webp ... (≤1200 px wide, ≤300 KB)
```

## 3. Narration (Chatterbox "Heart" voice)
```bash
python3 make_story.py narrate stories/2026-10-22-bella-bear-big-sneeze
# same as: /workspace/tts/venv-expr/bin/python narrate.py stories/2026-10-22-bella-bear-big-sneeze
```
This takes about 5 minutes on the box CPU for a 10-page story. Each clip is transcribed with faster-whisper. If it scores
below 90% of the words, the clip is re-recorded with a new seed (up to 4 tries). Exit code 1 means some clip is still below
90%: read the log line, simplify the wording on that page, and run `narrate.py <folder> --only p04` again.
Other flags: `--force` re-records everything, and `--verify-only` re-checks the existing clips.

## 4. Check, build, look
```bash
python3 make_story.py check stories/2026-10-22-bella-bear-big-sneeze
python3 build.py                                   # rebuilds index.html, stories/index.json, the reader page
/workspace/.pw-venv/bin/python tools/screenshot.py # screenshots of the newest story + 200 checks on all its files
git add -A && git commit -m "Story: Bella Bear's Big Sneeze"
```
`python3 make_story.py all <folder>` runs images → narrate → check → build in one go.
The newest date is featured on the home page automatically. Older stories move into the library grid.
