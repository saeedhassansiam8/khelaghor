# Khelaghor — খেলাঘর

Own-name website for Master Rakib's Gollachut game. **Not** a muse.ai link.
Target address: **https://khelaghor.vercel.app**

## What is here

| File | Purpose |
|---|---|
| `index.html` | Khelaghor home: brand, Gollachut (iframe), how-to-play, coming-soon games (Lukochuri, Kanamachi, Ghuri) |
| `game.html` | The Gollachut game (exported from the `gollachut` Muse artifact, patched — see `patch-game.py`). All original features kept: chain+break, dodge/katakati, GOAL celebration, 60fps, joystick, sound, funny voice, coins+shop, 2-min timer, streaks, daily reward, rematch, pause, difficulty, Bangla+English |
| `config.js` | Supabase URL + anon key (empty until the owner fills them in) |
| `settings-loader.js` | Fetches shared settings from Supabase (or defaults / local mode), applies them to the game, sends anonymous match-end events, exposes save/load + SHA-256 helpers |
| `admin.html` + `admin.js` | Admin panel: login / first-time password setup, tabs for Game / Coins / Shop / Features / Stats |
| `supabase.sql` | Backend schema: `site_settings` (1 row), `game_events`, `update_site_settings()` RPC (hash-gated writes), RLS policies |
| `vercel.json` | Static site config (clean URLs, no-cache on config/loader/admin JS) |
| `patch-game.py` | The exact patch applied to the exported game (asserts every replacement) — re-run it if the game is re-exported |
| `SETUP-BN.md` | Setup steps in Bangla for the owner |

## How settings flow (admin → all visitors)

1. Admin changes something in `admin.html` and taps Save.
2. `admin.js` sends the whole settings JSON + SHA-256(password) to Supabase RPC `update_site_settings`.
3. The RPC only writes when the hash matches the stored `adminHash` (or when none is set yet — first setup).
4. Every visitor's page fetches the row on load (`settings-loader.js`) and applies it: match length, coin rewards, shop prices, difficulty, feature switches, announcement.

Without Supabase configured, the site works fully on built-in defaults, and the
admin panel runs in **local mode** (changes apply on that browser only, badge
says so clearly).

## Deploy (blocked — see below)

```bash
cd ~/workspace/khelaghor
# create project "khelaghor" on Vercel, then deploy this folder as a static site
# expected URL: https://khelaghor.vercel.app
```

### BLOCKER (2026-11-11): Vercel team-scope authorization

The connected Vercel MCP token returns **403 forbidden** for `list_projects`,
`create_project` (and therefore any deployment) under scope `master-rakib`
(team `team_nnOVxN4lJCPGodcAcdGrtG3q`):

> "Not authorized: Trying to access resource under scope \"master-rakib\".
> You must re-authenticate to this scope or use a token with access to this scope."

The recovery tool it names (`authorize_team_access`) is **not** in this MCP
server's tool list, and `authorize-url` refuses because the connector is
already connected ("disconnect it before starting a new authorization flow").
`disconnect` must NOT be run without the owner's explicit approval.

**Owner step needed:** re-authorize Vercel with team access (reconnect the
Vercel connection including the `master-rakib` team scope). After that, retry
the deploy above — the site is complete and ready.

## Owner steps (after Vercel is fixed)

1. **Supabase (free):** https://supabase.com → sign in (GitHub/Google) → New
   project (free) → SQL Editor → paste `supabase.sql` → Run → Settings → API →
   copy Project URL + `anon public` key → give them to the assistant, who puts
   them in `config.js` and redeploys.
2. **Admin password:** open `https://khelaghor.vercel.app/admin.html` → set the
   admin password on first visit (only the hash is stored).
3. **Custom domain (optional, paid):** `khelaghor.com` needs a purchase — never
   buy without the owner's explicit approval + a quoted price.

## Notes / limits (honest)

- Coins, best score and owned shop items still save **per device**
  (localStorage) — the shared backend only carries *settings*, not player data.
- Admin writes are gated by a password hash in the RPC. A determined person
  who reads the anon key could still try the RPC — but without the password
  hash it returns false. For stricter control, enable Supabase Auth later.
- The `gollachut` Muse artifact is untouched and stays the fallback; the
  public muse.ai link still exists.
- Live two-phone multiplayer is gone (PeerJS was removed to allow sharing);
  the site is single-player.
