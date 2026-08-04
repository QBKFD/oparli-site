// scene-terminal.js: "the agents reason over a live chart" scene.
// Candlesticks animate in, the Scanner catches a moment at a key level, then the
// Technical / Visual / Sentiment analysts reason (indicators, the candle, a news
// headline) and the Meta agent turns the votes into a decision. Bull/Bear toggle
// + replay. Vanilla canvas + a few HTML cards on one shared timeline.

(function () {
  "use strict";

  var root = document.getElementById("tviz");
  if (!root) return;
  var cv = root.querySelector(".tviz__canvas");
  var g = cv.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var cards = {};
  root.querySelectorAll(".tcard").forEach(function (el) { cards[el.getAttribute("data-step")] = el; });
  var replayBtn = document.getElementById("tviz-replay");
  var segBtns = root.querySelectorAll(".tviz__seg button");

  var ACCENT = "226,186,74", SELL = "150,175,203", GREY = "139,140,147", LINE = "168,172,182";

  // ---- scenarios (content for the cards) ----
  var SCEN = {
    bull: {
      dir: 1,
      scan: "Price sweeps yesterday's Asia-session low on 2.3x average volume.",
      tech: { v: "buy", t: "9-EMA crosses above the 21-SMA as the MACD histogram turns positive." },
      vis: { v: "buy", t: "Long lower wick through the level: displacement, not drift, so the sweep reads as a rejection." },
      sent: { v: "buy", t: "Headline: US CPI cools; the gold bid firms into the print." },
      meta: { v: "buy", t: "Consensus BUY, 74% confidence, 2 of 3 analysts above the governance threshold." }
    },
    bear: {
      dir: -1,
      scan: "Price stalls at yesterday's Asia-session high as volume thins out.",
      tech: { v: "sell", t: "9-EMA crosses below the 21-SMA as the MACD histogram rolls negative." },
      vis: { v: "sell", t: "Long upper wick through the level: a liquidity sweep, not continuation." },
      sent: { v: "sell", t: "Headline: the Fed holds a hawkish tone; the dollar firms and gold fades." },
      meta: { v: "sell", t: "Consensus SELL, 68% confidence, 2 of 3 analysts above the governance threshold." }
    }
  };
  var mode = "bull";

  // ---- candle data ----
  var N = 22, revIdx = 14, candles = [], level = 0, maArr = [];
  function build(dir) {
    var base = 2000, amp = 24, closes = [], i;
    var p = revIdx / (N - 1);
    for (i = 0; i < N; i++) {
      var t = i / (N - 1), s;
      if (t <= p) s = -amp * (t / p); else s = -amp + (amp * 0.72) * ((t - p) / (1 - p));
      var noise = Math.sin(i * 1.7) * 2.1 + Math.sin(i * 0.55) * 1.4;
      closes.push(base + dir * s + noise);
    }
    candles = [];
    for (i = 0; i < N; i++) {
      var o = i ? closes[i - 1] : closes[0], c = closes[i];
      var hi = Math.max(o, c), lo = Math.min(o, c);
      var w = 1.6 + Math.abs(Math.sin(i * 2.1)) * 2.6;
      var h = hi + w, l = lo - w;
      if (i === revIdx) { if (dir > 0) l = lo - 13; else h = hi + 13; }
      candles.push({ o: o, h: h, l: l, c: c });
    }
    level = dir > 0 ? candles[revIdx].l + 2 : candles[revIdx].h - 2;
    maArr = [];
    for (i = 0; i < N; i++) { var a = 0, n = 0; for (var j = Math.max(0, i - 4); j <= i; j++) { a += closes[j]; n++; } maArr.push(a / n); }
  }

  // ---- layout / scale ----
  var W = 0, H = 0, dpr = 1, padL = 10, padR = 12, padT = 14, padB = 14, pMin = 0, pMax = 0;
  function layout() {
    W = cv.offsetWidth; H = cv.offsetHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    pMin = Infinity; pMax = -Infinity;
    candles.forEach(function (k) { pMin = Math.min(pMin, k.l); pMax = Math.max(pMax, k.h); });
    var pad = (pMax - pMin) * 0.08; pMin -= pad; pMax += pad;
  }
  function cx(i) { return padL + (W - padL - padR) * (i + 0.5) / N; }
  function cy(price) { return padT + (H - padT - padB) * (1 - (price - pMin) / (pMax - pMin)); }
  function cw() { return (W - padL - padR) / N * 0.62; }

  // ---- timeline ----
  var T = 0, running = false, raf = 0, lastTs = 0, shown = {};
  var STEP = { scan: 1.7, tech: 2.5, vis: 3.3, sent: 4.1, meta: 5.0 }, ENDT = 6.2;

  function draw() {
    g.clearRect(0, 0, W, H);
    var col = SCEN[mode].dir > 0 ? ACCENT : SELL;

    // level line (fades in after candles)
    var lvlA = Math.min(1, Math.max(0, (T - 1.2) / 0.6));
    if (lvlA > 0) {
      var thick = T > STEP.vis ? 1.6 : 1;
      g.setLineDash([5, 5]); g.lineWidth = thick;
      g.strokeStyle = "rgba(" + (T > STEP.vis ? col : GREY) + "," + (0.4 * lvlA) + ")";
      g.beginPath(); g.moveTo(padL, cy(level)); g.lineTo(W - padR, cy(level)); g.stroke(); g.setLineDash([]);
    }

    // candles (appear left to right over ~1.4s)
    var appear = Math.min(N, (T / 1.4) * N);
    for (var i = 0; i < candles.length; i++) {
      var f = Math.min(1, Math.max(0, appear - i));
      if (f <= 0) break;
      drawCandle(candles[i], i, f);
    }

    // MA line (draws in at tech step)
    if (T > STEP.tech) {
      var frac = Math.min(1, (T - STEP.tech) / 0.7);
      g.strokeStyle = "rgba(" + LINE + ",0.6)"; g.lineWidth = 1.4; g.beginPath();
      var last = Math.floor(frac * (N - 1));
      for (var m = 0; m <= last; m++) { var x = cx(m), y = cy(maArr[m]); m ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }

    // scanner ring at the reversal candle (pulsing)
    if (T > STEP.scan) {
      var rc = candles[revIdx], rx = cx(revIdx), ry = cy(SCEN[mode].dir > 0 ? rc.l : rc.h);
      var pr = 8 + 4 * (0.5 + 0.5 * Math.sin(T * 5));
      g.strokeStyle = "rgba(" + GREY + ",0.8)"; g.lineWidth = 1.4;
      g.beginPath(); g.arc(rx, ry, pr, 0, 6.2832); g.stroke();
    }

    // entry marker at meta
    if (T > STEP.meta) {
      var lc = candles[N - 1], lx = cx(N - 1), ly = cy(lc.c), d = SCEN[mode].dir;
      g.fillStyle = "rgba(" + col + ",0.95)"; var s = 6;
      g.beginPath();
      if (d > 0) { g.moveTo(lx + 12, ly + s + 6); g.lineTo(lx + 12 + s, ly + s * 2 + 6); g.lineTo(lx + 12 - s, ly + s * 2 + 6); }
      else { g.moveTo(lx + 12, ly - s - 6); g.lineTo(lx + 12 + s, ly - s * 2 - 6); g.lineTo(lx + 12 - s, ly - s * 2 - 6); }
      g.closePath(); g.fill();
    }
  }
  function drawCandle(k, i, f) {
    var x = cx(i), w = cw(), up = k.c >= k.o;
    var col = up ? ACCENT : GREY;
    g.globalAlpha = f;
    g.strokeStyle = "rgba(" + col + ",0.75)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, cy(k.h)); g.lineTo(x, cy(k.l)); g.stroke();
    var yO = cy(k.o), yC = cy(k.c), top = Math.min(yO, yC), hgt = Math.max(1.5, Math.abs(yO - yC));
    if (up) { g.fillStyle = "rgba(" + col + ",0.85)"; g.fillRect(x - w / 2, top, w, hgt); }
    else { g.fillStyle = "rgba(19,19,22,1)"; g.fillRect(x - w / 2, top, w, hgt); g.strokeRect(x - w / 2, top, w, hgt); }
    g.globalAlpha = 1;
  }

  // ---- card content + reveal ----
  function fillCards() {
    var s = SCEN[mode];
    setCard("scan", s.scan, null);
    setCard("tech", s.tech.t, s.tech.v);
    setCard("vis", s.vis.t, s.vis.v);
    setCard("sent", s.sent.t, s.sent.v);
    setCard("meta", s.meta.t, s.meta.v);
  }
  function setCard(step, text, vote) {
    var el = cards[step]; if (!el) return;
    el.querySelector(".tcard__text").textContent = text;
    var b = el.querySelector(".tcard__badge");
    if (b) {
      b.className = "tcard__badge" + (vote === "buy" ? " tcard__badge--buy" : vote === "sell" ? " tcard__badge--sell" : "");
      b.textContent = vote ? vote.toUpperCase() : "scan";
    }
  }
  function hideCards() { for (var k in cards) cards[k].classList.remove("is-on"); shown = {}; }
  function revealCheck() {
    for (var step in STEP) { if (!shown[step] && T >= STEP[step]) { shown[step] = 1; if (cards[step]) cards[step].classList.add("is-on"); } }
  }

  // ---- loop ----
  function loop(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
    T += dt;
    revealCheck();
    draw();
    if (T < ENDT) raf = requestAnimationFrame(loop); else running = false;
  }
  function play() {
    if (reduce) { T = ENDT; draw(); for (var k in cards) cards[k].classList.add("is-on"); return; }
    T = 0; hideCards(); running = true; lastTs = 0; raf = requestAnimationFrame(loop);
  }
  function rebuild(newMode) {
    mode = newMode; build(SCEN[mode].dir); layout(); fillCards(); play();
  }

  // ---- controls ----
  segBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.classList.contains("is-active")) return;
      segBtns.forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      rebuild(btn.getAttribute("data-dir"));
    });
  });
  if (replayBtn) replayBtn.addEventListener("click", play);

  // ---- init ----
  build(SCEN[mode].dir); layout(); fillCards();
  var rz = 0; window.addEventListener("resize", function () { if (rz) return; rz = requestAnimationFrame(function () { rz = 0; layout(); draw(); }); });

  if (reduce) { T = ENDT; draw(); for (var k in cards) cards[k].classList.add("is-on"); }
  else if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { play(); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(root);
  } else play();
})();
