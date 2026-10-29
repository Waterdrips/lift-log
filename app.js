'use strict';

/* ---------- Storage ---------- */
const KEY = 'liftlog.v1';
const CATS = ['Legs', 'Glutes', 'Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Other'];
const LP = window.LiftPlans;
const ALL_GEAR = Object.keys(LP.GEAR);
const SETTINGS = { unit: 'kg', rest: 90, minutes: 45, goal: 'tone', gear: ALL_GEAR, target: 3, days: [], awake: true };

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => Date.now();
const touch = o => { o.u = now(); return o; };

function fresh() {
  return {
    v: 1,
    tab: 'train',
    settings: { ...SETTINGS },
    exercises: LP.CATALOG.map(c => ({ id: c.id, name: c.name, cat: c.cat, u: 0 })),
    templates: [],
    history: [],
    active: null,
    tomb: { w: {}, x: {}, t: {} }, // deleted ids → when (stops deleted built-ins coming back)
  };
}

/** Fill in fields added in later versions, and add any new built-in exercises. */
function upgrade(s) {
  s.settings = Object.assign({ ...SETTINGS }, s.settings);
  s.templates = s.templates || [];
  s.history = s.history || [];
  s.tomb = Object.assign({ w: {}, x: {}, t: {} }, s.tomb);
  delete s.sync;
  const byName = {}, remap = {};
  LP.CATALOG.forEach(c => { byName[c.name] = c.id; });
  for (const e of s.exercises) {
    // Early versions gave built-ins random ids; switch them to the catalogue's so tips and swaps work.
    const id = byName[e.name];
    if (id && e.id !== id && !s.exercises.some(x => x.id === id)) { remap[e.id] = id; e.id = id; }
  }
  const fix = list => list.forEach(x => { if (remap[x.exId]) x.exId = remap[x.exId]; });
  s.history.forEach(w => fix(w.exercises));
  s.templates.forEach(t => fix(t.items));
  if (s.active) fix(s.active.exercises);
  const have = new Set(s.exercises.map(e => e.id));
  LP.CATALOG.forEach(c => { if (!have.has(c.id) && !s.tomb.x[c.id]) s.exercises.push({ id: c.id, name: c.name, cat: c.cat, u: 0 }); });
  return s;
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) return upgrade(s);
  } catch (e) { /* fall through */ }
  return fresh();
}

let S = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    toast('Couldn’t save — phone storage may be full');
  }
}
// Belt and braces: write again whenever the page is hidden or closed.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
window.addEventListener('pagehide', save);

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmtN = n => (Math.round(n * 100) / 100).toString();
const unit = () => S.settings.unit;
const exById = id => S.exercises.find(e => e.id === id);
const exName = (id, fallback) => exById(id)?.name || fallback || 'Exercise';
const meta = id => LP.META[id];
const isTimed = id => !!meta(id)?.f.includes('t');
const fmtSet = (s, exId) => isTimed(exId)
  ? `${s.w ? fmtN(s.w) + unit() + ' · ' : ''}${s.r} s`
  : `${s.w ? fmtN(s.w) + unit() : 'BW'} × ${s.r}`;
const e1rm = s => (s.w && s.r ? s.w * (1 + Math.min(s.r, 12) / 30) : 0);

function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtDur(ms) {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/** Sets from the most recent finished workout containing this exercise. */
function prevSets(exId) {
  for (const w of S.history) {
    const e = w.exercises.find(x => x.exId === exId);
    if (e && e.sets.length) return e.sets;
  }
  return [];
}

/** What a set will default to if ticked empty: last session's matching set, else the set above. */
function suggestion(entry, j) {
  const prev = prevSets(entry.exId)[j];
  if (prev) return { w: prev.w ? fmtN(prev.w) : '', r: String(prev.r) };
  for (let k = j - 1; k >= 0; k--) {
    const s = entry.sets[k];
    if (s.w !== '' || s.r !== '') return { w: s.w, r: s.r };
  }
  return { w: '', r: entry.plan ? String(entry.plan.hi) : '' };
}

/* ---------- Workout actions ---------- */
function newEntry(exId, setCount, plan) {
  const n = setCount || plan?.sets || prevSets(exId).length || 3;
  const e = { id: uid(), exId, name: exName(exId), sets: Array.from({ length: n }, () => ({ w: '', r: '', done: false })) };
  if (plan) e.plan = plan;
  return e;
}

/** items: [{ exId, sets, plan }] */
function startWorkout(name, items = [], extra = {}) {
  S.active = {
    id: uid(),
    name: name || defaultName(),
    start: Date.now(),
    restEnd: null, restTotal: 0,
    exercises: items.filter(i => exById(i.exId)).map(i => newEntry(i.exId, i.sets, i.plan)),
    ...extra,
  };
  S.tab = 'train';
  save();
  render();
  syncWakeLock();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function defaultName() {
  const h = new Date().getHours();
  return h < 12 ? 'Morning workout' : h < 17 ? 'Afternoon workout' : 'Evening workout';
}

function finishWorkout() {
  const a = S.active;
  const exercises = a.exercises
    .map(e => ({
      exId: e.exId, name: e.name, ...(e.plan ? { plan: e.plan } : {}),
      sets: e.sets.filter(s => s.done).map(s => ({ w: num(s.w) || 0, r: num(s.r) || 0 })),
    }))
    .filter(e => e.sets.length);
  const done = exercises.reduce((n, e) => n + e.sets.length, 0);
  const undone = a.exercises.reduce((n, e) => n + e.sets.filter(s => !s.done && (s.w !== '' || s.r !== '')).length, 0);

  if (!done) {
    if (confirm('No sets are ticked off yet. Discard this workout?')) { S.active = null; save(); render(); }
    return;
  }
  let msg = `Finish workout? ${done} set${done === 1 ? '' : 's'} logged.`;
  if (undone) msg += `\n\n${undone} filled-in set${undone === 1 ? ' isn’t' : 's aren’t'} ticked and won’t be saved.`;
  if (!confirm(msg)) return;

  S.history.unshift({ id: a.id, name: a.name.trim() || defaultName(), start: a.start, end: now(), exercises, u: now(), ...(a.focus ? { focus: a.focus } : {}) });
  S.active = null;
  S.tab = 'history';
  S.openHist = a.id;
  save();
  render();
  syncWakeLock();
  window.scrollTo(0, 0);
  celebrate(S.history[0]);
}

function startRest(sec) {
  if (!S.active || !sec) return;
  S.active.restTotal = sec;
  S.active.restEnd = Date.now() + sec * 1000;
  save();
  updateTimers();
}

/* ---------- Sound / vibration for the rest timer ---------- */
let audio;
function primeAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch (e) { /* no audio */ }
}
function beep() {
  navigator.vibrate?.([200, 100, 200]);
  if (!audio) return;
  try {
    [0, 0.25].forEach(t => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + t);
      o.stop(audio.currentTime + t + 0.2);
    });
  } catch (e) { /* ignore */ }
}

