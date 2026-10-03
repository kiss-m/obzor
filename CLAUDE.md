# DNES – project memory

Personal phone app of Matej (Slovak speaker, based in Brno). Installable PWA, deployed as a static site (GitHub Pages / Netlify).
Repo: `kiss-m/obzor`. Baseline when this file was written: commit `e606bf3` (2026-10-02).
The app was renamed from **Obzor** to **DNES** (user-visible name: `<title>`, `apple-mobile-web-app-title`, manifest `name`/`short_name`, toasts, backup file name `dnes-zaloha-…`). Internal identifiers keep `obzor` on purpose and must not be renamed without a migration: the `obzor.` localStorage prefix, backup `app: 'obzor'`, history state `obzorBack`, the repo, the GitHub Pages URL and the news URL.

## How to work with me

- **Talk to Matej in Slovak** (questions, explanations, summaries). Code, comments, commit messages and repo docs stay in English.
- **App UI text is Slovak** (labels, toasts, errors, dates). Keep Slovak diacritics and correct declension (use the `plural()` helper).
- Prefer small, focused changes. Do not refactor unrelated code or restructure `index.html` without asking.
- After changing anything user-visible, update the relevant section of this file and `README.md` (README is in Slovak, it is user-facing).
- Commit after every finished feature or fix, so project state lives in git, not in chat context.
- Matej develops in Claude Code, tests on iPhone/Android and desktop browser. Mobile Safari is the strictest target.

## Hard constraints (do not break)

1. **No build step, no framework, no npm dependencies in the app.** The whole client is `index.html` (CSS + JS inline, one IIFE, `'use strict'`) plus `sw.js`, `manifest.webmanifest`, `icons/`.
2. **No accounts, no backend, no tracking.** All user data lives in `localStorage` on the device. News preference learning runs on-device.
3. **Never lose user data.** Any change to a stored data shape needs a migration in the module's `normalize`/`init` and an update of `Backup.export()` / `Backup.import()`. Old backups must still import.
4. **XP and levels are always computed from `game.log`** (the log is the source of truth). Never store derived XP/levels.
5. **Never punish the user in the gamification** (no XP deduction except undoing an accidental completion).
6. Must work offline for the shell (service worker) and degrade gracefully when APIs fail.
7. Day starts at **04:00** (`dayStartHour`), a task done at 01:00 belongs to the previous day.

## Architecture

### Files
| File | Purpose |
|---|---|
| `index.html` | Entire app (~4500 lines): styles, name-day/holiday data, all logic. Sections separated by `/* ===== ... ===== */` banner comments. |
| `sw.js` | Service worker, cache name `dnes-v9`. Same-origin: network-first, cache fallback. Google Fonts: cache-first. **Bump `CACHE` when `SHELL` changes.** |
| `manifest.webmanifest`, `icons/` | PWA install (standalone, portrait, theme `#1d4f82`). Manifest `shortcuts` (long-press on the Android icon) use `icons/shortcut-*.png` (192 px, sky gradient + white line glyph). |
| `scripts/fetch-news.mjs` | RSS collector (Node 22, no deps). Run: `node scripts/fetch-news.mjs out.json [prev.json]`. Offline test: `NEWS_FIXTURES=<dir with <id>.xml>`. |
| `scripts/feeds.json` | ~50 RSS sources: `id`, `name`, `lang` (sk/cs/en), `url`, optional `hint` (topics for the whole feed). Add/remove sources here. |
| `.github/workflows/news.yml` | Cron `17,47 * * * *` + manual + on push to `scripts/**`. Writes `news.json` to the orphan branch **`news`** (force-pushed). |
| `docs/gamifikacia.md` | Full gamification design (Slovak): rules, XP table, level curve, data model, phases. Read before touching Tasks/Character. |
| `README.md` | User-facing description (Slovak) and deploy instructions. |

