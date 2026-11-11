// PrivacyBrew feedback page.
// Passes only the details the extension user chose to share (v, browser)
// to the embedded Tally form. Nothing else is read or sent.
(() => {
  "use strict";
  const FORM_ID = "PdM2QV";
  const ALLOWED = ["v", "browser"];

  const incoming = new URLSearchParams(location.search);
  const params = new URLSearchParams({ hideTitle: "1", transparentBackground: "1", dynamicHeight: "1" });
  const shared = [];
  for (const key of ALLOWED) {
    const value = (incoming.get(key) || "").slice(0, 100);
    if (value) {
      params.set(key, value);
      shared.push([key, value]);
    }
  }

  const frame = document.getElementById("feedback-frame");
  const status = document.getElementById("feedback-status");
  const statusText = document.getElementById("feedback-status-text");
  const statusFix = document.getElementById("feedback-status-fix");
  let formReady = false;
  let failTimer;

  // The form is hidden until Tally answers, so nobody looks at an empty box.
  // If it does not answer in time, say why and give a way forward.
  function showProblem(message) {
    if (formReady) return;
    statusText.textContent = message;
    statusFix.hidden = false;
  }
  function loadForm() {
    clearTimeout(failTimer);
    statusText.textContent = "Loading the form. This takes a few seconds.";
    statusFix.hidden = true;
    if (!navigator.onLine) {
      showProblem("You are offline, so the form cannot load. Connect to the internet and try again.");
      return;
    }
    frame.src = `https://tally.so/embed/${FORM_ID}?${params.toString()}&t=${Date.now()}`;
    failTimer = setTimeout(() => showProblem("The form did not load."), 12000);
  }
  function formLoaded() {
    if (formReady) return;
    formReady = true;
    clearTimeout(failTimer);
    status.hidden = true;
    frame.classList.remove("waiting");
  }
  document.getElementById("feedback-retry").addEventListener("click", loadForm);
  window.addEventListener("online", () => { if (!formReady) loadForm(); });
  loadForm();

  const labels = { v: "Extension version", browser: "Browser" };
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
    formLoaded();
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === "Tally.FormHeightChanged" && msg.payload && msg.payload.height) {
        frame.style.height = Math.min(Math.max(msg.payload.height, 300), 2000) + "px";
      }
    } catch (err) { /* not a Tally message */ }
  });
})();
