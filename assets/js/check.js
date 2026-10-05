// PrivacyBrew Browser Privacy Check.
// Everything here runs in the visitor's browser. Nothing is sent to
// PrivacyBrew. The only network requests are the opt-in tests (section 7)
// and the location test (section 5), only after the visitor taps them.

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
  // Longer, ID-style version (16 hex digits) for the headline "browser ID".
  const browserIdCode = (hex) => hex.slice(0, 16).toUpperCase().match(/.{4}/g).join("-");
  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r("timeout"), ms))]);

  // ---------- browser detection (for "what you can do" tips) ----------

  function browserName() {
    const ua = navigator.userAgent;
    if (navigator.brave) return "Brave";
    if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
    if (/Edg\/|EdgiOS\//.test(ua)) return "Edge";
    if (/OPR\//.test(ua)) return "Opera";
    if (/DuckDuckGo/.test(ua)) return "DuckDuckGo";
    if (/Firefox\/|FxiOS\//.test(ua)) return "Firefox";
    if (/Chrome\/|CriOS\//.test(ua)) return "Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    return "your browser";
  }
  const BROWSER = browserName();

  const TIPS = {
    cookies: {
      Chrome: "In Chrome: Settings › Privacy and security › Third-party cookies › Block third-party cookies.",
      Edge: "In Edge: Settings › Privacy, search, and services › Cookies › turn on Block third-party cookies.",
      Opera: "In Opera: Settings › Privacy & security › Third-party cookies › Block third-party cookies.",
      "Samsung Internet": "In Samsung Internet: Settings › Privacy › turn on Smart anti-tracking.",
      default: "In your browser privacy settings, find \"Block third-party cookies\" and turn it on.",
    },
    fingerprint: {
      Chrome: "Chrome does not protect you from fingerprints. Brave does. Firefox does when you set it to Strict.",
      Edge: "In Edge: Settings › Privacy, search, and services › set Tracking prevention to Strict.",
      Firefox: "In Firefox: Settings › Privacy & Security › set Enhanced Tracking Protection to Strict.",
      Safari: "Safari gives more protection in Private Browsing windows.",
      default: "Brave and Firefox (Strict mode) give more protection from fingerprints.",
    },
    gpc: {
      Firefox: "In Firefox: Settings › Privacy & Security › turn on \"Tell websites not to sell or share my data\".",
      default: `${BROWSER === "your browser" ? "Your browser" : BROWSER} does not send this request. ` +
        "Brave, DuckDuckGo and Firefox can send it. Other browsers need an extension.",
    },
  };
  const tip = (topic) => TIPS[topic][BROWSER] || TIPS[topic].default;

  // ---------- results model + rendering ----------

  // status: "neutral" (just a fact), "good", or "risk"
  const results = {};

  const STATUS_LABEL = { good: "Protected", risk: "Exposed", neutral: "All websites get this", info: "Good to know" };

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

  // Simple line icons (24x24, stroke). Built as DOM nodes so the strict CSP holds.
  const ICONS = {
    device: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
    laptop: "M5 5h14v10H5zM2 19h20",
    system: "M3 4h18v16H3zM3 8h18M6 6h.01M8.5 6h.01",
    browser: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18",
    clock: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2",
    language: "M4 5h11v8H9l-4 3v-3H4zM15 9h5v8h-1v3l-3-3h-4v-2",
    screen: "M3 4h18v12H3zM3 13h18M8 20h8",
    font: "M4 20L10 4h1l6 16M6.5 14h8M17 20h3",
    chip: "M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
    draw: "M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3",
    audio: "M3 12h2l2-6 3 12 3-9 2 6 2-3h4",
  };

  function icon(name) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "check-icon");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", ICONS[name]);
    svg.append(path);
    return svg;
  }

  // Info card: a headline number, a grid of tiles, and the rest behind a toggle.
  // Used for sections that only show what the browser hands over.
  function renderInfoCard(id, { status, statusText, hero, meter, tiles, more, note, soWhat, todo }) {
    const body = $(`#${id} .check-body`);
    body.textContent = "";
    const card = el("div", "check-card check-info");
    const head = el("div", "check-card-head");
    head.append(el("span", `check-chip check-chip-${status}`, statusText || STATUS_LABEL[status]));
    card.append(head);

    const h = el("div", "check-hero");
    h.append(el("div", `check-hero-value${hero.mono ? " check-mono" : ""}`, hero.value));
    h.append(el("div", "check-hero-label", hero.label));
    card.append(h);

    if (meter) {
      const m = el("div", "check-meter");
      const bar = el("div", "check-meter-bar");
      const fill = el("div", `check-meter-fill check-meter-${status}`);
      fill.style.width = `${Math.round((meter.value / meter.max) * 100)}%`;
      bar.append(fill);
      m.append(bar, el("div", "check-meter-label", meter.label));
      card.append(m);
    }

    const grid = el("div", tiles.length === 4 ? "check-tiles check-tiles-2" : "check-tiles");
    tiles.forEach((t) => {
      const tile = el("div", "check-tile");
      tile.append(icon(t.icon));
      const v = el("div", `check-tile-value${t.mono ? " check-mono" : ""}`, t.value);
      v.title = t.value;
      tile.append(v, el("div", "check-tile-label", t.label));
      grid.append(tile);
    });
    card.append(grid);

    if (more && more.rows.length) {
      const btn = el("button", "check-more", more.label);
      btn.type = "button";
      btn.setAttribute("aria-expanded", "false");
      const dl = el("dl", "check-rows");
      dl.hidden = true;
      more.rows.forEach(([k, v]) => dl.append(el("dt", null, k), el("dd", null, v)));
      btn.addEventListener("click", () => {
        dl.hidden = !dl.hidden;
        btn.setAttribute("aria-expanded", String(!dl.hidden));
        btn.textContent = dl.hidden ? more.label : "Hide details";
      });
      card.append(btn, dl);
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
      ["Don't sell my data", results.signals],
      ["Autofill", results.autofill],
      ["Site access", results.access],
      ["Cross-site cookies", results.cookies],
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

  // Model codes some phones report, mapped to the names people know.
  // Samsung codes: SM-<series><model><region>, so match the prefix only.
  const MODEL_NAMES = [
    [/^SM-S931/, "Galaxy S25"], [/^SM-S936/, "Galaxy S25+"], [/^SM-S938/, "Galaxy S25 Ultra"],
    [/^SM-S921/, "Galaxy S24"], [/^SM-S926/, "Galaxy S24+"], [/^SM-S928/, "Galaxy S24 Ultra"], [/^SM-S721/, "Galaxy S24 FE"],
    [/^SM-S911/, "Galaxy S23"], [/^SM-S916/, "Galaxy S23+"], [/^SM-S918/, "Galaxy S23 Ultra"], [/^SM-S711/, "Galaxy S23 FE"],
    [/^SM-S901/, "Galaxy S22"], [/^SM-S906/, "Galaxy S22+"], [/^SM-S908/, "Galaxy S22 Ultra"],
    [/^SM-G991/, "Galaxy S21"], [/^SM-G996/, "Galaxy S21+"], [/^SM-G998/, "Galaxy S21 Ultra"], [/^SM-G990/, "Galaxy S21 FE"],
    [/^SM-F966/, "Galaxy Z Fold7"], [/^SM-F766/, "Galaxy Z Flip7"], [/^SM-F956/, "Galaxy Z Fold6"], [/^SM-F741/, "Galaxy Z Flip6"],
    [/^SM-F946/, "Galaxy Z Fold5"], [/^SM-F731/, "Galaxy Z Flip5"],
    [/^SM-A566/, "Galaxy A56"], [/^SM-A556/, "Galaxy A55"], [/^SM-A546/, "Galaxy A54"], [/^SM-A536/, "Galaxy A53"],
    [/^SM-A366/, "Galaxy A36"], [/^SM-A356/, "Galaxy A35"], [/^SM-A346/, "Galaxy A34"],
    [/^SM-A266/, "Galaxy A26"], [/^SM-A256/, "Galaxy A25"], [/^SM-A166/, "Galaxy A16"], [/^SM-A156/, "Galaxy A15"],
    [/^SM-X/, "Galaxy Tab"],
  ];
  const friendlyModel = (code) => {
    const hit = MODEL_NAMES.find(([re]) => re.test(code));
    return hit ? hit[1] : code;
  };

  // When the browser does not share the model, name the kind of device.
  function deviceKind(ua, os, mobile) {
    if (/iPhone/.test(ua)) return "iPhone";
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
    if (/Android/.test(ua) || /^Android/.test(os)) return mobile ? "Android phone" : "Android tablet";
    if (/CrOS/.test(ua) || /Chrome OS/.test(os)) return "Chromebook";
    if (/Windows/.test(ua) || /^Windows/.test(os)) return "Windows PC";
    if (/Macintosh/.test(ua) || /^macOS/.test(os)) return "Mac";
    if (/Linux/.test(ua) || /^Linux/.test(os)) return "Linux computer";
    return mobile ? "Phone or tablet" : "Computer";
  }

  // iOS: Safari 26+ freezes the OS in the user agent at 18_6 / 18_7 for privacy,
  // but its Version/ number still matches the iOS release.
  function iosVersion(ua) {
    const os = ua.match(/OS (\d+)[_.](\d+)(?:[_.](\d+))? like Mac OS X/);
    if (!os) return null;
    const name = /iPad/.test(ua) ? "iPadOS" : "iOS";
    const [maj, min] = [+os[1], +os[2]];
    const frozen = maj === 18 && min >= 6;
    const safari = ua.match(/Version\/(\d+)(?:\.(\d+))?/);
    if (frozen && safari && +safari[1] >= 26) return `${name} ${safari[1]}${safari[2] && safari[2] !== "0" ? "." + safari[2] : ""} (about)`;
    if (frozen) return `${name} 18.6 or newer`;
    return `${name} ${maj}.${min}${os[3] ? "." + os[3] : ""}`;
  }

  // Chrome reports Windows as an internal number: 13 or higher is Windows 11,
  // 1 to 10 is Windows 10. Other systems report their real version.
  function osLabel(platform, version) {
    const major = parseInt(version, 10);
    if (platform === "Windows" && version) {
      if (major >= 13) return "Windows 11";
      if (major > 0) return "Windows 10";
      return "Windows 8.1 or older";
    }
    if (platform === "Android" || platform === "macOS") {
      const v = version.replace(/(\.0)+$/, "");
      return v ? `${platform} ${v}` : platform;
    }
    return platform;
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
        os = osLabel(hi.platform || uaData.platform, hi.platformVersion || "");
        if (hi.model) device = hi.model;
      } catch (e) { /* fall back to the user agent below */ }
    }
    const ua = navigator.userAgent;
    if (!os) os = iosVersion(ua) || "";
    if (!os) {
      const m = ua.match(/\(([^)]+)\)/);
      os = m ? m[1].split(";").slice(0, 2).join(",").trim() : "Unknown";
    }
    if (browser === BROWSER) {
      const m = ua.match(/(Firefox|FxiOS|CriOS|EdgiOS|Edg|OPR|Chrome|Version)\/(\d+)/);
      if (m) browser = `${BROWSER} ${m[2]}`;
    }
    const mobile = (uaData && uaData.mobile) || /Mobi|Android|iPhone|iPad/.test(ua) || navigator.maxTouchPoints > 1;
    const deviceName = device ? friendlyModel(device) : deviceKind(ua, os, mobile);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
    let tzName = "";
    try {
      tzName = new Intl.DateTimeFormat("en-US", { timeZoneName: "longGeneric" })
        .formatToParts(new Date()).find((p) => p.type === "timeZoneName").value;
    } catch (e) { /* older browsers: city only */ }
    const tzLabel = tz.replace(/_/g, " ") + (tzName && !/^GMT/.test(tzName) ? ` (${tzName})` : "");
    const langs = (navigator.languages || [navigator.language]).join(", ");
    const dpr = window.devicePixelRatio || 1;
    const realRes = `${Math.round(screen.width * dpr)} × ${Math.round(screen.height * dpr)}`;
    const langCodes = navigator.languages || [navigator.language];
    let langName = (code) => code;
    try {
      const dn = new Intl.DisplayNames(["en"], { type: "language" });
      langName = (code) => { try { return dn.of(code) || code; } catch (e) { return code; } };
    } catch (e) { /* older browsers: show codes */ }
    const rows = [
      ["Browser", browser],
      ["Operating system", os],
      ["Device", deviceName + (device && deviceName !== device ? ` (model ${device})` : "")],
      ["Screen resolution", `${realRes} pixels`],
      ["Screen size in website pixels", `${screen.width} × ${screen.height}`],
      ["Pixel density", `${Math.round(dpr * 100) / 100}× (each website pixel is ${Math.round(dpr * 100) / 100} real pixels wide)`],
      ["Time zone", tzLabel],
      ["Languages", langCodes.map((c) => `${langName(c)} (${c})`).join(", ")],
      ["Processor cores", String(navigator.hardwareConcurrency || "Not shared")],
    ];
    if (navigator.deviceMemory) rows.push(["Memory (rounded by your browser)", navigator.deviceMemory >= 8 ? "8 GB or more" : `About ${navigator.deviceMemory} GB`]);
    rows.push(["Page you came from", document.referrer || "Not shared"]);

    results.arrival = { rows, tz, langs, screen: `${screen.width}x${screen.height}x${devicePixelRatio}`, browser, os };
    const shared = rows.filter(([, v]) => v !== "Not shared").length;
    renderInfoCard("arrival", {
      status: "neutral",
      hero: { value: String(shared), label: "items of data this page got when you opened it" },
      tiles: [
        { icon: mobile ? "device" : "laptop", value: deviceName, label: "Device" },
        { icon: "system", value: os, label: "Operating system" },
        { icon: "browser", value: browser, label: "Browser" },
        { icon: "clock", value: tzLabel, label: "Time zone" },
        { icon: "language", value: langCodes[0] ? langName(langCodes[0]) : "Unknown", label: "Language" },
        { icon: "screen", value: realRes, label: "Screen resolution" },
      ],
      more: { label: "Show all details", rows },
      soWhat: "One item does not identify you. Your time zone and language show approximately where you live. " +
        "Together, the items make you easier to identify.",
      todo: "You cannot hide all of this data. Browsers need some of it to show pages correctly.",
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
    const idHex = await sha256(combined);
    const code = browserIdCode(idHex);
    const canvasCode = canvas ? shortCode(await sha256(canvas)) : "Not available";
    const audioCode = audio ? shortCode(await sha256(audio)) : "Not available";

    const rows = [
      ["Browser identity text (user agent)", navigator.userAgent],
      ["Hidden drawing test (canvas)", scrambled ? `${canvasCode} (scrambled by your browser)` : canvasCode],
      ["Graphics card (WebGL)", gl.renderer || "Not shared"],
      ["Audio test result", audioCode],
      [`Fonts found (of ${FONTS.length} checked)`, fonts.length ? `${fonts.length}: ${fonts.join(", ")}` : "None detected"],
    ];

    // Each test that gives the same answer every time is one more thing a tracker can lean on.
    const tests = [
      !!navigator.userAgent,
      !!canvas && !scrambled,
      !!gl.renderer && gl.renderer !== "Not available",
      !!audio,
      fonts.length > 0,
    ];
    const readable = tests.filter(Boolean).length;

    results.fingerprint = scrambled
      ? { status: "good", short: "scrambled", code }
      : { status: "risk", short: "readable", code };
    renderInfoCard("fingerprint", {
      status: results.fingerprint.status,
      statusText: scrambled ? "Partly protected" : "Any website can read it",
      hero: { value: code, label: "Your browser ID", mono: true },
      meter: { value: readable, max: tests.length, label: `${readable} of ${tests.length} tests could be read` },
      tiles: [
        { icon: "font", value: `${fonts.length} of ${FONTS.length} checked`, label: "Fonts found" },
        { icon: "chip", value: gl.renderer || "Not shared", label: "Graphics card" },
        { icon: "draw", value: scrambled ? "Scrambled" : canvasCode, label: "Hidden drawing test", mono: !scrambled },
        { icon: "audio", value: audioCode, label: "Audio test result", mono: !!audio },
      ],
      more: { label: "Show technical details", rows },
      soWhat: scrambled
        ? "Your browser adds small random changes to the drawing test. Trackers get a different result on each " +
          "website. This makes it hard to connect your visits."
        : "Trackers can identify you on all websites with this ID. Clearing cookies does not change it. " +
          "A private window does not change it.",
      todo: scrambled ? null : tip("fingerprint"),
    });
  }

  // ---------- 3. "don't sell my data" signal ----------

  function signals() {
    const gpc = navigator.globalPrivacyControl === true;
    const dnt = navigator.doNotTrack === "1" || window.doNotTrack === "1";
    results.signals = gpc ? { status: "good", short: "sent" } : { status: "risk", short: "not sent" };
    renderSection("signals", {
      status: results.signals.status,
      statusText: gpc ? "Yes, your browser asks" : "No, your browser does not ask",
      rows: [
        ["Do not sell my data (GPC)", gpc ? "Sent" : "Not sent"],
        ["Do Not Track (old, most websites ignore it)", dnt ? "Sent" : "Not sent"],
      ],
      soWhat: gpc
        ? "All websites get the request. Where the law supports it, websites must obey it."
        : "Websites do not know your choice. Many websites think that they can sell your data.",
      todo: gpc ? null : tip("gpc"),
    });
  }

  // ---------- 6. third-party cookies ----------

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
          soWhat: "The test page did not respond. Possibly a blocker stopped it. Then it probably stops ads too.",
        };
      } else if (r.unpartitioned && navigator.brave) {
        // Brave isolates third-party storage per site by default ("ephemeral
        // storage"), but still reports full access to the frame itself, so
        // the frame can't see the isolation. Verified on Brave for Android.
        results.cookies = { status: "good", short: "kept separate" };
        view = {
          status: "good",
          statusText: "No, kept separate per site",
          soWhat: "Brave keeps a different, temporary set of these cookies for each website. Ad companies cannot " +
            "connect your visits. This stops if you turn off Shields for a website.",
        };
      } else if (r.unpartitioned) {
        results.cookies = { status: "risk", short: "allowed" };
        view = {
          status: "risk",
          statusText: "Yes, they can",
          soWhat: "Ad companies can make a list of the websites that you visit.",
          todo: tip("cookies"),
        };
      } else if (r.partitioned) {
        results.cookies = { status: "good", short: "kept separate" };
        view = {
          status: "good",
          statusText: "No, kept separate per site",
          soWhat: "Your browser keeps a different set of these cookies for each website. Ad companies cannot " +
            "connect your visits.",
        };
      } else {
        results.cookies = { status: "good", short: "blocked" };
        view = {
          status: "good",
          statusText: "No, blocked",
          soWhat: "Ad companies cannot use cookies to follow you.",
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

  // ---------- 7a. opt-in: tracker blocking ----------

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
    // Control request to this website. If it fails, the network is the problem, not a blocker.
    const control = navigator.onLine ? await probe(`/assets/img/favicon-32.png?t=${Date.now()}`) : "blocked";
    if (control !== "loaded") {
      results.trackers = { status: "neutral", short: "no answer" };
      renderResult("trackers", { status: "neutral", statusText: "No connection", lines: ["Your connection did not work during the test. Connect to the internet. Then try again."] });
      renderSummary();
      return;
    }
    const out = await Promise.all(TRACKER_PROBES.map(async ([name, url]) => [name, await probe(url)]));
    const blocked = out.filter(([, r]) => r === "blocked").length;
    const loaded = out.filter(([, r]) => r === "loaded").length;
    const lines = out.map(([name, r]) => `${name}: ${r === "blocked" ? "blocked" : r === "loaded" ? "not blocked" : "no answer"}`);
    let view;
    if (blocked === out.length) {
      results.trackers = { status: "good", short: "all blocked" };
      view = { status: "good", statusText: "All blocked", soWhat: "Something in your browser stops these trackers." };
    } else if (loaded === out.length) {
      results.trackers = { status: "risk", short: "none blocked" };
      view = {
        status: "risk",
        statusText: "None blocked",
        soWhat: "Most websites use scripts like these. Each script sees the page you open. " +
          "It connects that page to your visits on other websites.",
        todo: "Use a browser that blocks trackers (Brave, DuckDuckGo, or Firefox set to Strict). " +
          "Or add a tracker-blocking extension.",
      };
    } else {
      results.trackers = { status: "risk", short: `${blocked} of ${out.length} blocked` };
      view = {
        status: "risk",
        statusText: `${blocked} of ${out.length} blocked`,
        soWhat: "Your browser stops some trackers, but not all.",
        todo: "Set tracking protection to Strict. Or add a tracker-blocking extension.",
      };
    }
    view.lines = lines;
    renderResult("trackers", view);
    renderSummary();
  }

  // ---------- 7b. opt-in: WebRTC IP leak ----------

  const isPrivateIp = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|fe80)/i.test(ip);

  async function webrtc() {
    if (!window.RTCPeerConnection) {
      results.webrtc = { status: "good", short: "WebRTC off" };
      renderResult("webrtc", { status: "good", statusText: "Cannot leak", soWhat: "WebRTC is off in your browser. It cannot show your IP address." });
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
        soWhat: "Websites can see the address of your device on your home network. This helps to identify you.",
        todo: "Update your browser. Or turn off WebRTC IP sharing in its privacy settings.",
      };
    } else {
      results.webrtc = { status: "neutral", short: "check if you use a VPN" };
      view = {
        status: "neutral",
        statusText: found.public.size ? "Compare with your VPN" : "Nothing revealed",
        soWhat: "All websites see your public IP address. This is important only if you use a VPN. " +
          "Is the address above your home address, not the VPN address? Then your VPN leaks it.",
        todo: "If it leaks, turn on leak protection in your VPN app. Or use a browser that limits WebRTC.",
      };
    }
    view.lines = lines;
    renderResult("webrtc", view);
    renderSummary();
  }

  // ---------- 4. autofill hidden fields (local only) ----------

  const AF_LABELS = {
    email: "Email",
    tel: "Phone number",
    organization: "Company",
    address: "Street address",
    address2: "Address line 2",
    city: "City",
    region: "State or region",
    postal: "Postal code",
    country: "Country",
  };

  const looksAutofilled = (input) =>
    [":autofill", ":-webkit-autofill"].some((sel) => {
      try { return input.matches(sel); } catch (e) { return false; }
    });

  // Shows enough to recognise your own details without putting them in full on screen.
  const mask = (v) => (v.length <= 2 ? v[0] + "•" : v.slice(0, 2) + "•".repeat(Math.min(v.length - 2, 10)));

  let afShowFull = false;

  function autofillCheck() {
    const form = $("#autofill-form");
    const name = $("#af-name");
    const caught = [...form.querySelectorAll(".check-af-hidden input")]
      .filter((i) => i.value.trim())
      .map((i) => [AF_LABELS[i.name] || i.name, i.value.trim()]);
    const box = $("#autofill-result");
    $("#autofill-clear").hidden = !name.value && !caught.length;

    if (caught.length) {
      results.autofill = { status: "risk", short: `${caught.length} hidden ${caught.length === 1 ? "box" : "boxes"} filled` };
      renderResult("autofill", {
        status: "risk",
        statusText: `Filled ${caught.length} hidden ${caught.length === 1 ? "box" : "boxes"}`,
        lines: ["You filled in only your name. Your browser also gave this page:"],
        soWhat: "A website can get your data this way. You do not see the hidden boxes. This page did not send your data.",
        todo: "Before you select a suggestion, look at the data it fills in. Use autofill only on websites that you trust.",
      });
      const list = el("dl", "check-rows");
      caught.forEach(([k, v]) => list.append(el("dt", null, k), el("dd", "check-caught", afShowFull ? v : mask(v))));
      box.insertBefore(list, box.querySelector(".check-sowhat"));
      const toggle = el("button", "btn btn-ghost check-run", afShowFull ? "Hide full details" : "Show full details");
      toggle.type = "button";
      toggle.addEventListener("click", () => { afShowFull = !afShowFull; autofillCheck(); });
      box.insertBefore(toggle, box.querySelector(".check-sowhat"));
    } else if (name.value && looksAutofilled(name)) {
      results.autofill = { status: "good", short: "only the visible box" };
      renderResult("autofill", {
        status: "good",
        statusText: "Filled only the box you can see",
        soWhat: "Your browser filled in only your name. Hidden boxes cannot get your data here.",
      });
    } else if (name.value) {
      box.textContent = "";
      box.append(el("p", "check-note", "You typed your name, so the test did not run. Clear the box. Then select it and select a saved suggestion. No suggestion? Then your browser has no saved address. That is good."));
    } else {
      box.textContent = "";
      delete results.autofill;
    }
    renderSummary();
  }

  function autofillClear() {
    $("#autofill-form").reset();
    afShowFull = false;
    autofillCheck();
  }

  // ---------- 5. location, camera, microphone ----------

  const PERMISSIONS = [["geolocation", "Location"], ["camera", "Camera"], ["microphone", "Microphone"], ["notifications", "Notifications"]];
  const PERM_LABEL = { granted: "Allowed", denied: "Blocked", prompt: "Asks first" };
  let watchingPermissions = false;

  async function access() {
    // Before you allow the camera, browsers show at most whether one exists, not how many.
    let cam = "Not shown by your browser";
    let mic = "Not shown by your browser";
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const named = devices.some((d) => d.label);
        const show = (list, one, many) =>
          !list.length ? "Not shown by your browser" : named ? `Yes, ${list.length} ${list.length === 1 ? one : many}` : "Yes";
        cam = show(devices.filter((d) => d.kind === "videoinput"), "camera", "cameras");
        mic = show(devices.filter((d) => d.kind === "audioinput"), "microphone", "microphones");
      } catch (e) { /* keep "Not shown" */ }
    }

    const states = [];
    for (const [name, label] of PERMISSIONS) {
      let state = null;
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const st = await navigator.permissions.query({ name });
          state = st.state;
          if (!watchingPermissions) st.addEventListener("change", () => access());
        }
      } catch (e) { /* this browser does not report it */ }
      states.push([label, state]);
    }
    watchingPermissions = true;

    const allowed = states.filter(([, s]) => s === "granted").map(([l]) => l);
    const seen = cam.startsWith("Yes") || mic.startsWith("Yes");
    const rows = [
      ["Has a camera (seen without asking)", cam],
      ["Has a microphone (seen without asking)", mic],
      ...states.map(([l, s]) => [`${l}: this website`, s ? PERM_LABEL[s] : "Not shown by your browser"]),
    ];
    const status = allowed.length ? "risk" : "good";
    results.access = { status, short: allowed.length ? `${allowed.join(", ").toLowerCase()} allowed` : "asks first" };
    renderSection("access", {
      status,
      statusText: allowed.length ? `This website has access: ${allowed.join(", ")}` : "This website must ask first",
      rows,
      soWhat: (allowed.length
        ? "You allowed this website. It can use this access again without asking."
        : "Websites must ask before they use your location, camera or microphone.") +
        (seen ? " All websites can see that you have a camera or microphone. This adds to your fingerprint." : ""),
      todo: allowed.length
        ? "If you do not want this, open Site settings in your browser and remove the access."
        : "Allow access only for websites that need it. For example, a map needs your location.",
    });
    renderSummary();
  }

  function locationTest() {
    if (!navigator.geolocation) {
      renderResult("location", { status: "good", statusText: "Not available", soWhat: "Your browser does not give location to websites." });
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          const acc = Math.round(accuracy);
          const dist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
          const area = acc <= 50 ? "your building" : acc <= 200 ? "your street" : acc <= 2000 ? "your neighborhood"
            : acc <= 10000 ? "your town or city" : "your region";
          renderResult("location", {
            status: "risk",
            statusText: `Can find ${area}`,
            lines: [
              `Your browser gave this point: ${latitude.toFixed(2)}, ${longitude.toFixed(2)} (rounded on this screen).`,
              `You are within ${dist(acc)} of that point. That is a circle about ${dist(acc * 2)} wide.`,
            ],
            soWhat: `A website with this access can find ${area}. It gets the exact numbers. This page did not send them.`,
            todo: "Allow location only for websites that need it. You can remove access in Site settings.",
          });
          if (acc > 1000) {
            $("#location .check-result").append(el("p", "check-note",
              "Computers often find location from Wi-Fi or the internet connection. Phones with GPS are usually exact to a few meters."));
          }
          access().then(resolve);
        },
        (err) => {
          const blocked = err.code === 1;
          renderResult("location", blocked
            ? { status: "good", statusText: "You blocked it", soWhat: "This website cannot get your location." }
            : { status: "neutral", statusText: "Location not found", soWhat: "Your device could not find its location. Location services may be off." });
          access().then(resolve);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  }

  // ---------- copy results ----------

  function resultsText() {
    const lines = [`PrivacyBrew Browser Privacy Check (${BROWSER})`, ""];
    (results.arrival ? results.arrival.rows : []).forEach(([k, v]) => lines.push(`${k}: ${v}`));
    if (results.fingerprint) lines.push(`Fingerprint: ${results.fingerprint.short} (browser ID ${results.fingerprint.code})`);
    if (results.signals) lines.push(`"Don't sell my data" request (GPC): ${results.signals.short}`);
    if (results.autofill) lines.push(`Autofill hidden boxes: ${results.autofill.short}`);
    if (results.access) lines.push(`Location, camera, microphone: ${results.access.short}`);
    if (results.cookies) lines.push(`Third-party cookies (ads following you): ${results.cookies.short}`);
    if (results.trackers) lines.push(`Tracker blocking: ${results.trackers.short}`);
    if (results.webrtc) lines.push(`IP leak test: ${results.webrtc.short}`);
    lines.push("", "Check yours: https://privacybrew.app/check.html");
    return lines.join("\n");
  }

  // ---------- wire up ----------

  document.addEventListener("DOMContentLoaded", async () => {
    document.querySelectorAll(".check-run[data-test]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const which = btn.dataset.test;
        btn.disabled = true;
        btn.textContent = "Testing…";
        try {
          await ({ trackers, webrtc, location: locationTest })[which]();
        } catch (e) {
          renderResult(which, { status: "neutral", statusText: "Couldn't run this test", lines: [String(e.message || e)] });
        }
        btn.textContent = "Start again";
        btn.disabled = false;
      });
    });

    const afForm = $("#autofill-form");
    let afTimer;
    const afSoon = () => { clearTimeout(afTimer); afTimer = setTimeout(autofillCheck, 300); };
    afForm.addEventListener("input", afSoon);
    afForm.addEventListener("change", afSoon);
    afForm.addEventListener("submit", (e) => e.preventDefault());
    $("#autofill-clear").addEventListener("click", autofillClear);
    // Don't keep filled-in details around if the page is left or restored from cache.
    window.addEventListener("pagehide", () => {
      afForm.reset();
      const loc = $("#location .check-result");
      if (loc) loc.textContent = "";
    });
    window.addEventListener("pageshow", (e) => { if (e.persisted) autofillClear(); });

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
    access();
  });
})();
