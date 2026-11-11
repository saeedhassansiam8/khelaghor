#!/usr/bin/env python3
"""Patch the exported Gollachut game (game.html) so its tunable values come
from window.KHELAGHOR_SETTINGS (loaded by settings-loader.js).
Every replacement is asserted by count: the script fails loudly if a
pattern is missing or matches more than expected.
The original artifact (slug gollachut) is NOT touched.
"""
import re, sys

PATH = "/home/hatch/workspace/khelaghor/game.html"
src = open(PATH, encoding="utf-8").read()

CFG_BLOCK = '''
/* ================= Khelaghor remote settings (admin-controlled) =================
   Values below read window.KHELAGHOR_SETTINGS (fetched from Supabase by
   settings-loader.js). If the backend is not configured, the built-in
   defaults (identical to the original game) apply. */
function KH() { return (typeof window !== "undefined" && window.KHELAGHOR_SETTINGS) || {}; }
function KHnum(path, fb) {
  var o = KH(), parts = path.split("."), v = o;
  for (var i = 0; i < parts.length; i++) { if (v == null) return fb; v = v[parts[i]]; }
  var n = Number(v); return isFinite(n) ? n : fb;
}
function matchLen()    { return Math.max(30, Math.min(600, KHnum("matchLen", 120))); }
function dailyCoins()  { return Math.max(0, Math.min(1000, KHnum("coins.daily", 50))); }
function coinGoalCap() { return Math.max(0, KHnum("coins.goalCaptain", 20)); }
function coinGoal()    { return Math.max(0, KHnum("coins.goal", 10)); }
function coinPerfect() { return Math.max(0, KHnum("coins.perfectBreak", 5)); }
function coinStreakStep(){ return Math.max(0, KHnum("coins.streakStep", 5)); }
function coinDodgeCap(){ return Math.max(0, KHnum("coins.dodgeCaptain", 10)); }
function coinDodge()   { return Math.max(0, KHnum("coins.dodge", 5)); }
function coinTag()     { return Math.max(0, KHnum("coins.tag", 8)); }
function coinWin()     { return Math.max(0, KHnum("coins.win", 25)); }
function coinDraw()    { return Math.max(0, KHnum("coins.draw", 10)); }
function powerPrice(key, fb) { return Math.max(0, KHnum("shop.power." + key, fb)); }
function featOff(name) { var f = KH().features; return !!(f && f[name] === false); }
'''

BEACON = '''
  try { if (window.KhelaghorBeacon) window.KhelaghorBeacon({ type: "match_end", you: S.youScore, opp: S.oppScore, coins: S.matchCoins, result: S.youScore > S.oppScore ? "win" : (S.youScore < S.oppScore ? "lose" : "draw"), goals: SAVE.totalTargets, tags: SAVE.totalTags }); } catch (e) {}
'''

