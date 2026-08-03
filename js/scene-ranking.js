// scene-ranking.js: interactive rank-IC slopegraph for the IC/IR scoring stage.
// Left column = companies ordered by the signal; right column = ordered by the
// return that actually followed. Lines connect each company; a slider morphs how
// predictive the signal is, and the rank IC updates live. Vanilla, DPR-aware.

(function () {
  "use strict";

  var root = document.getElementById("rviz");
  if (!root) return;
  var cv = root.querySelector(".rviz__canvas");
  var g = cv.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var icEl = document.getElementById("rviz-ic");
  var slider = document.getElementById("rviz-strength");
  var newBtn = document.getElementById("rviz-new");

  var N = 12;
  var comp = [];        // {zf, zn, ret, leftRank, rightRank, curY, tgtY, leftY}

  function gauss() {    // Box-Muller
    var u = Math.random() || 1e-9, v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function newSample() {
    comp = [];
    for (var i = 0; i < N; i++) comp.push({ zf: gauss(), zn: gauss() });
  }

  function ranks(vals) {           // ordinal ranks, 0 = largest
    var idx = vals.map(function (v, i) { return i; });
    idx.sort(function (a, b) { return vals[b] - vals[a]; });
    var r = new Array(vals.length);
    idx.forEach(function (id, pos) { r[id] = pos; });
    return r;
  }
  function spearman(a, b) {
    var ra = ranks(a), rb = ranks(b), n = a.length;
    var ma = (n - 1) / 2, sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) { var dx = ra[i] - ma, dy = rb[i] - ma; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxy / Math.sqrt(sxx * syy || 1);
  }

  // strength in [0,1] -> returns correlated with the factor by ~strength
  function recompute(strength) {
    var s = strength, k = Math.sqrt(Math.max(0, 1 - s * s));
    comp.forEach(function (c) { c.ret = s * c.zf + k * c.zn; });
    var rf = ranks(comp.map(function (c) { return c.zf; }));
    var rr = ranks(comp.map(function (c) { return c.ret; }));
    comp.forEach(function (c, i) { c.leftRank = rf[i]; c.rightRank = rr[i]; });
    return spearman(comp.map(function (c) { return c.zf; }), comp.map(function (c) { return c.ret; }));
  }

  // ---- layout ----
  var W = 0, H = 0, dpr = 1, xL = 0, xR = 0, top = 28, gap = 0;
  function layout() {
    W = cv.offsetWidth; H = cv.offsetHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    xL = W * 0.17; xR = W * 0.83; top = 26; gap = (H - top * 2) / (N - 1);
    comp.forEach(function (c) {
      c.leftY = top + c.leftRank * gap;
      c.tgtY = top + c.rightRank * gap;
      if (c.curY === undefined) c.curY = c.leftY;
    });
  }
  function yLeft(c) { return top + c.leftRank * gap; }

  // ---- draw ----
  function draw() {
    g.clearRect(0, 0, W, H);
    g.lineWidth = 1.3;
    // connecting lines (dim = ranks disagree, bright = agree)
    comp.forEach(function (c) {
      var diff = Math.abs(c.leftRank - c.rightRank) / (N - 1);
      var a = 0.12 + 0.72 * (1 - diff);
      g.strokeStyle = "rgba(226,186,74," + a.toFixed(3) + ")";
      g.beginPath(); g.moveTo(xL, yLeft(c)); g.lineTo(xR, c.curY); g.stroke();
    });
    // nodes
    g.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
    g.textBaseline = "middle";
    comp.forEach(function (c, i) {
      node(xL, yLeft(c)); node(xR, c.curY);
      g.fillStyle = "rgba(240,240,242,0.68)";
      g.textAlign = "right"; g.fillText(String.fromCharCode(65 + i), xL - 14, yLeft(c));
      g.textAlign = "left"; g.fillText(String.fromCharCode(65 + i), xR + 14, c.curY);
    });
  }
  function node(x, y) {
    g.beginPath(); g.arc(x, y, 6, 0, 6.2832);
    g.fillStyle = "rgba(226,186,74,0.16)"; g.fill();
    g.lineWidth = 1; g.strokeStyle = "rgba(226,186,74,0.75)"; g.stroke();
  }

  // ---- loop (only while right nodes are settling) ----
  var running = false, raf = 0, lastTs = 0;
  function step(dt) {
    var active = false, k = 1 - Math.exp(-dt / 0.12);
    comp.forEach(function (c) {
      if (Math.abs(c.curY - c.tgtY) > 0.4) { c.curY += (c.tgtY - c.curY) * k; active = true; }
      else c.curY = c.tgtY;
    });
    return active;
  }
  function loop(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
    var active = step(dt);
    draw();
    if (active) raf = requestAnimationFrame(loop); else running = false;
  }
  function kick() {
    if (reduce) { comp.forEach(function (c) { c.curY = c.tgtY; }); draw(); return; }
    if (!running) { running = true; lastTs = 0; raf = requestAnimationFrame(loop); }
  }

  function curStrength() { return (slider ? +slider.value : 72) / 100 * 0.96; }
  function fmtIC(ic) { return (ic >= 0 ? " " : "") + ic.toFixed(2); }

  // draw a fresh sample whose IC at the current strength reads clearly positive
  function niceSample() {
    var tries = 0, ic;
    do { newSample(); ic = recompute(curStrength()); tries++; }
    while ((ic < 0.55 || ic > 0.85) && tries < 80);
    return ic;
  }

  function apply(animateFromSignal) {
    var ic = recompute(curStrength());
    layout();
    if (icEl) icEl.textContent = fmtIC(ic);
    if (animateFromSignal && !reduce) comp.forEach(function (c) { c.curY = c.leftY; }); // start aligned, then reorder
    kick();
  }

  // ---- controls ----
  if (slider) slider.addEventListener("input", function () { apply(false); });
  if (newBtn) newBtn.addEventListener("click", function () { newSample(); apply(true); });

  // ---- init (seed a clean-looking default; settle in place) ----
  var ic0 = niceSample();
  layout();
  comp.forEach(function (c) { c.curY = c.tgtY; });
  if (icEl) icEl.textContent = fmtIC(ic0);
  draw();

  var rz = 0;
  window.addEventListener("resize", function () {
    if (rz) return;
    rz = requestAnimationFrame(function () { rz = 0; layout(); draw(); });
  });

  // reveal: start with right column aligned to the signal, then let reality reorder it
  if (reduce) {
    comp.forEach(function (c) { c.curY = c.tgtY; }); draw();
  } else if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { comp.forEach(function (c) { c.curY = c.leftY; }); kick(); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(root);
  } else { kick(); }
})();
