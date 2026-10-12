// PrivacyBrew feedback page.
// Passes only the details the extension user chose to share (v, browser, page)
// to the embedded Tally form. Nothing else is read or sent.
(() => {
  "use strict";
  const FORM_ID = "PdM2QV";
  const ALLOWED = ["v", "browser", "page"];

  const incoming = new URLSearchParams(location.search);
  const params = new URLSearchParams({ hideTitle: "1", transparentBackground: "1", dynamicHeight: "1" });
  const shared = [];
  for (const key of ALLOWED) {
    let value = (incoming.get(key) || "").slice(0, 300);
    if (key === "page" && value) {
      // Keep the website address only: no query string or fragment.
      try {
        const u = new URL(value);
        value = u.origin + u.pathname;
      } catch (e) {
        value = "";
      }
    }
    if (value) {
      params.set(key, value);
      shared.push([key, value]);
    }
  }

  const frame = document.getElementById("feedback-frame");
  frame.src = `https://tally.so/embed/${FORM_ID}?${params.toString()}`;

  const labels = { v: "Extension version", browser: "Browser", page: "Page" };
  const box = document.getElementById("feedback-shared");
  if (shared.length) {
    const list = document.createElement("dl");
    for (const [k, v] of shared) {
      const dt = document.createElement("dt");
      dt.textContent = labels[k];
      const dd = document.createElement("dd");
      dd.textContent = v;
      list.append(dt, dd);
    }
    box.querySelector(".feedback-shared-list").append(list);
    box.hidden = false;
  }

  // Tally reports its height so the form does not need its own scroll bar.
  window.addEventListener("message", (e) => {
    if (e.origin !== "https://tally.so" || typeof e.data !== "string") return;
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === "Tally.FormHeightChanged" && msg.payload && msg.payload.height) {
        frame.style.height = Math.min(Math.max(msg.payload.height, 300), 2000) + "px";
      }
    } catch (err) { /* not a Tally message */ }
  });
})();