### Modules in `index.html` (in file order)
`store` (localStorage wrapper, keys prefixed `obzor.`) → helpers (`$`, `$$`, `esc`, `plural`, `fmtNum`, `today`, `addDays`, `norm`, `isoWeek`, `ico()` + `ICONS`) → `MENINY_SK`, `SVATKY_CZ`, `SVIATKY_SK`, `SVATKY_STATNI_CZ` (name days, in a separate earlier `<script>`, one array row = one month) → `Kal` (calendar logic, Easter) → weather helpers (`wxKind`, `wxIcon`, `skyFor`, `moonPhase`, …) → `Wx` (weather) + `Places` → `Bd` (birthdays) → `GAME` constants, `Game` (data/logic), `TasksView`, `Look`, `LevelUp`, `Backup` → `Splash` (intro screen) → `KalView` → `News` (data, preference model), `Deck` (swipe cards), `NewsView` → `SettingsView` → `Sheet`, `toast()` → `BackGuard` (Back button) → `App` (tabs, init, lifecycle).

### Views / navigation
Tab bar order, left to right (same order in `App.tabs`): `novinky` · `pocasie` (home, weather) · `ulohy` (center) · `kalendar` · `nastavenia`. Each is a `<section id="view-…">`, tab buttons in `.tabbar`, routing via URL hash.
**New feature = new `<section id="view-…">` + new `.tabbar` button + entry in `App.tabs` + render hook in `App.show()` + init call in `App.init()`.**
App always opens on Pocasie; `Splash` (4 s intro: date, SK name day, CZ svátek, holidays, birthdays, level + main task) shows only on cold start, not on return from background. After the splash comes the news swipe deck (`Deck`).
**Icon shortcuts:** `./?akcia=uloha|zaznam|novinky` → `App.init` reads `akcia`, strips it from the URL, skips the splash and the daily deck, shows the tab from `App.shortcutTabs` and opens `TasksView.openForm(null)`, `TasksView.quickForm()` or `Deck.open('more')`.
**Back button (`BackGuard`):** on each tap/key press (user activation, Chrome skips history entries pushed without it) up to 3 entries `{obzorBack: n}` are pushed over the app's own entry. Back closes one overlay per press (sheet, level-up, news deck, splash); with nothing to close it jumps to the app's entry and shows the "Opustiť appku?" sheet; one more Back leaves (a web app cannot close itself). Keep `history.state` when replacing the URL (`App.show` does `replaceState(history.state, …)`), never `pushState` elsewhere.

### localStorage keys (all prefixed `obzor.`)
`game` (tasks, log, attrs, mainTask, unlocked, look, dayStartHour; schema v1) · `birthdays` · `places` · `sel` (selected place) · `wxModel` (forecast model id) · `tab` · `wx.<placeId>` (weather cache) · `news.prefs` (`topics`, `count` default 5, `langs` default sk+cs) · `news.model` (learned weights: `b`, `w`, `n`, `words`, `sources`, `ratings`) · `news.seen` (10-day TTL) · `news.history` (max 300) · `news.data` (cached news.json) · `news.tipShown` · `tasksSwipeHint`.

### Backup
`Backup.export()` writes JSON `{ app: 'obzor', version: 4, exported, birthdays, places, weather: {model}, news: {prefs, model, seen, history}, game }`. `Backup.import()` validates `app === 'obzor'` and `birthdays` array; older backups without `game` (before v3) or `weather` (before v4) leave the current data untouched. **Bump `version` and keep import backward compatible whenever a new persisted module is added.**

### External services (all free, no keys)
Open-Meteo forecast (models from ČHMÚ, DWD, GeoSphere Austria, ECMWF) / geocoding / air-quality, BigDataCloud reverse geocoding (for "my location"), Google Fonts (Archivo, Onest), news from `https://raw.githubusercontent.com/kiss-m/obzor/news/news.json` (client TTL `NEWS_TTL` = 15 min).

## Feature summary and key rules

