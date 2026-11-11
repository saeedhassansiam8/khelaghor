/* ============================================================================
   Khelaghor — admin panel logic
   - Login: SHA-256 of the password is compared with the stored adminHash.
     The plain password is never saved anywhere.
   - First run (no adminHash): the setup card lets the owner SET the password.
   - Save: the whole settings object goes to Supabase via the
     update_site_settings() RPC (which checks the hash); in local mode it
     saves to this browser's localStorage only.
   ========================================================================== */
(function () {
  function $(id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function setStatus(el, msg, ok) { el.textContent = msg || ""; el.className = "status " + (ok ? "ok" : "err"); }

  var settings = null;
  var pwHash = sessionStorage.getItem("khelaghor_admin_hash") || "";
  var authed = sessionStorage.getItem("khelaghor_admin") === "1" && !!pwHash;
  var customSkins = [];
  var customThemes = [];

  function backendBadge() {
    var b = window.KHELAGHOR_BACKEND || { configured: false, mode: "local" };
    var badge = $("backendBadge"), hint = $("backendHint");
    if (b.configured) {
      badge.textContent = "✅ Supabase যুক্ত — পরিবর্তন সবার জন্য";
      badge.className = "badge ok";
      hint.textContent = "তোমার পরিবর্তন live সাইটের সব ভিজিটরের জন্য প্রযোজ্য হবে।";
    } else {
      badge.textContent = "⚠️ Local mode — শুধু এই ডিভাইসে";
      badge.className = "badge warn";
      hint.textContent = "Supabase এখনো যুক্ত হয়নি — পরিবর্তন শুধু এই ব্রাউজারে কাজ করবে। সবার জন্য করতে Supabase যুক্ত করো (SETUP-BN দেখো)।";
    }
  }

  function baseCatalog(kind) {
    var d = window.KHELAGHOR_DEFAULTS || {};
    return (d.shop && d.shop[kind]) ? d.shop[kind] : [];
  }
  function overridePrice(kind, id) {
    var list = (settings.shop && settings.shop[kind]) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id && list[i].price != null) return list[i].price;
    return null;
  }
  function findBase(kind, id) {
    var list = baseCatalog(kind);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function renderShopRows() {
    function rows(kind, containerId, customs, swatchOf) {
      var host = $(containerId);
      var html = "";
      baseCatalog(kind).forEach(function (it) {
        var p = overridePrice(kind, it.id);
        var price = (p == null ? it.price : p);
        html += '<div class="shop-row"><div class="sw" style="background:' + swatchOf(it) + '"></div>'
          + '<div class="nm">' + it.bn + ' <small>' + it.en + '</small></div>'
          + '<input type="number" min="0" max="1000" data-kind="' + kind + '" data-id="' + it.id + '" value="' + price + '" /></div>';
      });
      customs.forEach(function (it) {
        html += '<div class="shop-row"><div class="sw" style="background:' + swatchOf(it) + '"></div>'
          + '<div class="nm">' + it.bn + ' <small>' + it.en + ' · নতুন</small></div>'
          + '<input type="number" min="0" max="1000" data-kind="' + kind + '" data-id="' + it.id + '" value="' + it.price + '" />'
          + '<button class="btn-danger" data-del="' + kind + '" data-id="' + it.id + '" style="padding:8px 10px">✕</button></div>';
      });
      host.innerHTML = html;
    }
    rows("skins", "shopSkins", customSkins, function (it) { return it.color || "#888"; });
    rows("themes", "shopThemes", customThemes, function (it) { return it.gA || "#888"; });
    document.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var kind = b.getAttribute("data-del"), id = b.getAttribute("data-id");
        if (kind === "skins") customSkins = customSkins.filter(function (x) { return x.id !== id; });
        else customThemes = customThemes.filter(function (x) { return x.id !== id; });
        renderShopRows();
      });
    });
  }

  function fillForms() {
    var s = settings;
    $("f-matchLen").value = s.matchLen;
    $("f-defaultDiff").value = s.defaultDiff || "medium";
    ["easy", "medium", "hard"].forEach(function (lv) {
      $("f-diff-" + lv + "-tagSpd").value = s.diffs[lv].tagSpd;
      $("f-diff-" + lv + "-aiSpd").value = s.diffs[lv].aiSpd;
    });
    $("f-announcement").value = s.announcement || "";
    var c = s.coins;
    ["goal", "goalCaptain", "perfectBreak", "streakStep", "dodge", "dodgeCaptain", "tag", "win", "draw", "daily"].forEach(function (k) {
      $("c-" + k).value = c[k];
    });
    $("p-boost").value = s.shop.power.boost;
    $("p-life").value = s.shop.power.life;
    $("p-dash").value = s.shop.power.dash;
    $("p-turbo").value = s.shop.power.turbo;
    $("feat-sound").checked = s.features.sound !== false;
    $("feat-voice").checked = s.features.voice !== false;
    $("feat-daily").checked = s.features.daily !== false;
    renderShopRows();
  }

  function collectShop(kind) {
    var out = [];
    document.querySelectorAll('#tab-shop input[data-kind="' + kind + '"]').forEach(function (inp) {
      var id = inp.getAttribute("data-id");
      var price = parseInt(inp.value, 10);
      if (!isFinite(price)) return;
      var base = findBase(kind, id);
      if (base) { if (price !== base.price) out.push({ id: id, price: price }); }
    });
    var customs = kind === "skins" ? customSkins : customThemes;
    customs.forEach(function (it) {
      var copy = clone(it);
      var inp = document.querySelector('#tab-shop input[data-id="' + it.id + '"]');
      var price = inp ? parseInt(inp.value, 10) : it.price;
      if (isFinite(price)) copy.price = price;
      out.push(copy);
    });
    return out;
  }

  function numVal(id, fb) { var v = parseInt($(id).value, 10); return isFinite(v) ? v : fb; }
  function collect() {
    var next = clone(settings);
    next.matchLen = Math.max(30, Math.min(600, numVal("f-matchLen", 120)));
    next.defaultDiff = $("f-defaultDiff").value;
    ["easy", "medium", "hard"].forEach(function (lv) {
      next.diffs[lv].tagSpd = parseFloat($("f-diff-" + lv + "-tagSpd").value) || next.diffs[lv].tagSpd;
      next.diffs[lv].aiSpd = parseFloat($("f-diff-" + lv + "-aiSpd").value) || next.diffs[lv].aiSpd;
    });
    next.announcement = $("f-announcement").value.trim();
    ["goal", "goalCaptain", "perfectBreak", "streakStep", "dodge", "dodgeCaptain", "tag", "win", "draw", "daily"].forEach(function (k) {
      next.coins[k] = Math.max(0, numVal("c-" + k, next.coins[k]));
    });
    next.shop.skins = collectShop("skins");
    next.shop.themes = collectShop("themes");
    next.shop.power = {
      boost: Math.max(0, numVal("p-boost", 30)),
      life: Math.max(0, numVal("p-life", 40)),
      dash: Math.max(0, numVal("p-dash", 150)),
      turbo: Math.max(0, numVal("p-turbo", 200))
    };
    next.features = {
      sound: $("feat-sound").checked,
      voice: $("feat-voice").checked,
      daily: $("feat-daily").checked
    };
    return next;
  }

  function showPanel() {
    $("setupCard").hidden = true;
    $("loginCard").hidden = true;
    $("panel").hidden = false;
    fillForms();
    loadStats();
  }

  function loadStats() {
    var host = $("statsRecent");
    if (!window.KHELAGHOR_BACKEND || !window.KHELAGHOR_BACKEND.configured) {
      $("statsSummary").innerHTML = "";
      host.innerHTML = '<p class="hint">Supabase যুক্ত নেই — পরিসংখ্যান দেখা যাচ্ছে না।</p>';
      return;
    }
    window.KhelaghorLoadEvents(500).then(function (rows) {
      var matches = rows.length, wins = 0, goals = 0, tags = 0, coins = 0;
      rows.forEach(function (r) {
        var e = r.event || {};
        if (e.result === "win") wins++;
        goals += (e.you || 0); tags += (e.tags || 0); coins += (e.coins || 0);
      });
      $("statsSummary").innerHTML =
        '<div class="stat-box"><div class="n">' + matches + '</div><div class="l">মোট ম্যাচ</div></div>'
        + '<div class="stat-box"><div class="n">' + wins + '</div><div class="l">জয়</div></div>'
        + '<div class="stat-box"><div class="n">' + goals + '</div><div class="l">মোট গোল</div></div>'
        + '<div class="stat-box"><div class="n">🪙 ' + coins + '</div><div class="l">মোট কয়েন (ম্যাচে)</div></div>';
      if (!rows.length) { host.innerHTML = '<p class="hint">এখনো কোনো ম্যাচ খেলা হয়নি।</p>'; return; }
      var html = '<table><tr><th>সময়</th><th>ফল</th><th>স্কোর</th><th>কয়েন</th></tr>';
      rows.slice(0, 20).forEach(function (r) {
        var e = r.event || {};
        var t = new Date(r.created_at);
        var ts = t.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        html += "<tr><td>" + ts + "</td><td>" + (e.result || "-") + "</td><td>" + (e.you || 0) + "–" + (e.opp || 0) + "</td><td>🪙 " + (e.coins || 0) + "</td></tr>";
      });
      host.innerHTML = html + "</table>";
    });
  }

  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".tabs button").forEach(function (x) { x.classList.remove("on"); });
      document.querySelectorAll(".tabpage").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      $("tab-" + b.getAttribute("data-tab")).classList.add("on");
      if (b.getAttribute("data-tab") === "stats") loadStats();
    });
  });

  $("setupBtn").addEventListener("click", function () {
    var p1 = $("setupPass1").value, p2 = $("setupPass2").value;
    if (p1.length < 6) { setStatus($("setupStatus"), "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।", false); return; }
    if (p1 !== p2) { setStatus($("setupStatus"), "দুইবার একই পাসওয়ার্ড লেখো।", false); return; }
    setStatus($("setupStatus"), "সেভ হচ্ছে…", true);
    window.KhelaghorSha256(p1).then(function (hash) {
      var next = clone(settings);
      next.adminHash = hash;
      return window.KhelaghorSaveSettings(next, hash).then(function (res) {
        if (!res.ok) { setStatus($("setupStatus"), "সেভ হয়নি — আবার চেষ্টা করো।", false); return; }
        settings = next;
        pwHash = hash;
        sessionStorage.setItem("khelaghor_admin", "1");
        sessionStorage.setItem("khelaghor_admin_hash", hash);
        setStatus($("setupStatus"), "✅ পাসওয়ার্ড সেট হয়েছে!", true);
        showPanel();
      });
    });
  });

  $("loginBtn").addEventListener("click", function () {
    var p = $("loginPass").value;
    if (!p) { setStatus($("loginStatus"), "পাসওয়ার্ড লেখো।", false); return; }
    window.KhelaghorSha256(p).then(function (hash) {
      if (hash === settings.adminHash) {
        pwHash = hash;
        sessionStorage.setItem("khelaghor_admin", "1");
        sessionStorage.setItem("khelaghor_admin_hash", hash);
        showPanel();
      } else {
        setStatus($("loginStatus"), "ভুল পাসওয়ার্ড।", false);
      }
    });
  });

  $("saveBtn").addEventListener("click", function () {
    var next = collect();
    var useHash = pwHash;
    var np = $("newPass").value;
    function doSave(hashToUse) {
      setStatus($("saveStatus"), "সেভ হচ্ছে…", true);
      window.KhelaghorSaveSettings(next, hashToUse).then(function (res) {
        if (res.ok) {
          settings = next;
          setStatus($("saveStatus"), res.mode === "supabase" ? "✅ সেভ হয়েছে — সব ভিজিটরের জন্য প্রযোজ্য!" : "✅ সেভ হয়েছে (এই ডিভাইসে)।", true);
        } else if (res.error === "wrong-password") {
          setStatus($("saveStatus"), "পাসওয়ার্ড মেলেনি — আবার লগইন করো।", false);
        } else {
          setStatus($("saveStatus"), "নেটওয়ার্ক সমস্যা — আবার চেষ্টা করো।", false);
        }
      });
    }
    if (np) {
      if (np.length < 6) { setStatus($("saveStatus"), "নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।", false); return; }
      window.KhelaghorSha256(np).then(function (h) {
        next.adminHash = h;
        pwHash = h;
        sessionStorage.setItem("khelaghor_admin_hash", h);
        $("newPass").value = "";
        doSave(h);
      });
    } else {
      doSave(useHash);
    }
  });

  $("logoutBtn").addEventListener("click", function () {
    sessionStorage.removeItem("khelaghor_admin");
    sessionStorage.removeItem("khelaghor_admin_hash");
    location.reload();
  });

  $("addSkinBtn").addEventListener("click", function () {
    var bn = $("ns-bn").value.trim(), en = $("ns-en").value.trim();
    var price = parseInt($("ns-price").value, 10);
    if (!bn || !en) { alert("জার্সির বাংলা ও English নাম দুটোই লেখো।"); return; }
    customSkins.push({ id: "custom-" + Date.now().toString(36), color: $("ns-color").value,
      price: isFinite(price) ? Math.max(0, price) : 100, bn: bn, en: en, dsBn: bn, dsEn: en, custom: true });
    $("ns-bn").value = ""; $("ns-en").value = "";
    renderShopRows();
  });
  $("addThemeBtn").addEventListener("click", function () {
    var bn = $("nt-bn").value.trim(), en = $("nt-en").value.trim();
    var price = parseInt($("nt-price").value, 10);
    if (!bn || !en) { alert("মাঠের বাংলা ও English নাম দুটোই লেখো।"); return; }
    customThemes.push({ id: "custom-" + Date.now().toString(36), price: isFinite(price) ? Math.max(0, price) : 100,
      gA: $("nt-ga").value, gB: $("nt-gb").value, sky: $("nt-sky").value,
      bn: bn, en: en, dsBn: bn, dsEn: en, custom: true });
    $("nt-bn").value = ""; $("nt-en").value = "";
    renderShopRows();
  });

  backendBadge();
  window.KhelaghorLoadSettings().then(function (s) {
    settings = s;
    customSkins = (settings.shop.skins || []).filter(function (x) { return x.custom; });
    customThemes = (settings.shop.themes || []).filter(function (x) { return x.custom; });
    if (authed) showPanel();
    else if (!settings.adminHash) $("setupCard").hidden = false;
    else $("loginCard").hidden = false;
  }).catch(function () {
    settings = clone(window.KHELAGHOR_DEFAULTS || {});
    $("loginCard").hidden = false;
  });
})();
