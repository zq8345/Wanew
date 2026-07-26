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

  /* ---- active nav section (runtime; baked chrome stays byte-identical for
     chrome-verify). Map current path's first segment -> a top-level nav href,
     then flag the matching <li> in both the desktop and mobile lists. ---- */
  (function () {
    var p = location.pathname;
    if (!/\/$/.test(p)) p += "/";
    p = p.replace(/^\/(pt|es|zh)\//, "/");              // strip locale dir
    var seg = (p.match(/^\/([^/]*)\//) || ["", ""])[1];
    var PRODUCTS = ["products", "standard", "standard-actuated", "standard-circular", "mini",
      "performance-gen-1", "performance-gen-2", "performance-gen-3", "enterprise", "type",
      "starlink-compatible-accessories"];
    var GUIDES = ["service", "mounts", "marine", "rv-off-grid", "power", "industrial", "faq", "video", "compatibility"];
    var SOLUTIONS = ["hangye", "solutions"];
    var target = PRODUCTS.indexOf(seg) >= 0 ? "/products/"
      : SOLUTIONS.indexOf(seg) >= 0 ? "/hangye/"
      : GUIDES.indexOf(seg) >= 0 ? "/service/"
      : seg === "about" ? "/about/"
      : seg === "contact" ? "/contact/" : null;
    if (!target) return;                                // home / unknown -> no active item
    d.querySelectorAll(".main-menu__list > li, .mobile-nav__list > li").forEach(function (li) {
      var a = li.querySelector(":scope > a");
      if (!a) return;
      var href = (a.getAttribute("href") || "").replace(/^https?:\/\/[^/]+/, "").replace(/^\/(pt|es|zh)\//, "/");
      if (href === target) li.classList.add("is-active");
    });
  })();

  /* ---- scroll-to-top (chrome element) ---- */
  var toTop = d.querySelector(".scroll-to-top");
  if (toTop) toTop.addEventListener("click", function (e) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ---- contact: WeChat QR popover + copy id ---- */
  d.querySelectorAll("[data-wechat]").forEach(function (wrap) {
    var btn = wrap.querySelector(".w3-channel--wc");
    var pop = wrap.querySelector(".w3-wechat-pop");
    if (!btn || !pop) return;
    function close() { pop.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = pop.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    d.addEventListener("click", function (e) { if (!wrap.contains(e.target)) close(); });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    var copyBtn = pop.querySelector("[data-wechat-copy]");
    if (copyBtn) copyBtn.addEventListener("click", function () {
      var id = copyBtn.getAttribute("data-id") || "";
      var done = function () { copyBtn.classList.add("is-copied"); setTimeout(function () { copyBtn.classList.remove("is-copied"); }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(id).then(done, done);
      else { var t = d.createElement("textarea"); t.value = id; d.body.appendChild(t); t.select(); try { d.execCommand("copy"); } catch (x) {} d.body.removeChild(t); done(); }
    });
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

  /* ---- scenario tabs (home) — auto-rotate w/ crossfade (CSS 0.8s), pause on hover
     /focus, manual click/arrow re-arms the dwell, honors prefers-reduced-motion.
     Dwell is a single constant for easy tuning (Joe). ---- */
  d.querySelectorAll("[data-w3-scenes]").forEach(function (tabsWrap) {
    var tabs = Array.prototype.slice.call(tabsWrap.querySelectorAll(".w3-scenetab"));
    var stage = d.querySelector("[data-w3-scenes-stage]");
    if (!tabs.length || !stage) return;
    var panels = Array.prototype.slice.call(stage.querySelectorAll(".w3-scene-panel"));
    var DWELL_MS = 4000;   // ⏱ per-scene dwell — tune here (crossfade duration is 0.8s in w3.css)
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cur = 0, timer = null;
    function activate(n) {
      cur = n;
      tabs.forEach(function (t, k) { t.classList.toggle("is-active", k === n); t.setAttribute("aria-selected", k === n ? "true" : "false"); });
      panels.forEach(function (p, k) { p.classList.toggle("is-active", k === n); });
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() { if (reduce || timer || tabs.length < 2) return; timer = setInterval(function () { activate((cur + 1) % tabs.length); }, DWELL_MS); }
    function restart() { stop(); start(); }   // manual interaction: show it, then re-arm the dwell
    tabs.forEach(function (t, n) {
      t.addEventListener("click", function () { activate(n); restart(); });
      t.addEventListener("keydown", function (e) {
        var dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        var m = (n + dir + tabs.length) % tabs.length;
        tabs[m].focus(); activate(m); restart();
      });
    });
    // pause while the user is reading/aiming; resume on leave (start() no-ops under reduced-motion)
    [stage, tabsWrap].forEach(function (el) {
      el.addEventListener("mouseenter", stop);
      el.addEventListener("mouseleave", start);
    });
    tabsWrap.addEventListener("focusin", stop);
    tabsWrap.addEventListener("focusout", start);
    start();
  });

  /* ---- Guides library topic filter (home /guides/) ---- */
  d.querySelectorAll("[data-guides-filter]").forEach(function (bar) {
    var grid = d.getElementById("guidesGrid");
    if (!grid) return;
    var chips = Array.prototype.slice.call(bar.querySelectorAll(".guides-chip"));
    var cards = Array.prototype.slice.call(grid.querySelectorAll(".guides-card"));
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        chips.forEach(function (c) { c.classList.remove("is-active"); });
        chip.classList.add("is-active");
        var f = chip.getAttribute("data-filter");
        cards.forEach(function (card) {
          card.classList.toggle("is-hidden", f !== "all" && card.getAttribute("data-topic") !== f);
        });
      });
    });
  });

  /* ---- list-page filter (products / category / type shells) ----
     Unified from the old per-page inline scripts. Binds whichever button
     chip rows are present (#modelChips by data-cat, #formChips by data-form);
     model-nav anchors are plain links and need no JS. Recomputes counts
     within the current cross-filter; hash deep-links to a chip. */
  (function () {
    var grid = d.getElementById("productGrid");
    if (!grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll("[data-cat]"));
    var modelChips = Array.prototype.slice.call(d.querySelectorAll("#modelChips .product-chip"));
    var formChips = Array.prototype.slice.call(d.querySelectorAll("#formChips .product-chip"));
    if (!modelChips.length && !formChips.length) return;
    var state = { cat: "all", form: "all" };
    var empty = d.createElement("div");
    empty.className = "product-empty"; empty.style.display = "none";
    empty.textContent = grid.getAttribute("data-empty") || "No products match this combination.";
    grid.parentNode.insertBefore(empty, grid.nextSibling);
    function show(c) {
      return (state.cat === "all" || c.getAttribute("data-cat") === state.cat) &&
             (state.form === "all" || c.getAttribute("data-form") === state.form);
    }
    function count(chips, selfAttr, otherAttr) {
      var otherVal = otherAttr === "data-cat" ? state.cat : state.form;
      chips.forEach(function (chip) {
        var f = chip.getAttribute("data-filter"), n = 0;
        cards.forEach(function (c) {
          var selfOk = f === "all" || c.getAttribute(selfAttr) === f;
          var otherOk = otherVal === "all" || c.getAttribute(otherAttr) === otherVal;
          if (selfOk && otherOk) n++;
        });
        var span = chip.querySelector(".product-chip__n");
        if (span) span.textContent = n;
        chip.classList.toggle("is-empty", n === 0);
      });
    }
    function apply() {
      var vis = 0;
      cards.forEach(function (c) { var ok = show(c); c.style.display = ok ? "" : "none"; if (ok) vis++; });
      if (modelChips.length) count(modelChips, "data-cat", "data-form");
      if (formChips.length) count(formChips, "data-form", "data-cat");
      empty.style.display = vis ? "none" : "";
    }
    function bind(chips, axis) {
      chips.forEach(function (chip) {
        if (!chip.hasAttribute("data-filter")) return;   // skip model-nav anchors
        chip.addEventListener("click", function (e) {
          if (chip.tagName === "A") return;              // anchors navigate, don't filter
          e.preventDefault();
          state[axis] = chip.getAttribute("data-filter");
          chips.forEach(function (o) { o.classList.toggle("is-active", o === chip); });
          apply();
        });
      });
    }
    bind(modelChips, "cat");
    bind(formChips, "form");
    apply();
    function deepLink() {
      var hsh = (location.hash || "").replace("#", "").toLowerCase();
      if (!/^[a-z0-9-]+$/.test(hsh)) return;
      var chip = d.querySelector('#formChips .product-chip[data-filter="' + hsh + '"]')
              || d.querySelector('#modelChips .product-chip[data-filter="' + hsh + '"]');
      if (!chip || chip.tagName === "A") return;
      chip.click();
      var bar = d.querySelector(".product-filters"); if (bar) bar.scrollIntoView({ block: "start" });
    }
    deepLink();
    window.addEventListener("hashchange", deepLink);
  })();

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
