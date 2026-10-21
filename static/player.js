/* Obsidian Archive · narration player for pre-generated article MP3s.
   Shown only when build.py finds audio/<slug>.mp3. The browser Listen button
   (static/listen.js) stays hidden on those pages. */
(function () {
  "use strict";
  var box = document.querySelector(".narration");
  if (!box) return;
  var play = box.querySelector(".narration-play");
  var ico = box.querySelector(".narration-ico");
  var lbl = box.querySelector(".narration-lbl");
  var scrub = box.querySelector(".narration-scrub");
  var time = box.querySelector(".narration-time");
  var rate = box.querySelector(".narration-rate");
  var src = box.getAttribute("data-src");
  if (!src || !play || !scrub) return;
  // The source lives on data-src; the element is created here so the bar is our controls.
  var audio = document.createElement("audio");
  audio.className = "narration-audio";
  audio.preload = "auto";
  audio.src = src;
  box.appendChild(audio);

  var RATES = [0.75, 1, 1.25, 1.5];
  var dragging = false;
  var seeking = false;
  var pendingSeek = null;

  function seekableEnd() {
    var end = 0;
    try {
      var ranges = audio.seekable;
      for (var i = 0; i < ranges.length; i++) end = Math.max(end, ranges.end(i));
    } catch (e) {}
    return end;
  }
  function applySeek(t) {
    var end = seekableEnd();
    if (!(end > 0.5)) return false;
    seeking = true;
    audio.currentTime = Math.min(end, Math.max(0, t));
    return true;
  }

  function storeGet(k) { try { return localStorage.getItem("oa-narration-" + k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem("oa-narration-" + k, v); } catch (e) {} }
  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    var tail = (m < 10 && h ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
    return h ? h + ":" + tail : tail;
  }
  function dur() { return isFinite(audio.duration) ? audio.duration : 0; }
  function paintTime() {
    var d = dur();
    var shown = pendingSeek != null && seekableEnd() > 0.5 ? pendingSeek : audio.currentTime;
    time.textContent = fmt(shown) + " / " + (d ? fmt(d) : "0:00");
    if (!dragging && !seeking && d) {
      if (scrub.max !== String(d)) scrub.max = String(d);
      scrub.value = String(Math.min(d, shown));
      scrub.style.setProperty("--pos", (shown / d) * 100 + "%");
    }
  }
  function setPlaying(on) {
    box.classList.toggle("is-playing", on);
    ico.innerHTML = on ? "&#10074;&#10074;" : "&#9654;";
    lbl.textContent = on ? "Pause" : "Listen";
    play.setAttribute("aria-label", on ? "Pause narration" : "Listen to this article");
  }
  var saved = parseFloat(storeGet("rate"));
  rate.value = RATES.indexOf(saved) >= 0 ? String(saved) : "1";
  audio.playbackRate = parseFloat(rate.value) || 1;

  play.addEventListener("click", function () {
    if (!audio.paused && !audio.ended) { audio.pause(); return; }
    if (audio.ended) audio.currentTime = 0;
    var pending = audio.play();
    if (pending && pending.catch) pending.catch(function () { setPlaying(false); });
  });
  audio.addEventListener("play", function () { setPlaying(true); });
  audio.addEventListener("pause", function () { setPlaying(false); });
  audio.addEventListener("ended", function () {
    setPlaying(false);
    audio.currentTime = 0;
    paintTime();
  });
  audio.addEventListener("loadedmetadata", paintTime);
  audio.addEventListener("seeking", function () { seeking = true; });
  audio.addEventListener("seeked", function () {
    seeking = false;
    if (pendingSeek != null && Math.abs(audio.currentTime - pendingSeek) < 1) pendingSeek = null;
    paintTime();
  });
  function flushSeek() {
    if (pendingSeek == null) return false;
    if (applySeek(pendingSeek)) return true;
    if (seekableEnd() <= 0.5) pendingSeek = null;
    return false;
  }
  audio.addEventListener("timeupdate", function () {
    if (flushSeek()) return;
    if (!seeking && !dragging) paintTime();
  });
  audio.addEventListener("progress", flushSeek);
  audio.addEventListener("canplaythrough", flushSeek);
  audio.addEventListener("error", function () {
    play.disabled = true;
    lbl.textContent = "Unavailable";
    play.setAttribute("aria-label", "Narration unavailable");
  });
  scrub.addEventListener("pointerdown", function () { dragging = true; });
  scrub.addEventListener("pointerup", function () { dragging = false; paintTime(); });
  scrub.addEventListener("pointercancel", function () { dragging = false; });
  scrub.addEventListener("input", function () {
    var d = dur();
    var next = parseFloat(scrub.value);
    if (!isFinite(next)) return;
    next = d ? Math.min(d, Math.max(0, next)) : Math.max(0, next);
    pendingSeek = next;
    applySeek(next);
    if (d) scrub.style.setProperty("--pos", (next / d) * 100 + "%");
    time.textContent = fmt(next) + " / " + (d ? fmt(d) : "0:00");
  });
  rate.addEventListener("change", function () {
    storeSet("rate", rate.value);
    audio.playbackRate = parseFloat(rate.value) || 1;
  });
  paintTime();
})();
