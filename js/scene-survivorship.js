// scene-survivorship.js: interactive canvas for the IC/IR survivorship stage.
// One centered disc. The 503 survivors form the inner core; pressing the toggle
// blooms the 342 companies that left outward as a ring, so the circle visibly
// grows (more dots) and an illustrative "measured return" bar drops from its
// inflated survivors-only value to the honest full-universe value.

(function () {
  "use strict";

  var root = document.getElementById("sviz");
  if (!root) return;
  var cv = root.querySelector(".sviz__canvas");
  var g = cv.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var KEEP = 503, LEFT = 342;          // survivors (inner) and companies that left (outer)
  var kEl = document.getElementById("sviz-k");
  var lEl = document.getElementById("sviz-l");
  var leftLegend = document.getElementById("sviz-left-legend");
  var btn = root.querySelector(".sviz__toggle");
  var fill = document.getElementById("sviz-fill");
  var valEl = document.getElementById("sviz-val");
  var noteEl = document.getElementById("sviz-note");

  // survivors-only (default) is the flattering, biased view; full is honest
  var SURV = { val: "10.4%", width: "74%", note: "This is the dataset most people use: only the survivors. The backtest looks great, and that is exactly the problem." };
  var FULL = { val: "6.5%", width: "46%", note: "Add back the companies that left and the circle grows. The same backtest drops to its honest number." };

  // ---- dot field: group 0 = survivors (inner), group 1 = left (outer ring) ----
  var W = 0, H = 0, dpr = 1;
  var dots = [];
  function buildDots() {
    var thin = cv.offsetWidth < 560 ? 0.5 : 1;
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

    var cx = W * 0.5, cy = H * 0.5;
    var Rfull = Math.min(W * 0.46, H * 0.46);
    var c = Rfull / Math.sqrt(dots.length || 1);   // full disc holds every dot
    var gold = Math.PI * (3 - Math.sqrt(5));
    dots.forEach(function (d, i) {                  // single phyllotaxis, inner->outer
      var rr = c * Math.sqrt(i + 0.5), a = i * gold;
      d.tx = cx + rr * Math.cos(a);
      d.ty = cy + rr * Math.sin(a);
      d.r = d.group === 0 ? 1.7 : 1.5;
      d.cx = cx; d.cy = cy;
      if (d.sx === undefined) { d.sx = Math.random() * W; d.sy = Math.random() * H; }
      if (introP >= 1 && d.group === 0) { d.x = d.tx; d.y = d.ty; }
    });
  }

  // ---- animated state ----
  var introP = 0, introStart = 0;      // survivors fly-in
  var appearP = 0, appearTarget = 0;   // failures bloom (0 = hidden, 1 = full ring)
  function smoothstep(x) { return x * x * (3 - 2 * x); }

  function draw() {
    g.clearRect(0, 0, W, H);
    var fin = smoothstep(introP);
    // survivors: fly in from scattered start
    g.globalAlpha = 0.92 * fin;
    g.fillStyle = "rgba(226,186,74,1)";
    drawGroup(0, function (d) { return [d.sx + (d.tx - d.sx) * fin, d.sy + (d.ty - d.sy) * fin]; });
    // failures: bloom outward from the centre as the ring appears
    var ap = smoothstep(appearP);
    if (ap > 0.003) {
      g.globalAlpha = 0.5 * ap;
      g.fillStyle = "rgba(168,172,182,1)";
      drawGroup(1, function (d) { return [d.cx + (d.tx - d.cx) * ap, d.cy + (d.ty - d.cy) * ap]; });
    }
    g.globalAlpha = 1;
  }
  function drawGroup(group, posFn) {
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      if (d.group !== group) continue;
      var p = posFn(d);
      g.beginPath(); g.arc(p[0], p[1], d.r, 0, 6.2832); g.fill();
    }
  }

  function updateCounts() {
    if (kEl) kEl.textContent = Math.round(KEEP * smoothstep(introP));
    if (lEl) lEl.textContent = Math.round(LEFT * smoothstep(introP));
  }

  // ---- loop (runs only while animating) ----
  var running = false, raf = 0, lastTs = 0;
  function step(dt) {
    var active = false;
    if (introP < 1) { introP = Math.min(1, (performance.now() - introStart) / 1300); active = true; }
    if (Math.abs(appearP - appearTarget) > 0.002) {
      appearP += (appearTarget - appearP) * (1 - Math.exp(-dt / 0.16));
      active = true;
    } else { appearP = appearTarget; }
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
    if (reduce) { introP = 1; appearP = appearTarget; updateCounts(); layout(); draw(); return; }
    if (!running) { running = true; lastTs = 0; raf = requestAnimationFrame(loop); }
  }

  // ---- toggle ----
  var full = false;
  function applyMode() {
    var m = full ? FULL : SURV;
    appearTarget = full ? 1 : 0;
    if (btn) { btn.setAttribute("aria-pressed", full ? "true" : "false"); btn.textContent = "Showing: " + (full ? "full universe" : "survivors only"); }
    if (leftLegend) leftLegend.classList.toggle("is-dropped", !full);
    if (fill) { fill.style.width = m.width; fill.classList.toggle("sviz__fill--accent", !full); }
    if (valEl) valEl.textContent = m.val;
    if (noteEl) noteEl.textContent = m.note;
    kick();
  }
  if (btn) btn.addEventListener("click", function () { full = !full; applyMode(); });

  // ---- init ----
  buildDots();
  layout();
  applyMode();               // survivors-only baseline

  var resizeRaf = 0;
  window.addEventListener("resize", function () {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(function () { resizeRaf = 0; buildDots(); layout(); draw(); });
  });

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