/* ---------- Views ---------- */
const TICK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function viewTrain() {
  const a = S.active;
  if (!a) {
    const tpl = S.templates.map(t => `
      <div class="list-item">
        <div class="grow">
          <div class="title">${esc(t.name)}</div>
          <div class="muted small">${t.items.map(i => esc(exName(i.exId, i.name))).join(' · ')}</div>
        </div>
        <button class="icon-btn" data-a="tpl-menu" data-id="${t.id}" aria-label="Routine options">⋯</button>
        <button class="btn primary" data-a="tpl-start" data-id="${t.id}">Start</button>
      </div>`).join('');
    const focus = Object.entries(LP.FOCUS).map(([k, f]) => `
      <button class="focus-btn" data-a="plan-focus" data-id="${k}"><span class="ico">${f.icon}</span>${esc(f.label)}</button>`).join('');
    const sessions = LP.SESSIONS.map(x => `
      <button class="list-item" data-a="plan-session" data-id="${x.id}">
        <span class="grow">
          <span class="title" style="display:block">${esc(x.name)}</span>
          <span class="muted small" style="display:block">${esc(x.desc)}</span>
          <span class="tags">${x.gear.map(g => `<span class="tag">${esc(LP.GEAR_ONE[g])}</span>`).join('')}</span>
        </span>
        <span class="chev">›</span>
      </button>`).join('');
    return `
      <h1>${greeting()}</h1>
      ${todayCard()}
      <h2>Or pick a focus</h2>
      <div class="focus-grid">${focus}</div>
      <button class="btn block" data-a="plan-surprise" style="margin-top:8px">🎲 Surprise me</button>
      <h2>Ready-made sessions</h2>
      ${sessions}
      ${tpl ? `<h2>Your routines</h2>${tpl}` : ''}
      <button class="btn ghost block" data-a="start-empty" style="margin-top:14px">Start an empty workout</button>
      ${tpl ? '' : '<p class="muted small" style="text-align:center">Tip: after a workout, open it in History and tap “Save as routine” to keep it here.</p>'}`;
  }

  const u = esc(unit());
  const cards = a.exercises.map((e, i) => {
    const prev = prevSets(e.exId);
    const m = meta(e.exId);
    const bw = m?.g === 'bodyweight';
    const rows = e.sets.map((s, j) => {
      const sug = suggestion(e, j);
      const p = prev[j];
      return `
        <div class="set-row${s.done ? ' done' : ''}" data-si="${j}">
          <span class="n">${j + 1}</span>
          <span class="prev">${p ? esc(fmtSet(p, e.exId)) : '—'}</span>
          <input data-f="w" inputmode="decimal" enterkeyhint="next" value="${esc(s.w)}" placeholder="${esc(sug.w || (bw ? 'BW' : ''))}" aria-label="Set ${j + 1} weight">
          <input data-f="r" inputmode="numeric" enterkeyhint="done" value="${esc(s.r)}" placeholder="${esc(sug.r)}" aria-label="Set ${j + 1} reps">
          <button class="tick" data-a="tick" aria-label="Mark set ${j + 1} done">${TICK}</button>
        </div>`;
    }).join('');
    return `
      <section class="card" data-ei="${i}">
        <div class="ex-head">
          <h3>${esc(exName(e.exId, e.name))}</h3>
          <button class="icon-btn" data-a="ex-menu" aria-label="Exercise options">⋯</button>
        </div>
        ${e.plan ? `<div class="rx"><b>${esc(rxLine(e.plan, e.sets.length))}</b> · ${esc(guidance(e.plan))}</div>` : ''}
        ${hint(e, prev) ? `<div class="rx up">${esc(hint(e, prev))}</div>` : ''}
        ${m?.cue ? `<details class="cue"><summary>How to</summary>${esc(m.cue)}</details>` : ''}
        <div class="set-row head"><span class="n">Set</span><span>Last time</span><span style="text-align:center">${u}</span><span style="text-align:center">${isTimed(e.exId) ? 'Secs' : 'Reps'}</span><span></span></div>
        ${rows}
        <button class="add-set" data-a="add-set">+ Add set</button>
      </section>`;
  }).join('');

  return `
    <div class="sess-head">
      <input class="sess-name" data-f="wname" value="${esc(a.name)}" aria-label="Workout name">
      <span class="elapsed" id="elapsed">${fmtClock((Date.now() - a.start) / 1000)}</span>
    </div>
    ${a.warm ? `<div class="card warm">
        <div class="grow"><b>Warm up first (~5 min)</b><div class="small">Easy cardio until you’re breathing a bit harder, then one light set of ${esc(exName(a.exercises[0]?.exId, ''))}.</div></div>
        <button class="icon-btn" data-a="warm-done" aria-label="Dismiss">✕</button>
      </div>` : ''}
    ${cards || '<div class="empty">Add your first exercise to get going.</div>'}
    <button class="btn ghost block" data-a="add-ex">+ Add exercise</button>
    <div class="row finish-row">
      <button class="btn danger" data-a="discard">Discard</button>
      <button class="btn primary" data-a="finish">Finish workout</button>
    </div>`;
}

function weekLabel(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const thisMon = new Date(now); thisMon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const diff = Math.round((thisMon - monday) / (7 * 864e5));
  if (diff === 0) return 'This week';
  if (diff === 1) return 'Last week';
  return 'Week of ' + monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: monday.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function viewHistory() {
  if (!S.history.length) return `<h1>History</h1><div class="empty">Finished workouts will show up here.</div>`;
  let lastWeek = '';
  const items = S.history.map(w => {
    const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
    const vol = w.exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + s.w * s.r, 0), 0);
    const open = S.openHist === w.id;
    const wk = weekLabel(w.start);
    const header = wk !== lastWeek ? `<div class="week">${esc(wk)} · ${plural(S.history.filter(h => weekLabel(h.start) === wk).length, 'workout')}</div>` : '';
    lastWeek = wk;
    const detail = open ? `
      <div class="hist-detail">
        ${w.exercises.map(e => `<div class="hist-ex"><b>${esc(exName(e.exId, e.name))}</b><span>${e.sets.map(s => esc(fmtSet(s, e.exId))).join(' · ')}</span></div>`).join('')}
        <div class="chips">
          <button class="chip" data-a="repeat" data-id="${w.id}">Repeat</button>
          <button class="chip" data-a="save-tpl" data-id="${w.id}">Save as routine</button>
          <button class="chip danger" data-a="del-hist" data-id="${w.id}">Delete</button>
        </div>
      </div>` : '';
    return `${header}
      <div class="card" >
        <button style="width:100%;text-align:left" data-a="toggle-hist" data-id="${w.id}">
          <div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(w.name)}</b><span class="chev">${open ? '▴' : '▾'}</span></div>
          <div class="hist-meta"><span>${fmtDate(w.start)}</span><span>${fmtDur(w.end - w.start)}</span><span>${sets} sets</span>${vol ? `<span>${Math.round(vol).toLocaleString()} ${esc(unit())} lifted</span>` : ''}</div>
        </button>
        ${detail}
      </div>`;
  }).join('');
  return `<h1>History</h1>${items}`;
}

