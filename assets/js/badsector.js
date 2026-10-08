/* BADSECTOR page: the boot board in the hero and a playable sector.
   The engine below is the game's own prototype engine (design/engine/engine.js
   in the BADSECTOR repo): same seed + same first cell = the same board as in the app. */
(function () {
  'use strict';

  var PL = document.documentElement.lang === 'pl';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function T(en, pl) { return PL ? pl : en; }
  function css(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }
  function rgba(hex, a) {
    var n = parseInt(hex.replace('#', ''), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ==================================================================
     ENGINE: seeded generation, no-guess solver, 3BV
     ================================================================== */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashString(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function geometry(W, H) {
    var N = W * H, nb = new Int32Array(N * 8), nc = new Uint8Array(N);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, k = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) nb[i * 8 + k++] = ny * W + nx;
      }
      nc[i] = k;
    }
    return { W: W, H: H, N: N, nb: nb, nc: nc };
  }
  function place(geo, M, start, rng) {
    var N = geo.N, nb = geo.nb, nc = geo.nc;
    var mine = new Uint8Array(N), banned = new Uint8Array(N), k;
    banned[start] = 1;
    if (N - (nc[start] + 1) >= M) for (k = 0; k < nc[start]; k++) banned[nb[start * 8 + k]] = 1;
    var pool = [];
    for (var i = 0; i < N; i++) if (!banned[i]) pool.push(i);
    var m = Math.min(M, pool.length);
    for (k = 0; k < m; k++) {
      var j = k + Math.floor(rng() * (pool.length - k));
      var t = pool[k]; pool[k] = pool[j]; pool[j] = t;
      mine[pool[k]] = 1;
    }
    var count = new Uint8Array(N);
    for (i = 0; i < N; i++) {
      if (mine[i]) continue;
      var c = 0;
      for (k = 0; k < nc[i]; k++) c += mine[nb[i * 8 + k]];
      count[i] = c;
    }
    return { mine: mine, count: count, mines: m };
  }
  // Logic-only solver: single-cell rules, the pair rule and the global mine count.
  function solve(geo, M, mine, count, start) {
    var W = geo.W, H = geo.H, N = geo.N, nb = geo.nb, nc = geo.nc;
    var st = new Uint8Array(N);
    var safeTotal = N - M, open = 0, flagged = 0, broken = false, stack = [];
    function openCell(i) {
      if (st[i]) return;
      stack.push(i);
      while (stack.length) {
        var c = stack.pop();
        if (st[c]) continue;
        if (mine[c]) { broken = true; return; }
        st[c] = 1; open++;
        if (count[c] === 0) for (var k = 0; k < nc[c]; k++) { var n = nb[c * 8 + k]; if (!st[n]) stack.push(n); }
      }
    }
    function markMine(i) { if (st[i] === 0) { st[i] = 2; flagged++; } }
    openCell(start);
    var ci = new Int32Array(N), markA = new Uint8Array(N), markB = new Uint8Array(N);
    var progress = true;
    while (!broken && open < safeTotal && progress) {
      progress = false;
      var cons = [], i, k, u;
      for (i = 0; i < N; i++) {
        if (st[i] !== 1 || count[i] === 0) continue;
        var unk = [], km = 0;
        for (k = 0; k < nc[i]; k++) { var n = nb[i * 8 + k]; if (st[n] === 0) unk.push(n); else if (st[n] === 2) km++; }
        if (!unk.length) continue;
        var need = count[i] - km;
        if (need === 0) { for (u = 0; u < unk.length; u++) openCell(unk[u]); progress = true; }
        else if (need === unk.length) { for (u = 0; u < unk.length; u++) markMine(unk[u]); progress = true; }
        else cons.push({ i: i, unk: unk, need: need });
      }
      if (progress) continue;
      ci.fill(-1);
      for (k = 0; k < cons.length; k++) ci[cons[k].i] = k;
      pairs:
      for (var a = 0; a < cons.length; a++) {
        var A = cons[a], ax = A.i % W, ay = (A.i / W) | 0;
        for (u = 0; u < A.unk.length; u++) markA[A.unk[u]] = 1;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
          if (!dx && !dy) continue;
          var x = ax + dx, y = ay + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          var kb = ci[y * W + x];
          if (kb < 0) continue;
          var B = cons[kb], shared = 0;
          for (u = 0; u < B.unk.length; u++) if (markA[B.unk[u]]) shared++;
          if (!shared) continue;
          var aOnly = A.unk.length - shared, bOnly = B.unk.length - shared;
          if (A.need - aOnly === B.need && (aOnly || bOnly)) {
            for (u = 0; u < B.unk.length; u++) markB[B.unk[u]] = 1;
            for (u = 0; u < B.unk.length; u++) if (!markA[B.unk[u]]) openCell(B.unk[u]);
            for (u = 0; u < A.unk.length; u++) if (!markB[A.unk[u]]) markMine(A.unk[u]);
            for (u = 0; u < B.unk.length; u++) markB[B.unk[u]] = 0;
            for (u = 0; u < A.unk.length; u++) markA[A.unk[u]] = 0;
            progress = true;
            break pairs;
          }
        }
        for (u = 0; u < A.unk.length; u++) markA[A.unk[u]] = 0;
      }
      if (progress) continue;
      var unknown = N - open - flagged, left = M - flagged;
      if (unknown > 0 && (left === 0 || left === unknown)) {
        for (i = 0; i < N; i++) if (st[i] === 0) { if (left === 0) openCell(i); else markMine(i); }
        progress = true;
      }
    }
    return !broken && open === safeTotal;
  }
  function bbbv(geo, mine, count) {
    var N = geo.N, nb = geo.nb, nc = geo.nc, seen = new Uint8Array(N), stack = [], v = 0, i;
    for (i = 0; i < N; i++) {
      if (mine[i] || count[i] || seen[i]) continue;
      v++; stack.push(i); seen[i] = 1;
      while (stack.length) {
        var c = stack.pop();
        if (count[c]) continue;
        for (var k = 0; k < nc[c]; k++) { var n = nb[c * 8 + k]; if (!seen[n] && !mine[n]) { seen[n] = 1; stack.push(n); } }
      }
    }
    for (i = 0; i < N; i++) if (!mine[i] && !seen[i]) v++;
    return v;
  }
  function NoGuessJob(geo, M, start, seed) {
    this.geo = geo; this.M = M; this.start = start; this.seed = seed >>> 0;
    this.maxAttempts = 4000;
    this.rng = mulberry32(this.seed ^ Math.imul(start + 1, 0x9E3779B1));
    this.attempts = 0; this.result = null;
  }
  NoGuessJob.prototype.step = function (budgetMs) {
    var t0 = performance.now();
    while (!this.result) {
      var b = place(this.geo, this.M, this.start, this.rng);
      this.attempts++;
      var ok = solve(this.geo, b.mines, b.mine, b.count, this.start);
      if (ok || this.attempts >= this.maxAttempts) {
        b.noGuess = ok; b.attempts = this.attempts; b.bbbv = bbbv(this.geo, b.mine, b.count);
        this.result = b; break;
      }
      if (performance.now() - t0 >= budgetMs) break;
    }
    return this.result;
  };

  /* ==================================================================
     3x5 pixel font (the app's PixelFont.kt, letters we need)
     ================================================================== */
  var FONT = {
    A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
    D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], O: ['010', '101', '101', '101', '010'],
    R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010']
  };
  function pixelWidth(s) { return s.length * 4 - 1; }
  function pixelText(s, x, y, dot) {
    for (var c = 0; c < s.length; c++) {
      var rows = FONT[s[c]];
      if (rows) for (var yy = 0; yy < 5; yy++) for (var xx = 0; xx < 3; xx++) if (rows[yy][xx] === '1') dot(x + c * 4 + xx, y + yy);
    }
  }

  function fitCanvas(cv) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }
  function rrect(ctx, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); ctx.fill(); }
    else ctx.fillRect(x, y, w, h);
  }
  function ease(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

  var DIGITS = ['', '#5aa9ff', '#52d68a', '#ff6b6b', '#b08cff', '#ffa94d', '#3ccfc4', '#ecebe6', '#8a8983'];

  /* ==================================================================
     HERO: the boot board. A cascade opens a real board from the middle;
     the ICE it finds spells BAD / SECTOR, every number counts its ICE.
     ================================================================== */
  var boot = document.getElementById('bs-boot');
  if (boot) (function () {
    var COLS = pixelWidth('SECTOR') + 2, ROWS = 13, N = COLS * ROWS;
    var ice = new Uint8Array(N), cnt = new Uint8Array(N);
    pixelText('BAD', ((COLS - pixelWidth('BAD')) / 2) | 0, 1, function (x, y) { ice[y * COLS + x] = 1; });
    pixelText('SECTOR', 1, 7, function (x, y) { ice[y * COLS + x] = 1; });
    for (var i = 0; i < N; i++) {
      var x = i % COLS, y = (i / COLS) | 0, n = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var xx = x + dx, yy = y + dy;
        if ((dx || dy) && xx >= 0 && yy >= 0 && xx < COLS && yy < ROWS && ice[yy * COLS + xx]) n++;
      }
      cnt[i] = n;
    }
    var cx = COLS >> 1, cy = ROWS >> 1;
    var maxD = Math.max(cx, COLS - 1 - cx, cy, ROWS - 1 - cy);
    var TOTAL = 3600, dims, acc, start = -1, raf = 0, hover = -1;
    var replay = document.getElementById('bs-boot-replay');
    boot.setAttribute('aria-label', T('A minesweeper board opens from the middle. The ICE it finds spells BAD SECTOR, and every number counts the ICE around it.',
      'Plansza sapera odkrywa się od środka. Znalezione ICE układa się w napis BAD SECTOR, a każda liczba liczy ICE wokół siebie.'));

    // the grid and the two lines under it, centred together so nothing is ever clipped
    function textBlock(cell) { return Math.max(26, cell * 1.5) + Math.max(18, cell * 0.95) + 6; }
    function geo() {
      var pad = Math.max(12, dims.w * 0.035);
      var cell = Math.min((dims.w - pad * 2) / COLS, (dims.h - pad * 2 - textBlock(14)) / ROWS);
      var gw = cell * COLS, gh = cell * ROWS;
      return { cell: cell, x0: (dims.w - gw) / 2, y0: Math.max(pad, (dims.h - gh - textBlock(cell)) / 2), gw: gw, gh: gh };
    }

    function draw(e) {
      if (dims.w < 40 || dims.h < 40) return;
      var ctx = dims.ctx, g = geo(), c = g.cell, gap = Math.max(1, c * 0.09);
      ctx.clearRect(0, 0, dims.w, dims.h);
      var open = ease((e - 0.04) / 0.46) * (maxD + 1.4);
      var scan = (e - 0.52) / 0.16;
      var after = ease((e - 0.62) / 0.14);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 ' + Math.round(c * 0.6) + 'px "JetBrains Mono", monospace';
      var scanX = g.x0 + scan * g.gw;
      for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
        var i = y * COLS + x, px = g.x0 + x * c, py = g.y0 + y * c;
        var dist = Math.max(Math.abs(x - cx), Math.abs(y - cy));
        var k = Math.max(0, Math.min(1, (open - dist) / 1.2));
        var w = c - gap;
        if (k < 1) {
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = '#17171b'; rrect(ctx, px, py, w, w, c * 0.12);
          ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(px, py, w, gap);
          ctx.globalAlpha = 1;
        }
        if (k <= 0) continue;
        var lit = scan > 0 && scan < 1.15 && Math.abs(px + w / 2 - scanX) < c * 1.2;
        if (ice[i]) {
          var s = 0.6 + 0.4 * k, o = w * (1 - s) / 2;
          ctx.globalAlpha = 0.22 * k;
          ctx.fillStyle = acc; rrect(ctx, px - gap, py - gap, w + gap * 2, w + gap * 2, c * 0.2);
          ctx.globalAlpha = k;
          ctx.fillStyle = lit ? '#ffffff' : acc; rrect(ctx, px + o, py + o, w * s, w * s, c * 0.12);
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = k;
          ctx.fillStyle = lit ? '#1c1729' : '#0d0d0f'; ctx.fillRect(px, py, w, w);
          if (cnt[i]) { ctx.fillStyle = DIGITS[cnt[i]]; ctx.fillText(String(cnt[i]), px + w / 2, py + w / 2 + c * 0.04); }
          ctx.globalAlpha = 1;
        }
        if (i === hover && e >= 1) {
          ctx.strokeStyle = ice[i] ? '#ffffff' : acc; ctx.lineWidth = 1.5;
          ctx.strokeRect(px - 1, py - 1, w + 2, w + 2);
        }
      }
      // the scan line
      if (scan > 0 && scan < 1.15) {
        var grad = ctx.createLinearGradient(scanX - c * 3, 0, scanX, 0);
        grad.addColorStop(0, rgba(acc, 0)); grad.addColorStop(1, rgba(acc, 0.22));
        ctx.fillStyle = grad; ctx.fillRect(scanX - c * 3, g.y0 - c * 0.4, c * 3, g.gh + c * 0.8);
        ctx.fillStyle = acc; ctx.fillRect(Math.round(scanX), g.y0 - c * 0.4, 2, g.gh + c * 0.8);
      }
      // SECTOR CLEAN and the motto (system lines stay English, as in the app)
      if (after > 0) {
        var ty = g.y0 + g.gh + Math.max(26, c * 1.5);
        ctx.globalAlpha = after;
        ctx.fillStyle = acc;
        ctx.font = '700 ' + Math.max(10, Math.round(c * 0.58)) + 'px "JetBrains Mono", monospace';
        spaced(ctx, 'SECTOR CLEAN', dims.w / 2, ty, 0.3);
        ctx.fillStyle = css('--fg-3');
        ctx.font = '500 ' + Math.max(9, Math.round(c * 0.45)) + 'px "JetBrains Mono", monospace';
        spaced(ctx, 'SCAN  ·  MARK  ·  CLEAR', dims.w / 2, ty + Math.max(18, c * 0.95), 0.25);
        ctx.globalAlpha = 1;
      }
    }
    // letter-spaced text without relying on ctx.letterSpacing
    function spaced(ctx, s, x, y, em) {
      var size = parseFloat(ctx.font.split(' ')[1]) || 12, sp = size * em, w = 0, k;
      for (k = 0; k < s.length; k++) w += ctx.measureText(s[k]).width + (k < s.length - 1 ? sp : 0);
      var cx0 = x - w / 2;
      ctx.textAlign = 'left';
      for (k = 0; k < s.length; k++) { ctx.fillText(s[k], cx0, y); cx0 += ctx.measureText(s[k]).width + sp; }
      ctx.textAlign = 'center';
    }

    function frame(now) {
      if (start < 0) start = now;
      var e = Math.min(1, (now - start) / TOTAL);
      draw(e);
      if (e < 1) raf = requestAnimationFrame(frame); else raf = 0;
    }
    function run() {
      cancelAnimationFrame(raf);
      if (reduce) { draw(1); return; }
      start = -1; raf = requestAnimationFrame(frame);
    }
    function layout() { dims = fitCanvas(boot); acc = css('--acc') || '#b39dff'; if (!raf) draw(start < 0 && !reduce ? 0 : 1); }

    layout();
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(boot);
    var seen = false;
    new IntersectionObserver(function (en) {
      if (en[0].isIntersecting && !seen) { seen = true; setTimeout(run, reduce ? 0 : 350); }
    }, { threshold: 0.3 }).observe(boot);
    if (replay) replay.addEventListener('click', run);
    boot.addEventListener('click', run);
    boot.addEventListener('pointermove', function (ev) {
      if (raf) return;
      var r = boot.getBoundingClientRect(), g = geo();
      var x = Math.floor((ev.clientX - r.left - g.x0) / g.cell), y = Math.floor((ev.clientY - r.top - g.y0) / g.cell);
      var h = x >= 0 && y >= 0 && x < COLS && y < ROWS ? y * COLS + x : -1;
      if (h !== hover) { hover = h; draw(1); }
    });
    boot.addEventListener('pointerleave', function () { if (hover >= 0 && !raf) { hover = -1; draw(1); } });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!raf) draw(seen ? 1 : 0); });
  })();

  /* ==================================================================
     NULL, the TELEMETRY cat (sprite from the app's Pixel.kt)
     ================================================================== */
  var CAT = {
    sit: ['...o......o.....', '..obo....obo....', '..opboooobpo....', '.obbbbbbbbbbo...', '.obbbbbbbbbbo...', '.obwebbbbwebo...', '.obeebbbbeebo...',
      '.obbbbppbbbbo.o.', '..obbbbbbbbo..o.', '.obbbbbbbbbbo.o.', '.obbbbbbbbbbo.o.', '.obbbbbbbbbbooo.', '.obhbbbbbbhbo...', '..oooooooooo....']
  };
  function swap(base, rows) { return base.map(function (r, i) { return rows[i] || r; }); }
  CAT.blink = swap(CAT.sit, { 5: '.obbbbbbbbbbo...' });
  CAT.happy = swap(CAT.sit, { 5: '.obbebbbbebbo...', 6: '.obebebbebebo...' });
  CAT.shock = swap(CAT.sit, { 5: '.obwwbbbbwwbo...', 6: '.obwebbbbewbo...' });
  CAT.talk = swap(CAT.sit, { 7: '.obbbbppbbbbo.o.', 8: '..obbbppbbbo..o.' });
  var ACC = css('--acc') || '#b39dff';
  var PAL = { o: ACC, b: '#16181d', h: '#262a33', e: ACC, w: '#ffffff', p: '#ff6b9a' };
  function drawCat(cv, rows) {
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 16, 14);
    for (var y = 0; y < 14; y++) for (var x = 0; x < 16; x++) {
      var ch = rows[y][x];
      if (ch !== '.') { ctx.fillStyle = PAL[ch]; ctx.fillRect(x, y, 1, 1); }
    }
  }

  /* ==================================================================
     PLAYABLE SECTOR
     ================================================================== */
  var root = document.getElementById('bs-demo');
  if (!root) return;

  var boardEl = root.querySelector('.bs-board');
  var elIce = root.querySelector('[data-ice]'), elTime = root.querySelector('[data-time]');
  var elSay = root.querySelector('.bs-null p'), catCv = root.querySelector('.bs-null canvas');
  var elRes = root.querySelector('.bs-result');
  var modeBtns = root.querySelectorAll('[data-mode]');
  var levelBtns = root.querySelectorAll('[data-level]');
  var hintBtn = root.querySelector('[data-act="hint"]'), newBtn = root.querySelector('[data-act="new"]');
  root.querySelector('.bs-levels').setAttribute('aria-label', T('Board', 'Plansza'));
  root.querySelector('.bs-seg').setAttribute('aria-label', T('What a tap does', 'Co robi dotknięcie'));

  var LEVELS = {
    L1: { w: 9, h: 9, m: 10 },
    L2: { w: 16, h: 16, m: 40 }
  };
  var today = new Date();
  var dayNo = Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(today.getFullYear(), 0, 0)) / 86400000);
  var dailySeed = hashString('BADSECTOR/' + today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate());
  root.querySelectorAll('[data-dayno]').forEach(function (el) { el.textContent = '#' + String(dayNo).padStart(4, '0'); });

  var G = null, level = 'L1', mode = 'scan', cells = [], focusI = 0, timer = 0, sayTimer = 0;

  function say(text, pose) {
    elSay.textContent = text;
    clearTimeout(sayTimer);
    drawCat(catCv, CAT[pose || 'talk']);
    sayTimer = setTimeout(function () { drawCat(catCv, CAT[pose === 'happy' || pose === 'shock' ? pose : 'sit']); }, pose === 'happy' || pose === 'shock' ? 2400 : 700);
  }
  if (!reduce) setInterval(function () {
    if (!G || G.phase === 'won' || G.phase === 'lost') return;
    drawCat(catCv, CAT.blink); setTimeout(function () { drawCat(catCv, CAT.sit); }, 140);
  }, 4200);

  function fmt(ms) {
    var s = Math.floor(ms / 1000), t = Math.floor((ms % 1000) / 100);
    return '<span>' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + '</span><i>.' + t + '</i>';
  }
  function fmtPlain(ms) {
    var s = Math.floor(ms / 1000), t = Math.floor((ms % 1000) / 100);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + '.' + t;
  }

  function newGame(keepBoard) {
    var cfg = level === 'D' ? { w: 16, h: 16, m: 40 } : LEVELS[level];
    var old = G;
    G = {
      w: cfg.w, h: cfg.h, M: cfg.m, geo: geometry(cfg.w, cfg.h), phase: 'ready',
      open: new Uint8Array(cfg.w * cfg.h), flag: new Uint8Array(cfg.w * cfg.h),
      board: null, seed: 0, start: -1, opened: 0, flags: 0, clicks: 0, t0: 0, t1: 0,
      hinted: false, moves: [], gen: null
    };
    if (level === 'D') {
      G.seed = dailySeed;
      G.fixed = (2 + Math.floor(dailySeed / 256) % (G.h - 4)) * G.w + 2 + (dailySeed % (G.w - 4));
    }
    if (keepBoard && old && old.board && old.w === G.w) { G.board = old.board; G.seed = old.seed; G.start = old.start; G.fixed = old.start; G.retry = true; }
    build();
    elRes.classList.remove('on', 'lose');
    elRes.setAttribute('aria-hidden', 'true');
    boardEl.classList.remove('done');
    clearInterval(timer);
    elTime.innerHTML = fmt(0);
    paintIce();
    hintBtn.disabled = true;
    if (G.retry) say(T('same sector, same first cell. one more time, cleaner.', 'ten sam sektor, to samo pierwsze pole. jeszcze raz, czyściej.'), 'talk');
    else if (level === 'D') say(T('today’s daily. the same board as in the app. start from the marked cell.', 'dzisiejsze daily. ta sama plansza co w aplikacji. zacznij od oznaczonego pola.'), 'talk');
    else say(T('a fresh sector, ' + G.w + '×' + G.h + '. tap any cell. the first scan never hits ICE.',
      'świeży sektor, ' + G.w + '×' + G.h + '. dotknij dowolnego pola. pierwszy skan nigdy nie trafia w ICE.'), 'talk');
  }

  function build() {
    boardEl.style.setProperty('--w', G.w);
    boardEl.setAttribute('aria-label', T('Board ', 'Plansza ') + G.w + '×' + G.h + ', ' + G.M + ' ICE');
    var html = '';
    for (var i = 0; i < G.w * G.h; i++) html += '<button type="button" class="bs-cell" tabindex="-1" data-i="' + i + '"><span></span></button>';
    boardEl.innerHTML = html;
    cells = boardEl.children;
    focusI = G.fixed != null ? G.fixed : ((G.h >> 1) * G.w + (G.w >> 1));
    cells[focusI].tabIndex = 0;
    if (G.fixed != null) cells[G.fixed].classList.add('start');
    for (i = 0; i < cells.length; i++) label(i);
  }

  function label(i) {
    var x = i % G.w + 1, y = ((i / G.w) | 0) + 1, s;
    if (G.open[i]) s = G.board.count[i] ? G.board.count[i] + ' ICE' : T('clean', 'czyste');
    else if (G.flag[i]) s = T('marker', 'marker');
    else s = T('covered', 'zakryte');
    cells[i].setAttribute('aria-label', T('Row ', 'Wiersz ') + y + T(', column ', ', kolumna ') + x + ': ' + s);
  }

  function paintIce() { elIce.textContent = String(G.M - G.flags).padStart(3, '0'); }

  function startClock() {
    G.t0 = performance.now();
    clearInterval(timer);
    timer = setInterval(function () { elTime.innerHTML = fmt(performance.now() - G.t0); }, 100);
  }

  function nbs(i) { var out = [], g = G.geo; for (var k = 0; k < g.nc[i]; k++) out.push(g.nb[i * 8 + k]); return out; }

  // first scan: generate a no-guess board around it, in slices so the page never freezes
  function generate(i, then) {
    G.phase = 'gen';
    if (!G.seed) G.seed = (Math.random() * 4294967296) >>> 0;
    var job = new NoGuessJob(G.geo, G.M, i, G.seed);
    var shown = false;
    (function slice() {
      var r = job.step(14);
      if (r) { G.board = r; G.start = i; then(); return; }
      if (!shown) { shown = true; say(T('generating a sector that needs no guessing…', 'generuję sektor, który nie wymaga zgadywania…'), 'talk'); }
      requestAnimationFrame(slice);
    })();
  }

  function scan(i) {
    if (!G || G.phase === 'won' || G.phase === 'lost' || G.phase === 'gen') return;
    if (G.phase === 'ready') {
      if (G.fixed != null && i !== G.fixed) {
        say(T('the daily starts from the marked cell. everyone starts the same way.', 'daily zaczyna się od oznaczonego pola. wszyscy startują tak samo.'), 'talk');
        cells[G.fixed].focus();
        return;
      }
      var go = function () {
        G.phase = 'play';
        if (G.fixed != null) cells[G.fixed].classList.remove('start');
        hintBtn.disabled = false;
        startClock();
        act('scan');
        reveal(i);
        if (G.phase === 'play') say(T('every number counts the ICE touching it. nothing more, nothing less.', 'każda liczba mówi, ile ICE dotyka pola. nic więcej, nic mniej.'), 'talk');
      };
      if (G.board) go(); else generate(i, go);
      return;
    }
    clearHint();
    if (G.open[i]) { chord(i); return; }
    if (G.flag[i]) return;
    act('scan');
    reveal(i);
  }

  function act(kind) { G.clicks++; G.moves.push(performance.now()); }

  function reveal(i) {
    var b = G.board;
    if (b.mine[i]) { lose(i); return; }
    var q = [i], dist = {}, k;
    dist[i] = 0;
    while (q.length) {
      var c = q.shift();
      if (G.open[c] || G.flag[c]) continue;
      G.open[c] = 1; G.opened++;
      var el = cells[c], n = b.count[c];
      el.style.setProperty('--d', Math.min(dist[c] * 26, 520) + 'ms');
      el.classList.add('o');
      if (n) { el.dataset.n = n; el.firstChild.textContent = n; } else el.classList.add('z');
      label(c);
      if (!n) {
        var ns = nbs(c);
        for (k = 0; k < ns.length; k++) if (!G.open[ns[k]] && !G.flag[ns[k]] && dist[ns[k]] == null) { dist[ns[k]] = dist[c] + 1; q.push(ns[k]); }
      }
    }
    if (G.opened === G.w * G.h - G.M) win();
  }

  function chord(i) {
    var n = G.board.count[i];
    if (!n) return;
    var ns = nbs(i), f = 0, cov = [], k;
    for (k = 0; k < ns.length; k++) { if (G.flag[ns[k]]) f++; else if (!G.open[ns[k]]) cov.push(ns[k]); }
    if (f !== n || !cov.length) return;
    act('chord');
    for (k = 0; k < cov.length && G.phase === 'play'; k++) if (!G.open[cov[k]]) reveal(cov[k]);
  }

  function mark(i) {
    if (!G || G.phase !== 'play' || G.open[i]) return;
    clearHint();
    G.flag[i] ^= 1;
    G.flags += G.flag[i] ? 1 : -1;
    cells[i].classList.toggle('f', !!G.flag[i]);
    act('mark');
    label(i);
    paintIce();
    if (navigator.vibrate && G.flag[i]) try { navigator.vibrate(12); } catch (e) {}
  }

  function finish() {
    G.t1 = performance.now();
    clearInterval(timer);
    elTime.innerHTML = fmt(G.t1 - G.t0);
    boardEl.classList.add('done');
    hintBtn.disabled = true;
    clearHint();
  }

  function pauses() {
    var p = 0, m = G.moves;
    for (var k = 1; k < m.length; k++) if (m[k] - m[k - 1] > 4000) p++;
    return p;
  }

  function win() {
    G.phase = 'won';
    finish();
    var b = G.board, k = 0;
    for (var i = 0; i < cells.length; i++) if (b.mine[i]) {
      cells[i].classList.remove('f'); cells[i].classList.add('ice', 'win');
      cells[i].style.setProperty('--d', (k++ * 30) + 'ms');
    }
    G.flags = G.M; paintIce();
    var ms = G.t1 - G.t0, sec = Math.max(ms / 1000, 0.1);
    result(false, [
      [T('Time', 'Czas'), fmtPlain(ms)], ['3BV', b.bbbv], ['3BV/s', (b.bbbv / sec).toFixed(2)],
      [T('Clicks', 'Kliknięcia'), G.clicks], [T('Effic.', 'Efekt.'), Math.round(b.bbbv / G.clicks * 100) + '%'], [T('Pauses > 4 s', 'Przerwy > 4 s'), pauses()]
    ]);
    say(G.hinted
      ? T('clean, with a hint. in the app that one stays out of the rankings.', 'czysto, z podpowiedzią. w aplikacji taka partia nie trafia do rankingów.')
      : T('sector clean. no guessing, no losses. that is how it is done.', 'sektor czysty. bez zgadywania, bez strat. tak to się robi.'), 'happy');
    if (navigator.vibrate) try { navigator.vibrate([20, 40, 20]); } catch (e) {}
  }

  function lose(hit) {
    G.phase = 'lost';
    finish();
    var b = G.board, hx = hit % G.w, hy = (hit / G.w) | 0;
    for (var i = 0; i < cells.length; i++) {
      var d = Math.max(Math.abs(i % G.w - hx), Math.abs(((i / G.w) | 0) - hy)) * 40;
      if (b.mine[i] && !G.flag[i]) { cells[i].classList.add('ice'); cells[i].style.setProperty('--d', d + 'ms'); }
      if (!b.mine[i] && G.flag[i]) cells[i].classList.add('bad');
    }
    cells[hit].classList.add('boom');
    cells[hit].style.setProperty('--d', '0ms');
    var safe = G.w * G.h - G.M;
    result(true, [
      [T('Time', 'Czas'), fmtPlain(G.t1 - G.t0)], [T('Cleared', 'Odkryte'), Math.floor(G.opened / safe * 100) + '%'], [T('Clicks', 'Kliknięcia'), G.clicks]
    ]);
    say(T('trace complete. on a no-guess board a safe move was there. next time ask for a hint.',
      'trace complete. na planszy no-guess był pewny ruch. następnym razem poproś o podpowiedź.'), 'shock');
    if (navigator.vibrate) try { navigator.vibrate(80); } catch (e) {}
  }

  function code() {
    var id = level === 'D' ? 'D' + dayNo : level;
    return id + '-' + G.seed.toString(36).toUpperCase() + '-' + G.start;
  }

  function result(lost, stats) {
    elRes.classList.toggle('lose', lost);
    var tag = G.hinted ? 'UNRANKED' : (G.board.noGuess ? 'NO-GUESS' : 'SECTOR');
    var html = '<div class="rt"><span>' + (lost ? 'BAD SECTOR FOUND' : 'SECTOR CLEAN') + ' · ' + code() + '</span><b>' + tag + '</b></div>' +
      '<div class="big">' + (lost ? 'Trace<br>complete' : 'Access<br>granted') + '</div><dl>';
    stats.forEach(function (s) { html += '<div><dt>' + s[0] + '</dt><dd>' + s[1] + '</dd></div>'; });
    html += '</dl><div class="row"><span class="bs-code">' + T('Sector code', 'Kod sektora') + ' <b>' + code() + '</b>' +
      '<button type="button" data-act="copy">' + T('Copy', 'Kopiuj') + '</button></span>' +
      '<span style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn--ghost" data-act="retry"><span class="t">' + T('Retry', 'Ponów') + '</span></button>' +
      '<button type="button" class="btn btn--solid" data-act="new"><span class="t">' + T('New sector', 'Nowy sektor') + '</span><span class="g" aria-hidden="true"><i>&#8594;</i></span></button></span></div>';
    elRes.innerHTML = html;
    elRes.classList.add('on');
    elRes.setAttribute('aria-hidden', 'false');
  }

  /* --- hint: the app's "safe, because..." rules, in the same order --- */
  function clearHint() {
    for (var i = 0; i < cells.length; i++) cells[i].classList.remove('hint', 'hint-src');
  }
  function showHint(target, srcs, text) {
    clearHint();
    cells[target].classList.add('hint');
    srcs.forEach(function (s) { cells[s].classList.add('hint-src'); });
    setFocus(target, false);
    cells[target].focus({ preventScroll: true });
    say(text, 'talk');
  }
  function hint() {
    if (!G || G.phase !== 'play') return;
    var b = G.board, N = G.w * G.h, i, k;
    G.hinted = true;
    // a wrong marker breaks every rule after it
    for (i = 0; i < N; i++) if (G.flag[i] && !b.mine[i]) {
      showHint(i, [], T('this marker sits on a clean cell. take it off first.', 'ten marker stoi na czystym polu. najpierw go zdejmij.'));
      return;
    }
    var cons = [];
    for (i = 0; i < N; i++) {
      if (!G.open[i] || !b.count[i]) continue;
      var ns = nbs(i), unk = [], f = 0;
      for (k = 0; k < ns.length; k++) { if (G.flag[ns[k]]) f++; else if (!G.open[ns[k]]) unk.push(ns[k]); }
      if (!unk.length) continue;
      var need = b.count[i] - f;
      if (need === 0) {
        showHint(unk[0], [i], T('this ' + b.count[i] + ' already has all its ICE around it. the rest of its neighbours are clean.',
          'ta ' + b.count[i] + ' ma już wokół siebie całe swoje ICE. reszta jej sąsiadów jest czysta.'));
        return;
      }
      if (need === unk.length) {
        showHint(unk[0], [i], T('this ' + b.count[i] + ' still needs ' + need + ' ICE and has exactly ' + need + ' covered ' + (need === 1 ? 'neighbour' : 'neighbours') + '. mark ' + (need === 1 ? 'it' : 'them all') + '.',
          'tej ' + b.count[i] + ' brakuje jeszcze ' + need + ' ICE, a ma dokładnie tyle zakrytych sąsiadów. oznacz ' + (need === 1 ? 'go' : 'je wszystkie') + '.'));
        return;
      }
      cons.push({ i: i, unk: unk, need: need });
    }
    // pairs: when the ICE of one number has to sit in the cells it shares with another
    for (var a = 0; a < cons.length; a++) for (var c = 0; c < cons.length; c++) {
      if (a === c) continue;
      var A = cons[a], B = cons[c], inA = {}, shared = 0;
      A.unk.forEach(function (u) { inA[u] = 1; });
      B.unk.forEach(function (u) { if (inA[u]) shared++; });
      if (!shared) continue;
      var aOnly = A.unk.length - shared, bOnly = B.unk.length - shared;
      if (A.need - aOnly === B.need && bOnly) {
        var safeCell = B.unk.filter(function (u) { return !inA[u]; })[0];
        showHint(safeCell, [A.i, B.i], T('compare the two marked numbers: all the ICE of one sits in the cells they share, so the other one’s extra cell is clean.',
          'porównaj dwie zaznaczone liczby: całe ICE jednej leży we wspólnych polach, więc dodatkowe pole drugiej jest czyste.'));
        return;
      }
      if (A.need - aOnly === B.need && aOnly) {
        var inB = {}; B.unk.forEach(function (u) { inB[u] = 1; });
        var iceCell = A.unk.filter(function (u) { return !inB[u]; })[0];
        showHint(iceCell, [A.i, B.i], T('compare the two marked numbers: the shared cells can’t hold all the ICE of the bigger one. its extra cell is ICE.',
          'porównaj dwie zaznaczone liczby: wspólne pola nie pomieszczą całego ICE większej. jej dodatkowe pole to ICE.'));
        return;
      }
    }
    // global count
    var unknown = 0, first = -1;
    for (i = 0; i < N; i++) if (!G.open[i] && !G.flag[i]) { unknown++; if (first < 0) first = i; }
    var left = G.M - G.flags;
    if (first >= 0 && (left === 0 || left === unknown)) {
      showHint(first, [], T('count the ICE: ' + left + ' left, ' + unknown + ' covered cells. the counter decides.',
        'policz ICE: zostało ' + left + ', zakrytych pól ' + unknown + '. licznik rozstrzyga.'));
      return;
    }
    // past the three rules, the solver still knows a safe cell: point at one next to the open area
    for (i = 0; i < N; i++) if (!G.open[i] && !G.flag[i] && !b.mine[i] && nbs(i).some(function (n) { return G.open[n]; })) {
      showHint(i, [], T('this one is clean. it takes more than one rule to see it: look at the whole edge.',
        'to pole jest czyste. trzeba więcej niż jednej reguły, żeby to zobaczyć: spójrz na całą krawędź.'));
      return;
    }
  }

  /* --- input: tap scans, hold or right-click marks, a tap on a number chords --- */
  var press = null;
  boardEl.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('.bs-cell');
    if (!el || e.button > 0) return;
    var i = +el.dataset.i;
    press = { i: i, fired: false, x: e.clientX, y: e.clientY };
    press.t = setTimeout(function () {
      if (!press || press.i !== i) return;
      press.fired = true;
      if (mode === 'scan') mark(i); else scan(i);
    }, 320);
  });
  // up and leave keep the press for the click that follows; a drag or a cancel drops it
  function cancelPress(e) {
    if (!press) return;
    if (e.type === 'pointermove' && Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) < 10) return;
    clearTimeout(press.t);
    if (e.type === 'pointermove' || e.type === 'pointercancel') press = null;
  }
  boardEl.addEventListener('pointermove', cancelPress);
  boardEl.addEventListener('pointerup', cancelPress);
  boardEl.addEventListener('pointercancel', cancelPress);
  boardEl.addEventListener('pointerleave', cancelPress);
  boardEl.addEventListener('click', function (e) {
    var el = e.target.closest('.bs-cell');
    if (!el) return;
    var i = +el.dataset.i;
    if (press && press.fired) { press = null; return; }
    press = null;
    setFocus(i, false);
    if (mode === 'scan') scan(i); else if (G.open[i]) scan(i); else mark(i);
  });
  boardEl.addEventListener('contextmenu', function (e) {
    var el = e.target.closest('.bs-cell');
    if (!el) return;
    e.preventDefault();
    if (press) { clearTimeout(press.t); if (press.fired) { press = null; return; } press = null; }
    mark(+el.dataset.i);
  });
  function setFocus(i, move) {
    cells[focusI].tabIndex = -1;
    focusI = i;
    cells[i].tabIndex = 0;
    if (move) cells[i].focus();
  }
  boardEl.addEventListener('keydown', function (e) {
    var el = e.target.closest('.bs-cell');
    if (!el) return;
    var i = +el.dataset.i, x = i % G.w, y = (i / G.w) | 0;
    var k = e.key;
    if (k === 'ArrowLeft' && x > 0) i--;
    else if (k === 'ArrowRight' && x < G.w - 1) i++;
    else if (k === 'ArrowUp' && y > 0) i -= G.w;
    else if (k === 'ArrowDown' && y < G.h - 1) i += G.w;
    else if (k === 'f' || k === 'F' || k === 'm' || k === 'M') { e.preventDefault(); mark(i); return; }
    else if (k === 'h' || k === 'H') { e.preventDefault(); hint(); return; }
    else return;
    e.preventDefault();
    setFocus(i, true);
  });

  modeBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.getAttribute('data-mode');
      modeBtns.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
    });
  });
  levelBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      level = b.getAttribute('data-level');
      levelBtns.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      newGame(false);
    });
  });
  hintBtn.addEventListener('click', hint);
  newBtn.addEventListener('click', function () { newGame(false); });
  elRes.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'new') newGame(false);
    else if (a === 'retry') newGame(true);
    else if (a === 'copy') {
      var done = function () { b.textContent = T('Copied', 'Skopiowano'); };
      if (navigator.clipboard) navigator.clipboard.writeText(code()).then(done, function () {}); else done();
    }
  });

  catCv.width = 16; catCv.height = 14;
  drawCat(catCv, CAT.sit);
  newGame(false);
})();
