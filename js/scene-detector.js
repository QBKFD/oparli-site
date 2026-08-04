// scene-detector.js: "Wrong, or just unlucky?" scene for the self-evolving stage.
// A per-trade R-multiple stream with a bootstrapped no-change band, and a CUSUM
// sequential detector that only fires on a sustained, significant drop. Toggle the
// hidden ground truth (pure variance vs a genuine shift); resample to watch the
// false-alarm rate stay low and the detection rate stay high. Vanilla canvas.

(function () {
  "use strict";

  var root = document.getElementById("dviz");
  if (!root) return;
  var cv = root.querySelector(".dviz__canvas");
  var g = cv.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var verdictEl = document.getElementById("dviz-verdict");
  var tallyEl = document.getElementById("dviz-tally");
  var resampleBtn = document.getElementById("dviz-resample");
  var segBtns = root.querySelectorAll(".dviz__seg button");

  var ACCENT = "226,186,74", GREY = "139,140,147", LINE = "168,172,182", TEXT = "240,240,242";

  // ---- model ----
  var N = 64, WIN = 10, BASE = 0.15, SIG = 0.42, CHG = Math.round(N * 0.6), DROP = 0.34;
  var K = 0.5 * SIG, H = 3.0 * SIG;           // CUSUM slack + decision threshold
  var SE = SIG / Math.sqrt(WIN), Z = 1.64;     // rolling-mean null band (90%)
  var truth = "noise";
  var x = [], roll = [], cusum = [], alarmIdx = -1;
  var counts = { noise: { flag: 0, total: 0 }, shift: { flag: 0, total: 0 } };

  function gauss() { var u = Math.random() || 1e-9, v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function generate() {
    x = []; roll = []; cusum = []; alarmIdx = -1;
    var i, s = 0;
    for (i = 0; i < N; i++) {
      var mean = BASE - (truth === "shift" && i >= CHG ? DROP : 0);
      x.push(mean + gauss() * SIG);
    }
    for (i = 0; i < N; i++) {
      var a = 0, n = 0; for (var j = Math.max(0, i - WIN + 1); j <= i; j++) { a += x[j]; n++; }
      roll.push(a / n);
      s = Math.max(0, s + (BASE - x[i]) - K);          // one-sided downward CUSUM
      cusum.push(s);
      if (alarmIdx < 0 && s > H) alarmIdx = i;
    }
  }

  // ---- layout ----
  var W = 0, HH = 0, dpr = 1, padL = 12, padR = 12, padT = 20, padB = 16;
  var topY0, topY1, botY0, botY1, yMin, yMax, sMax;
  function layout() {
    W = cv.offsetWidth; HH = cv.offsetHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(HH * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var inner = HH - padT - padB, gap = inner * 0.09;
    topY0 = padT; topY1 = padT + inner * 0.60;
    botY0 = topY1 + gap; botY1 = HH - padB;
    yMin = -0.55; yMax = 0.60;
    sMax = H * 1.25;
  }
  function cx(i) { return padL + (W - padL - padR) * (i / (N - 1)); }
  function cyT(v) { return topY1 - (topY1 - topY0) * (v - yMin) / (yMax - yMin); }
  function cyB(s) { return botY1 - (botY1 - botY0) * s / sMax; }

  // ---- timeline ----
  var T = 0, running = false, raf = 0, lastTs = 0, done = false;
  var DUR = 1.25;

  function draw() {
    g.clearRect(0, 0, W, HH);
    var appear = Math.min(N, Math.ceil((T / DUR) * N));

    // --- top: rolling mean + no-change band ---
    var bandHi = cyT(BASE + Z * SE), bandLo = cyT(BASE - Z * SE);
    g.fillStyle = "rgba(" + LINE + ",0.09)";
    g.fillRect(padL, bandHi, W - padL - padR, bandLo - bandHi);
    g.setLineDash([4, 5]); g.lineWidth = 1;
    g.strokeStyle = "rgba(" + LINE + ",0.32)";
    g.beginPath(); g.moveTo(padL, cyT(BASE)); g.lineTo(W - padR, cyT(BASE)); g.stroke();
    g.setLineDash([]);
    // rolling-mean line
    g.lineWidth = 1.6; g.strokeStyle = "rgba(" + TEXT + ",0.8)"; g.beginPath();
    for (var i = 0; i < appear; i++) { var px = cx(i), py = cyT(roll[i]); i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.stroke();
    // change marker
    if (truth === "shift" && appear > CHG) {
      g.setLineDash([2, 4]); g.strokeStyle = "rgba(" + LINE + ",0.3)";
      g.beginPath(); g.moveTo(cx(CHG), topY0); g.lineTo(cx(CHG), topY1); g.stroke(); g.setLineDash([]);
    }

    // --- bottom: CUSUM + threshold ---
    var thY = cyB(H);
    g.setLineDash([4, 5]); g.lineWidth = 1; g.strokeStyle = "rgba(" + ACCENT + ",0.5)";
    g.beginPath(); g.moveTo(padL, thY); g.lineTo(W - padR, thY); g.stroke(); g.setLineDash([]);
    g.lineWidth = 1.6; g.beginPath();
    for (var m = 0; m < appear; m++) {
      var qx = cx(m), qy = cyB(Math.min(cusum[m], sMax));
      m ? g.lineTo(qx, qy) : g.moveTo(qx, qy);
    }
    var crossed = alarmIdx >= 0 && appear > alarmIdx;
    g.strokeStyle = crossed ? "rgba(" + ACCENT + ",0.95)" : "rgba(" + GREY + ",0.85)";
    g.stroke();
    if (crossed) {
      var ax = cx(alarmIdx), ay = cyB(Math.min(cusum[alarmIdx], sMax));
      g.fillStyle = "rgba(" + ACCENT + ",1)"; g.beginPath(); g.arc(ax, ay, 3.2, 0, 6.2832); g.fill();
    }

    // labels
    g.font = "10px 'IBM Plex Mono', ui-monospace, monospace"; g.textBaseline = "alphabetic";
    g.fillStyle = "rgba(" + LINE + ",0.7)"; g.textAlign = "left";
    g.fillText("rolling mean R  ·  no-change band 90%", padL, topY0 - 7);
    g.fillText("CUSUM sequential detector", padL, botY0 - 6);
    g.textAlign = "right"; g.fillStyle = "rgba(" + ACCENT + ",0.7)";
    g.fillText("decision threshold", W - padR, thY - 5);
  }

  function finish() {
    done = true;
    var alarmed = alarmIdx >= 0;
    counts[truth].total++; if (alarmed) counts[truth].flag++;
    if (verdictEl) {
      verdictEl.textContent = alarmed ? "FLAG: genuine" : "HOLD: within noise";
      verdictEl.style.color = "rgb(" + (alarmed ? ACCENT : GREY) + ")";
    }
    if (tallyEl) {
      var c = counts[truth];
      tallyEl.textContent = (truth === "noise" ? "false alarms " : "detections ") + c.flag + " / " + c.total;
    }
  }

  function loop(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
    T += dt; draw();
    if (T < DUR) raf = requestAnimationFrame(loop);
    else { running = false; if (!done) finish(); }
  }
  function play() {
    done = false;
    if (verdictEl) { verdictEl.textContent = "running…"; verdictEl.style.color = "rgb(" + GREY + ")"; }
    if (reduce) { T = DUR; draw(); finish(); return; }
    T = 0; running = true; lastTs = 0; raf = requestAnimationFrame(loop);
  }
  function resample() { generate(); layout(); play(); }

  // ---- controls ----
  segBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.classList.contains("is-active")) return;
      segBtns.forEach(function (o) { o.classList.remove("is-active"); });
      b.classList.add("is-active");
      truth = b.getAttribute("data-truth");
      resample();
    });
  });
  if (resampleBtn) resampleBtn.addEventListener("click", resample);

  // ---- init ----
  generate(); layout();
  var rz = 0; window.addEventListener("resize", function () { if (rz) return; rz = requestAnimationFrame(function () { rz = 0; layout(); draw(); }); });

  if (reduce) { T = DUR; draw(); finish(); }
  else if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { play(); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(root);
  } else play();
})();