### Weather (`Wx`, `Places`)
Any number of places (search + "my location"), swipe between them. Current temp, 24 h hourly with sunrise/sunset, 10-day forecast, cloud cover (24 h chart + low/mid/high), feels-like, wind, UV, precipitation, humidity, visibility, pressure, air quality, moon phase. Forecast model is chosen in Settings → Počasie (`WX_MODELS`, stored as `wxModel`, default `chmi_aladin_seamless`; others `best_match`, `geosphere_seamless`, `ecmwf_ifs`). A non-default model is requested as `models=<model>,best_match` and `mergeModels()` fills values the model lacks (e.g. UV index) from best_match; HTTP 400 falls back to best_match alone. The weather cache entry stores the requested `model` and is refetched when it changes. Sky is drawn full-screen on the home tab (`body.mode-wx`). The weather tab shows weather only: no news or character cards.

### Calendar & birthdays (`KalView`, `Bd`, `Kal`)
Month grid (dots = tasks / done / birthdays), day detail (name days, birthdays, tasks, completion history), "when is the name day of …" search, next 14 days, add task or birthday for a specific day. Birthdays list shows countdown, age and name day; tapping jumps the calendar. Name-day data can be corrected by hand in `MENINY_SK` / `SVATKY_CZ`.

### Tasks & character (`Game`, `TasksView`) – design in `docs/gamifikacia.md`
- Records: **todo** (optional due date, optional "main task of the day"), **habit** (repeat types: `daily`, `weekdays`, `perWeek`, `interval`, `monthly`, with `start` date), **quick log** (`kind: 'quick'`, `ref: null`).
- Difficulty 1–5 → XP `[5, 10, 25, 60, 150]`. Main task of the day +50 %. Same title same day: 100 % / 50 % / 0 %. Small + light tasks capped at 60 XP/day.
- Level cost L→L+1 is `100·L` XP (total `50·L·(L−1)`); attribute levels use the half curve (`ATTR_STEP` 50). Title and unlock every 5 levels (`GAME.TITLES`, `GAME.UNLOCKS`: colour themes and character card styles, chosen in Settings → Vzhľad, stored in `game.look`).
- Attributes: default Telo, Myseľ, Práca, Vzťahy (editable in Settings, max 6, `DEFAULT_ATTRS`). Balance warning when an attribute is under 10 % of the last 14 days (needs ≥ 5 entries).
- Log entries store final `xp`, plus `base`, `main`, `nth`, `capped`, so history survives rule changes and task deletion.
- UI: completion by checkbox (done task greys out in place), toast "+25 XP · Telo" with Undo for 6 s, swipe the day card left = next days, right = Character page. Level-up celebration (`LevelUp`), vibration on Android only. Respect `prefers-reduced-motion`.
- **All tunable numbers live in the `GAME` object.** Changing them affects only new completions (log stores computed XP).
- Phases 1–4 of the design are all done (base, character, habits, app integration).

### News (`News`, `Deck`, `NewsView`, `scripts/`)
- Server side: GitHub Action collects ~50 RSS feeds every 30 min, classifies into 12 topics (`TOPICS`: slovensko, svet, politika, vojna, ekonomika, technologie, veda, zdravie, klima, sport, kultura, krimi), detects style (analysis, live, explainer, short/medium/long…), merges the same event across outlets, keeps 30 h / max 1400 items.
- Client side: user picks topics (defaults: technologie, vojna, ekonomika, politika) and source languages. Swipe deck after the splash: **right = like (1), left = dislike (0), down = neutral (0.5), tap = detail + link to the article**. Count configurable (default 5), the rest in the Novinky tab ("Ďalšie novinky").
- Card text: title + short summary from `News.brief(it)` → `briefOf()`: first one or two sentences of the perex that add something to the title, max `BRIEF_MAX` (180) characters, datelines/question leads dropped; if the outlet sent no perex (Google News items), perexes of other outlets in the same cluster and a near language (`it.alts`, sk↔cs) are used. The full perex stays in the detail sheet. The collector's `stripHtml(html, true)` (perex only, never titles) ends a paragraph, `<br>` line or, in plain-text perexes without block tags (WordPress excerpts), a line break before a capital with a period, so standfirst and body or bullet points do not run together.
- Ranking uses an **on-device online logistic regression** (`News.features`, `News.words`): learns topics, outlets, article style and names/places from titles. Ranking also uses how many outlets cover the event and freshness. Settings shows what it learned and feed health.

