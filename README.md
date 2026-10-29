# Lift Log

A simple gym tracker designed to make going to the gym as easy as possible. Runs in the browser, works offline, and every tap is saved on the phone straight away — closing the page mid-workout loses nothing.

## What it does

**Open the app → tap Start.** The home screen has today's workout ready to go (whichever area you've trained least recently, at your usual length), so there's nothing to decide.

- **Today's workout** — one tap starts a full session. 🎲 suggests another idea; *Quick 20 min* is the "just show up" version; *Customise…* opens the builder.
- **Session builder** — pick a focus (Legs, Glutes, Arms & shoulders, Core, Upper body, Full body, or 🎲 Surprise me) or one of 8 ready-made sessions. Choose **30 / 45 / 60 min or a custom length**, a goal (**Tone** by default, Strength or Endurance) and what equipment the gym has. The app works out how many exercises and sets fit. 🔀 swaps any exercise for a similar one, ✕ drops it, 🎲 *Randomise* re-rolls the lot.
- **Flexible targets** — every exercise says e.g. *"3 × 12–15 · 45s rest · Use a weight you can only just do 15 reps with"*, plus a one-line *How to* tip. When she hits the top of the range on every set, it suggests going a little heavier next time.
- **During the workout** — "last time" numbers next to every set, tick a set with the boxes empty to repeat the suggestion, an automatic rest timer (beep + vibrate) using that exercise's rest time, the screen kept awake, and an automatic scroll to the next exercise when one is finished.
- **After the workout** — a celebration screen with time, sets, kg lifted, personal bests, weekly progress and streak.
- **History, exercises, routines** — workouts grouped by week, repeat or save any workout as a routine, ~75 built-in exercises (machines, cables, dumbbells, barbell, bodyweight) plus her own, and a stats page per exercise.
- **Backup** — export/import a JSON file from Settings.

### Habit design (the thinking behind it)
Borrowed from *Atomic Habits* and good product design:

| Idea | In the app |
|---|---|
| Make it obvious | Opens on today's workout; plan gym days in advance (Settings → *Gym days*) and they're marked on the week strip |
| Make it easy | One-tap start, smart defaults that are remembered, no decisions needed at the gym, empty boxes auto-fill from last time |
| Two-minute rule | *Quick 20 min* — a short session still counts |
| Never miss twice | After a few days off, a gentle nudge towards the short version |
| Make it satisfying | Week strip ticks, weekly goal, week streak (forgiving — weeks not days), celebration and personal bests |
| Identity | "Workout #12 done — every session is a vote for the person you're becoming" |
| Reduce friction | Works offline, screen stays on, big tap targets, auto-scroll, progression hints so she never has to work out what weight to use |

## Deploy (GitHub Pages)
Repo → **Settings → Pages** → *Deploy from a branch* → `main` / `(root)` → Save. A minute later it's live at `https://<username>.github.io/<repo>/`.

## On the phone (Android)
Open the URL once in Chrome, then ⋮ → **Install app** (or *Add to Home screen*). It then opens full-screen and works with no signal. (iPhone: Safari → Share → *Add to Home Screen*.)

Data is stored in the browser on that phone only. Clearing Chrome's site data deletes it — use *Export backup* in Settings now and then.

## Updating
Edit files, bump `VERSION` in `sw.js` (e.g. `v3` → `v4`), push. The app shows its cached copy instantly and fetches the update in the background, so changes appear on the **second** open after deploying.

## Files
| File | Purpose |
|---|---|
| `index.html` | App shell |
| `app.js` | App logic (vanilla JS, no build step) |
| `plans.js` | Exercise catalogue, ready-made sessions, session builder |
| `styles.css` | Styles; follows the phone's light/dark mode |
| `sw.js` | Service worker — offline support |
| `manifest.webmanifest`, `icons/` | Home-screen install |
