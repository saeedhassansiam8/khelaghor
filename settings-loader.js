/* ============================================================================
   Khelaghor — settings loader + backend client
   - Loads the shared settings (Supabase when configured, else built-in
     defaults, else the admin's own local copy in "local mode").
   - Applies them to the Gollachut game globals (prices, coin rewards,
     match length, difficulty, feature switches).
   - Sends anonymous match-end events for the admin stats page.
   - Provides the save/load helpers used by admin.html.
   No secrets here: the anon key is public by design; writes go through the
   update_site_settings() RPC, which checks the admin password hash.
   ========================================================================== */
(function () {
  var DEFAULTS = {
    matchLen: 120,
    defaultDiff: "medium",
    diffs: {
      easy:   { tagSpd: 0.80, tagCount: -1, aiSpd: 0.85, helpSpd: 0.85, react: 0.55 },
      medium: { tagSpd: 1.00, tagCount: 0,  aiSpd: 1.00, helpSpd: 1.00, react: 0.30 },
      hard:   { tagSpd: 1.16, tagCount: 1,  aiSpd: 1.14, helpSpd: 1.12, react: 0.15 }
    },
    coins: { goal: 10, goalCaptain: 20, perfectBreak: 5, streakStep: 5,
             dodge: 5, dodgeCaptain: 10, tag: 8, win: 25, draw: 10, daily: 50 },
    shop: {
      // Full built-in catalog (same as the game). Remote settings only store
      // price overrides {id, price} and fully-defined custom items.
      skins: [
        { id: "classic", color: "#1e8a49", price: 0,   bn: "সবুজ জার্সি",   en: "Green Jersey",   dsBn: "আসল স্কুলের পোশাক", dsEn: "The classic school kit" },
        { id: "crimson", color: "#d63c2f", price: 50,  bn: "লাল জার্সি",     en: "Red Jersey",     dsBn: "আগুনে লাল", dsEn: "Fiery red" },
        { id: "ocean",   color: "#2470c9", price: 80,  bn: "নীল জার্সি",     en: "Blue Jersey",    dsBn: "ঠান্ডা সমুদ্র-নীল", dsEn: "Cool ocean blue" },
        { id: "tiger",   color: "#e8912d", price: 120, bn: "বাঘের জার্সি",   en: "Tiger Jersey",   dsBn: "কমলা বাঘের মতো", dsEn: "Orange like a tiger" },
        { id: "royal",   color: "#7b4bb5", price: 180, bn: "রাজকীয় জার্সি", en: "Royal Jersey",   dsBn: "বেগুনি রাজকীয় লুক", dsEn: "A royal purple look" },
        { id: "gold",    color: "#e8a812", price: 250, bn: "সোনালি জার্সি",  en: "Golden Jersey",  dsBn: "চ্যাম্পিয়নদের সোনালি", dsEn: "Champion gold" },
        { id: "sky",     color: "#35b6d9", price: 150, bn: "আকাশি জার্সি",   en: "Sky Jersey",     dsBn: "খোলা আকাশের মতো হালকা নীল", dsEn: "Light as the open sky" },
        { id: "rose",    color: "#e5639a", price: 170, bn: "গোলাপি জার্সি",  en: "Pink Jersey",    dsBn: "গোলাপের মতো ঝলমলে", dsEn: "Bright as a rose" },
        { id: "midnight", color: "#2e3a47", price: 230, bn: "মিডনাইট জার্সি", en: "Midnight Jersey", dsBn: "গভীর রাতের স্টাইল", dsEn: "Deep midnight style" }
      ],
      themes: [
        { id: "village", price: 0,   bn: "গ্রামের মাঠ",   en: "Village Field",  gA: "#4da842", gB: "#57b34a", sky: "#aee3f5", dsBn: "সবুজ গ্রামের মাঠ", dsEn: "The green village field" },
        { id: "sunset",  price: 100, bn: "গোধূলির মাঠ",   en: "Sunset Field",   gA: "#55953c", gB: "#63a848", sky: "#ffc98a", dsBn: "সন্ধ্যার কমলা আলো", dsEn: "Warm evening light" },
        { id: "monsoon", price: 140, bn: "বর্ষার মাঠ",    en: "Monsoon Field",  gA: "#3e8f4e", gB: "#479e58", sky: "#9fc6d8", dsBn: "বৃষ্টিভেজা সবুজ", dsEn: "Rain-washed green" },
        { id: "night",   price: 200, bn: "রাতের স্টেডিয়াম", en: "Night Stadium", gA: "#256b33", gB: "#2c783c", sky: "#26354f", dsBn: "ফ্লাডলাইটের রাত", dsEn: "Floodlit night match" },
        { id: "sand",    price: 120, bn: "বালুর মাঠ",    en: "Sandy Field",    gA: "#cfa960", gB: "#d8b96c", sky: "#ffe3ae", dsBn: "নদীর পাড়ের বালুর মাঠ", dsEn: "Riverside sand pitch" },
        { id: "autumn",  price: 170, bn: "শরতের মাঠ",    en: "Autumn Field",   gA: "#7f9c38", gB: "#8cab42", sky: "#ffcf99", dsBn: "শরতের সোনালি ঘাস", dsEn: "Golden autumn grass" }
      ],
      power: { boost: 30, life: 40, dash: 150, turbo: 200 }
    },
    features: { sound: true, voice: true, daily: true },
    adminHash: null,
    announcement: ""
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isObj(o) { return o && typeof o === "object" && !Array.isArray(o); }
  function deepMerge(base, over) {
    var out = clone(base);
    if (!isObj(over)) return out;
    for (var k in over) {
      if (isObj(over[k]) && isObj(out[k])) out[k] = deepMerge(out[k], over[k]);
      else if (over[k] !== undefined) out[k] = clone(over[k]);
    }
    return out;
  }

  var cfg = (typeof window !== "undefined" && window.KHELAGHOR_CONFIG) || {};
  var SUPABASE_URL = (cfg.supabaseUrl || "").replace(/\/$/, "");
  var SUPABASE_KEY = cfg.supabaseAnonKey || "";
  var CONFIGURED = !!(SUPABASE_URL && SUPABASE_KEY);
  var LOCAL_KEY = "khelaghor_admin_settings";

  var settings = clone(DEFAULTS);
  // Local mode: the admin's own saved copy (this device only) overrides defaults.
  try {
    var localRaw = localStorage.getItem(LOCAL_KEY);
    if (localRaw) settings = deepMerge(settings, JSON.parse(localRaw));
  } catch (e) {}

  window.KHELAGHOR_DEFAULTS = clone(DEFAULTS);
  window.KHELAGHOR_SETTINGS = settings;
  window.KHELAGHOR_FEATURES = settings.features;
  window.KHELAGHOR_BACKEND = { configured: CONFIGURED, mode: CONFIGURED ? "supabase" : "local" };

  function fireReady() {
    try { document.dispatchEvent(new CustomEvent("khelaghor-settings-ready")); } catch (e) {}
  }

  function supaHeaders() {
    return { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY,
             "Content-Type": "application/json", "Prefer": "return=representation" };
  }
  function fetchTimeout(url, opts, ms) {
    if (typeof AbortController !== "undefined") {
      var c = new AbortController();
      var t = setTimeout(function () { c.abort(); }, ms || 2500);
      opts = opts || {}; opts.signal = c.signal;
      return fetch(url, opts).then(function (r) { clearTimeout(t); return r; },
        function (e) { clearTimeout(t); throw e; });
    }
    return fetch(url, opts);
  }

  /* ---- apply settings to the running game (game.html globals) ---- */
  function applyToGame() {
    try {
      window.KHELAGHOR_SETTINGS = settings;
      window.KHELAGHOR_FEATURES = settings.features || {};
      if (typeof DIFFS !== "undefined" && settings.diffs) {
        for (var d in settings.diffs) {
          if (DIFFS[d]) for (var k in settings.diffs[d]) DIFFS[d][k] = settings.diffs[d][k];
        }
      }
      if (typeof SKINS !== "undefined" && settings.shop && settings.shop.skins) {
        settings.shop.skins.forEach(function (it) {
          var found = null;
          for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === it.id) found = SKINS[i];
          if (found) { if (it.price != null) found.price = it.price;
                       if (it.bn) found.bn = it.bn; if (it.en) found.en = it.en;
                       if (it.color) found.color = it.color;
                       if (it.dsBn) found.dsBn = it.dsBn; if (it.dsEn) found.dsEn = it.dsEn; }
          else if (it.custom && it.id && it.color) SKINS.push(it);
        });
      }
      if (typeof THEMES !== "undefined" && settings.shop && settings.shop.themes) {
        settings.shop.themes.forEach(function (it) {
          var found = null;
          for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === it.id) found = THEMES[i];
          if (found) { if (it.price != null) found.price = it.price;
                       if (it.bn) found.bn = it.bn; if (it.en) found.en = it.en;
                       if (it.gA) found.gA = it.gA; if (it.gB) found.gB = it.gB; if (it.sky) found.sky = it.sky; }
          else if (it.custom && it.id && it.gA) THEMES.push(it);
        });
      }
      // Fresh players (no save yet) start on the admin's default difficulty.
      try {
        if (!localStorage.getItem("gollachut_save_v2") && settings.defaultDiff) {
          if (typeof SAVE !== "undefined") SAVE.diff = settings.defaultDiff;
          if (typeof S !== "undefined") S.diff = settings.defaultDiff;
        }
      } catch (e) {}
      // Daily reward switch.
      try {
        var db = document.getElementById("dailyBtn");
        if (db) db.style.display = (settings.features && settings.features.daily === false) ? "none" : "";
      } catch (e) {}
      // Re-render the shop if it is open.
      try { if (typeof renderShop === "function") {
        var ov = document.getElementById("shopOverlay");
        if (ov && !ov.hidden) renderShop();
      } } catch (e) {}
      // Announcement bar on the home page.
      try {
        var an = document.getElementById("announceBar");
        if (an) {
          if (settings.announcement) { an.textContent = settings.announcement; an.hidden = false; }
          else an.hidden = true;
        }
      } catch (e) {}
    } catch (e) {}
    fireReady();
  }

  /* ---- load shared settings ---- */
  function loadRemote() {
    if (!CONFIGURED) { applyToGame(); return Promise.resolve(settings); }
    return fetchTimeout(SUPABASE_URL + "/rest/v1/site_settings?id=eq.1&select=settings",
        { headers: supaHeaders() }, 3000)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rows) {
        if (rows && rows.length && rows[0].settings) settings = deepMerge(clone(DEFAULTS), rows[0].settings);
        applyToGame();
        return settings;
      })
      .catch(function () { applyToGame(); return settings; });
  }
  window.KhelaghorLoadSettings = loadRemote;

  /* ---- save shared settings (admin only; RPC checks the password hash) ---- */
  window.KhelaghorSaveSettings = function (next, passwordHash) {
    settings = deepMerge(clone(DEFAULTS), next || {});
    window.KHELAGHOR_SETTINGS = settings;
    window.KHELAGHOR_FEATURES = settings.features;
    applyToGame();
    if (!CONFIGURED) {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(settings)); } catch (e) {}
      return Promise.resolve({ ok: true, mode: "local" });
    }
    return fetchTimeout(SUPABASE_URL + "/rest/v1/rpc/update_site_settings",
        { method: "POST", headers: supaHeaders(),
          body: JSON.stringify({ p_hash: passwordHash || "", p_settings: settings }) }, 5000)
      .then(function (r) { return r.json(); })
      .then(function (ok) {
        if (ok === true) return { ok: true, mode: "supabase" };
        return { ok: false, error: "wrong-password" };
      })
      .catch(function () { return { ok: false, error: "network" }; });
  };

  /* ---- anonymous match-end events (admin stats) ---- */
  window.KhelaghorBeacon = function (ev) {
    if (!CONFIGURED) return;
    try {
      fetch(SUPABASE_URL + "/rest/v1/game_events",
        { method: "POST", headers: supaHeaders(), body: JSON.stringify({ event: ev }) })
        .catch(function () {});
    } catch (e) {}
  };

  /* ---- admin stats: recent events ---- */
  window.KhelaghorLoadEvents = function (limit) {
    if (!CONFIGURED) return Promise.resolve([]);
    return fetchTimeout(SUPABASE_URL + "/rest/v1/game_events?select=event,created_at&order=created_at.desc&limit=" + (limit || 500),
        { headers: supaHeaders() }, 5000)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .catch(function () { return []; });
  };

  /* ---- SHA-256 hex (admin password; never store the plain password) ---- */
  window.KhelaghorSha256 = function (text) {
    if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf),
          function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      });
    }
    return Promise.resolve("fnv1a-" + (function (s) {
      var h1 = 0x811c9dc5, h2 = 0x01000193;
      for (var i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619); h2 = Math.imul(h2 ^ s.charCodeAt(i), 31); }
      return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
    })(text));
  };

  loadRemote();
})();