function viewLibrary() {
  const q = (S.libQ || '').toLowerCase();
  const counts = {};
  S.history.forEach(w => w.exercises.forEach(e => { counts[e.exId] = (counts[e.exId] || 0) + 1; }));
  const groups = CATS.map(c => {
    const list = S.exercises.filter(e => e.cat === c && e.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) return '';
    return `<div class="cat">${c}</div>` + list.map(e => `
      <button class="lib-item" data-a="lib-open" data-id="${e.id}">
        <span class="grow">${esc(e.name)}</span>
        <span class="badge">${[meta(e.id) ? LP.GEAR_ONE[meta(e.id).g] : '', counts[e.id] ? counts[e.id] + '×' : ''].filter(Boolean).join(' · ')}</span>
        <span class="chev">›</span>
      </button>`).join('');
  }).join('');
  return `
    <h1>Exercises</h1>
    <div class="row" style="align-items:center">
      <input type="search" id="lib-q" placeholder="Search exercises" value="${esc(S.libQ || '')}" style="flex:3">
      <button class="btn primary" data-a="lib-new" style="flex:0 0 auto">New</button>
    </div>
    <div id="lib-list">${groups || '<div class="empty">No matches.</div>'}</div>`;
}

function viewMore() {
  const s = S.settings;
  const rests = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
  const bytes = new Blob([localStorage.getItem(KEY) || '']).size;
  return `
    <h1>Settings</h1>
    <h2 style="margin-top:0">Your routine</h2>
    <div class="card">
      <div class="setting" style="display:block">
        <div>Gym days<div class="muted small">Pick the days you plan to go. Deciding in advance makes it much easier to actually go.</div></div>
        <div class="chips">${DOW_LONG.map((d, i) => `<button class="chip toggle ${s.days.includes(i) ? 'on' : ''}" data-a="day" data-v="${i}">${d}</button>`).join('')}</div>
      </div>
      ${s.days.length ? '' : `<div class="setting">
        <div>Weekly goal<div class="muted small">Workouts per week</div></div>
        <select id="target-sel">${[1, 2, 3, 4, 5, 6].map(n => `<option ${n === s.target ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>`}
      <div class="setting">
        <div>Usual session length</div>
        <select id="minutes-sel">${[20, 30, 45, 60, 75, 90].concat([20, 30, 45, 60, 75, 90].includes(s.minutes) ? [] : [s.minutes]).map(n => `<option value="${n}" ${n === s.minutes ? 'selected' : ''}>${n} min</option>`).join('')}</select>
      </div>
      <div class="setting">
        <div>Goal</div>
        <select id="goal-sel">${Object.entries(LP.GOALS).map(([k, g]) => `<option value="${k}" ${k === s.goal ? 'selected' : ''}>${g.label}</option>`).join('')}</select>
      </div>
      <div class="setting" style="display:block">
        <div>Equipment at your gym<div class="muted small">Today’s workout only uses these.</div></div>
        <div class="chips">${ALL_GEAR.map(g => `<button class="chip toggle ${s.gear.includes(g) ? 'on' : ''}" data-a="gear" data-v="${g}">${LP.GEAR[g]}</button>`).join('')}</div>
      </div>
    </div>

    <h2>During a workout</h2>
    <div class="card">
      <div class="setting">
        <div>Weight unit<div class="muted small">Just the label — numbers aren’t converted</div></div>
        <div class="seg">
          <button data-a="unit" data-v="kg" class="${s.unit === 'kg' ? 'on' : ''}">kg</button>
          <button data-a="unit" data-v="lb" class="${s.unit === 'lb' ? 'on' : ''}">lb</button>
        </div>
      </div>
      <div class="setting">
        <div>Rest timer<div class="muted small">Starts when you tick a set. Planned sessions use their own rest times.</div></div>
        <select id="rest-sel">${rests.map(r => `<option value="${r}" ${r === s.rest ? 'selected' : ''}>${r ? fmtClock(r) : 'Off'}</option>`).join('')}</select>
      </div>
      <div class="setting">
        <div>Keep screen on<div class="muted small">So you don’t have to unlock your phone between sets</div></div>
        <button class="switch ${s.awake ? 'on' : ''}" data-a="awake" role="switch" aria-checked="${s.awake}" aria-label="Keep screen on"><i></i></button>
      </div>
    </div>

    <h2>Your data</h2>
    <div class="card">
      <p class="muted small" style="margin-top:0">${plural(S.history.length, 'workout')}, stored on this phone only (${(bytes / 1024).toFixed(1)} KB). Clearing Chrome’s site data deletes it, so export a backup file now and then.</p>
      <div class="row">
        <button class="btn" data-a="export">Export backup</button>
        <button class="btn" data-a="import">Import backup</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
      <p class="muted small" id="persist-status"></p>
    </div>

    <h2>Install</h2>
    <div class="card muted small">
      <p style="margin-top:0"><b style="color:var(--text)">Android:</b> Chrome menu ⋮ → <i>Install app</i> / <i>Add to Home screen</i>.</p>
      <p style="margin-bottom:0"><b style="color:var(--text)">iPhone:</b> open in Safari → Share → <i>Add to Home Screen</i>.</p>
      <p style="margin-bottom:0" id="offline-status"></p>
    </div>

    <button class="btn danger block" data-a="wipe" style="margin-top:24px">Erase data on this phone</button>`;
}

const VIEWS = { train: viewTrain, history: viewHistory, library: viewLibrary, more: viewMore };

function render() {
  if (!VIEWS[S.tab]) S.tab = 'train';
  const y = window.scrollY;
  $('#view').innerHTML = VIEWS[S.tab]();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  if (S.tab === 'more') fillStatus();
  updateTimers();
  return y;
}
function rerenderKeepScroll() { const y = window.scrollY; render(); window.scrollTo(0, y); }

async function fillStatus() {
  const p = $('#persist-status');
  if (p && navigator.storage?.persisted) {
    const ok = await navigator.storage.persisted();
    p.textContent = ok ? '✓ The browser has marked this storage as persistent.' : 'Tip: installing to the home screen makes the browser much less likely to clear the data.';
  }
  const o = $('#offline-status');
  if (o) o.textContent = navigator.serviceWorker?.controller ? '✓ Ready to work offline.' : 'Offline mode activates after the first full load.';
}

/* ---------- Timers (elapsed + rest) ---------- */
function updateTimers() {
  const a = S.active;
  const el = $('#elapsed');
  if (el && a) el.textContent = fmtClock((Date.now() - a.start) / 1000);

  const bar = $('#rest');
  if (!a || !a.restEnd) { bar.hidden = true; return; }
  const left = (a.restEnd - Date.now()) / 1000;
  if (left <= -1) {
    // Finished: alert once (if the page is open), then hide.
    if (!a.restAlerted && left > -10) beep();
    a.restEnd = null; a.restAlerted = false; save();
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  $('#rest-time').textContent = fmtClock(Math.max(0, left));
  $('.rest-fill', bar).style.width = `${Math.min(100, Math.max(0, 100 - (left / a.restTotal) * 100))}%`;
  if (left <= 0 && !a.restAlerted) { a.restAlerted = true; beep(); }
}
setInterval(updateTimers, 1000);

/* ---------- Sheet (bottom modal) ---------- */
let sheetHandler = null;
function openSheet(html, handler) {
  $('#sheet-body').innerHTML = html;
  sheetHandler = handler;
  const d = $('#sheet');
  if (!d.open) d.showModal();
}
function closeSheet() { $('#sheet').close(); }
$('#sheet').addEventListener('close', () => { sheetHandler = null; });
$('#sheet').addEventListener('click', e => {
  if (e.target.id === 'sheet') return closeSheet(); // backdrop tap
  const b = e.target.closest('[data-s]');
  if (b && sheetHandler) sheetHandler(b.dataset.s, b);
});

function catSelect(id, selected = 'Other') {
  return `<select id="${id}">${CATS.map(c => `<option ${c === selected ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
}

function openPicker() {
  openSheet(`
    <h2>Add exercise</h2>
    <input type="search" id="pk-q" placeholder="Search or type a new name" autocomplete="off">
    <div class="sheet-list" id="pk-list"></div>`, (act, b) => {
    if (act === 'pick') addExercise(b.dataset.id);
    if (act === 'create') {
      const name = $('#pk-q').value.trim();
      if (!name) return;
      const ex = { id: uid(), name, cat: $('#pk-cat').value, u: now() };
      S.exercises.push(ex);
      addExercise(ex.id);
    }
  });
  const q = $('#pk-q');
  const draw = () => {
    const term = q.value.trim().toLowerCase();
    const used = new Set(S.active.exercises.map(e => e.exId));
    const recent = [];
    S.history.forEach(w => w.exercises.forEach(e => { if (!recent.includes(e.exId) && exById(e.exId)) recent.push(e.exId); }));
    let list = S.exercises.filter(e => e.name.toLowerCase().includes(term));
    list.sort((a, b) => {
      const ra = recent.indexOf(a.id), rb = recent.indexOf(b.id);
      if (!term && (ra >= 0 || rb >= 0)) return (ra < 0 ? 1e9 : ra) - (rb < 0 ? 1e9 : rb);
      return a.name.localeCompare(b.name);
    });
    const exact = S.exercises.some(e => e.name.toLowerCase() === term);
    const create = term && !exact ? `
      <div class="card" style="background:var(--surface-2);margin:6px 0 10px">
        <div style="margin-bottom:8px">Create <b>${esc(q.value.trim())}</b></div>
        <div class="row">${catSelect('pk-cat')}<button class="btn primary" data-s="create">Add</button></div>
      </div>` : '';
    $('#pk-list').innerHTML = create + list.map(e => `
      <button class="sheet-action" data-s="pick" data-id="${e.id}">
        ${esc(e.name)} <span class="muted small" style="font-weight:400">· ${e.cat}${used.has(e.id) ? ' · in workout' : ''}</span>
      </button>`).join('');
  };
  q.addEventListener('input', draw);
  draw();
  setTimeout(() => q.focus(), 50);
}

function addExercise(exId) {
  S.active.exercises.push(newEntry(exId));
  save();
  closeSheet();
  render();
  const cards = document.querySelectorAll('#view .card');
  cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function openExMenu(i) {
  const a = S.active, e = a.exercises[i];
  openSheet(`
    <h2>${esc(exName(e.exId, e.name))}</h2>
    <button class="sheet-action" data-s="up" ${i === 0 ? 'disabled' : ''}>Move up</button>
    <button class="sheet-action" data-s="down" ${i === a.exercises.length - 1 ? 'disabled' : ''}>Move down</button>
    ${meta(e.exId) ? '<button class="sheet-action" data-s="similar">Swap for something similar 🔀</button>' : ''}
    <button class="sheet-action" data-s="swap">Swap for another exercise</button>
    <button class="sheet-action" data-s="rm-set" ${e.sets.length ? '' : 'disabled'}>Remove last set</button>
    <button class="sheet-action danger" data-s="rm">Remove exercise</button>`, act => {
    const list = a.exercises;
    if (act === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    if (act === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    if (act === 'rm-set') e.sets.pop();
    if (act === 'similar') {
      const id = LP.swapFor(e.exId, S.settings.gear, new Set([...list.map(x => x.exId), ...hiddenIds()]), recentIds());
      if (!id) { closeSheet(); toast('No similar exercise for your equipment'); return; }
      e.exId = id; e.name = exName(id);
      if (e.plan) e.plan = { ...LP.prescription(id, e.plan.g), sets: e.sets.length };
      toast(`Swapped to ${e.name}`);
    }
    if (act === 'rm') {
      if (e.sets.some(s => s.done) && !confirm('Remove this exercise and its ticked sets?')) return;
      list.splice(i, 1);
    }
    if (act === 'swap') {
      // Reuse the picker, then replace instead of append.
      openPicker();
      const original = sheetHandler;
      sheetHandler = (act2, b) => {
        if (act2 === 'pick') {
          e.exId = b.dataset.id; e.name = exName(e.exId);
          save(); closeSheet(); rerenderKeepScroll();
        } else original(act2, b);
      };
      return;
    }
    save(); closeSheet(); rerenderKeepScroll();
  });
}

function openLibItem(id) {
  const ex = exById(id);
  if (!ex) return;
  const sessions = [];
  S.history.forEach(w => w.exercises.forEach(e => { if (e.exId === id) sessions.push({ when: w.start, sets: e.sets }); }));
  const all = sessions.flatMap(s => s.sets);
  const heaviest = all.reduce((m, s) => Math.max(m, s.w), 0);
  const best = all.reduce((m, s) => Math.max(m, e1rm(s)), 0);
  const mostReps = all.reduce((m, s) => Math.max(m, s.r), 0);
  const stats = sessions.length ? `
    <div class="stat-grid">
      <div class="stat"><b>${heaviest ? fmtN(heaviest) + esc(unit()) : '—'}</b><span>Heaviest set</span></div>
      <div class="stat"><b>${best ? fmtN(Math.round(best * 10) / 10) + esc(unit()) : '—'}</b><span>Est. 1-rep max</span></div>
      <div class="stat"><b>${mostReps}</b><span>Most reps</span></div>
      <div class="stat"><b>${sessions.length}</b><span>Sessions</span></div>
    </div>
    <div class="sheet-list" style="max-height:30vh">
      ${sessions.slice(0, 12).map(s => `<div class="hist-ex"><b>${fmtDate(s.when)}</b><span>${s.sets.map(x => esc(fmtSet(x, id))).join(' · ')}</span></div>`).join('')}
    </div>` : '<p class="muted">Not logged yet.</p>';
  const m = meta(id);
  openSheet(`
    <h2>${esc(ex.name)}</h2>
    ${m ? `<p class="muted small" style="margin-top:-6px">${esc(LP.GEAR_ONE[m.g])} · ${esc(m.cue)}</p>` : ''}
    ${stats}
    <div class="row" style="margin-top:12px"><input id="ed-name" value="${esc(ex.name)}" aria-label="Name">${catSelect('ed-cat', ex.cat)}</div>
    <div class="row" style="margin-top:10px">
      <button class="btn danger" data-s="del">Delete</button>
      <button class="btn primary" data-s="save">Save</button>
    </div>`, act => {
    if (act === 'save') {
      const n = $('#ed-name').value.trim();
      if (n) ex.name = n;
      ex.cat = $('#ed-cat').value;
      touch(ex);
    }
    if (act === 'del') {
      if (!confirm(`Delete “${ex.name}”? Past workouts keep their records.`)) return;
      S.exercises = S.exercises.filter(e => e.id !== id);
      S.tomb.x[id] = now();
    }
    save(); closeSheet(); render();
  });
}

function openNewExercise() {
  openSheet(`
    <h2>New exercise</h2>
    <input id="nx-name" placeholder="Name, e.g. Cable Pull-Through">
    <div class="row" style="margin-top:10px">${catSelect('nx-cat')}<button class="btn primary" data-s="add">Add</button></div>`, act => {
    const name = $('#nx-name').value.trim();
    if (act !== 'add' || !name) return;
    if (S.exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) return toast('That exercise already exists');
    S.exercises.push({ id: uid(), name, cat: $('#nx-cat').value, u: now() });
    save(); closeSheet(); render();
  });
  setTimeout(() => $('#nx-name').focus(), 50);
}

/* ---------- Habit helpers (weekly goal, streak, today's suggestion) ---------- */
const DAY = 864e5;
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DOW_LONG = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dow = d => (new Date(d).getDay() + 6) % 7; // 0 = Monday
function weekStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - dow(d)); return d.getTime(); }
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const target = () => S.settings.days.length || S.settings.target || 3;
const inWeek = ws => S.history.filter(w => w.start >= ws && w.start < ws + 7 * DAY + 3600e3);
const daysTrained = ws => new Set(inWeek(ws).map(w => dow(w.start)));

/** Consecutive weeks hitting the goal (this week counts once it's hit). */
function streak() {
  let ws = weekStart(Date.now()), n = 0;
  if (daysTrained(ws).size >= target()) n++;
  for (;;) {
    ws = weekStart(ws - 3 * DAY);
    if (daysTrained(ws).size >= target()) n++; else break;
    if (n > 520) break;
  }
  return n;
}
const daysSinceLast = () => S.history.length ? Math.floor((Date.now() - S.history[0].start) / DAY) : null;

/** Today's idea: the focus she hasn't trained for longest. Stays the same all day unless re-rolled. */
function todayFocus() {
  const key = new Date().toDateString();
  if (S.today?.date === key && LP.FOCUS[S.today.focus]) return S.today.focus;
  const last = {};
  S.history.forEach(w => { if (w.focus && !(w.focus in last)) last[w.focus] = w.start; });
  const order = Object.keys(LP.FOCUS).sort((a, b) => (last[a] || 0) - (last[b] || 0) || Math.random() - 0.5);
  S.today = { date: key, focus: order[0] };
  save();
  return S.today.focus;
}

function quickStart(focus, minutes) {
  const pool = LP.buildPool(focus, S.settings.gear, recentIds(), hiddenIds());
  const { items } = LP.fit(pool, minutes, S.settings.goal);
  if (!items.length) return toast('No exercises match your equipment — check Settings');
  startWorkout(`${LP.FOCUS[focus].label} day`, items.map(it => ({ exId: it.exId, sets: it.sets, plan: it.plan })), { focus, warm: true });
  window.scrollTo(0, 0);
}

function weekStrip() {
  const ws = weekStart(Date.now()), done = daysTrained(ws), today = dow(Date.now());
  return `<div class="week-strip">${DOW.map((d, i) => `
    <span class="wd ${done.has(i) ? 'done' : ''} ${S.settings.days.includes(i) ? 'plan' : ''} ${i === today ? 'is-today' : ''}">
      <i>${done.has(i) ? '✓' : ''}</i>${d}</span>`).join('')}</div>`;
}

function todayCard() {
  const f = todayFocus(), F = LP.FOCUS[f], st = S.settings;
  const ws = weekStart(Date.now()), count = inWeek(ws).length, goal = target(), str = streak();
  const doneToday = S.history.some(w => sameDay(w.start, Date.now()));
  const since = daysSinceLast();
  const restDay = st.days.length && !st.days.includes(dow(Date.now()));
  let msg = '';
  if (doneToday) msg = 'Done for today ✓ Rest well — recovery is when you get stronger.';
  else if (since !== null && since >= 4) msg = `It’s been ${since} days. Never miss twice — even the 20-minute version keeps the habit going.`;
  else if (restDay) msg = 'Not one of your gym days — but if you fancy it, go for it.';
  else if (count >= goal) msg = 'Weekly goal already hit — anything now is a bonus 🎉';
  return `
    <div class="today">
      ${weekStrip()}
      <div class="today-stats">
        <span><b>${count}</b> of ${goal} this week</span>
        ${str ? `<span>🔥 ${str}-week streak</span>` : ''}
      </div>
      ${msg ? `<p class="today-msg">${esc(msg)}</p>` : ''}
      <div class="today-pick">
        <span class="ico">${F.icon}</span>
        <div class="grow"><span class="muted small">${doneToday ? 'Another idea' : 'Today’s workout'}</span><b>${esc(F.label)} day</b>
          <span class="muted small">${st.minutes} min · ${esc(LP.GOALS[st.goal]?.label || 'Tone')}</span></div>
        <button class="icon-btn" data-a="today-reroll" aria-label="Different idea">🎲</button>
      </div>
      <button class="btn ${doneToday ? '' : 'primary'} block big" data-a="today-start">${doneToday ? 'Go again' : 'Start'} · ${st.minutes} min</button>
      <div class="row today-alt">
        <button class="btn small-btn" data-a="today-short">⏱ Quick 20 min</button>
        <button class="btn small-btn" data-a="today-custom">Customise…</button>
      </div>
    </div>`;
}

/* ---------- Finish celebration ---------- */
function personalRecords(w) {
  const prs = [];
  for (const e of w.exercises) {
    const before = S.history.filter(h => h.id !== w.id).flatMap(h => h.exercises.filter(x => x.exId === e.exId).flatMap(x => x.sets));
    if (!before.length) continue;
    const timed = isTimed(e.exId);
    const bestNow = e.sets.reduce((m, s) => (timed ? s.r : s.w) > (timed ? m.r : m.w) || ((timed ? s.r : s.w) === (timed ? m.r : m.w) && s.r > m.r) ? s : m, e.sets[0]);
    const prevMax = before.reduce((m, s) => Math.max(m, timed ? s.r : s.w), 0);
    if (timed) { if (bestNow.r > prevMax) prs.push(`${exName(e.exId, e.name)}: longest hold, ${bestNow.r} s`); continue; }
    if (bestNow.w > prevMax && bestNow.w > 0) prs.push(`${exName(e.exId, e.name)}: heaviest yet, ${fmtN(bestNow.w)}${unit()}`);
    else if (bestNow.w === prevMax) {
      const prevReps = before.filter(s => s.w === prevMax).reduce((m, s) => Math.max(m, s.r), 0);
      if (bestNow.r > prevReps) prs.push(`${exName(e.exId, e.name)}: most reps at ${bestNow.w ? fmtN(bestNow.w) + unit() : 'bodyweight'} (${bestNow.r})`);
    }
  }
  return prs;
}

function celebrate(w) {
  const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
  const vol = w.exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + s.w * s.r, 0), 0);
  const prs = personalRecords(w);
  const count = inWeek(weekStart(w.start)).length, goal = target(), str = streak();
  const n = S.history.length;
  const cheer = count === goal ? `That’s ${goal} of ${goal} — weekly goal hit! 🎉`
    : count < goal ? `${count} of ${goal} this week — ${goal - count} to go.` : `${count} workouts this week — above and beyond.`;
  openSheet(`
    <div class="celebrate">
      <div class="big-emoji">${prs.length ? '🏆' : '💪'}</div>
      <h2>Workout #${n} done!</h2>
      <p class="muted">Every session is a vote for the person you’re becoming.</p>
      <div class="stat-grid">
        <div class="stat"><b>${fmtDur(w.end - w.start)}</b><span>Time</span></div>
        <div class="stat"><b>${sets}</b><span>Sets</span></div>
        ${vol ? `<div class="stat"><b>${Math.round(vol).toLocaleString()}</b><span>${esc(unit())} lifted</span></div>` : ''}
        <div class="stat"><b>${str ? '🔥 ' + str : count}</b><span>${str ? 'Week streak' : 'This week'}</span></div>
      </div>
      ${prs.length ? `<div class="prs"><b>New personal bests</b>${prs.map(p => `<div>⭐ ${esc(p)}</div>`).join('')}</div>` : ''}
      <p><b>${esc(cheer)}</b></p>
      <button class="btn primary block" data-s="ok">Nice</button>
    </div>`, () => closeSheet());
}

/* ---------- Keep the screen on during a workout ---------- */
let wakeLock = null;
async function syncWakeLock() {
  const want = !!S.active && S.settings.awake && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', syncWakeLock);

/* ---------- Session planner ---------- */
const DURATIONS = [30, 45, 60];

/** Exercises from the last two workouts — the planner prefers others for variety. */
function recentIds() {
  const r = new Set();
  S.history.slice(0, 2).forEach(w => w.exercises.forEach(e => r.add(e.exId)));
  return r;
}
/** Built-in exercises she has deleted — never suggested. */
const hiddenIds = () => new Set(LP.CATALOG.filter(c => !exById(c.id)).map(c => c.id));

/** Random focus, skipping whatever the last two workouts were. */
function surpriseFocus() {
  const recent = S.history.slice(0, 2).map(w => w.focus).filter(Boolean);
  const all = Object.keys(LP.FOCUS);
  const fresh = all.filter(k => !recent.includes(k));
  const list = fresh.length ? fresh : all;
  return list[Math.floor(Math.random() * list.length)];
}

function rxLine(p, sets) {
  return `${sets ?? p.sets} × ${p.lo}–${p.hi}${p.t ? ' s' : ''}${p.u ? ' each side' : ''} · ${p.rest}s rest`;
}
function guidance(p) {
  if (p.t) return 'Hold with good form — stop when it breaks.';
  if (p.bw) return `Bodyweight. If ${p.hi} is easy, lower slowly over 3 seconds.`;
  return `Use a weight you can only just do ${p.hi} reps with.`;
}
/** Nudge to progress when every set last time reached the top of the range. */
function hint(e, prev) {
  const p = e.plan;
  if (!p || p.t || !prev.length || !prev.every(s => s.r >= p.hi)) return '';
  return p.bw ? `↑ You hit ${p.hi}+ on every set last time — add a pause or hold a dumbbell.`
    : `↑ You hit ${p.hi}+ on every set last time — go a little heavier.`;
}

let PL = null; // planner state while the sheet is open

function openPlanner({ focus, session }) {
  const st = S.settings;
  const sess = session && LP.SESSIONS.find(x => x.id === session);
  const hidden = hiddenIds();
  PL = {
    focus: sess ? sess.focus : focus,
    session: sess?.id || null,
    name: sess ? sess.name : `${LP.FOCUS[focus].label} day`,
    minutes: st.minutes || 45,
    custom: !DURATIONS.includes(st.minutes),
    goal: LP.GOALS[st.goal] ? st.goal : 'tone',
    gear: sess ? sess.gear : [...st.gear],
    pool: sess ? sess.pool.filter(id => !hidden.has(id)) : LP.buildPool(focus, st.gear, recentIds(), hidden),
    msg: '',
  };
  drawPlanner();
}

function drawPlanner() {
  const f = LP.FOCUS[PL.focus];
  openSheet(`
    <div class="pl-head">
      <h2>${esc(PL.name)}</h2>
      <span class="muted small">${f.icon} ${esc(f.label)}</span>
    </div>
    <div class="lbl">How long have you got?</div>
    <div class="dur-grid">
      ${DURATIONS.map(d => `<button class="dur ${!PL.custom && PL.minutes === d ? 'on' : ''}" data-s="dur" data-v="${d}"><b>${d}</b><span>min</span></button>`).join('')}
      <button class="dur ${PL.custom ? 'on' : ''}" data-s="dur-custom"><b>${PL.custom ? PL.minutes : '…'}</b><span>custom</span></button>
    </div>
    <div class="custom-row" ${PL.custom ? '' : 'hidden'}>
      <input type="range" id="pl-range" min="15" max="120" step="5" value="${PL.minutes}" aria-label="Session length">
      <input id="pl-min" inputmode="numeric" value="${PL.minutes}" aria-label="Minutes"><span class="muted">min</span>
    </div>
    <div class="lbl">Goal</div>
    <div class="seg full">${Object.entries(LP.GOALS).map(([k, g]) => `<button data-s="goal" data-v="${k}" class="${PL.goal === k ? 'on' : ''}">${g.label}</button>`).join('')}</div>
    <div class="muted small" style="margin-top:6px">${esc(LP.GOALS[PL.goal].blurb)}</div>
    ${PL.session ? '' : `<div class="lbl">Equipment</div>
      <div class="chips" style="margin-top:0">${ALL_GEAR.map(g => `<button class="chip toggle ${PL.gear.includes(g) ? 'on' : ''}" data-s="gear" data-v="${g}">${LP.GEAR[g]}</button>`).join('')}</div>`}
    <div id="pl-list"></div>`, plannerAction);

  const range = $('#pl-range'), box = $('#pl-min');
  const setMin = v => {
    PL.minutes = v; S.settings.minutes = v; touch(S.settings); save();
    const c = $('.dur[data-s="dur-custom"] b'); if (c) c.textContent = v;
    drawPlanList();
  };
  range.addEventListener('input', () => { box.value = range.value; setMin(+range.value); });
  box.addEventListener('input', () => {
    const v = parseInt(box.value, 10);
    if (v >= 10 && v <= 180) { range.value = v; setMin(v); }
  });
  drawPlanList();
}

function drawPlanList() {
  const { items, seconds } = LP.fit(PL.pool, PL.minutes, PL.goal);
  PL.items = items;
  const el = $('#pl-list');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<div class="empty">No exercises match that equipment — turn a few more on.</div>`;
    return;
  }
  const mins = Math.round(seconds / 60);
  el.innerHTML = `
    <div class="lbl pl-sum"><span>Your session</span><span>≈ ${mins} min · ${plural(items.length, 'exercise')}</span></div>
    <div class="muted small">Includes a ${PL.minutes <= 20 ? 3 : 5}-minute warm-up. Tap 🔀 to swap any exercise for a similar one.</div>
    ${items.map((it, i) => {
      const m = LP.META[it.exId];
      return `
      <div class="pl-item">
        <span class="pl-n">${i + 1}</span>
        <div class="grow">
          <b>${esc(exName(it.exId, m?.name))}</b>
          <div class="muted small">${esc(rxLine(it.plan))}${m ? ' · ' + esc(LP.GEAR_ONE[m.g]) : ''}</div>
        </div>
        <button class="icon-btn" data-s="swap" data-i="${i}" aria-label="Swap for a similar exercise">🔀</button>
        <button class="icon-btn" data-s="drop" data-i="${i}" aria-label="Remove">✕</button>
      </div>`;
    }).join('')}
    ${PL.msg ? `<p class="small" style="color:var(--accent)">${esc(PL.msg)}</p>` : ''}
    ${mins < PL.minutes - 8 ? `<p class="muted small">That’s everything for this focus with your equipment, so it’ll finish a little early.</p>` : ''}
    <div class="row pl-actions">
      <button class="btn" data-s="reroll">🎲 Randomise</button>
      <button class="btn primary" data-s="start">Start workout</button>
    </div>`;
  PL.msg = '';
}

function plannerAction(act, b) {
  const st = S.settings;
  const recent = recentIds(), hidden = hiddenIds();
  switch (act) {
    case 'dur': PL.minutes = +b.dataset.v; PL.custom = false; st.minutes = PL.minutes; break;
    case 'dur-custom': PL.custom = true; break;
    case 'goal': PL.goal = b.dataset.v; st.goal = PL.goal; break;
    case 'gear': {
      const g = b.dataset.v;
      PL.gear = PL.gear.includes(g) ? PL.gear.filter(x => x !== g) : [...PL.gear, g];
      st.gear = [...PL.gear];
      PL.pool = LP.buildPool(PL.focus, PL.gear, recent, hidden);
      break;
    }
    case 'reroll':
      if (PL.session) {
        // Remix a ready-made session like-for-like, keeping its equipment.
        const used = new Set([...hidden]);
        PL.pool = PL.pool.map(id => { const n = LP.swapFor(id, PL.gear, new Set([...used, id]), recent) || id; used.add(n); return n; });
        if (!PL.name.endsWith('(remix)')) PL.name += ' (remix)';
      } else {
        PL.pool = LP.buildPool(PL.focus, PL.gear, recent, hidden);
      }
      break;
    case 'swap': {
      const cur = PL.items[+b.dataset.i].exId;
      const id = LP.swapFor(cur, PL.gear, new Set([...PL.pool, ...hidden]), recent);
      if (id) PL.pool[PL.pool.indexOf(cur)] = id;
      else PL.msg = 'No other similar exercise with this equipment.';
      return drawPlanList();
    }
    case 'drop': {
      const cur = PL.items[+b.dataset.i].exId;
      PL.pool = PL.pool.filter(x => x !== cur);
      return drawPlanList();
    }
    case 'start': {
      if (S.active && !confirm('A workout is already in progress. Replace it?')) return;
      const items = PL.items.map(it => ({ exId: it.exId, sets: it.sets, plan: it.plan }));
      closeSheet();
      startWorkout(PL.name, items, { focus: PL.focus, warm: true });
      window.scrollTo(0, 0);
      return;
    }
    default: return;
  }
  touch(st); save(); drawPlanner();
}

/* ---------- Events ---------- */
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  S.tab = b.dataset.tab;
  save(); render(); window.scrollTo(0, 0);
});