def rep(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, "EXPECTED %d x %r, FOUND %d" % (count, old[:70], n)
    src = src.replace(old, new)

def rep_re(pattern, new, count=1):
    global src
    found = re.findall(pattern, src)
    assert len(found) == count, "EXPECTED %d x /%s/, FOUND %d" % (count, pattern[:70], len(found))
    src = re.sub(pattern, new, src)

# 1. CFG helpers after the two constants
rep("var MATCH_LEN = 120; // seconds per match — the countdown clock\nvar DAILY_COINS = 50;",
    "var MATCH_LEN = 120; // seconds per match — the countdown clock (admin can change it; see matchLen())\nvar DAILY_COINS = 50;" + CFG_BLOCK)

# 2. match length (state init + startMatch)
rep("matchTime: MATCH_LEN, streak: 0,", "matchTime: matchLen(), streak: 0,")
rep("S.matchTime = MATCH_LEN; S.streak = 0;", "S.matchTime = matchLen(); S.streak = 0;")

# 3. daily coins (button label + claim)
rep('b.textContent = T[S.lang].dailyBtn(DAILY_COINS);', 'b.textContent = T[S.lang].dailyBtn(dailyCoins());')
rep("SAVE.lastDaily = todayKey(); SAVE.coins += DAILY_COINS; persist();",
    "SAVE.lastDaily = todayKey(); SAVE.coins += dailyCoins(); persist();")

# 4. coin rewards
rep("var bonus = r.captain ? 10 : 5;", "var bonus = r.captain ? coinDodgeCap() : coinDodge();")
rep("var streakBonus = S.streak >= 2 ? (S.streak - 1) * 5 : 0;",
    "var streakBonus = S.streak >= 2 ? (S.streak - 1) * coinStreakStep() : 0;")
rep("var coins = (r.captain ? 20 : 10) + (S.lastBreakQ === 2 ? 5 : 0) + streakBonus;",
    "var coins = (r.captain ? coinGoalCap() : coinGoal()) + (S.lastBreakQ === 2 ? coinPerfect() : 0) + streakBonus;")
rep("addCoins(8, r.x, r.y);", "addCoins(coinTag(), r.x, r.y);")
rep("t.coinPlus(8)", "t.coinPlus(coinTag())")
rep("var title = t.draw, txt = t.endDrawText, bonus = 10;",
    "var title = t.draw, txt = t.endDrawText, bonus = coinDraw();")
rep("SAVE.wins++; bonus = 25;", "SAVE.wins++; bonus = coinWin();")

# 5. power-up prices (render + buy handlers) — line-scoped regexes
rep_re(r'data-act="buy-boost"\' \+ \(SAVE\.coins < 30 \? " disabled" : ""\) \+ ">" \+ t\.buy\(30\)',
       'data-act="buy-boost\' + (SAVE.coins < powerPrice("boost", 30) ? " disabled" : "") + ">" + t.buy(powerPrice("boost", 30))')
rep_re(r'data-act="buy-life"\' \+ \(SAVE\.coins < 40 \? " disabled" : ""\) \+ ">" \+ t\.buy\(40\)',
       'data-act="buy-life\' + (SAVE.coins < powerPrice("life", 40) ? " disabled" : "") + ">" + t.buy(powerPrice("life", 40))')
rep_re(r'data-act="buy-dash"\' \+ \(SAVE\.coins < 150 \? " disabled" : ""\) \+ ">" \+ t\.buy\(150\)',
       'data-act="buy-dash\' + (SAVE.coins < powerPrice("dash", 150) ? " disabled" : "") + ">" + t.buy(powerPrice("dash", 150))')
rep_re(r'data-act="buy-turbo"\' \+ \(SAVE\.coins < 200 \? " disabled" : ""\) \+ ">" \+ t\.buy\(200\)',
       'data-act="buy-turbo\' + (SAVE.coins < powerPrice("turbo", 200) ? " disabled" : "") + ">" + t.buy(powerPrice("turbo", 200))')
rep_re(r'if \(SAVE\.coins < 30\) \{ sndDeny\(\); return; \}\n    SAVE\.coins -= 30; SAVE\.speedBoosts\+\+;',
       'if (SAVE.coins < powerPrice("boost", 30)) { sndDeny(); return; }\n    SAVE.coins -= powerPrice("boost", 30); SAVE.speedBoosts++;')
rep_re(r'if \(SAVE\.coins < 40\) \{ sndDeny\(\); return; \}\n    SAVE\.coins -= 40; SAVE\.extraLives\+\+;',
       'if (SAVE.coins < powerPrice("life", 40)) { sndDeny(); return; }\n    SAVE.coins -= powerPrice("life", 40); SAVE.extraLives++;')
rep_re(r'if \(SAVE\.coins < 150\) \{ sndDeny\(\); return; \}\n    SAVE\.coins -= 150; SAVE\.dashPro = true;',
       'if (SAVE.coins < powerPrice("dash", 150)) { sndDeny(); return; }\n    SAVE.coins -= powerPrice("dash", 150); SAVE.dashPro = true;')
rep_re(r'if \(SAVE\.coins < 200\) \{ sndDeny\(\); return; \}\n    SAVE\.coins -= 200; SAVE\.turboBoots = true;',
       'if (SAVE.coins < powerPrice("turbo", 200)) { sndDeny(); return; }\n    SAVE.coins -= powerPrice("turbo", 200); SAVE.turboBoots = true;')

# 6. global feature switches (admin can force sound/voice off for everyone)
rep("if (!S.sound) return null;", 'if (!S.sound || featOff("sound")) return null;')
rep("function speak(key) {\n  if (!S.voice) return;",
    'function speak(key) {\n  if (!S.voice || featOff("voice")) return;')

# 7. match-end stats beacon (admin stats)
rep("if (S.youScore > SAVE.best) SAVE.best = S.youScore;\n  persist();",
    "if (S.youScore > SAVE.best) SAVE.best = S.youScore;\n  persist();" + BEACON)

# 8. title + loader scripts
rep("<title>গোল্লাছুট · Gollachut</title>", "<title>গোল্লাছুট · খেলাঘর (Khelaghor)</title>")
rep("</script>\n</body>\n</html>",
    '</script>\n  <script src="config.js"></script>\n  <script src="settings-loader.js"></script>\n</body>\n</html>')

open(PATH, "w", encoding="utf-8").write(src)
print("PATCH OK — all replacements applied exactly once")
