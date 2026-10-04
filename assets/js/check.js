// PrivacyBrew Browser Privacy Check.
// Everything here runs in the visitor's browser. Nothing is sent to
// PrivacyBrew. The only network requests are the two opt-in tests in
// section 5, and only after the visitor taps them.

(() => {
  "use strict";

  // ---------- helpers ----------

  const $ = (sel, root = document) => root.querySelector(sel);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  async function sha256(text) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    // Fallback (FNV-1a) for non-secure contexts; only used for display codes.
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }

  const shortCode = (hex) => (hex.slice(0, 4) + "-" + hex.slice(4, 8)).toUpperCase();
  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r("timeout"), ms))]);

  // ---------- browser detection (for "what you can do" tips) ----------

  function browserName() {
    const ua = navigator.userAgent;
    if (navigator.brave) return "Brave";
    if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
    if (/Edg\//.test(ua)) return "Edge";
    if (/OPR\//.test(ua)) return "Opera";
    if (/DuckDuckGo/.test(ua)) return "DuckDuckGo";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Chrome\//.test(ua)) return "Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    return "your browser";
  }
  const BROWSER = browserName();

  const TIPS = {
    cookies: {
      Chrome: "In Chrome: Settings › Privacy and security › Third-party cookies › Block third-party cookies.",
      Edge: "In Edge: Settings › Privacy, search, and services › Cookies › turn on Block third-party cookies.",
      Opera: "In Opera: Settings › Privacy & security › Third-party cookies › Block third-party cookies.",
      "Samsung Internet": "In Samsung Internet: Settings › Privacy › turn on Smart anti-tracking and block third-party cookies.",
      default: "Look for \"Block third-party cookies\" in your browser's privacy settings.",
    },
    fingerprint: {
      Chrome: "Chrome doesn't resist fingerprinting on its own. Brave and Firefox (Enhanced Tracking Protection set to Strict) do.",
      Edge: "In Edge, set Tracking prevention to Strict (Settings › Privacy, search, and services). It blocks known fingerprinting scripts, but doesn't scramble these readouts.",
      Firefox: "In Firefox, set Enhanced Tracking Protection to Strict (Settings › Privacy & Security) to block known fingerprinting scripts.",
      Safari: "Safari adds extra fingerprinting protection in Private Browsing windows.",
      default: "Browsers like Brave and Firefox (Strict mode) make fingerprinting harder.",
    },
    gpc: {
      Firefox: "In Firefox: Settings › Privacy & Security › turn on \"Tell websites not to sell or share my data\".",
      default: `${BROWSER === "your browser" ? "Your browser" : BROWSER} doesn't send this signal on its own. Brave, DuckDuckGo and Firefox can; in other browsers it takes an extension.`,
    },
  };
  const tip = (topic) => TIPS[topic][BROWSER] || TIPS[topic].default;

  // ---------- results model + rendering ----------

  // status: "neutral" (just a fact), "good", or "risk"
  const results = {};

  const STATUS_LABEL = { good: "Protected", risk: "Exposed", neutral: "Shared with every site", info: "Good to know" };

  function renderSection(id, { status, statusText, rows, soWhat, todo, note }) {
    const body = $(`#${id} .check-body`);
    body.textContent = "";
    const card = el("div", "check-card");
    const head = el("div", "check-card-head");
    head.append(el("span", `check-chip check-chip-${status}`, statusText || STATUS_LABEL[status]));
    card.append(head);
    if (rows && rows.length) {
      const dl = el("dl", "check-rows");
      rows.forEach(([k, v]) => {
        dl.append(el("dt", null, k), el("dd", null, v));
      });
      card.append(dl);
    }
    if (note) card.append(el("p", "check-note", note));
    if (soWhat) {
      const p = el("p", "check-sowhat");
      p.append(el("strong", null, "So what? "), soWhat);
      card.append(p);
    }
    if (todo) {
      const p = el("p", "check-todo");
      p.append(el("strong", null, "What you can do: "), todo);
      card.append(p);
    }
    body.append(card);
  }

  function renderResult(cardId, { status, statusText, lines, soWhat, todo }) {
    const box = $(`#${cardId} .check-result`);
    box.textContent = "";
    box.append(el("span", `check-chip check-chip-${status}`, statusText));
    (lines || []).forEach((l) => box.append(el("p", null, l)));
    if (soWhat) {
      const p = el("p", "check-sowhat");
      p.append(el("strong", null, "So what? "), soWhat);
      box.append(p);
    }
    if (todo) {
      const p = el("p", "check-todo");
      p.append(el("strong", null, "What you can do: "), todo);
      box.append(p);
    }
  }

  function renderSummary() {
    const s = $("#summary");
    s.textContent = "";
    const items = [
      ["Fingerprint", results.fingerprint],
      ["Privacy signal", results.signals],
      ["Third-party cookies", results.cookies],
      ["Tracker blocking", results.trackers],
      ["IP leak", results.webrtc],
    ].filter(([, r]) => r);
    if (!items.length) {
      s.append(el("span", "check-summary-label", "Running checks…"));
      return;
    }
    items.forEach(([label, r]) => {
      const chip = el("span", `check-chip check-chip-${r.status}`);
      chip.append(el("strong", null, label + ": "), r.short);
      s.append(chip);
    });
  }

  // ---------- 1. arrival data ----------

  async function arrival() {
    const uaData = navigator.userAgentData;
    let browser = BROWSER;
    let os = "";
    let device = "";
    if (uaData && uaData.getHighEntropyValues) {
      try {
        const hi = await uaData.getHighEntropyValues(["platformVersion", "model", "fullVersionList"]);
        const brand = (hi.fullVersionList || []).find((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand));
        if (brand) browser = `${brand.brand} ${brand.version.split(".")[0]}`;
        os = `${hi.platform || uaData.platform} ${hi.platformVersion || ""}`.trim();
        if (hi.model) device = hi.model;
      } catch (e) { /* fall back to the user agent below */ }
    }
    const ua = navigator.userAgent;
    if (!os) {
      const m = ua.match(/\(([^)]+)\)/);
      os = m ? m[1].split(";").slice(0, 2).join(",").trim() : "Unknown";
    }
    if (browser === BROWSER) {
      const m = ua.match(/(Firefox|Version|Chrome|Edg|OPR)\/(\d+)/);
      if (m) browser = `${BROWSER} ${m[2]}`;
    }
    const mobile = (uaData && uaData.mobile) || /Mobi|Android|iPhone|iPad/.test(ua) || navigator.maxTouchPoints > 1;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
    const langs = (navigator.languages || [navigator.language]).join(", ");
    const rows = [
      ["Browser", browser],
      ["Operating system", os],
      ["Device", device ? `${device} (${mobile ? "phone or tablet" : "computer"})` : mobile ? "Phone or tablet" : "Computer"],
      ["Screen", `${screen.width} × ${screen.height}, ${window.devicePixelRatio}× pixel density`],
      ["Time zone", tz],
      ["Languages", langs],
      ["Processor cores", String(navigator.hardwareConcurrency || "Not shared")],
    ];
    if (navigator.deviceMemory) rows.push(["Memory", `About ${navigator.deviceMemory} GB`]);
    rows.push(["Page you came from", document.referrer || "Not shared"]);

    results.arrival = { rows, tz, langs, screen: `${screen.width}x${screen.height}x${devicePixelRatio}`, browser, os };
    renderSection("arrival", {
      status: "neutral",
      rows,
      soWhat: "No single detail here names you. But your time zone and languages hint at where you live, and " +
        "all of them together narrow you down a lot. Every website, ad and embedded widget gets this without asking.",
      todo: "There's no switch to hide all of this; browsers need some of it to show pages properly. " +
        "What matters is whether sites can combine it into a fingerprint (next section).",
    });
  }

  // ---------- 2. fingerprint ----------

  function canvasData() {
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = 60;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.textBaseline = "top";
    ctx.font = "16px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(100, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("PrivacyBrew, \u{1F375} 1.0", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("PrivacyBrew, \u{1F375} 1.0", 4, 17);
    return c.toDataURL();
  }

  // Known-answer test: a plain solid square must read back exactly. If it
  // doesn't, the browser is adding noise to canvas readouts (Brave, Safari
  // private windows, some extensions).
  function canvasIsScrambled() {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    ctx.fillStyle = "rgb(10, 20, 30)";
    ctx.fillRect(0, 0, 16, 16);
    const d = ctx.getImageData(0, 0, 16, 16).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] !== 10 || d[i + 1] !== 20 || d[i + 2] !== 30 || d[i + 3] !== 255) return true;
    }
    return false;
  }

  function webglInfo() {
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      if (!gl) return { renderer: "Not available", vendor: "" };
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    } catch (e) {
      return { renderer: "Not available", vendor: "" };
    }
  }

  async function audioSignature() {
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx) return null;
    try {
      const ctx = new Ctx(1, 5000, 44100);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 10000;
      const comp = ctx.createDynamicsCompressor();
      osc.connect(comp);
      comp.connect(ctx.destination);
      osc.start(0);
      const buf = await withTimeout(ctx.startRendering(), 2000);
      if (buf === "timeout") return null;
      const data = buf.getChannelData(0);
      let sum = 0;
      for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
      return sum.toString();
    } catch (e) {
      return null;
    }
  }

  const FONTS = [
    "Arial", "Arial Black", "Calibri", "Cambria", "Candara", "Century Gothic", "Comic Sans MS", "Consolas",
    "Constantia", "Corbel", "Courier New", "DejaVu Sans", "Ebrima", "Franklin Gothic Medium", "Futura", "Garamond",
    "Geneva", "Georgia", "Gill Sans", "Helvetica", "Helvetica Neue", "Impact", "Lucida Console", "Lucida Grande",
    "Menlo", "Monaco", "Noto Sans", "Optima", "Palatino", "Roboto", "Segoe UI", "SF Pro Display", "Tahoma",
    "Times New Roman", "Trebuchet MS", "Ubuntu", "Verdana", "Liberation Sans", "Cantarell", "Fira Sans",
  ];

  // A font is "installed" if text drawn in it measures differently from all
  // three generic fallbacks, the same trick fingerprinting scripts use.
  function installedFonts() {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return [];
    const sample = "mmmmmmmmmmlli1WwQ@#";
    const base = ["monospace", "serif", "sans-serif"].map((f) => {
      ctx.font = `48px ${f}`;
      return ctx.measureText(sample).width;
    });
    return FONTS.filter((font) =>
      ["monospace", "serif", "sans-serif"].some((f, i) => {
        ctx.font = `48px "${font}", ${f}`;
        return ctx.measureText(sample).width !== base[i];
      }),
    );
  }

  async function fingerprint() {
    const scrambled = canvasIsScrambled();
    const canvas = canvasData();
    const gl = webglInfo();
    const audio = await audioSignature();
    const fonts = installedFonts();
    const a = results.arrival || {};
    const combined = [a.browser, a.os, a.screen, a.tz, a.langs, navigator.hardwareConcurrency, canvas,
      gl.vendor, gl.renderer, audio, fonts.join(",")].join("|");
    const code = shortCode(await sha256(combined));
    const canvasCode = canvas ? shortCode(await sha256(canvas)) : "Not available";
    const audioCode = audio ? shortCode(await sha256(audio)) : "Not available";

    const rows = [
      ["Your fingerprint code", code],
      ["Drawing test (canvas)", scrambled ? `${canvasCode} (scrambled by your browser)` : canvasCode],
      ["Graphics card (WebGL)", gl.renderer || "Not shared"],
      ["Audio test", audioCode],
      ["Fonts detected", fonts.length ? `${fonts.length}: ${fonts.slice(0, 6).join(", ")}${fonts.length > 6 ? "…" : ""}` : "None detected"],
    ];

    results.fingerprint = scrambled
      ? { status: "good", short: "scrambled", code }
      : { status: "risk", short: "readable", code };
    renderSection("fingerprint", {
      status: results.fingerprint.status,
      statusText: scrambled ? "Partly protected" : "Readable by any site",
      rows,
      note: "Your fingerprint code changes if you switch browsers or devices. Compare it across browsers to see which ones give away less.",
      soWhat: scrambled
        ? "Your browser adds tiny random changes to drawing tests, so trackers get a different answer on " +
          "different sites and can't easily link your visits. Other details above still help identify you."
        : "Trackers combine these results into an ID that stays the same across websites, even if you clear " +
          "cookies or use a private window. It's one of the main ways you're followed around the web without cookies.",
      todo: scrambled ? null : tip("fingerprint"),
    });
  }

  // ---------- 3. privacy signals ----------

  function signals() {
    const gpc = navigator.globalPrivacyControl === true;
    const dnt = navigator.doNotTrack === "1" || window.doNotTrack === "1";
    results.signals = gpc ? { status: "good", short: "GPC on" } : { status: "risk", short: "not sent" };
    renderSection("signals", {
      status: results.signals.status,
      statusText: gpc ? "Sending Global Privacy Control" : "Not sending Global Privacy Control",
      rows: [
        ["Global Privacy Control", gpc ? "On" : "Off"],
        ["Do Not Track", dnt ? "On (most sites ignore it)" : "Off"],
      ],
      soWhat: "Global Privacy Control tells every site \"don't sell or share my data\". In some places, like " +
        "California and Colorado, sites are legally required to honor it. Do Not Track is an older signal that " +
        "most sites ignore and that browsers are phasing out.",
      todo: gpc ? null : tip("gpc"),
    });
  }

  // ---------- 4. third-party cookies ----------

  // The test frame lives on a different website, so to the browser it's a
  // third party, just like an ad or tracker embedded in a page.
  function cookieTestOrigin() {
    const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    return local ? "http://127.0.0.1:8766" : "https://privacybrew.github.io";
  }

  function cookies() {
    const origin = cookieTestOrigin();
    const src = origin + (origin.includes("github.io") ? "/cookie-test/" : "/");
    const frame = el("iframe", "check-hidden-frame");
    frame.title = "Third-party cookie test";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;

    const done = (r) => {
      window.removeEventListener("message", onMessage);
      frame.remove();
      let view;
      if (!r) {
        results.cookies = { status: "neutral", short: "couldn't test" };
        view = {
          status: "neutral",
          statusText: "Couldn't run this test",
          soWhat: "The test page didn't respond. A strict blocker or network setting may have stopped it, which " +
            "usually means third-party content is being blocked too.",
        };
      } else if (r.unpartitioned) {
        results.cookies = { status: "risk", short: "allowed" };
        view = {
          status: "risk",
          statusText: "Allowed",
          soWhat: "An ad or tracker embedded on one site can set a cookie and read it back on every other site " +
            "that embeds it, building a list of where you go. Chrome still allows this by default.",
          todo: tip("cookies"),
        };
      } else if (r.partitioned) {
        results.cookies = { status: "good", short: "kept separate" };
        view = {
          status: "good",
          statusText: "Kept separate per site",
          soWhat: "Your browser lets embedded content keep cookies, but only within each site. A tracker on two " +
            "different sites sees two unrelated cookies, so it can't follow you between them this way.",
        };
      } else {
        results.cookies = { status: "good", short: "blocked" };
        view = {
          status: "good",
          statusText: "Blocked",
          soWhat: "Ads and trackers embedded on websites can't use cookies to follow you from site to site.",
        };
      }
      renderSection("cookies", view);
      renderSummary();
    };

    function onMessage(e) {
      if (e.origin !== origin || !e.data || e.data.pbCookieTest !== true) return;
      clearTimeout(timer);
      done(e.data);
    }
    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => done(null), 6000);
    frame.src = src;
    document.body.append(frame);
  }

  // ---------- 5a. opt-in: tracker blocking ----------

  const TRACKER_PROBES = [
    ["Google Analytics", "https://www.google-analytics.com/analytics.js"],
    ["Google ads (DoubleClick)", "https://static.doubleclick.net/instream/ad_status.js"],
    ["Meta Pixel", "https://connect.facebook.net/en_US/fbevents.js"],
    ["Microsoft Ads", "https://bat.bing.com/bat.js"],
  ];

  async function probe(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    try {
      await fetch(url, { mode: "no-cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: ctrl.signal });
      return "loaded";
    } catch (e) {
      return ctrl.signal.aborted ? "timeout" : "blocked";
    } finally {
      clearTimeout(t);
    }
  }

  async function trackers() {
    if (!navigator.onLine) {
      renderResult("trackers", { status: "neutral", statusText: "You're offline", lines: ["Connect to the internet and try again."] });
      return;
    }
    const out = await Promise.all(TRACKER_PROBES.map(async ([name, url]) => [name, await probe(url)]));
    const blocked = out.filter(([, r]) => r === "blocked").length;
    const loaded = out.filter(([, r]) => r === "loaded").length;
    const lines = out.map(([name, r]) => `${name}: ${r === "blocked" ? "blocked" : r === "loaded" ? "not blocked" : "no answer"}`);
    let view;
    if (blocked === out.length) {
      results.trackers = { status: "good", short: "all blocked" };
      view = { status: "good", statusText: "All blocked", soWhat: "Something in your browser stops these well-known trackers before they load." };
    } else if (loaded === out.length) {
      results.trackers = { status: "risk", short: "none blocked" };
      view = {
        status: "risk",
        statusText: "None blocked",
        soWhat: "Most websites embed scripts like these. Without a blocker, each one learns which page you're on " +
          "and can link it to what you do on other sites.",
        todo: "Switch to a browser with built-in tracker blocking (Brave, DuckDuckGo, or Firefox with Strict " +
          "protection), or add a well-known tracker-blocking extension.",
      };
    } else {
      results.trackers = { status: "risk", short: `${blocked} of ${out.length} blocked` };
      view = {
        status: "risk",
        statusText: `${blocked} of ${out.length} blocked`,
        soWhat: "Some trackers are stopped, others get through.",
        todo: "Turn up your browser's tracking protection, or add a tracker-blocking extension.",
      };
    }
    view.lines = lines;
    renderResult("trackers", view);
    renderSummary();
  }

  // ---------- 5b. opt-in: WebRTC IP leak ----------

  const isPrivateIp = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|fe80)/i.test(ip);

  async function webrtc() {
    if (!window.RTCPeerConnection) {
      results.webrtc = { status: "good", short: "WebRTC off" };
      renderResult("webrtc", { status: "good", statusText: "Can't leak", soWhat: "WebRTC is turned off in your browser, so it can't reveal your IP address." });
      renderSummary();
      return;
    }
    const found = { public: new Set(), local: new Set(), hidden: 0 };
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.createDataChannel("pb");
    pc.onicecandidate = (e) => {
      if (!e.candidate || !e.candidate.candidate) return;
      const parts = e.candidate.candidate.split(" ");
      const addr = parts[4];
      const type = parts[parts.indexOf("typ") + 1];
      if (!addr) return;
      if (addr.endsWith(".local")) found.hidden++;
      else if (type === "srflx") found.public.add(addr);
      else if (type === "host" && isPrivateIp(addr)) found.local.add(addr);
    };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise((r) => {
        const t = setTimeout(r, 5000);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === "complete") { clearTimeout(t); r(); }
        };
      });
    } finally {
      pc.close();
    }
    const lines = [];
    if (found.public.size) lines.push(`Public IP address WebRTC reveals: ${[...found.public].join(", ")}`);
    lines.push(found.local.size ? `Home network address: ${[...found.local].join(", ")} (visible)` : "Home network address: hidden");
    let view;
    if (found.local.size) {
      results.webrtc = { status: "risk", short: "local address visible" };
      view = {
        status: "risk",
        statusText: "Network address visible",
        soWhat: "Sites can see your device's address on your home or office network, an extra detail that helps fingerprint you.",
        todo: "Update your browser, or turn off WebRTC IP sharing in its privacy settings.",
      };
    } else {
      results.webrtc = { status: "neutral", short: "check if you use a VPN" };
      view = {
        status: "neutral",
        statusText: found.public.size ? "Compare with your VPN" : "Nothing revealed",
        soWhat: "Every site sees your public IP address anyway. This only matters if you use a VPN: if the address " +
          "above is your real home connection instead of your VPN's, your VPN is leaking it to websites.",
        todo: "If it leaks, turn on your VPN app's WebRTC or leak protection, or use a browser that limits WebRTC.",
      };
    }
    view.lines = lines;
    renderResult("webrtc", view);
    renderSummary();
  }

  // ---------- copy results ----------

  function resultsText() {
    const lines = [`PrivacyBrew Browser Privacy Check (${BROWSER})`, ""];
    (results.arrival ? results.arrival.rows : []).forEach(([k, v]) => lines.push(`${k}: ${v}`));
    if (results.fingerprint) lines.push(`Fingerprint: ${results.fingerprint.short} (code ${results.fingerprint.code})`);
    if (results.signals) lines.push(`Global Privacy Control: ${results.signals.short}`);
    if (results.cookies) lines.push(`Third-party cookies: ${results.cookies.short}`);
    if (results.trackers) lines.push(`Tracker blocking: ${results.trackers.short}`);
    if (results.webrtc) lines.push(`IP leak test: ${results.webrtc.short}`);
    lines.push("", "Check yours: https://privacybrew.app/check.html");
    return lines.join("\n");
  }

  // ---------- wire up ----------

  document.addEventListener("DOMContentLoaded", async () => {
    document.querySelectorAll(".check-run").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const which = btn.dataset.test;
        btn.disabled = true;
        btn.textContent = "Testing…";
        try {
          await (which === "trackers" ? trackers() : webrtc());
        } catch (e) {
          renderResult(which, { status: "neutral", statusText: "Couldn't run this test", lines: [String(e.message || e)] });
        }
        btn.textContent = "Run again";
        btn.disabled = false;
      });
    });

    $("#copy-results").addEventListener("click", async () => {
      const msg = $("#copied");
      try {
        await navigator.clipboard.writeText(resultsText());
        msg.textContent = "Copied. Nothing was sent anywhere.";
      } catch (e) {
        msg.textContent = "Couldn't copy on this browser.";
      }
    });

    await arrival();
    await fingerprint();
    signals();
    renderSummary();
    cookies();
  });
})();
