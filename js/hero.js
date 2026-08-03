// hero.js: OPARLI hero contour animation.
// Adapts the prototype drawing logic verbatim (constants + feel preserved);
// production layer adds DPR sizing, scroll coupling, visibility/viewport guards,
// touch handling, and reduced-motion support.

(function () {
  "use strict";

  var stage = document.getElementById("hero-stage");
  var cv = document.getElementById("hero-canvas");
  var content = document.querySelector(".hero__content");
  if (!stage || !cv) return;

  var g = cv.getContext("2d");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var noHover = window.matchMedia("(hover: none)").matches;

  // ---- sizing (DPR-aware; W/H are CSS pixels) ----
  // Cap DPR lower on phones: pixel work scales with dpr^2, so 1.0 vs 1.5 is a
  // ~2.25x saving that keeps the frame rate up on mobile GPUs.
  var W = 0, H = 0, dpr = 1;
  function resize() {
    W = stage.offsetWidth;
    H = stage.offsetHeight;
    dpr = Math.min(window.devicePixelRatio || 1, W < 640 ? 1 : 1.5);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + "px";
    cv.style.height = H + "px";
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  // ---- detail: fewer contours and segments on small screens ----
  function contourCount() {
    return W < 640 ? 48 : 74;
  }
  function segCount() {
    return W < 640 ? 72 : 110;
  }
  var grainTick = 0;

  // ---- film-grain tile (built once) ----
  var gr = document.createElement("canvas");
  gr.width = gr.height = 140;
  var gx = gr.getContext("2d");
  var idt = gx.createImageData(140, 140);
  for (var i = 0; i < idt.data.length; i += 4) {
    var v = Math.random() * 255 | 0;
    idt.data[i] = v; idt.data[i + 1] = v; idt.data[i + 2] = v; idt.data[i + 3] = 255;
  }
  gx.putImageData(idt, 0, 0);
  var pat = null;

  // ---- dust layer (30 particles; blurred sprites pre-rendered once) ----
  var DUST_N = 30;
  var dust = [];
  var spriteCache = {};
  function makeSprite(radius, blur) {
    var pad = Math.ceil(blur * 2) + 2;
    var d = Math.ceil(radius * 2 + pad * 2);
    var c = document.createElement("canvas");
    c.width = c.height = d;
    var c2 = c.getContext("2d");
    if (blur > 0) c2.filter = "blur(" + blur + "px)"; // applied once, at build time
    c2.beginPath();
    c2.arc(d / 2, d / 2, radius, 0, 6.2832);
    c2.fillStyle = "#c7c9d0";
    c2.fill();
    return { canvas: c, half: d / 2 };
  }
  (function initDust() {
    for (var i = 0; i < DUST_N; i++) {
      var dia = 1 + Math.random() * 2;              // 1-3px
      var radius = dia / 2;
      var blur = dia > 2 ? (2 + (dia - 2)) : 0;     // larger ones blurred 2-3px
      var key = radius.toFixed(2) + "_" + blur.toFixed(2);
      if (!spriteCache[key]) spriteCache[key] = makeSprite(radius, blur);
      dust.push({
        x: Math.pow(Math.random(), 1.7) * 0.9,       // biased toward left
        y: 1 - Math.pow(Math.random(), 1.7) * 0.9,   // biased toward bottom
        vx: (Math.random() - 0.45) * 0.000018,       // barely perceptible drift
        vy: (Math.random() - 0.5) * 0.000012,
        base: 0.08 + Math.random() * 0.12,           // 8-20% alpha
        ph: Math.random() * 6.2832,
        sp: 0.15 + Math.random() * 0.25,             // breathing speed
        sprite: spriteCache[key]
      });
    }
  })();
  function drawDust(alphaMul) {
    for (var i = 0; i < dust.length; i++) {
      var p = dust[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < -0.02) p.x = 1.02; else if (p.x > 1.02) p.x = -0.02;
      if (p.y < -0.02) p.y = 1.02; else if (p.y > 1.02) p.y = -0.02;
      var breath = 0.55 + 0.45 * Math.sin(t * p.sp + p.ph);
      g.globalAlpha = p.base * breath * alphaMul;
      g.drawImage(p.sprite.canvas, p.x * W - p.sprite.half, p.y * H - p.sprite.half);
    }
    g.globalAlpha = 1;
  }

  // ---- rare event state (a ring near the void flares; skipped for reduced motion) ----
  var rareOn = false, rareIndex = -1, rareElapsed = 0, rareIntensity = 0, rarePointA = -1;
  var rareClock = 0, rareNext = 120 + Math.random() * 60;

  // ---- sprung cursor state ----
  var mx = 0.5, my = 0.5, inside = 0, sx = 0.5, sy = 0.5, vx = 0, vy = 0, str = 0;

  // ---- long-period life ----
  var t = 0, gustT = 20, gustR = 0, gustOn = 0;

  // ---- scroll coupling (eased) ----
  var e = 0, eTarget = 0;
  function updateScrollTarget() {
    var heroH = stage.offsetHeight || window.innerHeight;
    var raw = window.scrollY / (0.9 * heroH);
    if (raw < 0) raw = 0; else if (raw > 1) raw = 1;
    eTarget = smoothstep(raw);
  }

  function smoothstep(x) { return x * x * (3 - 2 * x); }
  function smooth(vv) { return vv * vv * (3 - 2 * vv); } // prototype's regional-fade easing

  // ---- interaction wiring (skipped for reduced-motion / touch) ----
  if (!reduceMotion) {
    window.addEventListener("scroll", updateScrollTarget, { passive: true });
    updateScrollTarget();
    if (!noHover) {
      stage.addEventListener("mousemove", function (ev) {
        var r = stage.getBoundingClientRect();
        mx = (ev.clientX - r.left) / r.width;
        my = (ev.clientY - r.top) / r.height;
        inside = 1;
      });
      stage.addEventListener("mouseleave", function () { inside = 0; });
    }
  }

  // ---- one drawing pass (renders at current t / e) ----
  function draw() {
    var NC = contourCount();
    var SEG = segCount();
    g.fillStyle = "#0b0b0d";
    g.fillRect(0, 0, W, H);

    var alphaMul = 1 - e * 0.92;            // fade lines as page scrolls
    var strEff = str * (1 - e);             // cursor influence fades with scroll

    drawDust(alphaMul);                     // dust sits between ground and contours
    var bandC = 0.29 + 0.20 * Math.sin(t * 0.008 * 6.28); // migrating yellow band
    var opx = (sx - 0.62) * 0.03 * strEff;
    var opy = (sy - 0.40) * 0.03 * strEff;

    for (var i = 0; i < NC; i++) {
      var k = i / (NC - 1);
      var kk = Math.pow(k, 1.25);
      var cx = 0.58 - kk * 0.34 + Math.sin(t * 0.06 + k * 2) * 0.006 + opx;
      var cy = 0.40 + kk * 0.30 + Math.cos(t * 0.05 + k * 3) * 0.006 + opy - e * 0.12;
      var base = 0.045 + kk * 1.05;
      var rot = k * 1.35 + t * 0.012;
      var bd = Math.abs(k - bandC);
      var yel = bd < 0.05;
      var fadeLP = 0.62 + 0.38 * Math.sin(t * 0.009 * 6.28 + k * 9);
      fadeLP = 0.35 + 0.65 * smooth(Math.min(1, fadeLP * 1.3));
      var a;
      // grey contour alpha boosted ~40% overall
      if (yel) a = (0.34 - bd * 3.2) + Math.sin(t * 0.35 + k * 20) * 0.06;
      else a = (0.06 + (1 - k) * 0.15 + Math.sin(k * 47 + t * 0.25) * 0.025) * fadeLP * 1.4;

      var strokeA = (yel ? Math.max(0.05, a) : a) * alphaMul;

      // rare event: brighten one ring near the void toward white
      var bright = 0;
      if (rareOn && i === rareIndex) {
        bright = rareIntensity;
        strokeA = strokeA * (1 - bright) + 0.9 * bright;
      }
      if (strokeA <= 0.001 && bright <= 0.001) continue;
      if (bright > 0.001) {
        var cr = Math.round(168 + (255 - 168) * bright);
        var cg = Math.round(172 + (255 - 172) * bright);
        var cb = Math.round(182 + (255 - 182) * bright);
        g.strokeStyle = "rgba(" + cr + "," + cg + "," + cb + "," + strokeA + ")";
        g.lineWidth = 0.6 + bright * 0.9;
      } else {
        g.strokeStyle = yel
          ? "rgba(226,186,74," + strokeA + ")"
          : "rgba(168,172,182," + strokeA + ")";
        g.lineWidth = yel ? 0.85 : 0.6;
      }
      var capX = 0, capY = 0, capBest = 99, capOn = (rareOn && i === rareIndex && rarePointA >= 0);
      g.beginPath();
      for (var s = 0; s <= SEG; s++) {
        var th = s / SEG * 6.2832;
        var r = base * (1
          + 0.30 * Math.sin(th * 2 + k * 3.4 + t * 0.09)
          + 0.15 * Math.sin(th * 3 - k * 6 - t * 0.06)
          + 0.08 * Math.sin(th * 5 + k * 9 + t * 0.04)
          - 0.34 * kk * Math.sin(th + 0.9)
          + 0.18 * kk * Math.sin(th * 2 - 1.2));
        if (gustOn) {
          var gd = base - gustR * 0.7;
          r += Math.exp(-gd * gd * 40) * 0.02 * Math.sin(th * 4 + t * 2);
        }
        var x = cx + Math.cos(th + rot) * r;
        var y = cy + Math.sin(th + rot) * r * 0.80;
        var ddx = x - sx, ddy = (y - sy) * 0.85;
        var dist = Math.hypot(ddx, ddy);
        var inf = Math.exp(-dist * dist * 26) * 0.045 * strEff;
        if (inf > 0.0004) { x += ddx / (dist + 0.0001) * inf; y += ddy / (dist + 0.0001) * inf; }
        var X = x * W, Y = y * H;
        if (capOn) {
          var da = Math.abs(th - rarePointA);
          if (da < capBest) { capBest = da; capX = X; capY = Y; }
        }
        s ? g.lineTo(X, Y) : g.moveTo(X, Y);
      }
      g.closePath();
      g.stroke();

      // rare event: single bright point traveling the ring's circumference
      if (capOn) {
        g.save();
        g.globalCompositeOperation = "lighter";
        var glow = g.createRadialGradient(capX, capY, 0, capX, capY, 9);
        glow.addColorStop(0, "rgba(255,255,255," + (0.9 * rareIntensity) + ")");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = glow;
        g.beginPath(); g.arc(capX, capY, 9, 0, 6.2832); g.fill();
        g.fillStyle = "rgba(255,255,255," + rareIntensity + ")";
        g.beginPath(); g.arc(capX, capY, 1.5, 0, 6.2832); g.fill();
        g.restore();
      }
    }

    // film-grain overlay (expensive full-canvas blend). On phones run it every
    // other frame to halve the cost; the shimmer still reads fine.
    grainTick++;
    if (W >= 640 || (grainTick & 1)) {
      if (!pat) pat = g.createPattern(gr, "repeat");
      g.save();
      g.globalAlpha = 0.045;
      g.globalCompositeOperation = "overlay";
      g.translate((Math.random() * 140) | 0, (Math.random() * 140) | 0);
      g.fillStyle = pat;
      g.fillRect(-140, -140, W + 280, H + 280);
      g.restore();
    }
  }

  // ---- hero text coupling (fade + lift on scroll) ----
  function applyText() {
    if (!content) return;
    content.style.opacity = String(1 - smoothstep(Math.min(1, e * 1.6)));
    content.style.transform = "translateY(" + (-e * 70) + "px)";
  }

  // ---- animation loop with guards ----
  var running = false, rafId = 0, visible = true, lastTs = 0;

  function frame(ts) {
    if (!running) return;

    // Frame-rate-independent time: normalize elapsed time to 60fps "frames"
    // so the animation runs at the same real speed at 30fps or 120fps.
    if (!lastTs) lastTs = ts;
    var f = (ts - lastTs) / 16.6667;
    lastTs = ts;
    if (f > 3) f = 3; else if (f < 0.1) f = 0.1;   // clamp stalls / first frame

    // ease scroll coupling toward target
    e += (eTarget - e) * Math.min(1, 0.1 * f);

    t += 0.016 * f * (1 + e * 1.6);
    vx += (mx - sx) * 0.045 * f; vy += (my - sy) * 0.045 * f;
    var damp = Math.pow(0.88, f);
    vx *= damp; vy *= damp; sx += vx * f; sy += vy * f;
    str += ((inside ? 1 : 0) - str) * Math.min(1, 0.04 * f);
    gustT -= 0.016 * f;
    if (gustT <= 0 && !gustOn) { gustOn = 1; gustR = 0; }
    if (gustOn) { gustR += 0.010 * f; if (gustR > 2.0) { gustOn = 0; gustT = 80 + Math.random() * 100; } }

    // rare event: brighten a near-void ring, send a point around it, fade back
    rareClock += 0.016 * f;
    if (!rareOn && rareClock >= rareNext) {
      rareOn = true; rareElapsed = 0;
      var kTarget = 0.05 + Math.random() * 0.10;          // k in [0.05, 0.15]
      rareIndex = Math.round(kTarget * (contourCount() - 1));
    }
    if (rareOn) {
      rareElapsed += 0.016 * f;
      if (rareElapsed < 2) rareIntensity = smoothstep(rareElapsed / 2);          // 2s brighten
      else if (rareElapsed < 6) rareIntensity = 1;                               // 4s hold
      else if (rareElapsed < 8) rareIntensity = smoothstep(1 - (rareElapsed - 6) / 2); // 2s fade
      else rareIntensity = 0;
      rarePointA = (rareElapsed >= 2 && rareElapsed < 6)
        ? (rareElapsed - 2) / 4 * 6.2832                  // point circles once over 4s
        : -1;
      if (rareElapsed >= 8) {
        rareOn = false; rareIndex = -1; rarePointA = -1;
        rareClock = 0; rareNext = 120 + Math.random() * 60;
      }
    }

    draw();
    applyText();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduceMotion || !visible) return;
    running = true;
    lastTs = 0;                       // re-baseline dt so no jump after a pause
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  // reduced motion: single static frame, no loop, no handlers
  if (reduceMotion) {
    t = 8;
    draw();
    applyText();
    return;
  }

  // pause when tab hidden
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else if (visible) start();
  });

  // pause when hero scrolled out of view
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && !document.hidden) start(); else stop();
    }, { threshold: 0 });
    io.observe(stage);
  }

  start();
})();
