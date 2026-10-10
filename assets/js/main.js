// PrivacyBrew site — small, dependency-free interaction layer.
// Two jobs only: fade/slide sections into view on scroll, and toggle the
// mobile nav. No frameworks, no analytics, nothing phoning home — same
// spirit as the app itself.

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

    const sectionIds = ["features", "why-it-matters", "how-it-works", "compare"];
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
});
