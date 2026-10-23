/* Picture-book reader. Story data is embedded in the page as <script id="story" type="application/json">.
   Portrait: one page at a time, the page curls off to the left.
   Landscape (phone turned sideways, tablet, desktop): an open book with two pages side by side and a 3D page flip. */
(function () {
  'use strict';
  var story = JSON.parse(document.getElementById('story').textContent);
  var stage = document.getElementById('stage');
  var btnPrev = document.getElementById('prev'), btnNext = document.getElementById('next');
  var btnPlay = document.getElementById('play'), btnMode = document.getElementById('mode');
  var trail = document.getElementById('trail');
  var N = story.pages.length, LAST = N + 1;           // 0 = cover, 1..N = pages, N+1 = The End
  var cur = 0, curEl = null, book = null, started = false, playing = false, advanceTimer = null;
  var busy = false, pending = null;                   // a page-turn animation is running: ignore input
  var readToMe = localStorage.getItem('readToMe') !== 'off';
  var audio = new Audio(); audio.preload = 'auto';
  var wakeLock = null;
  var mqSpread = window.matchMedia('(orientation: landscape) and (min-width: 640px)');
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var spreadMode = mqSpread.matches;
  var FLIP_MS = 850, EASE = 'cubic-bezier(.45,.05,.3,1)';

  // ---------- spreads: [_ | cover], [p1 | p2], [p3 | p4], ... ----------
  function spreadOf(i) { return i === 0 ? 0 : Math.ceil(i / 2); }
  function pagesOf(k) {
    if (k === 0) return [null, 0];
    var l = 2 * k - 1, r = 2 * k;
    return [l <= LAST ? l : null, r <= LAST ? r : null];
  }
  var KMAX = spreadOf(LAST);

  function clipFor(i) {
    if (i === 0) return story.cover && story.cover.audio;
    if (i === LAST) return story.end && story.end.audio;
    return story.pages[i - 1].audio;
  }
  function textFor(i) {
    if (i === 0) return story.title;
    if (i === LAST) return (story.end && story.end.text) || 'The end.';
    return story.pages[i - 1].text;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function build(i) {
    var el = document.createElement('section');
    el.className = 'page';
    el.setAttribute('data-i', i);
    if (i === 0) {
      el.classList.add('cover');
      el.innerHTML = '<div class="pic"><img alt="" draggable="false" src="' + esc(story.cover.image) + '"></div>' +
        '<div class="cover-ov"><div class="kicker">\u2728 Tonight\u2019s Adventure \u2728</div><h1>' + esc(story.title) + '</h1>' +
        '<button class="btn gold start" data-act="start" aria-label="Start the adventure: read to me">\ud83d\ude80 Start the Adventure!</button>' +
        '<button class="self" data-act="self">I\u2019ll read it myself</button></div>';
    } else if (i === LAST) {
      el.classList.add('end');
      el.innerHTML = '<div class="burst"></div><div><div class="moon">\ud83c\udf19</div><h1>THE END</h1>' +
        '<p class="dream">Sweet dreams, hero! \u2b50</p>' +
        '<div class="btns"><button class="btn green" data-act="again">\u21ba Read again</button>' +
        '<a class="btn blue" href="../../index.html">\ud83d\uddfa\ufe0f More adventures</a></div></div>';
    } else {
      var p = story.pages[i - 1];
      el.innerHTML = '<div class="pic"><img alt="" draggable="false" src="' + esc(p.image) + '"></div>' +
        '<div class="txt"><p style="margin:0">' + esc(p.text) + '</p></div><span class="num">' + i + ' / ' + N + '</span>';
    }
    el.insertAdjacentHTML('beforeend', '<div class="shade" aria-hidden="true"></div>');
    return el;
  }

  function burst(box) {
    if (!box || mqReduce.matches) return;
    var bits = ['\u2b50', '\u2728', '\ud83c\udf1f', '\u2b50', '\u25cf', '\u25b2', '\u25a0'];
    var colors = ['#ffc53d', '#3ad7ff', '#ff7a1a', '#38d98b', '#ff5fa2', '#ffffff'];
    var html = '', span = Math.min(box.parentNode.clientWidth || innerWidth, 700);
    for (var k = 0; k < 70; k++) {
      var a = Math.random() * Math.PI * 2, r = span * (0.15 + Math.random() * 0.45);
      var b = bits[k % bits.length];
      html += '<i style="--x:' + Math.round(Math.cos(a) * r) + 'px;--y:' + Math.round(Math.sin(a) * r * 0.8 + 40) + 'px;--r:' +
        Math.round(Math.random() * 720 - 360) + 'deg;--d:' + (Math.random() * 0.35).toFixed(2) + 's;font-size:' +
        (b.length > 1 || b === '\u2b50' || b === '\u2728' ? 18 + Math.random() * 18 : 10 + Math.random() * 10).toFixed(0) +
        'px;color:' + colors[k % colors.length] + '">' + b + '</i>';
    }
    box.innerHTML = html;
  }
  function celebrate(root) {
    var b = root && root.querySelector('.page.end .burst');
    if (b) burst(b);
    // Stars and stickers live in rewards.js so this reader stays easy to merge.
    if (window.StoryRewards && root) window.StoryRewards.onBookEnd(root);
  }

  function preload(i) {
    if (i < 1 || i > N) return;
    var im = new Image(); im.src = story.pages[i - 1].image;
  }

  // In the open book the text shares a half page with the picture: shrink the text a little if the picture gets squeezed.
  function fit(el) {
    if (!spreadMode || !el) return;
    var t = el.querySelector('.txt'), pic = el.querySelector('.pic');
    if (!t || !pic) return;
    t.style.fontSize = '';
    var fs = parseFloat(getComputedStyle(t).fontSize), guard = 0;
    while (pic.clientHeight < el.clientHeight * 0.5 && fs > 14 && guard++ < 24) { fs -= 1; t.style.fontSize = fs + 'px'; }
  }
  function fitAll() { if (book) Array.prototype.forEach.call(book.querySelectorAll('.page'), fit); }

  function updateUI() {
    if (spreadMode) {
      var k = spreadOf(cur);
      btnPrev.disabled = k === 0;
      btnNext.disabled = k === KMAX;
    } else {
      btnPrev.disabled = cur === 0;
      btnNext.disabled = cur === LAST;
    }
    btnPlay.hidden = cur === 0 && !started;
    btnPlay.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
    btnPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    btnMode.setAttribute('aria-pressed', readToMe ? 'true' : 'false');
    var pct = (cur / LAST * 100) + '%';
    trail.querySelector('.done').style.width = pct;
    trail.querySelector('.rocket').style.left = pct;
    var stops = trail.querySelectorAll('.stop');
    for (var s = 0; s < stops.length; s++) stops[s].classList.toggle('on', s <= cur);
    trail.setAttribute('aria-valuenow', cur);
    markReading();
  }
  // glow on the page that is being read aloud (open-book mode)
  function markReading() {
    if (!book) return;
    var halves = book.querySelectorAll('.half');
    for (var h = 0; h < halves.length; h++)
      halves[h].classList.toggle('reading', playing && halves[h].getAttribute('data-i') === String(cur));
  }

  // ---------- animation bookkeeping ----------
  function runAnims(list, done) {
    var called = false;
    function end() {
      if (called) return; called = true; pending = null; busy = false;
      list.forEach(function (a) { try { a.cancel(); } catch (e) {} });
      done();
    }
    pending = end;
    if (!list.length) { end(); return; }
    busy = true;
    list[0].onfinish = end;
    setTimeout(end, FLIP_MS + 500);                    // safety net if the browser never reports the end
  }
  function finishAnims() { if (pending) pending(); }
  var canAnimate = !!document.body.animate;
  function anim(el, frames, opts) {
    var o = { duration: FLIP_MS, easing: EASE, fill: 'forwards' };
    for (var k in opts || {}) o[k] = opts[k];
    return el.animate(frames, o);
  }
  function shadeOf(el) { return el.querySelector(':scope > .shade'); }

  // ---------- portrait: one page ----------
  function show(i, dir) {
    finishAnims();
    var el = build(i), old = curEl;
    cur = i; curEl = el;
    if (!old || !dir || !old.parentNode || !canAnimate) {
      stage.innerHTML = ''; stage.appendChild(el); celebrate(stage);
    } else if (mqReduce.matches) {                     // gentle fade instead of motion
      stage.appendChild(el);
      runAnims([anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: 'ease' })],
        function () { if (old.parentNode) old.parentNode.removeChild(old); celebrate(el); });
    } else if (dir > 0) {                              // old page curls off from its right edge to reveal the new one
      stage.insertBefore(el, old);
      old.classList.add('turning');
      runAnims([
        anim(old, [
          { transform: 'rotateY(0deg)', opacity: 1 },
          { transform: 'rotateY(-28deg) skewY(-2deg) scale(1.02)', opacity: 1, offset: 0.35 },
          { transform: 'rotateY(-88deg) skewY(-1deg)', opacity: 1, offset: 0.78 },
          { transform: 'rotateY(-118deg)', opacity: 0 }]),
        anim(shadeOf(old), [{ opacity: 0 }, { opacity: 0.25, offset: 0.35 }, { opacity: 0.75 }]),
        anim(shadeOf(el), [{ opacity: 0.6 }, { opacity: 0 }], { easing: 'ease-out' })
      ], function () { if (old.parentNode) old.parentNode.removeChild(old); celebrate(el); });
    } else {                                           // previous page swings back in on top
      stage.appendChild(el);
      el.classList.add('turning');
      runAnims([
        anim(el, [
          { transform: 'rotateY(-118deg)', opacity: 0 },
          { transform: 'rotateY(-88deg) skewY(-1deg)', opacity: 1, offset: 0.22 },
          { transform: 'rotateY(-28deg) skewY(-2deg) scale(1.02)', opacity: 1, offset: 0.65 },
          { transform: 'rotateY(0deg)', opacity: 1 }]),
        anim(shadeOf(el), [{ opacity: 0.75 }, { opacity: 0.25, offset: 0.65 }, { opacity: 0 }]),
        anim(shadeOf(old), [{ opacity: 0 }, { opacity: 0.6 }])
      ], function () { el.classList.remove('turning'); if (old.parentNode) old.parentNode.removeChild(old); celebrate(el); });
    }
    preload(i + 1);
    updateUI();
  }

  // ---------- landscape: open book ----------
  function half(i, side, parent) {
    if (i === null) return null;
    var el = build(i);
    el.classList.add('half', side);
    parent.appendChild(el);
    return el;
  }
  function setBookShape(p) {
    book.classList.toggle('only-right', p[0] === null);
    book.classList.toggle('only-left', p[1] === null);
  }
  function renderSpread(k) {
    book.innerHTML = '';
    var p = pagesOf(k);
    half(p[0], 'left', book); half(p[1], 'right', book);
    setBookShape(p);
    fitAll(); celebrate(book);
  }
  function flipTo(k, dir) {
    finishAnims();
    var a = pagesOf(spreadOf(cur)), b = pagesOf(k);
    if (!canAnimate || !book.firstChild) { renderSpread(k); return; }
    if (mqReduce.matches) {
      renderSpread(k);
      runAnims([anim(book, [{ opacity: 0.15 }, { opacity: 1 }], { duration: 350, easing: 'ease', fill: 'none' })], function () {});
      return;
    }
    book.innerHTML = '';
    var leaf = document.createElement('div'), front, back, under1, under2, list = [];
    if (dir > 0) {   // right page lifts at its outer edge and flips over the spine to the left
      under1 = half(a[0], 'left', book);               // stays until covered
      under2 = half(b[1], 'right', book);              // revealed underneath
      leaf.className = 'leaf right';
      book.appendChild(leaf);
      front = half(a[1], 'right', leaf); back = half(b[0], 'left', leaf);
      list.push(anim(leaf, [
        { transform: 'rotateY(0deg)' },
        { transform: 'rotateY(-35deg) skewY(-1.5deg)', offset: 0.3 },
        { transform: 'rotateY(-90deg)', offset: 0.55 },
        { transform: 'rotateY(-180deg)' }]));
    } else {         // left page lifts and flips back over the spine to the right
      under1 = half(b[0], 'left', book);
      under2 = half(a[1], 'right', book);
      leaf.className = 'leaf left';
      book.appendChild(leaf);
      front = half(a[0], 'left', leaf); back = half(b[1], 'right', leaf);
      list.push(anim(leaf, [
        { transform: 'rotateY(0deg)' },
        { transform: 'rotateY(35deg) skewY(1.5deg)', offset: 0.3 },
        { transform: 'rotateY(90deg)', offset: 0.55 },
        { transform: 'rotateY(180deg)' }]));
      under1 = [under2, under2 = under1][0];          // under1 = page that gets covered, under2 = page revealed
    }
    if (front) { front.classList.add('front'); list.push(anim(shadeOf(front), [{ opacity: 0 }, { opacity: 0.35, offset: 0.3 }, { opacity: 0.8, offset: 0.55 }, { opacity: 0.8 }])); }
    if (back) { back.classList.add('back'); list.push(anim(shadeOf(back), [{ opacity: 0.8 }, { opacity: 0.8, offset: 0.55 }, { opacity: 0 }])); }
    if (under2) list.push(anim(shadeOf(under2), [{ opacity: 0.7 }, { opacity: 0 }], { easing: 'ease-out' }));
    if (under1) list.push(anim(shadeOf(under1), [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 0.45, offset: 0.9 }, { opacity: 0 }]));
    setBookShape(b);                                   // a closed book slides to the middle as it opens / closes
    [front, back, under1, under2].forEach(fit);
    runAnims(list, function () { renderSpread(k); updateUI(); });
  }

  function render() {
    finishAnims();
    document.body.classList.toggle('spread', spreadMode);
    stage.innerHTML = ''; curEl = null; book = null;
    if (spreadMode) {
      book = document.createElement('div'); book.className = 'book';
      stage.appendChild(book);
      renderSpread(spreadOf(cur));
      preload(2 * spreadOf(cur) + 1); preload(2 * spreadOf(cur) + 2);
    } else {
      show(cur);
    }
    updateUI();
  }

  // ---------- audio ----------
  function stopAudio() {
    clearTimeout(advanceTimer); advanceTimer = null;
    audio.pause(); playing = false;
  }

  function playClip(i) {
    clearTimeout(advanceTimer);
    var src = clipFor(i);
    if (!src) { onClipDone(); return; }
    audio.src = src; audio.currentTime = 0;
    var pr = audio.play();
    playing = true; updateUI();
    if (pr && pr.catch) pr.catch(function () { playing = false; updateUI(); });   // autoplay blocked: wait for a tap
  }

  // In the open book, the left page's clip is followed by the right page's clip.
  function rightPartner() {
    if (!spreadMode) return null;
    var p = pagesOf(spreadOf(cur));
    return cur === p[0] && p[1] !== null ? p[1] : null;
  }
  function onClipDone(failed) {
    playing = false;
    var r = rightPartner();
    if (r !== null && started) {
      updateUI();
      advanceTimer = setTimeout(function () { cur = r; updateUI(); playClip(cur); }, failed ? 1500 + textFor(cur).split(/\s+/).length * 400 : 600);
      return;
    }
    updateUI();
    if (readToMe && started && cur < LAST) {
      var wait = failed ? 1500 + textFor(cur).split(/\s+/).length * 400 : 1100;   // give time to read it, then carry on
      advanceTimer = setTimeout(function () { turn(1, true); }, wait);
    }
  }
  audio.addEventListener('ended', function () { onClipDone(false); });
  audio.addEventListener('error', function () {
    if (!audio.getAttribute('src')) return;
    console.warn('audio failed to load', audio.src);
    onClipDone(true);
  });

  // ---------- navigation ----------
  // Go to page i (portrait) or to the spread containing page i (open book).
  function go(i, auto) {
    if (busy) return;
    if (spreadMode) {
      var k = Math.min(Math.max(spreadOf(i), 0), KMAX), now = spreadOf(cur);
      if (k === now) return;
      if (!started) begin(readToMe);
      stopAudio();
      flipTo(k, k > now ? 1 : -1);
      var p = pagesOf(k); cur = p[0] !== null ? p[0] : p[1];
      preload(2 * k + 1); preload(2 * k + 2);
    } else {
      if (i < 0 || i > LAST || i === cur) return;
      if (!started) begin(readToMe);
      stopAudio();
      show(i, i > cur ? 1 : -1);
    }
    updateUI();
    if (readToMe) {
      if (auto) advanceTimer = setTimeout(function () { playClip(cur); }, spreadMode ? FLIP_MS + 150 : 450);
      else playClip(cur);                      // inside the tap, so mobile browsers allow it
    }
  }
  // one step forward / back: a page in portrait, a spread in the open book
  function turn(d, auto) {
    if (busy) return;
    if (spreadMode) {
      var p = pagesOf(spreadOf(cur) + d);
      if (spreadOf(cur) + d < 0 || spreadOf(cur) + d > KMAX) return;
      go(p[0] !== null ? p[0] : p[1], auto);
    } else go(cur + d, auto);
  }

  function begin(withVoice) {
    started = true;
    readToMe = withVoice; localStorage.setItem('readToMe', readToMe ? 'on' : 'off');
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () {});
    // unlock audio on this tap (iOS/Android autoplay rules)
    if (!audio.getAttribute('src')) { audio.src = clipFor(0); }
  }

  stage.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || busy) return;
    var act = b.getAttribute('data-act');
    if (act === 'start') { begin(true); updateUI(); playClip(0); }
    else if (act === 'self') { begin(false); turn(1); }
    else if (act === 'again') { go(0); }
  });

  btnNext.addEventListener('click', function () { turn(1); });
  btnPrev.addEventListener('click', function () { turn(-1); });
  btnPlay.addEventListener('click', function () {
    if (!started) begin(readToMe);
    if (playing) { stopAudio(); updateUI(); return; }
    clearTimeout(advanceTimer);
    var want = clipFor(cur);
    if (want && audio.getAttribute('src') === want && audio.currentTime > 0 && !audio.ended) {
      audio.play(); playing = true; updateUI();
    } else {
      if (spreadMode && audio.ended && audio.getAttribute('src') === want) {   // spread finished: read both pages again
        var p = pagesOf(spreadOf(cur)); if (p[0] !== null) cur = p[0];
      }
      playClip(cur);
    }
  });
  btnMode.addEventListener('click', function () {
    readToMe = !readToMe; localStorage.setItem('readToMe', readToMe ? 'on' : 'off');
    if (!readToMe) stopAudio();
    else if (started && !playing) playClip(cur);
    updateUI();
  });

  // swipe, or tap the right / left side of the book to turn
  var sx = null, sy = null;
  stage.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; });
  stage.addEventListener('pointerup', function (e) {
    if (sx === null) return;
    var dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) { turn(dx < 0 ? 1 : -1); return; }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return;
    if (e.target.closest('button,a,[data-act]')) return;
    if (cur === 0 && !started) return;                 // on the cover use the big Start button
    var r = (book || stage).getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (spreadMode) turn(x >= 0.5 ? 1 : -1);
    else if (x > 0.62) turn(1);
    else if (x < 0.25) turn(-1);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') turn(1);
    else if (e.key === 'ArrowLeft') turn(-1);
    else if (e.key === ' ') { e.preventDefault(); btnPlay.click(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && started && 'wakeLock' in navigator && (!wakeLock || wakeLock.released))
      navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () {});
  });

  // rotating the phone keeps your place: the spread with the current page, or that page on its own
  function onLayoutChange() {
    var want = mqSpread.matches;
    if (want === spreadMode) { fitAll(); return; }
    spreadMode = want; render();
  }
  if (mqSpread.addEventListener) mqSpread.addEventListener('change', onLayoutChange); else mqSpread.addListener(onLayoutChange);
  var rz = null;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(onLayoutChange, 120); });

  trail.innerHTML = '<div class="path"></div><div class="done"></div>' +
    Array.apply(null, Array(LAST + 1)).map(function (_, k) { return '<i class="stop" style="left:' + (k / LAST * 100) + '%"></i>'; }).join('') +
    '<span class="goal">\ud83c\udf19</span><span class="rocket">\ud83d\ude80</span>';
  trail.setAttribute('aria-valuemax', LAST);
  var start = parseInt((location.hash.match(/p=(\d+)/) || [])[1] || '0', 10);   // #p=3 opens a page directly
  cur = Math.min(Math.max(start, 0), LAST);
  render();
  preload(1);

  // read-only hooks for automated tests
  window.__reader = { state: function () {
    return { cur: cur, spread: spreadMode ? spreadOf(cur) : null, spreadMode: spreadMode, busy: busy, playing: playing,
      started: started, readToMe: readToMe, src: audio.getAttribute('src'), time: audio.currentTime,
      shown: Array.prototype.map.call(stage.querySelectorAll('.page'), function (p) { return p.getAttribute('data-i'); }) };
  } };
})();
