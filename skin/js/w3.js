/* w3.js — W3 redesign runtime. Vanilla, no dependencies.
   Serves ONLY the redesigned pages (home / products list / product detail).
   Works against chrome DOM injected by chrome-sync (mobile-nav wrapper is an
   empty shell by contract — mibooz.js used to clone the menu into it; we do
   the same here so the chrome contract stays unchanged). */
(function () {
  "use strict";
  var d = document, root = d.documentElement;

  /* ---- scrolled state (header background + scroll-to-top) ---- */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      root.classList.toggle("w3-scrolled", window.scrollY > 12);
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- mobile nav: clone main menu into the wrapper, wire togglers ---- */
  var wrapper = d.querySelector(".mobile-nav__wrapper");
  var container = wrapper && wrapper.querySelector(".mobile-nav__container");
  var mainList = d.querySelector(".main-menu__list");
  if (container && mainList && !container.firstElementChild) {
    var clone = mainList.cloneNode(true);
    /* the desktop list is display:none under 1080px — the clone must not
       inherit that class or the panel goes empty exactly when it is needed */
    clone.className = "mobile-nav__list";
    clone.querySelectorAll("li").forEach(function (li) {
      var sub = li.querySelector(":scope > ul");
      var a = li.querySelector(":scope > a");
      if (sub && a) {
        var btn = d.createElement("button");
        btn.type = "button";
        btn.className = "w3-subnav-btn";
        btn.setAttribute("aria-label", "toggle");
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          li.classList.toggle("w3-open");
        });
        a.appendChild(btn);
      }
    });
    container.appendChild(clone);
  }
  d.querySelectorAll(".mobile-nav__toggler").forEach(function (t) {
    t.addEventListener("click", function (e) {
      e.preventDefault();
      var open = wrapper.classList.toggle("expanded");
      d.body.classList.toggle("w3-nav-locked", open);
    });
  });

  /* ---- scroll-to-top (chrome element) ---- */
  var toTop = d.querySelector(".scroll-to-top");
  if (toTop) toTop.addEventListener("click", function (e) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ---- reveal on scroll ---- */
  var revealEls = d.querySelectorAll("[data-w3-reveal]");
  if (revealEls.length) {
    if ("IntersectionObserver" in window &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
      revealEls.forEach(function (el) { io.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add("is-in"); });
    }
  }

  /* ---- scenario carousel (home) ---- */
  d.querySelectorAll("[data-w3-carousel]").forEach(function (car) {
    var slides = Array.prototype.slice.call(car.querySelectorAll(".w3-carousel__slide"));
    if (slides.length < 2) return;
    var dotsWrap = car.querySelector("[data-w3-car-dots]");
    var prev = car.querySelector("[data-w3-car-prev]");
    var next = car.querySelector("[data-w3-car-next]");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var i = 0, timer = null, DELAY = 6000;
    var dots = slides.map(function (s, n) {
      var b = d.createElement("button");
      b.type = "button"; b.className = "w3-carousel__dot" + (n === 0 ? " is-active" : "");
      b.setAttribute("aria-label", "slide " + (n + 1));
      b.addEventListener("click", function () { go(n); reset(); });
      if (dotsWrap) dotsWrap.appendChild(b);
      return b;
    });
    function go(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle("is-active", k === i); });
      dots.forEach(function (dd, k) { dd.classList.toggle("is-active", k === i); });
    }
    function tick() { go(i + 1); }
    function start() { if (!reduce && !timer) timer = setInterval(tick, DELAY); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function reset() { stop(); start(); }
    if (prev) prev.addEventListener("click", function () { go(i - 1); reset(); });
    if (next) next.addEventListener("click", function () { go(i + 1); reset(); });
    car.addEventListener("mouseenter", stop);
    car.addEventListener("mouseleave", start);
    car.addEventListener("focusin", stop);
    car.addEventListener("focusout", start);
    /* touch swipe */
    var x0 = null;
    car.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; stop(); }, { passive: true });
    car.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
      x0 = null; start();
    }, { passive: true });
    /* pause when off-screen */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { en.isIntersecting ? start() : stop(); });
      }, { threshold: 0.2 }).observe(car);
    } else { start(); }
  });

  /* ---- product gallery (CSS scroll-snap + thumb sync) ---- */
  var main = d.querySelector(".product_feature_img_slider_2 .swiper-wrapper");
  if (main) {
    var slides = main.children.length;
    var gallery = d.querySelector(".w3-gallery");
    if (gallery && slides < 2) gallery.classList.add("w3-gallery--single");
    var thumbs = Array.prototype.slice.call(
      d.querySelectorAll(".product_thumb_slider_2 .swiper-slide"));
    var idx = 0, snapT = null;
    function go(i) {
      i = Math.max(0, Math.min(slides - 1, i));
      /* mandatory snap cancels smooth programmatic scrolls in Chromium and the
         wrapper springs back to 0 — lift the snap for the animation, restore after */
      main.style.scrollSnapType = "none";
      main.scrollTo({ left: i * main.clientWidth, behavior: "smooth" });
      clearTimeout(snapT);
      snapT = setTimeout(function () { main.style.scrollSnapType = ""; }, 600);
      mark(i);
    }
    function mark(i) {
      if (i === idx) return;
      idx = i;
      thumbs.forEach(function (t, n) { t.classList.toggle("is-active", n === i); });
      var t = thumbs[i];
      if (t && t.scrollIntoView) t.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
    thumbs.forEach(function (t, n) { t.addEventListener("click", function () { go(n); }); });
    if (thumbs[0]) thumbs[0].classList.add("is-active");
    var prev = d.querySelector(".swiper-button-prev");
    var next = d.querySelector(".swiper-button-next");
    if (prev) prev.addEventListener("click", function () { go(idx - 1); });
    if (next) next.addEventListener("click", function () { go(idx + 1); });
    main.addEventListener("scroll", function () {
      var i = Math.round(main.scrollLeft / Math.max(1, main.clientWidth));
      mark(Math.max(0, Math.min(slides - 1, i)));
    }, { passive: true });
  }
})();
