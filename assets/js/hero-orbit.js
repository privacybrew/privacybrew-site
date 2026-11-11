// Orbit hero. Two small effects, both skipped for reduced motion:
// 1. The headline types itself, letter by letter, with a blinking cursor.
// 2. The centre number counts up from 0.
// Without JS the full headline and the real number simply show.
(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const h1 = document.querySelector(".hero-orbit h1");
  if (h1) {
    // Screen readers read this copy once, in full.
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = h1.textContent;
    // Wrap each letter of the visible copy, keeping the gold "data" span.
    const letters = [];
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          for (const ch of n.textContent) {
            const s = document.createElement("span");
            s.className = "tw";
            s.textContent = ch;
            frag.appendChild(s);
            letters.push(s);
          }
          n.replaceWith(frag);
        } else {
          walk(n);
        }
      });
    };
    const visible = document.createElement("span");
    visible.setAttribute("aria-hidden", "true");
    while (h1.firstChild) visible.appendChild(h1.firstChild);
    walk(visible);
    h1.append(sr, visible);
    h1.classList.add("typing");

    let i = 0;
    const type = () => {
      if (i > 0) letters[i - 1].classList.remove("cur");
      if (i < letters.length) {
        letters[i].classList.add("on", "cur");
        i += 1;
        setTimeout(type, letters[i - 1].textContent === " " ? 20 : 45);
      } else {
        // Done: keep the cursor briefly, then draw the gold underline.
        const last = letters[letters.length - 1];
        last.classList.add("cur");
        h1.classList.replace("typing", "typed-wait");
        setTimeout(() => h1.classList.remove("typed-wait"), 150);
        setTimeout(() => last.classList.remove("cur"), 2400);
      }
    };
    setTimeout(type, 400);
  }

  const el = document.querySelector(".core-count");
  if (el) {
    const target = Number(el.dataset.count) || 0;
    const ms = 1600;
    el.textContent = "0";
    setTimeout(() => {
      // Start the clock on the first frame. A frame time can be a little
      // earlier than a time read before it, which would make p negative.
      let t0 = null;
      let done = false;
      const step = (now) => {
        if (done) return;
        if (t0 === null) t0 = now;
        const p = Math.max(0, Math.min(1, (now - t0) / ms));
        el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      // If frames stall (background tab, some tools), show the real number anyway.
      setTimeout(() => { done = true; el.textContent = String(target); }, ms + 300);
    }, 500);
  }
})();
