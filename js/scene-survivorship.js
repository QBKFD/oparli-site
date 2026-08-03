// scene-survivorship.js: interactive canvas for the IC/IR survivorship stage.
// 845 dots split into 503 survivors + 342 that left the index; a toggle fades
// the failures out and inflates an illustrative "measured return" bar to show
// how survivorship bias flatters a backtest. Vanilla, DPR-aware, reduced-motion.

(function () {
  "use strict";

  var root = document.getElementById("sviz");
  if (!root) return;
  var cv = root.querySelector(".sviz__canvas");
  var g = cv.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var KEEP = 503, LEFT = 342;          // real counts (from the reconstructed universe)
  var kEl = document.getElementById("sviz-k");
  var lEl = document.getElementById("sviz-l");
  var leftLegend = document.getElementById("sviz-left-legend");
  var btn = root.querySelector(".sviz__toggle");
  var fill = document.getElementById("sviz-fill");
  var valEl = document.getElementById("sviz-val");
  var noteEl = document.getElementById("sviz-note");

  // illustrative backtest numbers for the two modes
  var FULL = { val: "6.5%", width: "46%", note: "The full universe includes the companies that failed. This is the honest measurement." };
  var SURV = { val: "10.4%", width: "74%", note: "Survivors only: the same backtest looks far better, because the companies you deleted were the losers." };

  // ---- dot field ----
  var W = 0, H = 0, dpr = 1;
  var dots = [];
  function buildDots() {
    var thin = cv.offsetWidth < 560 ? 0.5 : 1;  // fewer dots on phones (perf)
    var nk = Math.round(KEEP * thin), nl = Math.round(LEFT * thin);
    dots = [];
    var i;
    for (i = 0; i < nk; i++) dots.push({ group: 0 });
    for (i = 0; i < nl; i++) dots.push({ group: 1 });
  }

  function layout() {
    W = cv.offsetWidth; H = cv.offsetHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    var cxK = W * 0.30, cxL = W * 0.72, cy = H * 0.5;
    var Rk = Math.min(W * 0.25, H * 0.46);
    var Rl = Rk * Math.sqrt(LEFT / KEEP);      // area proportional to count
    var nk = 0, nl = 0;
    dots.forEach(function (d) { d.group === 0 ? nk++ : nl++; });
    var ck = Rk / Math.sqrt(nk || 1), cl = Rl / Math.sqrt(nl || 1);
    var gold = Math.PI * (3 - Math.sqrt(5));
    var ki = 0, li = 0;
    dots.forEach(function (d) {
      var idx, rr, a;
      if (d.group === 0) { idx = ki++; rr = ck * Math.sqrt(idx + 0.5); a = idx * gold; d.tx = cxK + rr * Math.cos(a); d.ty = cy + rr * Math.sin(a); d.r = 1.7; }
      else { idx = li++; rr = cl * Math.sqrt(idx + 0.5); a = idx * gold; d.tx = cxL + rr * Math.cos(a); d.ty = cy + rr * Math.sin(a); d.r = 1.5; }
      if (d.sx === undefined) { d.sx = Math.random() * W; d.sy = Math.random() * H; }
      if (introP >= 1) { d.x = d.tx; d.y = d.ty; }
    });
  }

  // ---- animated state ----
  var introP = 0, introStart = 0;
  var leftA = 0.55, leftTarget = 0.55;   // failure-group opacity
  function smoothstep(x) { return x * x * (3 - 2 * x); }

  function draw() {
    g.clearRect(0, 0, W, H);
    var fin = smoothstep(introP);
    // two passes so fillStyle/alpha are set once per group
    drawGroup(0, "rgba(226,186,74,1)", 0.92 * fin, fin);
    drawGroup(1, "rgba(168,172,182,1)", leftA * fin, fin);
    g.globalAlpha = 1;
  }
  function drawGroup(group, color, alpha, fin) {
    if (alpha <= 0.003) return;
    g.globalAlpha = alpha;
    g.fillStyle = color;
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      if (d.group !== group) continue;
      var x = d.sx + (d.tx - d.sx) * fin;
      var y = d.sy + (d.ty - d.sy) * fin;
      g.beginPath(); g.arc(x, y, d.r, 0, 6.2832); g.fill();
    }
  }

  function updateCounts() {
    var e = smoothstep(introP);
    if (kEl) kEl.textContent = Math.round(KEEP * e);
    if (lEl) lEl.textContent = Math.round(LEFT * e);
  }

  // ---- loop (runs only while something is animating) ----
  var running = false, raf = 0, lastTs = 0;
  function step(dt) {
    var active = false;
    if (introP < 1) { introP = Math.min(1, (performance.now() - introStart) / 1300); active = true; }
    if (Math.abs(leftA - leftTarget) > 0.002) {
      leftA += (leftTarget - leftA) * (1 - Math.exp(-dt / 0.14));
      active = true;
    } else { leftA = leftTarget; }
    updateCounts();
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
    if (reduce) { introP = 1; leftA = leftTarget; updateCounts(); layout(); draw(); return; }
    if (!running) { running = true; lastTs = 0; raf = requestAnimationFrame(loop); }
  }

  // ---- toggle ----
  var survivors = false;
  function applyMode() {
    var m = survivors ? SURV : FULL;
    leftTarget = survivors ? 0.06 : 0.55;
    if (btn) { btn.setAttribute("aria-pressed", survivors ? "true" : "false"); btn.textContent = "Showing: " + (survivors ? "survivors only" : "full universe"); }
    if (leftLegend) leftLegend.classList.toggle("is-dropped", survivors);
    if (fill) { fill.style.width = m.width; fill.classList.toggle("sviz__fill--accent", survivors); }
    if (valEl) valEl.textContent = m.val;
    if (noteEl) noteEl.textContent = m.note;
    kick();
  }
  if (btn) btn.addEventListener("click", function () { survivors = !survivors; applyMode(); });

  // ---- init ----
  buildDots();
  layout();
  applyMode();               // sets the full-universe baseline (bar + note)

  var resizeRaf = 0;
  window.addEventListener("resize", function () {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(function () { resizeRaf = 0; buildDots(); layout(); draw(); });
  });

  // reveal: run the split once the widget scrolls into view
  if (reduce) {
    introP = 1; updateCounts(); draw();
  } else if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { introStart = performance.now(); kick(); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(root);
  } else {
    introStart = performance.now(); kick();
  }
})();
