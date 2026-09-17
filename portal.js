/* 门户脚本：星空背景 + 分类筛选（零依赖） */
(function () {
  'use strict';

  // ---------- 星空背景 ----------
  var canvas = document.getElementById('starfield');
  var ctx = canvas.getContext('2d');
  var stars = [];
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    var count = Math.min(160, Math.floor(window.innerWidth * window.innerHeight / 9000));
    stars = [];
    var palette = ['#ffffff', '#9db4ff', '#8ef1ff', '#ffc7e6'];
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: (Math.random() * 1.3 + 0.4) * dpr,
        vy: (Math.random() * 0.12 + 0.03) * dpr,
        tw: Math.random() * Math.PI * 2,
        color: palette[Math.floor(Math.random() * palette.length)]
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.y += s.vy;
      if (s.y > canvas.height + 4) { s.y = -4; s.x = Math.random() * canvas.width; }
      s.tw += 0.02;
      var alpha = 0.35 + Math.abs(Math.sin(s.tw)) * 0.55;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);

  // ---------- 分类筛选 ----------
  var chips = document.querySelectorAll('.chip');
  var cards = document.querySelectorAll('.card');

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      var cat = chip.getAttribute('data-cat');
      cards.forEach(function (card) {
        var show = cat === 'all' || card.getAttribute('data-cat') === cat;
        card.classList.toggle('hidden', !show);
      });
    });
  });
})();
