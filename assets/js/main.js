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
    toggle.addEventListener("click", () => {
      links.classList.toggle("open");
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

    const sectionIds = ["features", "why-it-matters", "how-it-works", "compare", "roadmap"];
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
    };

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
