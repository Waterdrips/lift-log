# Lift Log

A simple gym tracker designed to make going to the gym as easy as possible. Runs in the browser, works offline, and every tap is saved on the phone straight away — closing the page mid-workout loses nothing.

## What it does

**Open the app → tap Start.** The home screen has today's workout ready to go (whichever area you've trained least recently, at your usual length), so there's nothing to decide.

- **Today's workout** — one tap starts a full session. 🎲 suggests another idea; *Quick 20 min* is the "just show up" version; *Customise…* opens the builder.
- **Session builder** — pick a focus (Legs, Glutes, Arms & shoulders, Core, Upper body, Full body, or 🎲 Surprise me) or one of 8 ready-made sessions. Choose **30 / 45 / 60 min or a custom length**, a goal (**Tone** by default, Strength or Endurance) and what equipment the gym has. The app works out how many exercises and sets fit. 🔀 swaps any exercise for a similar one, ✕ drops it, 🎲 *Randomise* re-rolls the lot.
- **Flexible targets** — every exercise says e.g. *"3 × 12–15 · 45s rest · Use a weight you can only just do 15 reps with"*, plus a one-line *How to* tip. When she hits the top of the range on every set, it suggests going a little heavier next time.
- **Supersets** (*More options* in the builder) — pairs exercises back to back with one rest after both; the app takes you from one to the other.
- **During the workout** — "last time" numbers next to every set, tick a set with the boxes empty to repeat the suggestion, a big rest countdown pinned to the top (shows what's next, buzzes and flashes **Go!**), the screen kept awake, and *How to* tips with a ▶ demo video link.
- **How did it feel?** — after each exercise: *Too easy · Just right · Too hard · Not for me*. Saved in the log; next time it suggests going heavier (easy) or holding the weight (hard), and "Not for me" makes it come up less.
- **After the workout** — a celebration screen with time, sets, kg lifted, personal bests, weekly progress and streak, then a 5-face rating for the session and an optional note (both saved in History).
- **How often** — every exercise can be set to 🚫 Never · Less · Normal · More · ⭐ Favourite (from the workout ⋯ menu, the builder, or the Exercises tab).
- **Progress chart** — each exercise shows best weight (or reps / hold time) per session; tap the chart to read any point.
- **Equipment at your gym** — Settings has a checklist of ~30 kinds of gym kit; sessions only use exercises your gym can do.
- **Reminders** — pick gym days and a time, then *Add to Google Calendar* (repeating event) or download an .ics with a 30-minute alert.
- **Next weight, filled in** — when the last session felt easy or she hit the top of the rep range on every set, the next weight is pre-filled (shown in green) with a note saying why.
- **− / + buttons** on the set she's doing now, so no typing is needed; steps match the kit (e.g. 2 kg dumbbells, 2.5 kg bars, 5 kg machines).
- **Busy? Swap** — one tap on any exercise she hasn't started swaps it for something that works the same muscles, ideally on different equipment.
- **Machine levels** — for machines that show levels or pin numbers instead of kg (⋯ menu or Exercises tab).
- **4-week plan** — weeks 1–3 build up, week 4 is an "easy week" (one set fewer, ~80% weights). Restarts at week 1 after two weeks off. Can be turned off in Settings.
- **Cool-down** — optional 3-minute guided stretches matched to the workout, with a countdown and "switch sides" prompts.
- **Monthly recap** — shown at the start of each month (and from History): workouts, time, strength gains, most-done exercise, best-rated session.
- **Backups** — after 5 workouts, and then monthly, a reminder to back up; *Back up now* opens Android's share sheet (Google Drive, WhatsApp, email…). Restore from Settings.
- **Updates** — when a new version is deployed, a "Refresh" banner appears instead of changes silently waiting.
- **Your own exercises** — give them equipment and what they work, and the builder will include them.
- **History, exercises, routines** — workouts grouped by week, repeat or save any workout as a routine, ~75 built-in exercises (machines, cables, dumbbells, barbell, bodyweight) plus her own, and a stats page per exercise.
- **Backup** — export/import a JSON file from Settings.

### Habit design (the thinking behind it)
Borrowed from *Atomic Habits* and good product design:

| Idea | In the app |
|---|---|
| Make it obvious | Opens on today's workout; plan gym days in advance (Settings → *Gym days*), shown on the week strip and added to her calendar |
| Make it easy | One-tap start, smart defaults that are remembered, no decisions needed at the gym, empty boxes auto-fill from last time |
| Two-minute rule | *Quick 20 min* — a short session still counts |
| Never miss twice | After a few days off, a gentle nudge towards the short version |
| Make it satisfying | Week strip ticks, weekly goal, week streak (forgiving — weeks not days), celebration and personal bests |
| Identity | "Workout #12 done — every session is a vote for the person you're becoming" |
| Reduce friction | Works offline, screen stays on, big tap targets, auto-scroll, progression hints so she never has to work out what weight to use |
| Keep it simple | A 4-step welcome on first open; the advanced options (goal, supersets, equipment, editing) are folded away until needed |

## Deploy (GitHub Pages)
Repo → **Settings → Pages** → *Deploy from a branch* → `main` / `(root)` → Save. A minute later it's live at `https://<username>.github.io/<repo>/`.

## On the phone (Android)
Open the URL once in Chrome, then ⋮ → **Install app** (or *Add to Home screen*). It then opens full-screen and works with no signal. (iPhone: Safari → Share → *Add to Home Screen*.)

Data is stored in the browser on that phone only. Clearing Chrome's site data deletes it — the app nudges her to back up monthly (Settings → *Back up now*, restore with *Restore*).

## Updating
Edit files, bump `VERSION` in `sw.js` (e.g. `v5` → `v6`), push. The app shows its cached copy instantly and fetches the update in the background, and then shows a *Refresh* banner (it never reloads by itself, in case she's mid-set).

## Files
| File | Purpose |
|---|---|
| `index.html` | App shell |
| `app.js` | App logic (vanilla JS, no build step) |
| `plans.js` | Exercise catalogue, ready-made sessions, session builder |
| `styles.css` | Styles; follows the phone's light/dark mode |
| `sw.js` | Service worker — offline support |
| `manifest.webmanifest`, `icons/` | Home-screen install |