## Conventions

- Style: plain ES2020+, 2-space indent, single quotes, line icons via `ico(name)` (24×24 stroke icons in `ICONS`, add new ones there).
- Design tokens are CSS variables in `:root` (`--paper`, `--surface`, `--ink`, `--accent`, `--xp`, …) with a `prefers-color-scheme: dark` override. Fonts: Onest (UI), Archivo (display). Single column, max 720 px, bottom tab bar (`--tabbar-h: 62px`), safe-area insets respected.
- Always escape user text with `esc()` before putting it in `innerHTML`.
- Persist through `store.get/set` only (never raw `localStorage`), keep keys under the `obzor.` prefix.
- Code comments in the app are currently Slovak; new code comments may be English, don't mass-translate.
- Date handling: local time, use `today()` / `addDays()` helpers; ISO `YYYY-MM-DD` day strings in `game`.

## Testing / running

- Open `index.html` directly (weather works, PWA install and service worker need https) or serve statically: `python3 -m http.server`.
- Service worker only registers on `https:`. After changing cached files in dev, bump `CACHE` in `sw.js` or hard-reload.
- News scraper: `NEWS_FIXTURES=./fixtures node scripts/fetch-news.mjs /tmp/news.json` for an offline check.
- There is no automated test suite. Verify by hand: new user (empty storage), existing user (old data), backup export → import round trip, dark mode, 375 px wide screen, offline.

## Roadmap / backlog (keep this list current)

- [ ] (add the next features here; mark done items and move them to the feature summary above)

## Decisions log (append, never silently overwrite)

- Web app deployed via GitHub (Pages), not a native app.
- To-do gamification uses an RPG character (XP, levels, attributes), chosen over streaks and over competing with the past self.
- News learning stays fully on-device; the server only publishes the shared `news.json`.
- 2026-10-03: Tab bar reordered to Novinky · Počasie · Úlohy (center) · Kalendár · Nastavenia. The news card and the character/main-task card were removed from the weather tab (Matej wants weather only there); level and main task stay on the splash and in Úlohy, more news in the Novinky tab.
- 2026-10-03: Weather stays on Open-Meteo, with a model choice in Settings and ČHMÚ Aladin as default (Matej found the current temperature inaccurate with best_match/ICON-D2). Rejected: YR.no directly (MET Norway forbids browser requests in production, needs a proxy; for CZ/SK it serves ECMWF 9 km anyway, which is offered as a model) and Google Weather API (needs Google Cloud billing and a key that would be public).
- 2026-10-03: Back button asks before leaving (Matej's request). Confirmation is a second Back press, not an "Opustiť" button, because an installed PWA cannot close itself from script.
- 2026-10-03: App renamed from Obzor to DNES (Matej's request). Only the visible name changed; storage keys, backup format, repo and URLs stay `obzor` so data, backups and the installed app keep working.

---

# Compact instructions

When compacting this conversation, always preserve:
1. The task in progress, its current status, and the exact next step.
2. Files changed in this session (paths) and anything left half-done or uncommitted.
3. Open bugs, failing behaviour and the reproduction details (device/browser, steps, exact error text).
4. Decisions made this session and **why** (also add them to "Decisions log" above if they are lasting).
5. New or changed data shapes, localStorage keys, constants in `GAME`, and whether `Backup` was updated.
6. User preferences stated this session (UI wording, behaviour, look).
Drop: long tool outputs, full file dumps, repeated diffs, resolved debugging detours.
After a compact, re-read this file and the section of `index.html` you are working on before continuing.
