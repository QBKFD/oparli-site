// scene-pipeline.js: interactive system map for the trading-system page.
// Forward pipeline: Scanner -> Stage-1 gate -> analysts -> Meta (weighted vote)
// -> Risk -> Execution -> Trade Mgr. Plus the self-evolving feedback loops:
// post-trade weight updates, and a monthly evolution proposal routed through a
// human-approval gate before it can change an agent. Vanilla canvas, DPR-aware.

(function () {
  "use strict";

  var root = document.getElementById("pviz");
  if (!root) return;
  var cv = root.querySelector(".pviz__canvas");
  var g = cv.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var decEl = document.getElementById("pviz-decision");
  var runBtn = document.getElementById("pviz-run");
  var monthBtn = document.getElementById("pviz-month");
  var noteEl = document.getElementById("pviz-note");

  var ACCENT = "226,186,74", SELL = "150,175,203", GREY = "139,140,147", LINE = "168,172,182";
  function voteColor(v) { return v > 0 ? ACCENT : v < 0 ? SELL : GREY; }

  var analysts = [
    { id: "tech", label: "Technical", weight: 0.40, vote: 1 },
    { id: "vis", label: "Visual", weight: 0.35, vote: 1 },
    { id: "sent", label: "Sentiment", weight: 0.25, vote: -1 }
  ];
  var nodes = {
    scan: { label: "Scanner", nx: 0.05, ny: 0.34, r: 13, flash: 0 },
    gate1: { label: "Filter", nx: 0.17, ny: 0.34, r: 11, flash: 0, sq: 1 },
    tech: { label: "Technical", nx: 0.37, ny: 0.09, r: 14, flash: 0 },
    vis: { label: "Visual", nx: 0.37, ny: 0.34, r: 14, flash: 0 },
    sent: { label: "Sentiment", nx: 0.37, ny: 0.59, r: 14, flash: 0 },
    meta: { label: "Meta", nx: 0.58, ny: 0.34, r: 21, flash: 0 },
    risk: { label: "Risk", nx: 0.73, ny: 0.34, r: 13, flash: 0 },
    exec: { label: "Exec", nx: 0.84, ny: 0.34, r: 12, flash: 0 },
    tmgr: { label: "Trade Mgr", nx: 0.94, ny: 0.34, r: 12, flash: 0 },
    appr: { label: "Your approval", nx: 0.58, ny: 0.86, r: 13, flash: 0, sq: 1 }
  };

  function decide() {
    var score = 0, tot = 0;
    analysts.forEach(function (a) { score += a.weight * a.vote; tot += a.weight; });
    var norm = score / (tot || 1);
    var dir = Math.abs(norm) < 0.15 ? 0 : (norm > 0 ? 1 : -1);
    return { dir: dir, conf: Math.min(1, Math.abs(norm)) };
  }
  var decision = decide();

  // ---- layout ----
  var W = 0, H = 0, dpr = 1;
  function layout() {
    W = cv.offsetWidth; H = cv.offsetHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var s = Math.min(1, W / 620);
    for (var k in nodes) { var n = nodes[k]; n.x = n.nx * W; n.y = n.ny * H; n.rr = n.r * (0.82 + 0.18 * s); }
  }

  // ---- pulses ----
  var pulses = [];
  function addPulse(from, to, color, delay, onArrive, bow) {
    pulses.push({ a: nodes[from], b: nodes[to], t: 0, delay: delay || 0, dur: 0.6, color: color, onArrive: onArrive, done: false, bow: bow == null ? 0.35 : bow });
  }
  function ctrl(a, b, bow) {
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    return { x: mx, y: my + (my - H / 2) * bow };
  }
  function bez(a, c, b, t) { var u = 1 - t; return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }; }

  var ring = 0, ringTarget = 0, metaDir = 0;

  // ---- forward scan ----
  var arrived = 0;
  function runScan() {
    if (reduce) { decision = decide(); metaDir = decision.dir; ring = ringTarget = decision.conf; setDecisionText(); draw(); return; }
    pulses = []; arrived = 0; ring = 0; ringTarget = 0; metaDir = 0;
    nodes.scan.flash = 1; setDecisionText(true);
    addPulse("scan", "gate1", LINE, 0, function () {
      nodes.gate1.flash = 1;
      analysts.forEach(function (a, i) {
        addPulse("gate1", a.id, LINE, i * 0.1, function () {
          nodes[a.id].flash = 1;
          addPulse(a.id, "meta", voteColor(a.vote), 0.16, onMetaArrive);
        });
      });
    });
    kick();
  }
  function onMetaArrive() {
    arrived++; nodes.meta.flash = Math.max(nodes.meta.flash, 0.6);
    if (arrived >= analysts.length) {
      decision = decide(); metaDir = decision.dir; ringTarget = decision.conf; setDecisionText();
      if (decision.dir !== 0) addPulse("meta", "risk", voteColor(decision.dir), 0.22, function () {
        nodes.risk.flash = 1;
        if (decision.conf >= 0.22) addPulse("risk", "exec", voteColor(decision.dir), 0.12, function () {
          nodes.exec.flash = 1; addPulse("exec", "tmgr", voteColor(decision.dir), 0.1, function () { nodes.tmgr.flash = 1; });
        });
      });
    }
  }
  function retally() {
    if (reduce) { decision = decide(); metaDir = decision.dir; ring = ringTarget = decision.conf; setDecisionText(); draw(); return; }
    pulses = []; arrived = 0;
    analysts.forEach(function (a) { addPulse(a.id, "meta", voteColor(a.vote), 0, onMetaArrive); nodes[a.id].flash = 1; });
    kick();
  }

  // ---- the self-evolving month ----
  function normalizeWeights() {
    var s = 0; analysts.forEach(function (a) { a.weight = Math.max(0.1, Math.min(0.6, a.weight)); s += a.weight; });
    analysts.forEach(function (a) { a.weight /= s; });
  }
  var evoIdx = 0;
  function runMonth() {
    if (reduce) return;
    pulses = [];
    // outcome: assume the trade followed the meta signal; reward analysts who agreed
    var out = decision.dir || 1;
    nodes.tmgr.flash = 1;
    if (noteEl) noteEl.textContent = "Post-trade: the outcome flows back and every analyst's weight nudges toward whoever was right.";
    // FAST layer: outcome -> meta, nudge all weights, then a weight-update pulse to each analyst
    addPulse("tmgr", "meta", LINE, 0, function () {
      nodes.meta.flash = 1;
      analysts.forEach(function (a) { a.weight += (a.vote === out ? 0.05 : -0.03); });
      normalizeWeights(); decision = decide(); metaDir = decision.dir; ringTarget = decision.conf; setDecisionText();
      analysts.forEach(function (a, i) { addPulse("meta", a.id, LINE, 0.04 + i * 0.08, function () { nodes[a.id].flash = 1; }, -0.35); });
      // SLOW layer: one evidence-based proposal, targeting a different agent each month, via YOUR approval
      addPulse("meta", "appr", ACCENT, 0.55, function () {
        nodes.appr.flash = 1;
        if (noteEl) noteEl.textContent = "Monthly: the meta-agent proposes one evidence-backed instruction change for a chosen agent, but nothing ships until you approve it.";
        var target = analysts[evoIdx % analysts.length]; evoIdx++;
        addPulse("appr", target.id, ACCENT, 0.28, function () { nodes[target.id].flash = 1; }, -0.5);
      }, 0.45);
    }, 0.55);
    kick();
  }

  function setDecisionText(thinking) {
    if (!decEl) return;
    if (thinking) { decEl.textContent = "scanning…"; decEl.style.color = "rgb(" + GREY + ")"; return; }
    var name = decision.dir > 0 ? "BUY" : decision.dir < 0 ? "SELL" : "HOLD";
    decEl.textContent = name + (decision.dir !== 0 ? "  " + Math.round(decision.conf * 100) + "%" : "");
    decEl.style.color = "rgb(" + voteColor(decision.dir) + ")";
  }

  // ---- draw ----
  function edge(a, b, w, alpha, bow, dash) {
    var c = ctrl(a, b, bow == null ? 0.35 : bow);
    g.strokeStyle = "rgba(" + LINE + "," + alpha + ")"; g.lineWidth = w;
    if (dash) g.setLineDash([4, 5]); else g.setLineDash([]);
    g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(c.x, c.y, b.x, b.y); g.stroke();
    g.setLineDash([]);
  }
  function draw() {
    g.clearRect(0, 0, W, H);
    // feedback loops (dashed, behind)
    edge(nodes.tmgr, nodes.meta, 1, 0.22, 0.7, true);        // post-trade weights
    edge(nodes.meta, nodes.appr, 1, 0.22, 0, true);          // proposal -> approval
    analysts.forEach(function (a) { edge(nodes.appr, nodes[a.id], 1, 0.14, -0.5, true); }); // approval can reach any agent
    // forward edges
    edge(nodes.scan, nodes.gate1, 1.2, 0.3, 0.35);
    analysts.forEach(function (a) { edge(nodes.gate1, nodes[a.id], 1, 0.26, 0.35); });
    analysts.forEach(function (a) { edge(nodes[a.id], nodes.meta, 0.8 + a.weight * 3.4, 0.34, 0.35); });
    edge(nodes.meta, nodes.risk, 1.4, 0.34, 0.35);
    edge(nodes.risk, nodes.exec, 1.4, 0.34, 0.35);
    edge(nodes.exec, nodes.tmgr, 1.4, 0.34, 0.35);
    // pulses
    pulses.forEach(function (p) {
      if (p.t <= 0 || p.t >= 1) return;
      var c = ctrl(p.a, p.b, p.bow), pt = bez(p.a, c, p.b, p.t);
      g.save(); g.globalCompositeOperation = "lighter";
      var grd = g.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 7);
      grd.addColorStop(0, "rgba(" + p.color + ",0.95)"); grd.addColorStop(1, "rgba(" + p.color + ",0)");
      g.fillStyle = grd; g.beginPath(); g.arc(pt.x, pt.y, 7, 0, 6.2832); g.fill(); g.restore();
    });
    // meta ring
    var m = nodes.meta;
    g.lineWidth = 3; g.strokeStyle = "rgba(" + LINE + ",0.18)";
    g.beginPath(); g.arc(m.x, m.y, m.rr + 6, 0, 6.2832); g.stroke();
    if (ring > 0.01) {
      g.strokeStyle = "rgba(" + voteColor(metaDir) + ",0.95)"; g.lineCap = "round";
      g.beginPath(); g.arc(m.x, m.y, m.rr + 6, -Math.PI / 2, -Math.PI / 2 + ring * 6.2832); g.stroke(); g.lineCap = "butt";
    }
    for (var k in nodes) drawNode(k);
    // labels
    g.font = "10px 'IBM Plex Mono', ui-monospace, monospace"; g.textAlign = "center"; g.textBaseline = "top";
    for (var j in nodes) { g.fillStyle = "rgba(240,240,242,0.6)"; g.fillText(nodes[j].label, nodes[j].x, nodes[j].y + nodes[j].rr + 6); }
  }
  function drawNode(k) {
    var n = nodes[k];
    var an = analysts.filter(function (a) { return a.id === k; })[0];
    var col = an ? voteColor(an.vote) : (k === "meta" ? voteColor(metaDir) : (k === "appr" ? ACCENT : LINE));
    if (n.flash > 0.01) {
      g.save(); g.globalCompositeOperation = "lighter";
      var grd = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.rr * 2.4);
      grd.addColorStop(0, "rgba(" + col + "," + (0.35 * n.flash) + ")"); grd.addColorStop(1, "rgba(" + col + ",0)");
      g.fillStyle = grd; g.beginPath(); g.arc(n.x, n.y, n.rr * 2.4, 0, 6.2832); g.fill(); g.restore();
    }
    g.fillStyle = "rgba(19,19,22,1)"; g.lineWidth = 1.4; g.strokeStyle = "rgba(" + col + ",0.9)";
    if (n.sq) { roundRect(n.x - n.rr, n.y - n.rr, n.rr * 2, n.rr * 2, 4); g.fill(); g.stroke(); }
    else { g.beginPath(); g.arc(n.x, n.y, n.rr, 0, 6.2832); g.fill(); g.stroke(); }
    if (an) glyph(n, an.vote, col);
    else if (k === "meta") glyph(n, metaDir, col);
    else if (k === "gate1") { g.strokeStyle = "rgba(" + col + ",0.9)"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(n.x - 4, n.y - 4); g.lineTo(n.x + 4, n.y - 4); g.lineTo(n.x + 1, n.y + 1); g.lineTo(n.x + 1, n.y + 4); g.lineTo(n.x - 1, n.y + 4); g.lineTo(n.x - 1, n.y + 1); g.closePath(); g.stroke(); }
    else if (k === "appr") { g.strokeStyle = "rgba(" + col + ",0.95)"; g.lineWidth = 1.8; g.beginPath(); g.moveTo(n.x - 4, n.y); g.lineTo(n.x - 1, n.y + 4); g.lineTo(n.x + 5, n.y - 4); g.stroke(); }
    else { g.fillStyle = "rgba(" + col + ",0.9)"; g.beginPath(); g.arc(n.x, n.y, 2.4, 0, 6.2832); g.fill(); }
  }
  function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function glyph(n, vote, col) {
    g.fillStyle = "rgba(" + col + ",0.95)"; var s = n.rr * 0.42;
    if (vote > 0) { g.beginPath(); g.moveTo(n.x, n.y - s); g.lineTo(n.x + s, n.y + s * 0.7); g.lineTo(n.x - s, n.y + s * 0.7); g.closePath(); g.fill(); }
    else if (vote < 0) { g.beginPath(); g.moveTo(n.x, n.y + s); g.lineTo(n.x + s, n.y - s * 0.7); g.lineTo(n.x - s, n.y - s * 0.7); g.closePath(); g.fill(); }
    else g.fillRect(n.x - s, n.y - 1.4, s * 2, 2.8);
  }

  // ---- loop ----
  var running = false, raf = 0, lastTs = 0;
  function tick(dt) {
    var active = false;
    for (var i = pulses.length - 1; i >= 0; i--) {
      var p = pulses[i];
      if (p.delay > 0) { p.delay -= dt; active = true; continue; }
      p.t += dt / p.dur;
      if (p.t >= 1) { p.t = 1; if (!p.done) { p.done = true; if (p.onArrive) p.onArrive(); } pulses.splice(i, 1); }
      active = true;
    }
    for (var k in nodes) { if (nodes[k].flash > 0.01) { nodes[k].flash *= Math.pow(0.02, dt); active = true; } else nodes[k].flash = 0; }
    if (Math.abs(ring - ringTarget) > 0.004) { ring += (ringTarget - ring) * (1 - Math.exp(-dt / 0.18)); active = true; } else ring = ringTarget;
    return active;
  }
  function loop(ts) { if (!running) return; if (!lastTs) lastTs = ts; var dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts; var active = tick(dt); draw(); if (active) raf = requestAnimationFrame(loop); else running = false; }
  function kick() { if (!running) { running = true; lastTs = 0; raf = requestAnimationFrame(loop); } }

  // ---- interaction ----
  function hit(ev) {
    var r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    for (var i = 0; i < analysts.length; i++) { var n = nodes[analysts[i].id]; if ((x - n.x) * (x - n.x) + (y - n.y) * (y - n.y) <= (n.rr + 6) * (n.rr + 6)) return analysts[i]; }
    return null;
  }
  cv.addEventListener("click", function (ev) { var a = hit(ev); if (!a) return; a.vote = a.vote === 1 ? -1 : a.vote === -1 ? 0 : 1; retally(); });
  cv.addEventListener("mousemove", function (ev) { cv.style.cursor = hit(ev) ? "pointer" : "default"; });
  if (runBtn) runBtn.addEventListener("click", runScan);
  if (monthBtn) monthBtn.addEventListener("click", runMonth);

  // ---- init ----
  layout();
  decision = decide(); metaDir = decision.dir; ring = ringTarget = decision.conf;
  setDecisionText(); draw();
  var rz = 0; window.addEventListener("resize", function () { if (rz) return; rz = requestAnimationFrame(function () { rz = 0; layout(); draw(); }); });

  if (reduce) { setDecisionText(); draw(); }
  else if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { runScan(); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(root);
  } else runScan();
})();
