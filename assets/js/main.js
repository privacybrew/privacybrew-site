// PrivacyBrew site — small, dependency-free interaction layer.
// Two jobs only: fade/slide sections into view on scroll, and toggle the
// mobile nav. No frameworks, no analytics, nothing phoning home — same
// spirit as the app itself.

// Lets the CSS hide diagram parts until they rise into view. Without JS
// they simply stay visible.
document.documentElement.classList.add("js-dg");

document.addEventListener("DOMContentLoaded", () => {
  const revealEls = document.querySelectorAll(".reveal");
  const reveal = (el) => el.classList.add("in");

  // Anything already in (or near) the viewport on load should just be
  // visible immediately — no fade delay, and no dependency on the
  // IntersectionObserver callback ever firing for it.
  revealEls.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) reveal(el);
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            reveal(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach((el) => {
      if (!el.classList.contains("in")) io.observe(el);
    });
  } else {
    // No IntersectionObserver support — just show everything.
    revealEls.forEach(reveal);
  }

  // Safety net: never let content stay invisible because of a browser
  // quirk or an observer that doesn't fire — force everything visible
  // shortly after load no matter what.
  window.setTimeout(() => revealEls.forEach(reveal), 2000);

  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    const setOpen = (open) => {
      links.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(!links.classList.contains("open"));
    });
    links.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("click", (e) => {
      if (links.classList.contains("open") && !links.contains(e.target)) setOpen(false);
    });
    // Close the menu when the phone rotates or the window gets wide.
    const narrow = window.matchMedia("(max-width: 900px)");
    const closeOnChange = () => setOpen(false);
    if (narrow.addEventListener) narrow.addEventListener("change", closeOnChange);
    window.addEventListener("orientationchange", closeOnChange);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && links.classList.contains("open")) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  // Mobile floating section tracker: highlights which of the main
  // content sections is currently in view, and shows/hides itself so it
  // only appears once you've scrolled past the hero and disappears again
  // once you reach the final CTA/footer (nothing left to "track" there).
  const tracker = document.getElementById("section-tracker");
  if (tracker) {
    const trackerLinks = tracker.querySelectorAll("a[data-section]");
    const setActive = (id) => {
      trackerLinks.forEach((a) => a.classList.toggle("active", a.dataset.section === id));
    };

    const sectionIds = ["features", "tools", "why-it-matters", "how-it-works", "compare"];
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const hero = document.querySelector(".hero");
    const cta = document.getElementById("cta");

    // A plain scroll-position check rather than IntersectionObserver:
    // with several tall sections back to back, two separate observers
    // (one per section) can fire in a batch in DOM-unrelated order, so
    // the *previous* section's callback can "win" and stay highlighted
    // after you've already scrolled into the next one. Walking the
    // sections in document order and taking the last one whose top has
    // crossed the reference line is unambiguous by construction.
    const REF_LINE_RATIO = 0.35;
    let ticking = false;
    const update = () => {
      ticking = false;
      const refLine = window.innerHeight * REF_LINE_RATIO;

      let current = null;
      sections.forEach((el) => {
        if (el.getBoundingClientRect().top <= refLine) current = el;
      });
      if (current) setActive(current.id);

      const heroVisible = hero ? hero.getBoundingClientRect().bottom > 80 : false;
      const ctaVisible = cta ? cta.getBoundingClientRect().top <= refLine : false;
      tracker.classList.toggle("visible", !heroVisible && !ctaVisible);

      // Hide while scrolling down so the bar does not cover what you read.
      // Show again when you scroll up or stop near a section start.
      const y = window.scrollY;
      if (Math.abs(y - lastY) > 6) {
        tracker.classList.toggle("tucked", y > lastY);
        lastY = y;
      }
    };
    let lastY = window.scrollY;

    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    window.addEventListener("resize", update);
    update();
  }
  // ---------- Diagrams and motion ----------
  // CSS does the animation. JS only sets state classes, and stops the
  // loops when a diagram is off screen or the tab is hidden.
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const still = () => motionQuery.matches;
  const hasIO = "IntersectionObserver" in window;

  // Calls show/hide when el enters/leaves the screen (and on tab hide).
  const watch = (el, show, hide, threshold) => {
    let onScreen = false;
    const sync = () => (onScreen && !document.hidden ? show() : hide());
    document.addEventListener("visibilitychange", sync);
    if (!hasIO) { onScreen = true; sync(); return; }
    new IntersectionObserver(
      (entries) => entries.forEach((e) => { onScreen = e.isIntersecting; sync(); }),
      { threshold: threshold || 0 }
    ).observe(el);
  };

  // Thin reading-progress bar under the sticky nav.
  const nav = document.querySelector(".nav");
  if (nav) {
    const bar = document.createElement("div");
    bar.className = "nav-progress";
    bar.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    bar.appendChild(fill);
    nav.appendChild(bar);
    let queued = false;
    const paint = () => {
      queued = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      fill.style.transform = "scaleX(" + p.toFixed(4) + ")";
    };
    const queue = () => {
      if (!queued) { queued = true; window.requestAnimationFrame(paint); }
    };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    paint();
  }

  // .in = parts rise (once). .live = loops run (only while on screen).
  document.querySelectorAll(".dg, [data-live]").forEach((el) => {
    watch(
      el,
      () => el.classList.add("in", "live"),
      () => el.classList.remove("live"),
      0.15
    );
  });

  const stepCards = (el) => (el.closest("section") || document).querySelectorAll("[data-step-card]");

  // Home "How it works": select a step; the diagram and step card follow.
  // It moves to the next step by itself only while on screen, and stops
  // for good when you select a step.
  document.querySelectorAll("[data-stepper]").forEach((box) => {
    const btns = box.querySelectorAll("[data-step-btn]");
    const cards = stepCards(box);
    let cur = 1;
    let timer = 0;
    let user = false;
    const set = (i) => {
      cur = i;
      box.dataset.step = String(i);
      btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stepBtn === String(i))));
      cards.forEach((c) => c.classList.toggle("is-active", c.dataset.stepCard === String(i)));
    };
    const stop = () => { window.clearInterval(timer); timer = 0; };
    const start = () => {
      if (!timer && !user && !still()) timer = window.setInterval(() => set((cur % btns.length) + 1), 3800);
    };
    btns.forEach((b) =>
      b.addEventListener("click", () => { user = true; stop(); set(Number(b.dataset.stepBtn)); })
    );
    watch(box, start, stop, 0.4);
  });

  // Extension "How it works": without/with toggle, and boxes you can
  // select to read what each part does.
  document.querySelectorAll("[data-ba]").forEach((ba) => {
    const btns = ba.querySelectorAll("[data-ba-set]");
    const nodes = ba.querySelectorAll(".dg-node");
    const title = ba.querySelector("[data-detail-title]");
    const text = ba.querySelector("[data-detail-text]");
    const cards = stepCards(ba);
    let selected = ba.querySelector('.dg-node[aria-pressed="true"]') || nodes[0];
    let touched = false;
    const show = (t, x) => { title.textContent = t; text.textContent = x; };
    const pick = (node) => {
      selected = node;
      nodes.forEach((n) => n.setAttribute("aria-pressed", String(n === node)));
      show(node.dataset.title, node.dataset.text);
      cards.forEach((c) => c.classList.toggle("is-active", c.dataset.stepCard === node.dataset.step));
    };
    const setState = (s) => {
      ba.dataset.state = s;
      btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.baSet === s)));
      if (s === "before") {
        show(ba.dataset.beforeTitle, ba.dataset.beforeText);
        cards.forEach((c) => c.classList.remove("is-active"));
      } else if (selected) {
        pick(selected);
      }
    };
    btns.forEach((b) => b.addEventListener("click", () => { touched = true; setState(b.dataset.baSet); }));
    nodes.forEach((n) => {
      n.addEventListener("click", () => { touched = true; pick(n); });
      n.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); touched = true; pick(n); }
      });
    });
    // Tell the story once: start at "without", then change to "with"
    // a moment after it comes into view. Not with reduced motion.
    if (!still()) {
      setState("before");
      let pending = 0;
      watch(
        ba,
        () => {
          if (!touched && !pending && ba.dataset.state === "before") {
            pending = window.setTimeout(() => { if (!touched) setState("after"); }, 2400);
          }
        },
        () => { window.clearTimeout(pending); pending = 0; },
        0.5
      );
    }
  });

  // Check page: a result number counts up once when you first see it.
  // The final number is in the page from the start (for screen readers).
  const countUp = (el) => {
    const end = Number(el.textContent);
    if (el.dataset.counted || !(end > 1) || end > 9999) return;
    el.dataset.counted = "1";
    if (still()) return;
    const run = () => {
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 900);
        el.textContent = String(Math.round(end * (1 - Math.pow(1 - k, 3))));
        if (k < 1) window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    };
    if (!hasIO) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run(); }
    }, { threshold: 0.6 });
    io.observe(el);
  };
  document.querySelectorAll(".check-body").forEach((body) => {
    const scan = () => body.querySelectorAll(".check-hero-value:not(.check-mono)").forEach(countUp);
    new MutationObserver(scan).observe(body, { childList: true, subtree: true });
    scan();
  });
});
