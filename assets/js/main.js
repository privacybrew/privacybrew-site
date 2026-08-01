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
});
