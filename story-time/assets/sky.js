/* Animated night sky: twinkling stars + an occasional shooting star. Purely decorative.
   Stars are kept inside the sky box so a phone page never grows wider than the screen. */
(function () {
  var sky = document.querySelector('.sky'); if (!sky) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var n = Math.round(Math.min(140, (innerWidth * innerHeight) / 9000)) + 30;
  var frag = document.createDocumentFragment();
  for (var i = 0; i < n; i++) {
    var s = document.createElement('i');
    var size = Math.random() < 0.12 ? 3 + Math.random() * 2 : 1 + Math.random() * 1.8;
    s.className = 'st' + (Math.random() < 0.25 ? ' gold' : Math.random() < 0.3 ? ' blue' : '');
    s.dataset.rx = Math.random().toFixed(4);
    s.dataset.ry = Math.random().toFixed(4);
    s.style.cssText = 'width:' + size.toFixed(2) + 'px;height:' + size.toFixed(2) + 'px;' +
      'animation-delay:' + (-Math.random() * 4).toFixed(2) + 's;animation-duration:' + (2.5 + Math.random() * 3).toFixed(2) + 's';
    frag.appendChild(s);
  }
  sky.appendChild(frag);
  var shoot = null;
  if (!reduce) {
    shoot = document.createElement('b');
    shoot.className = 'shoot';
    shoot.dataset.rx = (0.42 + Math.random() * 0.5).toFixed(4);
    shoot.dataset.ry = (0.08 + Math.random() * 0.7).toFixed(4);
    sky.appendChild(shoot);
  }
  function layout() {
    var w = sky.clientWidth || window.innerWidth;
    var h = sky.clientHeight || window.innerHeight;
    var stars = sky.querySelectorAll('.st');
    for (var i = 0; i < stars.length; i++) {
      var star = stars[i];
      var size = parseFloat(star.style.width) || 2;
      var pad = size * 0.35 + 2;
      var maxL = Math.max(0, w - size - pad);
      var maxT = Math.max(0, h - size - pad);
      star.style.left = (parseFloat(star.dataset.rx) * maxL) + 'px';
      star.style.top = (parseFloat(star.dataset.ry) * maxT) + 'px';
    }
    if (!shoot) return;
    var room = Math.max(0, w - 164);
    var topRoom = Math.max(0, h * 0.42);
    shoot.style.left = (parseFloat(shoot.dataset.rx) * room) + 'px';
    shoot.style.top = (parseFloat(shoot.dataset.ry) * topRoom) + 'px';
  }
  layout();
  var rz = null;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(layout, 80); });
  if (!shoot) return;
  function fire() {
    layout();
    shoot.classList.remove('go'); void shoot.offsetWidth; shoot.classList.add('go');
    setTimeout(fire, 7000 + Math.random() * 9000);
  }
  setTimeout(fire, 2500);
})();