document.getElementById('rest').addEventListener('click', e => {
  const b = e.target.closest('[data-r]');
  const a = S.active;
  if (!b || !a?.restEnd) return;
  const v = b.dataset.r;
  if (v === 'skip') { a.restEnd = null; }
  else {
    a.restEnd += Number(v) * 1000;
    a.restTotal = Math.max(1, a.restTotal + Number(v));
    a.restAlerted = false;
  }
  save(); updateTimers();
});

const view = document.getElementById('view');

view.addEventListener('input', e => {
  const f = e.target.dataset.f;
  if (e.target.id === 'lib-q') {
    S.libQ = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const q = $('#lib-q'); q.focus(); q.setSelectionRange(pos, pos);
    return;
  }
  if (!f || !S.active) return;
  if (f === 'wname') { S.active.name = e.target.value; save(); return; }
  const ei = e.target.closest('[data-ei]')?.dataset.ei;
  const si = e.target.closest('[data-si]')?.dataset.si;
  const set = S.active.exercises[ei]?.sets[si];
  if (!set) return;
  set[f] = e.target.value.replace(/[^\d.,]/g, '');
  if (e.target.value !== set[f]) e.target.value = set[f];
  save();
});

view.addEventListener('change', e => {
  if (e.target.id === 'rest-sel') { S.settings.rest = Number(e.target.value); touch(S.settings); save(); }
  if (e.target.id === 'target-sel') { S.settings.target = Number(e.target.value); touch(S.settings); save(); }
  if (e.target.id === 'minutes-sel') { S.settings.minutes = Number(e.target.value); touch(S.settings); save(); }
  if (e.target.id === 'goal-sel') { S.settings.goal = e.target.value; touch(S.settings); save(); }
  if (e.target.id === 'import-file') importFile(e.target.files[0]);
});

