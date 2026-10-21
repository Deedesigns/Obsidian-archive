/* Obsidian Archive · "Listen" read-aloud control.
   Uses the browser's built-in Web Speech API (speechSynthesis): free, no keys, no servers.
   Loaded on every page by build.py's shared page() template. It is the fallback
   for article pages that have no pre-generated MP3 (no .narration player) and a
   browser with speechSynthesis. */
(function () {
  "use strict";
  var article = document.querySelector("article.prose");
  if (!article || article.querySelector(".narration")) return;
  var synth = window.speechSynthesis;
  if (!synth || typeof window.SpeechSynthesisUtterance !== "function") return;

  var RATES = [0.75, 1, 1.25, 1.5];
  var store = {
    get: function (k) { try { return localStorage.getItem("oa-listen-" + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem("oa-listen-" + k, v); } catch (e) {} }
  };

  /* ---------- Build the control ---------- */
  var box = document.createElement("div");
  box.className = "listen";
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", "Listen to this page");
  box.innerHTML =
    '<button type="button" class="listen-play" aria-label="Listen to this page">' +
      '<span class="listen-ico" aria-hidden="true">&#9654;</span><span class="listen-lbl">Listen</span></button>' +
    '<button type="button" class="listen-stop" aria-label="Stop reading" disabled>' +
      '<span aria-hidden="true">&#9632;</span></button>' +
    '<label class="listen-opt"><span class="listen-sr">Speed</span><select class="listen-rate" aria-label="Reading speed">' +
      RATES.map(function (r) { return '<option value="' + r + '">' + r + "&times;</option>"; }).join("") +
    "</select></label>" +
    '<label class="listen-opt listen-voice-wrap"><span class="listen-sr">Voice</span><select class="listen-voice" aria-label="Voice"></select></label>' +
    '<span class="listen-status" aria-live="polite"></span>';

  var meta = article.querySelector(".meta");
  if (meta && meta.parentNode === article) meta.insertAdjacentElement("afterend", box);
  else article.insertBefore(box, article.firstChild);

  var playBtn = box.querySelector(".listen-play"),
      stopBtn = box.querySelector(".listen-stop"),
      ico = box.querySelector(".listen-ico"),
      lbl = box.querySelector(".listen-lbl"),
      rateSel = box.querySelector(".listen-rate"),
      voiceSel = box.querySelector(".listen-voice"),
      status = box.querySelector(".listen-status");

  var savedRate = parseFloat(store.get("rate"));
  rateSel.value = RATES.indexOf(savedRate) >= 0 ? String(savedRate) : "1";

  /* ---------- Voices (load asynchronously on Chrome/Safari) ---------- */
  var voices = [];
  function score(v) {
    var n = (v.name + " " + v.voiceURI).toLowerCase(), s = 0;
    if (!/^en/i.test(v.lang)) return -1;
    if (/natural|neural|online/.test(n)) s += 60;          // Microsoft "... Online (Natural)"
    if (/enhanced|premium|siri/.test(n)) s += 50;           // Apple enhanced / premium voices
    if (/google/.test(n)) s += 40;                          // Chrome's Google voices
    if (/samantha|ava|allison|susan|zoe|evan|tom|daniel|karen|moira|serena/.test(n)) s += 20;
    if (/en[-_]us/i.test(v.lang)) s += 8; else if (/en[-_]gb/i.test(v.lang)) s += 5;
    if (v.localService) s += 2;
    if (/compact|novelty|eloquence|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|rocko|shelley|flo|reed|sandy/.test(n)) s -= 40;
    if (v["default"]) s += 1;
    return s;
  }
  function loadVoices() {
    var all = synth.getVoices() || [];
    var en = all.filter(function (v) { return score(v) >= 0; });
    if (!en.length) en = all.slice();
    if (!en.length) return false;
    en.sort(function (a, b) { return score(b) - score(a) || a.name.localeCompare(b.name); });
    if (en.length === voices.length && voiceSel.options.length) return true;
    voices = en;
    var want = store.get("voice"), pick = 0;
    voiceSel.innerHTML = "";
    voices.forEach(function (v, i) {
      var o = document.createElement("option");
      o.value = v.voiceURI || v.name;
      o.textContent = v.name.replace(/^Microsoft\s+/, "").replace(/\s+Online\s*\(Natural\)/i, " (Natural)").replace(/\s+-\s+.*$/, "").trim() + (v.lang ? " · " + v.lang : "");
      if (want && o.value === want) pick = i;
      voiceSel.appendChild(o);
    });
    voiceSel.selectedIndex = pick;
    box.classList.add("has-voices");
    return true;
  }
  loadVoices();
  if ("onvoiceschanged" in synth) synth.addEventListener ? synth.addEventListener("voiceschanged", loadVoices) : (synth.onvoiceschanged = loadVoices);
  var tries = 0, poll = setInterval(function () { if (loadVoices() || ++tries > 20) clearInterval(poll); }, 250);
  function currentVoice() { return voices[voiceSel.selectedIndex] || null; }

  /* ---------- Collect the readable text (title + body only) ---------- */
  function clean(t) {
    return t
      .replace(/\[(?:\d+[\d,\s–-]*|citation needed|note \d+|[a-z])\]/gi, "")   // [1], [2–4], [a], [citation needed]
      .replace(/\s+/g, " ")
      .trim();
  }
  function blockText(el) {
    var c = el.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll("sup, .listen, script, style, .footnote, .fn, .citation, [aria-hidden='true']"), function (n) { n.remove(); });
    return clean(c.textContent || "");
  }
  function splitChunks(text) {
    // Sentence split, then merge short ones / break long ones so each utterance stays < ~220 chars
    var raw = text.replace(/([.!?…]["'”’)\]]*)\s+(?=["“'‘(]?[A-Z0-9])/g, "$1\u0001").split("\u0001"), parts = [];
    raw.forEach(function (p) {   // re-join splits after abbreviations like "St.", "c.", "B.C.", "Dr."
      var prev = parts[parts.length - 1];
      if (prev && /(?:\b(?:St|Mt|Mr|Mrs|Ms|Dr|Prof|Gen|Col|Lt|Capt|Rev|Fr|Jr|Sr|vs|etc|c|ca|cf|fl|r|d|b|no|vol|ed|eds|trans|approx|e\.g|i\.e|[A-Z])\.)$/.test(prev)) parts[parts.length - 1] = prev + " " + p;
      else parts.push(p);
    });
    var out = [], cur = "";
    parts.forEach(function (p) {
      p = p.trim(); if (!p) return;
      while (p.length > 220) {
        var cut = p.lastIndexOf(",", 200); if (cut < 80) cut = p.lastIndexOf(" ", 200); if (cut < 40) cut = 200;
        if (cur) { out.push(cur); cur = ""; }
        out.push(p.slice(0, cut + 1).trim()); p = p.slice(cut + 1).trim();
      }
      if ((cur + " " + p).length > 220) { if (cur) out.push(cur); cur = p; }
      else cur = cur ? cur + " " + p : p;
    });
    if (cur) out.push(cur);
    return out;
  }
  function buildQueue() {
    var q = [];
    var els = article.querySelectorAll("h1, h2, h3, h4, p, li, blockquote");
    Array.prototype.forEach.call(els, function (el) {
      if (el.closest(".listen, figure, figcaption, nav, footer, header, aside")) return;
      if (el.classList.contains("meta") || el.classList.contains("tag")) return;
      if (el.tagName === "P" && el.closest("li, blockquote")) return;
      var t = blockText(el);
      if (!t) return;
      if (/^H\d$/.test(el.tagName) && !/[.!?:]$/.test(t)) t += ".";
      splitChunks(t).forEach(function (c) { q.push({ text: c, el: el }); });
    });
    return q;
  }

  /* ---------- Playback ---------- */
  var queue = [], idx = 0, state = "idle", token = 0, keepAlive = null, lastEl = null;

  function setState(s) {
    state = s;
    box.classList.toggle("is-playing", s === "playing");
    box.classList.toggle("is-paused", s === "paused");
    stopBtn.disabled = s === "idle";
    if (s === "playing") { ico.innerHTML = "&#10074;&#10074;"; lbl.textContent = "Pause"; playBtn.setAttribute("aria-label", "Pause reading"); }
    else if (s === "paused") { ico.innerHTML = "&#9654;"; lbl.textContent = "Resume"; playBtn.setAttribute("aria-label", "Resume reading"); }
    else { ico.innerHTML = "&#9654;"; lbl.textContent = "Listen"; playBtn.setAttribute("aria-label", "Listen to this page"); }
    status.textContent = s === "idle" ? "" : (queue.length ? Math.min(100, Math.round(idx / queue.length * 100)) + "%" : "");
  }
  function mark(el) {
    if (lastEl === el) return;
    if (lastEl) lastEl.classList.remove("listen-now");
    lastEl = el;
    if (!el) return;
    el.classList.add("listen-now");
    var r = el.getBoundingClientRect(), vh = window.innerHeight || 800;
    if (r.top < 90 || r.bottom > vh - 40) {
      try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { el.scrollIntoView(); }
    }
  }
  function speakFrom(i) {
    var my = ++token;
    if (i >= queue.length) { finish(); return; }
    idx = i;
    var item = queue[i], u = new SpeechSynthesisUtterance(item.text), v = currentVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = document.documentElement.lang || "en-US";
    u.rate = parseFloat(rateSel.value) || 1;
    u.pitch = 1;
    u.onstart = function () { if (my === token) { mark(item.el); setState("playing"); } };
    u.onend = function () { if (my === token && state === "playing") speakFrom(i + 1); };
    u.onerror = function (e) {
      if (my !== token) return;
      if (e && (e.error === "interrupted" || e.error === "canceled")) return;
      if (state === "playing") speakFrom(i + 1);      // skip a bad chunk rather than stalling
    };
    mark(item.el);
    synth.speak(u);   // first call happens inside the tap handler (required on iOS)
  }
  function play() {
    if (synth.speaking || synth.pending) synth.cancel();
    if (state === "idle" || !queue.length) { queue = buildQueue(); idx = 0; }
    if (!queue.length) return;
    setState("playing");
    speakFrom(idx);
    clearInterval(keepAlive);
    // Some Chrome builds silently stall the speech engine; nudge it if it stops mid-queue.
    keepAlive = setInterval(function () {
      if (state === "playing" && !synth.speaking && !synth.pending) speakFrom(idx);
    }, 4000);
  }
  function pause() {
    // cancel + remember position is more reliable than synth.pause() on Android/Chrome
    token++; setState("paused"); synth.cancel(); clearInterval(keepAlive);
  }
  function finish() {
    token++; clearInterval(keepAlive); synth.cancel(); mark(null); idx = 0; queue = []; setState("idle");
  }

  playBtn.addEventListener("click", function () { state === "playing" ? pause() : play(); });
  stopBtn.addEventListener("click", finish);
  rateSel.addEventListener("change", function () {
    store.set("rate", rateSel.value);
    if (state === "playing") { token++; synth.cancel(); speakFrom(idx); }
  });
  voiceSel.addEventListener("change", function () {
    store.set("voice", voiceSel.value);
    if (state === "playing") { token++; synth.cancel(); speakFrom(idx); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && state !== "idle") finish(); });
  window.addEventListener("pagehide", function () { synth.cancel(); });
  synth.cancel(); // clear any speech left over from a previous page
  box.classList.add("ready");
})();
