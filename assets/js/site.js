/* minimalistic.solutions — site behaviour. No dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function css(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
  }
  function lang() { return root.getAttribute('data-lang') === 'pl' ? 'pl' : 'en'; }

  /* ------------------------------------------------------------------
     Language
     ------------------------------------------------------------------ */
  // Each language has its own URL (/ and /pl/). Remember an explicit choice
  // so the next visit opens in the same language.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-set-lang]');
    if (!a) return;
    try { localStorage.setItem('ms-lang', a.getAttribute('data-set-lang')); } catch (err) {}
  });
  root.classList.add('rv');

  /* ------------------------------------------------------------------
     Mobile menu
     ------------------------------------------------------------------ */
  var menuBtn = document.querySelector('.menu-btn');
  if (menuBtn) {
    var setMenu = function (open) {
      root.classList.toggle('menu-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    };
    menuBtn.addEventListener('click', function () { setMenu(!root.classList.contains('menu-open')); });
    document.querySelectorAll('.sheet a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
    window.matchMedia('(min-width: 861px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });
  }

  /* ------------------------------------------------------------------
     Scroll reveal
     ------------------------------------------------------------------ */
  var revealEls = document.querySelectorAll('[data-reveal],[data-wipe]');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ------------------------------------------------------------------
     Terminal text scramble on small mono labels
     ------------------------------------------------------------------ */
  var GLYPHS = '!<>-_\\/[]{}=+*^?#01';
  function scramble(el) {
    if (reduce || el.dataset.done) return;
    el.dataset.done = '1';
    var targets = el.querySelectorAll('[lang]').length ? el.querySelectorAll('[lang]') : [el];
    targets.forEach(function (node) {
      var final = node.textContent;
      var start = performance.now();
      var dur = Math.min(900, 280 + final.length * 22);
      (function frame(now) {
        var p = Math.min(1, (now - start) / dur);
        var reveal = Math.floor(p * final.length);
        var out = '';
        for (var i = 0; i < final.length; i++) {
          var ch = final[i];
          if (i < reveal || ch === ' ') out += ch;
          else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        node.textContent = out;
        if (p < 1) requestAnimationFrame(frame); else node.textContent = final;
      })(start);
    });
  }
  var scr = document.querySelectorAll('[data-scramble]');
  if ('IntersectionObserver' in window) {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { scramble(en.target); sio.unobserve(en.target); } });
    }, { threshold: 0.6 });
    scr.forEach(function (el) { sio.observe(el); });
  }

  /* ------------------------------------------------------------------
     Footer year
     ------------------------------------------------------------------ */
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ------------------------------------------------------------------
     Canvas helper
     ------------------------------------------------------------------ */
  function fitCanvas(cv) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  /* ------------------------------------------------------------------
     Galton board (home hero). Every ball is a data point; the last one
     always lands in the far tail: the outlier.
     ------------------------------------------------------------------ */
  var gCanvas = document.getElementById('galton');
  if (gCanvas) {
    var ROWS = 14, BINS = ROWS + 1, TOTAL = 420;
    var out = document.getElementById('galton-n');
    var replay = document.getElementById('galton-replay');
    var G = { balls: [], landed: [], counts: [], spawned: 0, running: false, last: 0, acc: 0 };
    var dims, cFg, cFg2, cFg3, cLine, cOut;

    function readColors() {
      cFg = css('--fg'); cFg2 = css('--fg-2'); cFg3 = css('--fg-3'); cLine = css('--line-2'); cOut = css('--outlier');
    }

    function geo() {
      var w = dims.w, h = dims.h;
      var padX = Math.max(18, w * 0.06);
      var top = h * 0.07;
      var pegH = h * 0.36;
      var binTop = top + pegH + h * 0.05;
      var binBottom = h - 30;
      var binW = (w - padX * 2) / BINS;
      var colsPerBin = 3;
      var cell = Math.min(binW / colsPerBin, (binBottom - binTop) / Math.ceil((TOTAL * 0.2) / colsPerBin));
      return { w: w, h: h, padX: padX, top: top, pegH: pegH, binTop: binTop, binBottom: binBottom, binW: binW, cell: cell, cols: colsPerBin };
    }

    function pegX(g, row, k) {
      // row r has r+1 pegs, centred
      var cx = g.w / 2;
      return cx + (k - row / 2) * g.binW;
    }
    function pegY(g, row) { return g.top + (row / ROWS) * g.pegH; }

    function makeBall(forceOutlier) {
      var path = [], k = 0;
      for (var r = 0; r < ROWS; r++) {
        var right = forceOutlier ? true : Math.random() < 0.5;
        path.push(right);
        if (right) k++;
      }
      return { path: path, bin: k, t: 0, outlier: !!forceOutlier };
    }

    function reset() {
      G.balls = []; G.landed = []; G.counts = new Array(BINS).fill(0); G.spawned = 0; G.acc = 0;
    }

    function landedPos(g, bin, index) {
      var col = index % g.cols, row = Math.floor(index / g.cols);
      var bx = g.padX + bin * g.binW + (g.binW - g.cols * g.cell) / 2 + col * g.cell;
      var by = g.binBottom - (row + 1) * g.cell;
      return [bx, by];
    }

    function land(b) {
      var idx = G.counts[b.bin]++;
      G.landed.push({ bin: b.bin, idx: idx, outlier: b.outlier });
    }

    function ballXY(g, b) {
      // t goes 0..ROWS (+1 for the drop into the bin)
      var r = Math.min(Math.floor(b.t), ROWS);
      var f = b.t - r;
      var k = 0;
      for (var i = 0; i < r && i < ROWS; i++) if (b.path[i]) k++;
      if (r >= ROWS) {
        var x = g.padX + b.bin * g.binW + g.binW / 2;
        var y0 = pegY(g, ROWS - 1);
        return [x, y0 + f * (g.binTop - y0)];
      }
      var x0 = pegX(g, r, k), yA = pegY(g, r) - g.cell * 1.2;
      var nk = k + (b.path[r] ? 1 : 0);
      var x1 = (r + 1 < ROWS) ? pegX(g, r + 1, nk) : g.padX + b.bin * g.binW + g.binW / 2;
      var y1 = (r + 1 < ROWS) ? pegY(g, r + 1) - g.cell * 1.2 : pegY(g, r) + g.pegH / ROWS;
      var bounce = Math.sin(f * Math.PI) * g.cell * 1.1;
      return [x0 + (x1 - x0) * f, yA + (y1 - yA) * f * f - bounce * (1 - f)];
    }

    function draw() {
      var g = geo(), ctx = dims.ctx;
      ctx.clearRect(0, 0, g.w, g.h);

      // pegs
      ctx.fillStyle = cFg3;
      for (var r = 0; r < ROWS; r++) {
        for (var k = 0; k <= r; k++) {
          ctx.fillRect(Math.round(pegX(g, r, k)) - 1, Math.round(pegY(g, r)), 2, 2);
        }
      }
      // bin walls
      ctx.fillStyle = cLine;
      for (var b = 0; b <= BINS; b++) {
        var x = Math.round(g.padX + b * g.binW);
        ctx.fillRect(x, Math.round(g.binTop), 1, Math.round(g.binBottom - g.binTop));
      }
      ctx.fillRect(Math.round(g.padX), Math.round(g.binBottom), Math.round(g.w - g.padX * 2) + 1, 1);

      // sigma ticks
      ctx.font = '500 9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = cFg3;
      ctx.textAlign = 'center';
      var sig = Math.sqrt(ROWS) / 2; // std dev in bins
      [-3, -2, -1, 0, 1, 2, 3].forEach(function (s) {
        var bx = g.w / 2 + s * sig * g.binW;
        if (bx < g.padX || bx > g.w - g.padX) return;
        ctx.fillRect(Math.round(bx), Math.round(g.binBottom) + 3, 1, 4);
        ctx.fillText(s === 0 ? 'μ' : (s > 0 ? '+' : '−') + Math.abs(s) + 'σ', bx, g.binBottom + 18);
      });

      // landed
      var s = Math.max(2, g.cell - 1.5);
      var outlierPos = null;
      for (var i = 0; i < G.landed.length; i++) {
        var L = G.landed[i];
        var p = landedPos(g, L.bin, L.idx);
        if (L.outlier) { outlierPos = p; continue; }
        ctx.fillStyle = cFg2;
        ctx.fillRect(p[0], p[1], s, s);
      }
      // falling
      ctx.fillStyle = cFg;
      for (var j = 0; j < G.balls.length; j++) {
        var q = ballXY(g, G.balls[j]);
        ctx.fillStyle = G.balls[j].outlier ? cOut : cFg;
        ctx.fillRect(q[0] - s / 2, q[1] - s / 2, s, s);
      }
      if (outlierPos) {
        ctx.fillStyle = cOut;
        ctx.fillRect(outlierPos[0] - 1, outlierPos[1] - 1, s + 2, s + 2);
        // leader + label
        var lx = Math.round(outlierPos[0] + s / 2), ly = outlierPos[1] - 4;
        var ty = Math.round(g.binTop - 4);
        ctx.fillRect(lx, ty + 4, 1, Math.max(0, ly - ty - 4));
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        var label = lang() === 'pl' ? 'OUTLIER / TO TY?' : 'OUTLIER / YOU?';
        var tw = ctx.measureText(label).width;
        ctx.fillStyle = css('--bg-2');
        ctx.fillRect(lx - tw - 4, ty - 11, tw + 8, 15);
        ctx.fillStyle = cOut;
        ctx.fillText(label, lx + 2, ty);
      }
    }

    function step(now) {
      if (!G.running) return;
      var dt = Math.min(48, now - (G.last || now));
      G.last = now;
      G.acc += dt;
      var spawnEvery = 14;
      while (G.acc > spawnEvery && G.spawned < TOTAL) {
        G.acc -= spawnEvery;
        G.balls.push(makeBall(G.spawned === TOTAL - 1));
        G.spawned++;
      }
      var speed = dt / 55; // rows per ms
      for (var i = G.balls.length - 1; i >= 0; i--) {
        var b = G.balls[i];
        b.t += speed * (b.outlier ? 0.8 : 1);
        if (b.t >= ROWS + 1) { land(b); G.balls.splice(i, 1); }
      }
      if (out) out.textContent = String(G.landed.length).padStart(3, '0');
      draw();
      if (G.spawned >= TOTAL && G.balls.length === 0) { G.running = false; return; }
      requestAnimationFrame(step);
    }

    function instant() {
      reset();
      for (var i = 0; i < TOTAL; i++) land(makeBall(i === TOTAL - 1));
      G.spawned = TOTAL;
      if (out) out.textContent = String(TOTAL);
      draw();
    }

    function run() {
      reset();
      if (reduce) { instant(); return; }
      G.running = true; G.last = 0;
      requestAnimationFrame(step);
    }

    function layout() { dims = fitCanvas(gCanvas); readColors(); if (!G.running) draw(); }

    reset();
    layout();
    if ('ResizeObserver' in window) new ResizeObserver(function () { layout(); }).observe(gCanvas);
    var started = false;
    new IntersectionObserver(function (en) {
      if (en[0].isIntersecting && !started) { started = true; setTimeout(run, reduce ? 0 : 500); }
    }, { threshold: 0.25 }).observe(gCanvas);
    if (replay) replay.addEventListener('click', function () { G.running = false; setTimeout(run, 30); });
    document.addEventListener('langchange', function () { if (!G.running) draw(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!G.running) draw(); });
  }

  /* ------------------------------------------------------------------
     Gaussian percentile widget (Outlier page)
     ------------------------------------------------------------------ */
  var gc = document.getElementById('gauss');
  if (gc) {
    var slider = document.getElementById('gauss-z');
    var outZ = document.getElementById('g-z'), outP = document.getElementById('g-p'), outT = document.getElementById('g-t');
    var gd;

    function erf(x) {
      var s = x < 0 ? -1 : 1; x = Math.abs(x);
      var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      var t = 1 / (1 + p * x);
      var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return s * y;
    }
    function cdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
    function pdf(z) { return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); }

    function render() {
      var z = parseFloat(slider.value);
      var ctx = gd.ctx, w = gd.w, h = gd.h;
      var acc = css('--acc'), acc2 = css('--acc-2') || acc, fg3 = css('--fg-3'), line = css('--line-2'), fg = css('--fg');
      var padB = 26, padT = 18;
      var X = function (v) { return (v + 3.4) / 6.8 * w; };
      var Y = function (v) { return h - padB - v / pdf(0) * (h - padB - padT); };
      ctx.clearRect(0, 0, w, h);

      // hatch fill under curve left of z
      ctx.fillStyle = acc2;
      ctx.globalAlpha = 0.6;
      for (var px = 0; px <= X(z); px += 3) {
        var v = (px / w) * 6.8 - 3.4;
        var y = Y(pdf(v));
        ctx.fillRect(px, y, 1, h - padB - y);
      }
      ctx.globalAlpha = 1;

      // curve
      ctx.strokeStyle = fg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var i = 0; i <= w; i += 2) {
        var vv = (i / w) * 6.8 - 3.4;
        if (i === 0) ctx.moveTo(i, Y(pdf(vv))); else ctx.lineTo(i, Y(pdf(vv)));
      }
      ctx.stroke();

      // axis
      ctx.fillStyle = line;
      ctx.fillRect(0, h - padB, w, 1);
      ctx.fillStyle = fg3;
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      for (var s = -3; s <= 3; s++) {
        ctx.fillRect(Math.round(X(s)), h - padB, 1, 5);
        ctx.fillText(s === 0 ? 'μ' : (s > 0 ? '+' : '−') + Math.abs(s) + 'σ', X(s), h - 8);
      }

      // marker
      var mx = Math.round(X(z));
      ctx.fillStyle = acc;
      ctx.fillRect(mx - 1, padT - 6, 2, h - padB - padT + 6);
      ctx.fillRect(mx - 4, Y(pdf(z)) - 4, 8, 8);

      var p = cdf(z) * 100;
      var top = 100 - p;
      outZ.textContent = (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(2) + 'σ';
      outP.textContent = p.toFixed(1) + '%';
      outT.textContent = (lang() === 'pl' ? 'TOP ' : 'TOP ') + (top < 0.1 ? '<0.1' : top.toFixed(1)) + '%';
      slider.style.setProperty('--p', ((z + 3) / 6 * 100) + '%');
      slider.setAttribute('aria-valuetext', outZ.textContent + ', ' + outP.textContent);
    }
    function layoutG() { gd = fitCanvas(gc); render(); }
    slider.addEventListener('input', render);
    layoutG();
    if ('ResizeObserver' in window) new ResizeObserver(layoutG).observe(gc);
    document.addEventListener('langchange', render);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
  }

  /* ------------------------------------------------------------------
     Horizontal strip controls
     ------------------------------------------------------------------ */
  document.querySelectorAll('[data-strip]').forEach(function (wrap) {
    var strip = wrap.querySelector('.strip');
    wrap.querySelectorAll('[data-strip-dir]').forEach(function (b) {
      b.addEventListener('click', function () {
        var dir = parseInt(b.getAttribute('data-strip-dir'), 10);
        var fig = strip.querySelector('figure');
        var step = fig ? fig.getBoundingClientRect().width + 16 : 300;
        strip.scrollBy({ left: dir * step, behavior: reduce ? 'auto' : 'smooth' });
      });
    });
  });

  /* ------------------------------------------------------------------
     Killswitch live demo
     ------------------------------------------------------------------ */
  var ks = document.getElementById('ks-feed');
  if (ks) {
    var THRESH = 8, WINDOW = 10000, UNIT = 260;
    var block = document.getElementById('ks-block');
    var meter = document.getElementById('ks-meter');
    var outS = document.getElementById('ks-s'), outB = document.getElementById('ks-b'), outBig = document.getElementById('ks-count');
    var events = [], lastTop = 0, travel = 0, blocks = 0, locked = false;

    var html = '';
    for (var n = 1; n <= 60; n++) {
      html += '<div class="ks-post" aria-hidden="true"><div class="who"><span class="av"></span><span class="nm"></span></div>' +
        '<div class="media" data-n="#' + String(n).padStart(3, '0') + '"></div><div class="ln"></div><div class="ln s"></div></div>';
    }
    ks.innerHTML = html;

    function paint() {
      var now = performance.now();
      events = events.filter(function (t) { return now - t < WINDOW; });
      outS.textContent = events.length + '/' + THRESH;
      outB.textContent = String(blocks);
      meter.style.transform = 'scaleX(' + Math.min(1, events.length / THRESH) + ')';
    }

    function trigger() {
      locked = true;
      blocks++;
      outBig.textContent = String(blocks).padStart(2, '0');
      block.classList.add('on');
      block.setAttribute('aria-hidden', 'false');
      events = [];
      paint();
      setTimeout(function () {
        ks.scrollTo({ top: 0, behavior: 'auto' });
        lastTop = 0; travel = 0;
        block.classList.remove('on');
        block.setAttribute('aria-hidden', 'true');
        locked = false;
      }, 3000);
    }

    ks.addEventListener('scroll', function () {
      if (locked) return;
      var d = ks.scrollTop - lastTop;
      lastTop = ks.scrollTop;
      if (d <= 0) return;
      travel += d;
      while (travel >= UNIT) {
        travel -= UNIT;
        events.push(performance.now());
      }
      paint();
      if (events.length >= THRESH) trigger();
    }, { passive: true });
    setInterval(function () { if (!locked) paint(); }, 1000);
    paint();
  }

  /* ------------------------------------------------------------------
     Legal docs: active TOC entry
     ------------------------------------------------------------------ */
  var tocLinks = document.querySelectorAll('.toc a[href^="#"]');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    tocLinks.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var tio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var a = map[en.target.id];
          if (!a) return;
          a.closest('ol').querySelectorAll('a').forEach(function (x) { x.classList.remove('on'); });
          a.classList.add('on');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) tio.observe(s); });
  }
})();
