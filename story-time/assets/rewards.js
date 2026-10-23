/* Bedtime stars. One star per finished book, a chest every 3, stickers on this device only.
   The stars and the chest live on the reward page. Nothing is sent anywhere.
   A quiet chime plays when a new star lands. A quiet chime plays when the chest is tapped. */
(function () {
  'use strict';
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
  var KEY = 'storytime.rewards.v1';
  var PLAY = 'storytime.rewardPlay.v1';
  var NEED = 3;
  var AUTO_MS = 2000;
  var memory = null;
  var opening = false;
  var navTimer = null;
  var suppress = false;
  var backLoad = false;
  var savedTitle = '';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    backLoad = !!(nav && nav.type === 'back_forward');
  } catch (e) { backLoad = false; }

  var STAR = '<svg viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,4 39.2,24.2 60.5,25.6 44.2,39.2 49.2,60 32,48.6 14.8,60 19.8,39.2 3.5,25.6 24.8,24.2"/></svg>';
  var CHEST = '<svg class="chest-svg" viewBox="0 0 160 148" aria-hidden="true">' +
    '<ellipse class="chest-aura" cx="80" cy="126" rx="56" ry="11" fill="#7af6ff"/>' +
    '<g class="chest-lid">' +
    '<path d="M32 74V58C32 32 128 32 128 58v16Z" fill="#3d348f" stroke="#ffd56a" stroke-width="4" stroke-linejoin="round"/>' +
    '<path d="M46 68c0-16 68-16 68 0" fill="none" stroke="#7af6ff" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="80" cy="52" r="6" fill="#ffc53d" stroke="#1a1038" stroke-width="2"/>' +
    '</g>' +
    '<g class="chest-base">' +
    '<rect x="26" y="70" width="108" height="48" rx="10" fill="#2a226e" stroke="#ffd56a" stroke-width="4"/>' +
    '<rect x="26" y="86" width="108" height="10" fill="#ffc53d"/>' +
    '<rect x="70" y="70" width="20" height="48" fill="#e8b23a"/>' +
    '<circle cx="80" cy="102" r="7" fill="#3ad7ff" stroke="#1a1038" stroke-width="2"/>' +
    '<circle cx="80" cy="102" r="2.6" fill="#fff"/>' +
    '</g></svg>';

  function catalog() { return window.STORY_STICKERS || []; }
  function empty() { return { books: {}, stars: 0, owned: {}, cursor: 0 }; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function cssId(id) {
    if (window.CSS && CSS.escape) return CSS.escape(id);
    return String(id).replace(/[^a-zA-Z0-9_-]/g, '');
  }
  function reduced() { return !!(reduce && reduce.matches); }

  function normalize(o) {
    var s = empty();
    if (!o || typeof o !== 'object') return s;
    if (o.books && typeof o.books === 'object') {
      for (var k in o.books) {
        if (Object.prototype.hasOwnProperty.call(o.books, k) && o.books[k]) s.books[k] = 1;
      }
    }
    var stars = parseInt(o.stars, 10);
    s.stars = isFinite(stars) ? Math.max(0, Math.min(99, stars)) : 0;
    if (o.owned && typeof o.owned === 'object') {
      for (var id in o.owned) {
        if (!Object.prototype.hasOwnProperty.call(o.owned, id)) continue;
        var item = o.owned[id] || {};
        var n = parseInt(item.n, 10) || 0;
        var shiny = parseInt(item.shiny, 10) || 0;
        if (n > 0) s.owned[id] = { n: n, shiny: Math.max(0, shiny) };
      }
    }
    var cursor = parseInt(o.cursor, 10);
    s.cursor = isFinite(cursor) ? Math.max(0, Math.min(10000, cursor)) : 0;
    return s;
  }
  function load() {
    if (memory) return memory;
    try {
      var raw = localStorage.getItem(KEY);
      memory = raw ? normalize(JSON.parse(raw)) : empty();
    } catch (e) { memory = empty(); }
    return memory;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch (e) {}
  }
  function resetAll() { memory = empty(); save(); }

  function bookSlug() {
    var q = bookFromQuery();
    if (q && /rewards\.html$/.test(location.pathname)) return q;
    var parts = location.pathname.split('/');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === 'stories' && parts[i + 1] && parts[i + 1].indexOf('.') === -1) {
        try { return decodeURIComponent(parts[i + 1]); }
        catch (err) { return parts[i + 1]; }
      }
    }
    return '';
  }
  function bookFromQuery() {
    try { return new URLSearchParams(location.search).get('book') || ''; }
    catch (e) { return ''; }
  }
  function scriptSrc() {
    var s = document.querySelector('script[src*="stickers.js"]');
    return s ? s.getAttribute('src') : '';
  }
  function assetBase() {
    var src = scriptSrc();
    return src ? src.replace(/stickers\.js(\?.*)?$/, 'stickers/') : 'assets/stickers/';
  }
  function hereLinks() {
    if (/\/rewards\.html$/.test(location.pathname) || /rewards\.html$/.test(location.pathname)) {
      return { home: 'index.html', stickers: 'stickers.html' };
    }
    var src = scriptSrc();
    var root = src ? src.replace(/assets\/stickers\.js(\?.*)?$/, '') : '';
    return { home: root + 'index.html', stickers: root + 'stickers.html' };
  }
  function rewardsUrl(slug) {
    var src = scriptSrc();
    var root = src ? src.replace(/assets\/stickers\.js(\?.*)?$/, '') : '';
    return root + 'rewards.html?book=' + encodeURIComponent(slug);
  }

  function awardBook(slug) {
    var s = load();
    if (!slug) return { awarded: false, stars: s.stars, already: false };
    if (s.books[slug]) return { awarded: false, stars: s.stars, already: true };
    s.books[slug] = 1;
    s.stars += 1;
    save();
    return { awarded: true, stars: s.stars, already: false };
  }
  function takeNext(s) {
    var list = catalog();
    if (!list.length) return null;
    var i = s.cursor;
    var item = list[i % list.length];
    var shiny = i >= list.length;
    var owned = s.owned[item.id] || { n: 0, shiny: 0 };
    owned.n += 1;
    if (shiny) owned.shiny += 1;
    s.owned[item.id] = owned;
    s.cursor = i + 1;
    return { item: item, shiny: shiny, shinyCount: owned.shiny, justCompleted: i + 1 === list.length };
  }
  function spendChest() {
    var s = load();
    if (s.stars < NEED || !catalog().length) return null;
    var got = takeNext(s);
    if (!got) return null;
    s.stars -= NEED;
    save();
    return { stars: s.stars, got: got };
  }

  function readPlay() {
    try {
      var raw = sessionStorage.getItem(PLAY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function remember(slug, result) {
    if (!slug) return;
    var cur = readPlay();
    if (result.awarded) {
      if (cur && cur.slug === slug && cur.kind === 'earn') return;
      try {
        sessionStorage.setItem(PLAY, JSON.stringify({ slug: slug, kind: 'earn', stars: result.stars }));
      } catch (e) {}
      return;
    }
    if (cur && cur.slug === slug && cur.kind === 'earn') return;
    try {
      sessionStorage.setItem(PLAY, JSON.stringify({ slug: slug, kind: 'again', stars: load().stars }));
    } catch (e) {}
  }
  function consumePlay(slug) {
    var cur = readPlay();
    if (!cur || cur.slug !== slug) return null;
    try { sessionStorage.removeItem(PLAY); } catch (e) {}
    return cur;
  }

  function endIsShowing() {
    var nodes = document.querySelectorAll('.page.end');
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].isConnected) continue;
      if (nodes[i].closest('.leaf')) continue;
      return true;
    }
    return false;
  }

  function audioBox(force) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      if (!audioBox.c) audioBox.c = new Ctx();
      if (audioBox.c.state === 'suspended') {
        if (force && audioBox.c.resume) audioBox.c.resume();
        else return null;
      }
      return audioBox.c;
    } catch (e) { return null; }
  }
  function primeAudio() { audioBox(true); }
  document.addEventListener('pointerdown', primeAudio, true);
  document.addEventListener('keydown', primeAudio, true);

  function playNotes(notes, peak, dur, force) {
    var ctx = audioBox(!!force);
    if (!ctx) return;
    try {
      var now = ctx.currentTime;
      var master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(peak, now + 0.03);
      master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      master.connect(ctx.destination);
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i], t = now + n.t;
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(n.f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(n.g, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.6, dur));
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + Math.min(0.7, dur));
      }
    } catch (e) {}
  }
  function playStarChime() {
    playNotes([
      { f: 523.25, t: 0, g: 0.2 },
      { f: 659.25, t: 0.11, g: 0.14 }
    ], 0.04, 0.7, false);
  }
  function playChestSound() {
    playNotes([
      { f: 392, t: 0, g: 0.4 },
      { f: 523.25, t: 0.08, g: 0.34 },
      { f: 659.25, t: 0.16, g: 0.26 },
      { f: 783.99, t: 0.26, g: 0.18 }
    ], 0.06, 1.05, true);
  }

  function renderPip() {
    var pip = document.getElementById('star-pip');
    if (!pip) return;
    var n = load().stars;
    var link = pip.closest('a');
    if (n > 0) {
      pip.hidden = false;
      pip.textContent = String(n);
      if (link) link.setAttribute('aria-label', 'My Stickers, ' + n + (n === 1 ? ' star' : ' stars'));
    } else {
      pip.hidden = true;
      pip.textContent = '';
      if (link) link.removeAttribute('aria-label');
    }
  }

  function slotHTML(it, owned) {
    if (owned && owned.n > 0) {
      var shiny = owned.shiny > 0;
      var tag = shiny ? '<span class="shiny-tag">' + (owned.shiny > 1 ? '&times;' + owned.shiny : 'shiny') + '</span>' : '';
      return '<div class="sticker-slot got' + (shiny ? ' shiny' : '') + '" data-id="' + esc(it.id) + '">' +
        '<button type="button" class="sticker-hit" aria-label="' + esc(it.name + (shiny ? ', shiny' : '')) + '">' +
        '<img alt="" draggable="false" src="' + esc(assetBase() + it.file) + '"></button>' +
        tag + '<div class="cap">' + esc(it.name) + '</div></div>';
    }
    return '<div class="sticker-slot mystery" data-id="' + esc(it.id) + '">' +
      '<button type="button" class="mystery-face" aria-label="Mystery sticker"><span aria-hidden="true">?</span></button>' +
      '<div class="cap">???</div></div>';
  }
  function renderCollection() {
    var grid = document.getElementById('sticker-grid');
    if (!grid) return;
    var s = load();
    var list = catalog();
    var found = 0;
    var html = '';
    var all = list.length > 0;
    for (var n = 0; n < list.length; n++) {
      if (!(s.owned[list[n].id] && s.owned[list[n].id].n > 0)) all = false;
    }
    if (all) html += '<p class="all-found">You found every sticker. New ones sparkle.</p>';
    html += '<div class="sticker-grid-inner">';
    for (var i = 0; i < list.length; i++) {
      var owned = s.owned[list[i].id];
      if (owned && owned.n > 0) found++;
      html += slotHTML(list[i], owned);
    }
    html += '</div>';
    grid.innerHTML = html;
    var lead = document.getElementById('sticker-lead');
    if (lead) lead.textContent = found + ' of ' + list.length + ' stickers';
    var slots = grid.querySelectorAll('.sticker-slot');
    for (var j = 0; j < slots.length; j++) {
      slots[j].querySelector('button').addEventListener('click', function (e) {
        var slot = e.currentTarget.closest('.sticker-slot');
        slot.classList.remove('boop');
        void slot.offsetWidth;
        slot.classList.add('boop');
      });
    }
  }

  function meterHTML(filled) {
    var html = '<div class="star-meter" role="img" aria-label="' + filled + ' of ' + NEED + ' stars">';
    for (var i = 0; i < NEED; i++) {
      html += '<span class="star' + (i < filled ? ' on' : '') + '" data-slot="' + i + '">' + STAR + '</span>';
    }
    html += '</div>';
    return html;
  }

  function closeReward() {
    var screen = document.getElementById('reward-screen');
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    opening = false;
    if (savedTitle) { document.title = savedTitle; savedTitle = ''; }
  }

  function runReward(slug) {
    if (document.getElementById('reward-screen')) return;
    var s = load();
    var play = slug ? consumePlay(slug) : null;
    var kind = play ? play.kind : (slug && s.books[slug] ? 'again' : 'quiet');
    var stars = s.stars;
    var screen = document.createElement('div');
    screen.id = 'reward-screen';
    screen.className = 'reward-screen';
    screen.setAttribute('role', 'dialog');
    screen.setAttribute('aria-modal', 'true');
    var msg = kind === 'again' ? 'You already got a star for this book!'
      : (kind === 'earn' && stars > NEED) ? 'Extra star saved'
      : (kind === 'earn') ? 'A new star!'
      : (stars > 0 ? 'Your stars' : 'Finish a story to earn a star');
    screen.setAttribute('aria-label', msg);
    screen.innerHTML =
      '<div class="reward-stage">' +
        '<p class="reward-msg" id="reward-msg">' + esc(msg) + '</p>' +
        '<div id="reward-meter"></div>' +
        '<button type="button" class="reward-open" id="reward-open" hidden disabled>' +
          '<span class="chest-visual" id="reward-chest">' + CHEST + '</span>' +
          '<span class="reward-open-label" id="reward-label" hidden>Tap to open!</span>' +
        '</button>' +
        '<div class="reward-actions" id="reward-actions" hidden></div>' +
      '</div>' +
      '<div class="reward-reveal" id="reward-reveal" hidden></div>';
    document.body.appendChild(screen);
    if (!savedTitle) savedTitle = document.title;
    document.title = 'Your star · Story Time';

    var meter = document.getElementById('reward-meter');
    var msgEl = document.getElementById('reward-msg');
    var openBtn = document.getElementById('reward-open');
    var label = document.getElementById('reward-label');
    var chest = document.getElementById('reward-chest');
    var reveal = document.getElementById('reward-reveal');
    var ceremony = kind === 'earn' && stars >= NEED && (stars - 1) < NEED;
    var filledBefore = (kind === 'earn' && stars <= NEED) ? Math.max(0, stars - 1) : Math.min(stars, NEED);
    meter.innerHTML = meterHTML(filledBefore);

    function showActions() {
      if (!screen.isConnected) return;
      var actions = document.getElementById('reward-actions');
      if (!actions) return;
      var links = hereLinks();
      actions.innerHTML =
        '<a class="btn blue" href="' + esc(links.stickers) + '">My Stickers</a>' +
        '<a class="btn gold" href="' + esc(links.home) + '">More stories</a>';
      actions.hidden = false;
    }
    function armTap() {
      if (!screen.isConnected || !openBtn.isConnected) return;
      if (kind !== 'again') msgEl.textContent = '';
      openBtn.hidden = false;
      label.hidden = false;
      openBtn.disabled = false;
      openBtn.classList.add('is-ready');
      chest.classList.add('is-wiggle', 'is-glow');
      screen.setAttribute('aria-label', 'Tap to open!');
      try { openBtn.focus(); } catch (e) {}
    }
    function afterStar() {
      if (ceremony) swirl(armTap);
      else if (stars >= NEED) armTap();
      else showActions();
    }
    function swirl(done) {
      if (!screen.isConnected) return;
      openBtn.hidden = false;
      chest.classList.add('is-wiggle', 'is-glow');
      var starsEl = meter.querySelectorAll('.star.on');
      if (reduced() || !starsEl.length || !starsEl[0].animate) {
        setTimeout(done, reduced() ? 180 : 420);
        return;
      }
      var cr = chest.getBoundingClientRect();
      var cx = cr.left + cr.width / 2;
      var cy = cr.top + cr.height * 0.42;
      var left = starsEl.length;
      function oneDone() { left--; if (left <= 0) done(); }
      for (var i = 0; i < starsEl.length; i++) {
        (function (star, delay, n) {
          var r = star.getBoundingClientRect();
          var ghost = star.cloneNode(true);
          ghost.className = 'star on flyer';
          ghost.style.left = (r.left + r.width / 2) + 'px';
          ghost.style.top = (r.top + r.height / 2) + 'px';
          ghost.style.width = r.width + 'px';
          ghost.style.height = r.height + 'px';
          document.body.appendChild(ghost);
          var dx = cx - (r.left + r.width / 2);
          var dy = cy - (r.top + r.height / 2);
          var arc = (n - 1) * 36;
          var anim = ghost.animate([
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
            { transform: 'translate(calc(-50% + ' + (dx * 0.45 + arc).toFixed(1) + 'px), calc(-50% + ' + (dy * 0.2 - 24).toFixed(1) + 'px)) scale(.8) rotate(' + (30 + n * 18) + 'deg)', opacity: 1, offset: 0.5 },
            { transform: 'translate(calc(-50% + ' + dx.toFixed(1) + 'px), calc(-50% + ' + dy.toFixed(1) + 'px)) scale(.12) rotate(100deg)', opacity: 0 }
          ], { duration: 980, delay: delay, easing: 'cubic-bezier(.4,0,.75,1)', fill: 'forwards' });
          var ended = false;
          function end() {
            if (ended) return;
            ended = true;
            if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
            oneDone();
          }
          anim.onfinish = end;
          setTimeout(end, 980 + delay + 280);
        })(starsEl[i], i * 80, i);
      }
    }

    if (kind === 'earn' && stars >= 1 && stars <= NEED) {
      flyStar(meter, stars - 1, afterStar);
    } else if (kind === 'earn' && stars > NEED) {
      playStarChime();
      meter.classList.add('extra');
      setTimeout(afterStar, reduced() ? 200 : 700);
    } else if (stars >= NEED) {
      openBtn.hidden = false;
      setTimeout(armTap, reduced() ? 160 : 420);
    } else {
      setTimeout(showActions, reduced() ? 160 : 380);
    }

    openBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (openBtn.disabled || opening) return;
      beginOpen(chest, meter, msgEl, label, openBtn, reveal, showActions);
    });
  }

  function flyStar(meter, slotIndex, done) {
    var slot = meter.querySelector('[data-slot="' + slotIndex + '"]');
    var called = false;
    function finish() {
      if (called) return;
      called = true;
      if (!slot || !slot.isConnected) return;
      slot.classList.add('on', 'sparkle');
      done();
    }
    if (!slot) { finish(); return; }
    playStarChime();
    if (reduced() || !slot.animate) {
      slot.classList.add('on');
      setTimeout(finish, 280);
      return;
    }
    var flyer = document.createElement('span');
    flyer.className = 'star on flyer';
    flyer.innerHTML = STAR;
    document.body.appendChild(flyer);
    var sr = slot.getBoundingClientRect();
    var startX = window.innerWidth * 0.5;
    var startY = Math.min(window.innerHeight * 0.72, window.innerHeight - 72);
    if (startY < sr.bottom + 28) startY = Math.min(window.innerHeight - 36, sr.bottom + 96);
    flyer.style.left = startX + 'px';
    flyer.style.top = startY + 'px';
    flyer.style.width = sr.width + 'px';
    flyer.style.height = sr.height + 'px';
    var dx = (sr.left + sr.width / 2) - startX;
    var dy = (sr.top + sr.height / 2) - startY;
    var anim = flyer.animate([
      { transform: 'translate(-50%,-50%) scale(.35)', opacity: 0.15 },
      { transform: 'translate(calc(-50% + ' + (dx * 0.48).toFixed(1) + 'px), calc(-50% + ' + (dy * 0.12 - 28).toFixed(1) + 'px)) scale(1.12)', opacity: 1, offset: 0.55 },
      { transform: 'translate(calc(-50% + ' + dx.toFixed(1) + 'px), calc(-50% + ' + dy.toFixed(1) + 'px)) scale(1)', opacity: 1 }
    ], { duration: 1100, easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'forwards' });
    function land() {
      if (flyer.parentNode) flyer.parentNode.removeChild(flyer);
      finish();
    }
    anim.onfinish = land;
    setTimeout(land, 1450);
  }

  function beginOpen(chest, meter, msgEl, label, openBtn, reveal, showActions) {
    var result = spendChest();
    if (!result || !result.got) return;
    opening = true;
    playChestSound();
    label.hidden = true;
    meter.hidden = true;
    msgEl.textContent = '';
    openBtn.classList.remove('is-ready');
    openBtn.disabled = true;
    chest.classList.add('is-open');
    var got = result.got;
    var wait = reduced() ? 280 : 420;
    setTimeout(function () {
      if (!reveal.isConnected) return;
      chest.classList.add('is-aside');
      openBtn.hidden = true;
      reveal.hidden = false;
      reveal.classList.remove('is-flying');
      reveal.innerHTML =
        '<div class="sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
        '<img alt="" draggable="false" src="' + esc(assetBase() + got.item.file) + '">' +
        '<p class="reward-name">' + esc(got.item.name) + '</p>' +
        (got.shiny ? '<p class="reward-shiny">A shiny one!</p>' : '') +
        (got.justCompleted ? '<p class="reward-shiny">You found every sticker!</p>' : '');
      reveal.setAttribute('role', 'dialog');
      reveal.setAttribute('aria-label', got.item.name);
      var hold = reduced() ? 420 : 1300;
      setTimeout(function () {
        if (!reveal.isConnected) return;
        flyHome(reveal, result.stars, showActions);
      }, hold);
    }, wait);
  }

  function flyHome(reveal, starsLeft, showActions) {
    if (!reveal.isConnected) return;
    var img = reveal.querySelector('img');
    showActions();
    var meter = document.getElementById('reward-meter');
    if (meter) {
      meter.hidden = false;
      meter.innerHTML = meterHTML(Math.min(starsLeft, NEED));
    }
    var target = document.querySelector('#reward-actions a');
    if (reduced() || !img || !img.animate || !target) {
      reveal.hidden = true;
      opening = false;
      renderPip();
      renderCollection();
      return;
    }
    reveal.classList.add('is-flying');
    var a = img.getBoundingClientRect();
    var b = target.getBoundingClientRect();
    var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    var dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    var name = reveal.querySelector('.reward-name');
    var extra = reveal.querySelector('.reward-shiny');
    if (name) name.style.opacity = '0';
    if (extra) extra.style.opacity = '0';
    var anim = img.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(.18)', opacity: 0.85 }
    ], { duration: 780, easing: 'cubic-bezier(.45,.05,.2,1)', fill: 'forwards' });
    var ended = false;
    function end() {
      if (ended) return;
      ended = true;
      reveal.hidden = true;
      opening = false;
      if (target) {
        target.classList.remove('pocket-ping');
        void target.offsetWidth;
        target.classList.add('pocket-ping');
      }
      renderPip();
      renderCollection();
    }
    anim.onfinish = end;
    setTimeout(end, 1100);
  }

  function presentReward(slug) {
    if (document.getElementById('reward-screen')) return;
    try { history.pushState({ storyReward: 1 }, '', rewardsUrl(slug)); }
    catch (e) {}
    runReward(slug || bookSlug());
  }

  function onBookEnd() {
    try {
      if (!document.body.classList.contains('reader')) return;
      if (document.getElementById('reward-screen')) return;
      if (!endIsShowing()) return;
      var slug = bookSlug();
      var result = awardBook(slug);
      remember(slug, result);
      if (backLoad) { backLoad = false; suppress = true; return; }
      if (suppress || navTimer) return;
    navTimer = setTimeout(function () {
      navTimer = null;
      if (suppress || !endIsShowing() || document.getElementById('reward-screen')) return;
      try { presentReward(slug); }
      catch (err) { console.warn('rewards', err); }
    }, AUTO_MS);
    } catch (err) { console.warn('rewards', err); }
  }

  window.addEventListener('popstate', function () {
    if (!document.body.classList.contains('reader')) return;
    if (history.state && history.state.storyReward) {
      var slug = bookFromQuery() || bookSlug();
      runReward(slug);
      return;
    }
    if (document.getElementById('reward-screen')) {
      closeReward();
      suppress = true;
    }
  });

  document.addEventListener('click', function (e) {
    if (!document.body.classList.contains('reader')) return;
    var t = e.target && e.target.closest ? e.target.closest('[data-act=again], a.icon-btn, a.btn') : null;
    if (!t) return;
    suppress = false;
    backLoad = false;
    if (navTimer) { clearTimeout(navTimer); navTimer = null; }
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!document.getElementById('reward-screen')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (history.state && history.state.storyReward && document.body.classList.contains('reader')) history.back();
      else if (document.body.classList.contains('reward-page')) history.back();
      else closeReward();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === ' ') {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  });

  window.addEventListener('pagehide', function () {
    if (navTimer) { clearTimeout(navTimer); navTimer = null; }
  });

  function bindReset() {
    var title = document.getElementById('sticker-title');
    if (!title) return;
    var timer = null;
    function clear() { if (timer) { clearTimeout(timer); timer = null; } }
    title.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      clear();
      try { title.setPointerCapture(e.pointerId); } catch (err) {}
      timer = setTimeout(function () {
        timer = null;
        if (window.confirm('Reset all stars and stickers saved on this device?')) {
          resetAll();
          refreshAll();
        }
      }, 3000);
    });
    title.addEventListener('pointerup', clear);
    title.addEventListener('pointercancel', clear);
    title.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function refreshAll() {
    renderPip();
    renderCollection();
  }

  function boot() {
    try {
      renderPip();
      renderCollection();
      bindReset();
      if (document.body.classList.contains('reward-page')) runReward(bookFromQuery());
    } catch (err) { console.warn('rewards', err); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('storage', function (e) {
    if (e.key && e.key !== KEY) return;
    memory = null;
    refreshAll();
  });

  window.StoryRewards = {
    onBookEnd: onBookEnd,
    state: function () { return JSON.parse(JSON.stringify(load())); },
    resetAll: function () { resetAll(); refreshAll(); }
  };
})();
