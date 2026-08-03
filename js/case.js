// case.js: generic "path" engine for case-study pages.
// Drives scroll-reveal, rail progress, active node, count-up numbers, and
// benchmark bars. Content-agnostic: it operates on .stage / [data-countup] /
// .bench__fill[data-width], so every project page reuses it unchanged.

(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var path = document.querySelector(".path");
  var stages = [].slice.call(document.querySelectorAll(".stage"));
  if (!stages.length) return;

  // ---- reveal each stage once, then fire its inner animations ----
  function activate(el) {
    el.classList.add("is-visible");
    el.querySelectorAll(".bench__fill").forEach(function (f) {
      var w = f.getAttribute("data-width") || "0";
      if (reduce) { f.style.width = w; return; }
      requestAnimationFrame(function () { f.style.width = w; });
    });
    el.querySelectorAll("[data-countup]").forEach(countUp);
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { activate(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.25 });
    stages.forEach(function (s) { io.observe(s); });
  } else {
    stages.forEach(activate);
  }

  // ---- count-up numbers (ease-out cubic) ----
  function countUp(n) {
    var target = parseFloat(n.getAttribute("data-countup"));
    var dec = parseInt(n.getAttribute("data-decimals") || "0", 10);
    if (isNaN(target)) return;
    if (reduce) { n.textContent = target.toFixed(dec); return; }
    var start = null, dur = 1100;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var val = target * (1 - Math.pow(1 - p, 3));
      n.textContent = val.toFixed(dec);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---- rail progress + active node (skipped under reduced motion) ----
  if (path && !reduce) {
    var ticking = false;
    function update() {
      ticking = false;
      var vh = window.innerHeight;
      var r = path.getBoundingClientRect();
      var prog = (vh * 0.42 - r.top) / (r.height || 1);
      prog = prog < 0 ? 0 : prog > 1 ? 1 : prog;
      path.style.setProperty("--rail", prog.toFixed(4));

      var cy = vh * 0.42, active = null, best = Infinity;
      stages.forEach(function (s) {
        var d = Math.abs(s.getBoundingClientRect().top + 16 - cy);
        if (d < best) { best = d; active = s; }
      });
      stages.forEach(function (s) { s.classList.toggle("is-active", s === active); });
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
  }
})();
