/* Animated night sky: twinkling stars + an occasional shooting star. Purely decorative. */
(function () {
  var sky = document.querySelector('.sky'); if (!sky) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var n = Math.round(Math.min(140, (innerWidth * innerHeight) / 9000)) + 30;
  var frag = document.createDocumentFragment();
  for (var i = 0; i < n; i++) {
    var s = document.createElement('i');
    var size = Math.random() < 0.12 ? 3 + Math.random() * 2 : 1 + Math.random() * 1.8;
    s.className = 'st' + (Math.random() < 0.25 ? ' gold' : Math.random() < 0.3 ? ' blue' : '');
    s.style.cssText = 'left:' + (Math.random() * 100) + '%;top:' + (Math.random() * 100) + '%;width:' + size + 'px;height:' + size + 'px;' +
      'animation-delay:' + (-Math.random() * 4).toFixed(2) + 's;animation-duration:' + (2.5 + Math.random() * 3).toFixed(2) + 's';
    frag.appendChild(s);
  }
  sky.appendChild(frag);
  if (reduce) return;
  var shoot = document.createElement('b'); shoot.className = 'shoot'; sky.appendChild(shoot);
  function fire() {
    shoot.style.top = (5 + Math.random() * 35) + '%';
    shoot.style.left = (40 + Math.random() * 55) + '%';
    shoot.classList.remove('go'); void shoot.offsetWidth; shoot.classList.add('go');
    setTimeout(fire, 7000 + Math.random() * 9000);
  }
  setTimeout(fire, 2500);
})();
