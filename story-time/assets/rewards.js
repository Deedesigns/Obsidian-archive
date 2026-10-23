/* Bedtime star rewards. One star per finished book, a chest every 3, stickers on this device only.
   Progress is localStorage. Nothing is sent anywhere. Sound plays only when the chest is tapped. */
(function () {
  'use strict';
  // Stay at the top when the library reloads. Otherwise the browser may restore a stray scroll
  // and hide the stars above the fold.
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
  var KEY = 'storytime.rewards.v1';
  var NEED = 3;
  var memory = null;
  var opening = false;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
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
    var parts = location.pathname.split('/');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === 'stories' && parts[i + 1] && parts[i + 1].indexOf('.') === -1) {
        try { return decodeURIComponent(parts[i + 1]); }
        catch (e) { return parts[i + 1]; }
      }
    }
    return '';
  }
  function scriptSrc() {
    var s = document.querySelector('script[src*="stickers.js"]');
    return s ? s.getAttribute('src') : '';
  }
  function assetBase() {
    var src = scriptSrc();
    return src ? src.replace(/stickers\.js(\?.*)?$/, 'stickers/') : 'assets/stickers/';
  }
  function collectionHref() {
    var src = scriptSrc();
    return src ? src.replace(/assets\/stickers\.js(\?.*)?$/, 'stickers.html') : 'stickers.html';
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

  /* Fixed order, no repeats until every sticker has been found. Later chests are shiny copies. */
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
    s.stars -= NEED;                 // extras past 3 stay in the jar
    save();
    return { stars: s.stars, got: got };
  }

  function shownStars(stars) { return Math.min(stars, NEED); }
  function homeNote(s) {
    if (s.stars >= NEED) return 'Tap the chest!';
    var read = 0;
    for (var k in s.books) if (Object.prototype.hasOwnProperty.call(s.books, k)) read++;
    if (s.stars === 0 && read > 0) return 'New adventures bring new stars';
    if (s.stars === 0) return 'Finish a story to earn a star';
    return 'Finish a new story to earn a star';
  }
  function endNote(result, stars) {
    if (!result || !result.awarded) return '';
    if (stars > NEED) return 'Extra star saved';
    return 'A new star!';
  }

  function meterHTML(stars, popIndex, extra) {
    var shown = shownStars(stars);
    var html = '<div class="star-meter' + (extra ? ' extra' : '') + '" role="img" aria-label="' + shown + ' of ' + NEED + ' stars">';
    for (var i = 0; i < NEED; i++) {
      html += '<span class="star' + (i < shown ? ' on' : '') + (i === popIndex ? ' is-new' : '') + '">' + STAR + '</span>';
    }
    html += '<span class="star-count">' + shown + '/' + NEED + '</span></div>';
    return html;
  }
  function chestHTML() {
    return '<button type="button" class="chest-btn" aria-label="Open the treasure chest">' + CHEST +
      '<span class="chest-word">Open</span></button>';
  }
  function bindChests(root) {
    var buttons = root.querySelectorAll('.chest-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      buttons[i].addEventListener('click', onChestClick);
    }
  }

  function renderHome() {
    var host = document.getElementById('rewards-home');
    if (!host) return;
    var s = load();
    host.innerHTML = meterHTML(s.stars, -1, false) +
      (s.stars >= NEED ? '<div class="collect-chest">' + chestHTML() + '</div>' : '') +
      '<p class="star-note">' + esc(homeNote(s)) + '</p>';
    bindChests(host);
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
    var html = '<div class="collect-top">' + meterHTML(s.stars, -1, false) +
      '<p class="star-note">' + esc(homeNote(s)) + '</p>' +
      (s.stars >= NEED ? '<div class="collect-chest">' + chestHTML() + '</div>' : '') + '</div>';
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
    bindChests(grid);
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

  function endPages(root) {
    var list = [];
    if (!root || !root.querySelectorAll) return list;
    if (root.classList && root.classList.contains('page') && root.classList.contains('end')) list.push(root);
    var found = root.querySelectorAll('.page.end');
    for (var i = 0; i < found.length; i++) if (list.indexOf(found[i]) === -1) list.push(found[i]);
    return list;
  }
  function mountEnd(page, result) {
    if (page.closest && page.closest('.leaf')) return;
    var s = load();
    var host = page.querySelector('.rewards-end');
    if (host && !(result && result.awarded) && host.getAttribute('data-stars') === String(s.stars)) return;
    if (!host) {
      host = document.createElement('div');
      host.className = 'rewards-end';
      var dream = page.querySelector('.dream');
      var btns = page.querySelector('.btns');
      if (dream && dream.parentNode) dream.parentNode.insertBefore(host, dream.nextSibling);
      else if (btns && btns.parentNode) btns.parentNode.insertBefore(host, btns);
      else page.appendChild(host);
    }
    var pop = -1;
    var extra = false;
    if (result && result.awarded) {
      if (s.stars > NEED) extra = true;
      else pop = shownStars(s.stars) - 1;
    }
    host.setAttribute('data-stars', String(s.stars));
    host.innerHTML = meterHTML(s.stars, pop, extra) +
      '<p class="star-note">' + esc(endNote(result, s.stars)) + '</p>' +
      (s.stars >= NEED ? chestHTML() : '') +
      '<a class="sticker-pocket" data-fly-target href="' + esc(collectionHref()) + '">My stickers</a>';
    bindChests(host);
  }
  function onBookEnd(root) {
    try {
      var pages = endPages(root || document);
      if (!pages.length) return;
      var result = awardBook(bookSlug());
      for (var i = 0; i < pages.length; i++) mountEnd(pages[i], result);
    } catch (err) { console.warn('rewards', err); }
  }

  function refreshAll(justId) {
    renderHome();
    renderCollection();
    var pages = document.querySelectorAll('.page.end');
    for (var i = 0; i < pages.length; i++) mountEnd(pages[i], { awarded: false });
    if (!justId) return;
    var slot = document.querySelector('.sticker-slot[data-id="' + cssId(justId) + '"]');
    if (slot) slot.classList.add('just-got');
  }
  function flyTargetFor(id) {
    var slot = document.querySelector('.sticker-slot[data-id="' + cssId(id) + '"]');
    if (slot) return slot;
    return document.querySelector('[data-fly-target]');
  }
  function ping(el) {
    if (!el) return;
    el.classList.remove('pocket-ping');
    void el.offsetWidth;
    el.classList.add('pocket-ping');
  }

  function playChestSound() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      var ctx = playChestSound.ctx || (playChestSound.ctx = new Ctx());
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      var now = ctx.currentTime;
      var master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.07, now + 0.03);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
      master.connect(ctx.destination);
      var notes = [
        { f: 392, t: 0, g: 0.45 },
        { f: 523.25, t: 0.08, g: 0.4 },
        { f: 659.25, t: 0.16, g: 0.32 },
        { f: 783.99, t: 0.26, g: 0.22 }
      ];
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i], t = now + n.t;
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(n.f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(n.g, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 0.6);
      }
    } catch (e) {}
  }

  function showPop(got, chestEl) {
    var reduceOn = !!(reduce && reduce.matches);
    var layer = document.createElement('div');
    layer.className = 'pop-layer';
    var bits = '<div class="pop-sticker" role="dialog" aria-label="' + esc(got.item.name) + '">' +
      '<div class="sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '<img alt="" draggable="false" src="' + esc(assetBase() + got.item.file) + '">' +
      '<p class="pop-name">' + esc(got.item.name) + '</p>' +
      (got.shiny ? '<p class="pop-shiny">A shiny one!</p>' : '') +
      (got.justCompleted ? '<p class="pop-done">You found every sticker!</p>' : '') +
      (reduceOn ? '<button type="button" class="btn gold pop-yay">Yay!</button>' : '') +
      '</div>';
    layer.innerHTML = bits;
    document.body.appendChild(layer);
    var card = layer.querySelector('.pop-sticker');
    var img = layer.querySelector('img');
    var rect = chestEl.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var size = Math.max(96, Math.min(160, vw * 0.4, vh * 0.3));
    img.style.width = size + 'px';
    img.style.height = size + 'px';
    var cx = rect.left + rect.width / 2;
    var cy = rect.top - size * 0.15;
    cy = Math.max(size * 0.55 + 16, Math.min(cy, vh - size * 0.72 - 48));
    cx = Math.max(size * 0.55 + 8, Math.min(cx, vw - size * 0.55 - 8));
    card.style.left = cx + 'px';
    card.style.top = cy + 'px';
    chestEl.classList.add('is-open');

    var flown = false;
    function finish() {
      if (flown) return;
      flown = true;
      var id = got.item.id;
      function done() {
        if (layer.parentNode) layer.remove();
        opening = false;
        refreshAll(id);
        ping(flyTargetFor(id));
      }
      var target = flyTargetFor(id);
      if (reduceOn || !img.animate || !target) { done(); return; }
      img.style.animation = 'none';
      var a = img.getBoundingClientRect();
      var b = target.getBoundingClientRect();
      var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
      var dy = (b.top + b.height / 2) - (a.top + a.height / 2);
      var name = card.querySelector('.pop-name');
      if (name) name.style.opacity = '0';
      var anim = img.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(0.16)', opacity: 0.9 }
      ], { duration: 780, easing: 'cubic-bezier(.45,.05,.2,1)', fill: 'forwards' });
      var ended = false;
      function end() { if (ended) return; ended = true; done(); }
      anim.onfinish = end;
      setTimeout(end, 1100);
    }
    if (reduceOn) {
      layer.querySelector('.pop-yay').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        finish();
      });
    } else {
      var timer = setTimeout(finish, 1550);
      layer.addEventListener('click', function () { clearTimeout(timer); finish(); });
    }
  }

  function onChestClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (opening) return;
    var result = spendChest();
    if (!result || !result.got) return;
    opening = true;
    playChestSound();
    showPop(result.got, e.currentTarget);
  }

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

  function boot() {
    try {
      renderHome();
      renderCollection();
      bindReset();
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