// Enter on the weight field jumps to reps; Enter on reps ticks the set.
view.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const f = e.target.dataset.f;
  if (f === 'w') { e.preventDefault(); e.target.nextElementSibling?.focus(); }
  if (f === 'r') { e.preventDefault(); e.target.parentElement.querySelector('[data-a="tick"]').click(); }
  if (f === 'wname') e.target.blur();
});

view.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const act = b.dataset.a;
  const ei = Number(b.closest('[data-ei]')?.dataset.ei);
  const si = Number(b.closest('[data-si]')?.dataset.si);
  const a = S.active;

  switch (act) {
    case 'start-empty': startWorkout(); openPicker(); break;
    case 'add-ex': openPicker(); break;
    case 'ex-menu': openExMenu(ei); break;
    case 'add-set': {
      a.exercises[ei].sets.push({ w: '', r: '', done: false });
      save(); rerenderKeepScroll();
      const rows = document.querySelectorAll(`[data-ei="${ei}"] .set-row:not(.head)`);
      rows[rows.length - 1]?.querySelector('input')?.focus();
      break;
    }
    case 'tick': {
      primeAudio();
      const entry = a.exercises[ei], s = entry.sets[si];
      if (!s.done) {
        const sug = suggestion(entry, si);
        if (s.w === '') s.w = sug.w;
        if (s.r === '') s.r = sug.r;
        if (!num(s.r)) { toast('Enter the reps first'); return; }
        const m = meta(entry.exId);
        if (m && m.g !== 'bodyweight' && !num(s.w)) {
          toast('Enter the weight you used');
          $(`[data-ei="${ei}"] [data-si="${si}"] [data-f="w"]`)?.focus();
          return;
        }
        s.done = true;
        startRest(S.settings.rest ? (entry.plan?.rest ?? S.settings.rest) : 0);
      } else {
        s.done = false;
      }
      save(); rerenderKeepScroll();
      if (s.done && entry.sets.every(x => x.done)) {
        // Exercise finished: bring the next unfinished one into view.
        const next = a.exercises.findIndex((x, k) => k > ei && !x.sets.every(y => y.done));
        const card = next >= 0 ? $(`[data-ei="${next}"]`) : $('[data-a="finish"]');
        setTimeout(() => card?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
        if (next < 0) toast('All done — tap Finish workout 🎉');
      }
      break;
    }
    case 'finish': finishWorkout(); break;
    case 'discard':
      if (confirm('Discard this workout? Nothing from it will be saved.')) { S.active = null; save(); render(); syncWakeLock(); }
      break;

    case 'tpl-start': {
      if (a && !confirm('A workout is already in progress. Replace it?')) return;
      const t = S.templates.find(x => x.id === b.dataset.id);
      startWorkout(t.name, t.items);
      break;
    }
    case 'tpl-menu': {
      const t = S.templates.find(x => x.id === b.dataset.id);
      openSheet(`
        <h2>${esc(t.name)}</h2>
        <input id="tpl-name" value="${esc(t.name)}" aria-label="Routine name">
        <div class="row" style="margin-top:10px">
          <button class="btn danger" data-s="del">Delete</button>
          <button class="btn primary" data-s="save">Rename</button>
        </div>`, act2 => {
        if (act2 === 'del') {
          if (!confirm(`Delete routine “${t.name}”?`)) return;
          S.templates = S.templates.filter(x => x !== t);
          S.tomb.t[t.id] = now();
        }
        if (act2 === 'save') { t.name = $('#tpl-name').value.trim() || t.name; touch(t); }
        save(); closeSheet(); render();
      });
      break;
    }

    case 'toggle-hist': S.openHist = S.openHist === b.dataset.id ? null : b.dataset.id; rerenderKeepScroll(); break;
    case 'repeat': {
      if (a && !confirm('A workout is already in progress. Replace it?')) return;
      const w = S.history.find(x => x.id === b.dataset.id);
      startWorkout(w.name, w.exercises.map(e => ({ exId: e.exId, sets: e.sets.length, plan: e.plan })), w.focus ? { focus: w.focus } : {});
      break;
    }
    case 'save-tpl': {
      const w = S.history.find(x => x.id === b.dataset.id);
      const name = prompt('Routine name', w.name);
      if (!name) return;
      S.templates.push({ id: uid(), name: name.trim(), u: now(), items: w.exercises.map(e => ({ exId: e.exId, name: e.name, sets: e.sets.length, ...(e.plan ? { plan: e.plan } : {}) })) });
      save(); toast('Routine saved — find it on the Train tab');
      break;
    }
    case 'del-hist':
      if (!confirm('Delete this workout from history?')) return;
      S.history = S.history.filter(x => x.id !== b.dataset.id);
      S.tomb.w[b.dataset.id] = now();
      save(); rerenderKeepScroll();
      break;

    case 'lib-open': openLibItem(b.dataset.id); break;
    case 'lib-new': openNewExercise(); break;

    case 'unit': S.settings.unit = b.dataset.v; touch(S.settings); save(); render(); break;
    case 'export': exportData(); break;
    case 'warm-done': a.warm = false; save(); rerenderKeepScroll(); break;
    case 'plan-focus': openPlanner({ focus: b.dataset.id }); break;
    case 'plan-session': openPlanner({ session: b.dataset.id }); break;
    case 'plan-surprise': openPlanner({ focus: surpriseFocus() }); break;
    case 'today-start': quickStart(todayFocus(), S.settings.minutes); break;
    case 'today-short': quickStart(todayFocus(), 20); break;
    case 'today-custom': openPlanner({ focus: todayFocus() }); break;
    case 'today-reroll': {
      const cur = todayFocus(), opts = Object.keys(LP.FOCUS).filter(k => k !== cur);
      S.today.focus = opts[Math.floor(Math.random() * opts.length)];
      save(); rerenderKeepScroll(); break;
    }
    case 'day': {
      const d = +b.dataset.v, days = S.settings.days;
      S.settings.days = days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort();
      touch(S.settings); save(); rerenderKeepScroll(); break;
    }
    case 'gear': {
      const g = b.dataset.v, gear = S.settings.gear;
      const nextGear = gear.includes(g) ? gear.filter(x => x !== g) : [...gear, g];
      if (!nextGear.length) return toast('Keep at least one');
      S.settings.gear = nextGear; touch(S.settings); save(); rerenderKeepScroll(); break;
    }
    case 'awake': S.settings.awake = !S.settings.awake; touch(S.settings); save(); rerenderKeepScroll(); break;
    case 'import': $('#import-file').click(); break;
    case 'wipe':
      if (!confirm('Erase ALL workouts, routines and exercises from this phone?')) return;
      if (!confirm('Really? This can’t be undone unless you have a backup file.')) return;
      S = fresh(); save(); render(); toast('All data erased');
      break;
  }
});

/* ---------- Backup ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lift-log-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importFile(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data?.v !== 1 || !Array.isArray(data.history) || !Array.isArray(data.exercises)) throw new Error('bad');
    if (!confirm(`Replace everything on this device with the backup (${data.history.length} workouts)?`)) return;
    S = upgrade(data);
    S.tab = 'more';
    save(); render(); toast('Backup restored');
  } catch (e) {
    toast('That file isn’t a Lift Log backup');
  }
}

/* ---------- Boot ---------- */
render();
if (S.active) { toast('Workout resumed'); syncWakeLock(); }

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
