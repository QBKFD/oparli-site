// main.js: nav behavior and small page interactions.

(function () {
  "use strict";

  var nav = document.getElementById("nav");
  var hero = document.getElementById("hero");
  if (!nav) return;

  // Single scroll variable drives both the nav background/hairline transition
  // and the OPARLI wordmark fade: once the page is scrolled past ~70% of the
  // hero height, the nav enters its "scrolled" state (CSS handles the 300ms
  // fades). State reverses on scroll back up.
  var THRESHOLD = 0.7;
  var ticking = false;

  function update() {
    ticking = false;
    var heroH = hero ? hero.offsetHeight : window.innerHeight;
    var past = window.scrollY > heroH * THRESHOLD;
    nav.classList.toggle("is-scrolled", past);
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
})();
