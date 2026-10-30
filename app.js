'use strict';

/* ---------- Storage ---------- */
const KEY = 'liftlog.v1';
const CATS = ['Legs', 'Glutes', 'Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Other'];
const LP = window.LiftPlans;
const ALL_GEAR = Object.keys(LP.GEAR);
const SETTINGS = { unit: 'kg', rest: 90, minutes: 45, goal: 'tone', gear: ALL_GEAR, target: 3, days: [], awake: true, noEquip: [], superset: false, time: '18:00', cycle: true };

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
    prefs: {}, // exercise id → never | less | more | fav
    lvl: {}, // exercise id → true when the machine shows levels/pin numbers instead of kg
  };
}

/** Fill in fields added in later versions, and add any new built-in exercises. */
function upgrade(s) {
  s.settings = Object.assign({ ...SETTINGS }, s.settings);
  s.templates = s.templates || [];
  s.history = s.history || [];
  s.tomb = Object.assign({ w: {}, x: {}, t: {} }, s.tomb);
  s.prefs = s.prefs || {};
  s.lvl = s.lvl || {};
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
/** Some machines show levels / pin numbers rather than kg. */
const isLevel = id => !!S.lvl[id];
const wLabel = (w, lvl) => (lvl ? `L${fmtN(w)}` : fmtN(w) + unit());
const fmtSet = (s, exId, lvl = isLevel(exId)) => isTimed(exId)
  ? `${s.w ? wLabel(s.w, lvl) + ' · ' : ''}${s.r} s`
  : `${s.w ? wLabel(s.w, lvl) : 'BW'} × ${s.r}`;
const volumeOf = exercises => exercises.reduce((n, e) => n + (e.lvl ? 0 : e.sets.reduce((m, s) => m + s.w * s.r, 0)), 0);

/* ---------- Weight steps & progression ---------- */
const STEP = { kg: { dumbbell: 2, barbell: 2.5, machine: 5, cable: 2.5, bodyweight: 2.5 }, lb: { dumbbell: 5, barbell: 5, machine: 10, cable: 5, bodyweight: 5 } };
/** How much +/− moves the weight, and how much "go heavier" adds. */
function stepFor(exId) {
  if (isLevel(exId)) return 1;
  return (STEP[unit()] || STEP.kg)[meta(exId)?.g] || (unit() === 'lb' ? 5 : 2.5);
}
const roundTo = (v, st) => Math.round(v / st) * st;

/** Go up in weight today? Yes if last time felt easy, or every set hit the top of the rep range. */
function progression(exId, plan) {
  const last = lastEntry(exId);
  if (!last || !last.sets.length || isTimed(exId) || last.sets.every(x => !x.w)) return null;
  if (!!last.lvl !== isLevel(exId) || last.feel === 'hard' || last.feel === 'meh') return null;
  const p = plan || last.plan;
  const hitTop = p && !p.t && last.sets.every(x => x.r >= p.hi);
  if (last.feel !== 'easy' && !hitTop) return null;
  return { step: stepFor(exId), reps: p ? p.lo : null, why: last.feel === 'easy' ? 'Felt easy last time' : `You hit ${p.hi}+ on every set last time` };
}
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

/** The most recent logged entry for an exercise (sets + how it felt). */
function lastEntry(exId) {
  for (const w of S.history) { const e = w.exercises.find(x => x.exId === exId); if (e) return e; }
  return null;
}

const FEELS = [['easy', '😌', 'Too easy'], ['right', '💪', 'Just right'], ['hard', '😮‍💨', 'Too hard'], ['meh', '👎', 'Not for me']];
const feelLabel = v => FEELS.find(f => f[0] === v);
function feelPrompt(e) {
  if (e.feel) {
    const f = feelLabel(e.feel);
    return `<div class="feel done"><span>${f[1]} ${f[2]}</span><button class="link" data-a="feel-edit">change</button></div>`;
  }
  return `<div class="feel"><b>How was that?</b>
    <div class="feel-opts">${FEELS.map(([k, ico, l]) => `<button data-a="feel" data-v="${k}"><span>${ico}</span>${l}</button>`).join('')}</div></div>`;
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
  if (prev) {
    let w = prev.w, r = prev.r, up = false;
    const st = stepFor(entry.exId);
    if (w && S.active?.phase === 4) w = Math.max(st, roundTo(w * 0.8, st)); // easy week: ~80%
    else if (w) {
      const pr = progression(entry.exId, entry.plan);
      if (pr) { w += pr.step; if (pr.reps) r = pr.reps; up = true; }
    }
    return { w: w ? fmtN(w) : '', r: String(r), up };
  }
  for (let k = j - 1; k >= 0; k--) {
    const s = entry.sets[k];
    if (s.w !== '' || s.r !== '') return { w: s.w, r: s.r };
  }
  return { w: '', r: entry.plan ? String(entry.plan.hi) : '' };
}

/* ---------- Workout actions ---------- */
function newEntry(exId, setCount, plan, ss) {
  const n = setCount || plan?.sets || prevSets(exId).length || 3;
  const e = { id: uid(), exId, name: exName(exId), sets: Array.from({ length: n }, () => ({ w: '', r: '', done: false })) };
  if (plan) e.plan = plan;
  if (ss) e.ss = ss;
  return e;
}

/** items: [{ exId, sets, plan }] */
function startWorkout(name, items = [], extra = {}) {
  // 4-week cycle: (re)start it on the first workout, or after two weeks off.
  const since = daysSinceLast();
  if (!S.cycleStart || since === null || since >= 14) S.cycleStart = weekStart(Date.now());
  const phase = cycleWeek();
  if (phase === 4) items = items.map(i => (i.sets ? { ...i, sets: Math.max(2, i.sets - 1) } : i));
  S.active = {
    phase,
    id: uid(),
    name: name || defaultName(),
    start: Date.now(),
    restEnd: null, restTotal: 0,
    exercises: items.filter(i => exById(i.exId)).map(i => newEntry(i.exId, i.sets, i.plan, i.ss)),
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
      exId: e.exId, name: e.name, ...(e.plan ? { plan: e.plan } : {}), ...(e.feel ? { feel: e.feel } : {}), ...(isLevel(e.exId) ? { lvl: 1 } : {}),
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

  S.history.unshift({ id: a.id, name: a.name.trim() || defaultName(), start: a.start, end: now(), exercises, u: now(), ...(a.focus ? { focus: a.focus } : {}), ...(a.cooled ? { cool: 1 } : {}), ...(a.phase ? { phase: a.phase } : {}) });
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
  if (goTimer) { clearTimeout(goTimer); goTimer = null; $('#rest').classList.remove('go'); }
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
      ${backupDue() ? backupCard() : ''}
      <h2>Or pick a focus</h2>
      <div class="focus-grid">${focus}</div>
      <button class="btn block" data-a="plan-surprise" style="margin-top:8px">🎲 Surprise me</button>
      <details class="sessions" ${S.showSessions ? 'open' : ''}>
        <summary data-a="toggle-sessions"><h2>Ready-made sessions</h2><span class="muted small">${LP.SESSIONS.length} ▾</span></summary>
        ${sessions}
      </details>
      ${tpl ? `<h2>Your routines</h2>${tpl}` : ''}
      <button class="btn ghost block" data-a="start-empty" style="margin-top:14px">Start an empty workout</button>
      ${tpl ? '' : '<p class="muted small" style="text-align:center">Tip: after a workout, open it in History and tap “Save as routine” to keep it here.</p>'}`;
  }

  const u = esc(unit());
  const cards = a.exercises.map((e, i) => {
    const prev = prevSets(e.exId);
    const m = meta(e.exId);
    const bw = m?.g === 'bodyweight';
    const cur = e.sets.findIndex(x => !x.done);
    const rows = e.sets.map((s, j) => {
      const sug = suggestion(e, j);
      const p = prev[j];
      if (j === cur) {
        // The set to do next: bigger, with − / + buttons so there's no typing needed.
        return `
        <div class="set-row current" data-si="${j}">
          <span class="n">${j + 1}</span>
          <span class="prev">${p ? 'Last time: ' + esc(fmtSet(p, e.exId)) : 'Set ' + (j + 1)}</span>
          <div class="stepper"><button data-a="step" data-f="w" data-d="-1" aria-label="Less weight">−</button>
            <input data-f="w" inputmode="decimal" enterkeyhint="next" value="${esc(s.w)}" placeholder="${esc(sug.w || (bw ? 'BW' : ''))}" class="${sug.up ? 'sug-up' : ''}" aria-label="Set ${j + 1} ${isLevel(e.exId) ? 'level' : 'weight'}">
            <button data-a="step" data-f="w" data-d="1" aria-label="More weight">+</button></div>
          <div class="stepper"><button data-a="step" data-f="r" data-d="-1" aria-label="Fewer reps">−</button>
            <input data-f="r" inputmode="numeric" enterkeyhint="done" value="${esc(s.r)}" placeholder="${esc(sug.r)}" aria-label="Set ${j + 1} reps">
            <button data-a="step" data-f="r" data-d="1" aria-label="More reps">+</button></div>
          <span class="st-lbl">${isLevel(e.exId) ? 'Level' : bw ? '+' + u : u}</span><span class="st-lbl">${isTimed(e.exId) ? 'Secs' : 'Reps'}</span>
          <button class="tick" data-a="tick" aria-label="Mark set ${j + 1} done">${TICK}</button>
        </div>`;
      }
      return `
        <div class="set-row${s.done ? ' done' : ''}" data-si="${j}">
          <span class="n">${j + 1}</span>
          <span class="prev">${p ? esc(fmtSet(p, e.exId)) : '—'}</span>
          <input data-f="w" inputmode="decimal" enterkeyhint="next" value="${esc(s.w)}" placeholder="${esc(sug.w || (bw ? 'BW' : ''))}" class="${sug.up ? 'sug-up' : ''}" aria-label="Set ${j + 1} weight">
          <input data-f="r" inputmode="numeric" enterkeyhint="done" value="${esc(s.r)}" placeholder="${esc(sug.r)}" aria-label="Set ${j + 1} reps">
          <button class="tick" data-a="tick" aria-label="Mark set ${j + 1} done">${TICK}</button>
        </div>`;
    }).join('');
    return `
      <section class="card ${e.ss ? 'ss-card ss-' + e.ss[1] : ''} ${e.sets.length && e.sets.every(x => x.done) ? 'complete' : ''}" data-ei="${i}">
        ${e.ss ? `<div class="ss-badge">Superset ${e.ss[0]} · ${e.ss[1] === '1' ? 'do this, then the next one' : 'then rest'}</div>` : ''}
        <div class="ex-head">
          <h3>${esc(exName(e.exId, e.name))} ${prefBadge(e.exId) === '⭐' ? '⭐' : ''}</h3>
          ${m && !e.sets.some(x => x.done) ? '<button class="busy-btn" data-a="busy">Busy? Swap</button>' : ''}
          <button class="icon-btn" data-a="ex-menu" aria-label="Exercise options">⋯</button>
        </div>
        ${e.plan ? `<div class="rx"><b>${esc(rxLine(e.plan, e.sets.length))}</b> · ${esc(guidance(e.plan))}</div>` : ''}
        ${(h => (h ? `<div class="rx ${h.cls}">${esc(h.text)}</div>` : ''))(hint(e, prev))}
        ${m?.cue || m ? `<details class="cue"><summary>How to</summary>${m?.cue ? esc(m.cue) + ' ' : ''}${demoLink(e.exId)}</details>` : ''}
        <div class="set-row head"><span class="n">Set</span><span>Last time</span><span style="text-align:center">${isLevel(e.exId) ? 'Level' : u}</span><span style="text-align:center">${isTimed(e.exId) ? 'Secs' : 'Reps'}</span><span></span></div>
        ${rows}
        <button class="add-set" data-a="add-set">+ Add set</button>
        ${e.sets.length && e.sets.every(x => x.done) ? feelPrompt(e) : ''}
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
    ${a.exercises.some(e => e.sets.some(x => x.done)) ? (a.cooled
      ? '<div class="card cool done">🧘 Cool-down done — nice.</div>'
      : `<div class="card cool"><div class="grow"><b>🧘 Cool-down · 3 min</b><div class="muted small">Optional guided stretches for what you just trained. Helps you feel less stiff tomorrow.</div></div>
        <button class="btn" data-a="cooldown">Start</button></div>`) : ''}
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
    const vol = volumeOf(w.exercises);
    const open = S.openHist === w.id;
    const wk = weekLabel(w.start);
    const header = wk !== lastWeek ? `<div class="week">${esc(wk)} · ${plural(S.history.filter(h => weekLabel(h.start) === wk).length, 'workout')}</div>` : '';
    lastWeek = wk;
    const detail = open ? `
      <div class="hist-detail">
        ${w.feel || w.note ? `<div class="hist-note">${w.feel ? `<span>${SESSION_FEELS[w.feel - 1][1]} ${SESSION_FEELS[w.feel - 1][2]}</span>` : ''}${w.note ? `<span>“${esc(w.note)}”</span>` : ''}</div>` : ''}
        ${w.exercises.map(e => `<div class="hist-ex"><b>${esc(exName(e.exId, e.name))}${e.feel ? ` <span class="feel-tag">${feelLabel(e.feel)[1]} ${feelLabel(e.feel)[2]}</span>` : ''}</b><span>${e.sets.map(s => esc(fmtSet(s, e.exId, !!e.lvl))).join(' · ')}</span></div>`).join('')}
        ${w.cool || w.phase === 4 ? `<div class="muted small">${[w.phase === 4 ? '🌿 Easy week' : '', w.cool ? '🧘 Cooled down' : ''].filter(Boolean).join(' · ')}</div>` : ''}
        <div class="chips">
          <button class="chip" data-a="repeat" data-id="${w.id}">Repeat</button>
          <button class="chip" data-a="save-tpl" data-id="${w.id}">Save as routine</button>
          <button class="chip danger" data-a="del-hist" data-id="${w.id}">Delete</button>
        </div>
      </div>` : '';
    return `${header}
      <div class="card" >
        <button style="width:100%;text-align:left" data-a="toggle-hist" data-id="${w.id}">
          <div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(w.name)}${w.feel ? ' ' + SESSION_FEELS[w.feel - 1][1] : ''}</b><span class="chev">${open ? '▴' : '▾'}</span></div>
          <div class="hist-meta"><span>${fmtDate(w.start)}</span><span>${fmtDur(w.end - w.start)}</span><span>${sets} sets</span>${vol ? `<span>${Math.round(vol).toLocaleString()} ${esc(unit())} lifted</span>` : ''}</div>
        </button>
        ${detail}
      </div>`;
  }).join('');
  return `<h1>History</h1>${recapChips()}${items}`;
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
        <span class="grow">${esc(e.name)} ${prefBadge(e.id)}</span>
        <span class="badge">${[meta(e.id) ? LP.GEAR_ONE[meta(e.id).g] : '', counts[e.id] ? counts[e.id] + '×' : ''].filter(Boolean).join(' · ')}</span>
        <span class="chev">›</span>
      </button>`).join('');
  }).join('');
  return `
    <h1>Exercises</h1>
    <p class="muted small" style="margin-top:-8px">Tap one for tips, a demo, your progress, and how often it should come up (⭐ favourite · 🚫 never).</p>
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
      <div class="setting">
        <div>4-week plan<div class="muted small">Weeks 1–3 build up, week 4 is a lighter “easy week” so you recover and keep improving.</div></div>
        <button class="switch ${s.cycle ? 'on' : ''}" data-a="cycle" role="switch" aria-checked="${s.cycle}" aria-label="4-week plan"><i></i></button>
      </div>
      ${s.days.length ? reminderSetting() : ''}
    </div>

    <h2>Equipment at your gym</h2>
    <div class="card equip">
      <p class="muted small" style="margin-top:0">Untick anything your gym doesn’t have — sessions will only use what’s there. (${equipCount()})</p>
      ${LP.EQUIP.map((g, gi) => {
        const on = g.items.filter(([id]) => !s.noEquip.includes(id)).length;
        return `<details ${gi === 0 ? 'open' : ''}><summary><b>${esc(g.group)}</b><span class="muted small">${on} of ${g.items.length}</span></summary>
          <div class="equip-list">${g.items.map(([id, label]) => `
            <label class="check"><input type="checkbox" data-equip="${id}" ${s.noEquip.includes(id) ? '' : 'checked'}> ${esc(label)}</label>`).join('')}</div>
          <div class="row" style="margin-top:6px"><button class="btn small-btn" data-a="equip-all" data-v="${gi}">All</button><button class="btn small-btn" data-a="equip-none" data-v="${gi}">None</button></div>
        </details>`;
      }).join('')}
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
      <p class="muted small" style="margin-top:0">${plural(S.history.length, 'workout')}, stored on this phone only (${(bytes / 1024).toFixed(1)} KB). A new phone or clearing Chrome’s data would lose them, so keep a backup in Google Drive or send it to yourself.</p>
      <p class="small" style="margin:0 0 10px"><b>Last backup:</b> ${S.lastBackup ? esc(fmtDate(S.lastBackup)) : 'never'}</p>
      <div class="row">
        <button class="btn primary" data-a="export">Back up now</button>
        <button class="btn" data-a="import">Restore</button>
      </div>
      <input type="file" id="import-file" accept="application/json,text/plain,.json,.txt" hidden>
      <p class="muted small" id="persist-status"></p>
    </div>

    <h2>Install</h2>
    <div class="card muted small">
      <p style="margin-top:0"><b style="color:var(--text)">Android:</b> Chrome menu ⋮ → <i>Install app</i> / <i>Add to Home screen</i>.</p>
      <p style="margin-bottom:0"><b style="color:var(--text)">iPhone:</b> open in Safari → Share → <i>Add to Home Screen</i>.</p>
      <p style="margin-bottom:0" id="offline-status"></p>
    </div>

    <button class="btn block" data-a="help" style="margin-top:24px">How to use Lift Log</button>
    <button class="btn danger block" data-a="wipe" style="margin-top:10px">Erase data on this phone</button>`;
}

const VIEWS = { train: viewTrain, history: viewHistory, library: viewLibrary, more: viewMore };

function render() {
  if (!VIEWS[S.tab]) S.tab = 'train';
  LP.setCustom(S.exercises);
  const y = window.scrollY;
  $('#view').innerHTML = (updateReady ? updateBanner() : '') + VIEWS[S.tab]();
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
/** The next set to do: respects superset order (A1 set n, then A2 set n). */
function nextUp() {
  const a = S.active;
  if (!a) return null;
  for (let i = 0; i < a.exercises.length; i++) {
    const e = a.exercises[i], j = e.sets.findIndex(s => !s.done);
    if (j < 0) continue;
    const partner = e.ss && a.exercises.find(x => x !== e && x.ss && x.ss[0] === e.ss[0]);
    if (partner && e.ss[1] === '2') {
      const pj = partner.sets.findIndex(s => !s.done);
      if (pj >= 0 && pj <= j) return { e: partner, j: pj };
    }
    return { e, j };
  }
  return null;
}
function nextText() {
  const n = nextUp();
  if (!n) return 'Last set done — finish when ready';
  const sug = suggestion(n.e, n.j);
  const w = n.e.sets[n.j].w || sug.w, r = n.e.sets[n.j].r || sug.r;
  const target = [w ? (isLevel(n.e.exId) ? `level ${w}` : `${w}${unit()}`) : '', r ? `× ${r}${isTimed(n.e.exId) ? ' s' : ''}` : ''].filter(Boolean).join(' ');
  return `Next: ${exName(n.e.exId, n.e.name)} · set ${n.j + 1}${target ? ' · ' + target : ''}`;
}

let goTimer = null;
function updateTimers() {
  const a = S.active;
  const el = $('#elapsed');
  if (el && a) el.textContent = fmtClock((Date.now() - a.start) / 1000);

  const bar = $('#rest');
  const showBar = on => { bar.hidden = !on; document.body.classList.toggle('resting', on); };
  if (goTimer) return; // "Go!" flash is showing
  if (!a || !a.restEnd) { showBar(false); return; }
  const left = (a.restEnd - Date.now()) / 1000;
  if (left <= 0) {
    // Rest over: flash "Go!" for a few seconds, buzz, then hide.
    const fresh = left > -10;
    a.restEnd = null; save();
    if (!fresh) { showBar(false); return; }
    beep();
    bar.classList.add('go');
    $('#rest-label').textContent = 'Rest over';
    $('#rest-time').textContent = 'Go!';
    $('#rest-next').textContent = nextText().replace(/^Next: /, '');
    $('.rest-fill', bar).style.width = '100%';
    goTimer = setTimeout(() => { goTimer = null; bar.classList.remove('go'); showBar(false); }, 4000);
    return;
  }
  bar.classList.remove('go');
  showBar(true);
  $('#rest-label').textContent = 'Rest';
  $('#rest-time').textContent = fmtClock(left);
  $('#rest-next').textContent = nextText();
  $('.rest-fill', bar).style.width = `${Math.min(100, Math.max(0, 100 - (left / a.restTotal) * 100))}%`;
  bar.classList.toggle('soon', left <= 5);
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
  if (!b) return;
  if (b.dataset.s === 'pref') { setPref(b.dataset.id, b.dataset.v); plannerPrefChanged(b.dataset.id, b.dataset.v); return; }
  if (sheetHandler) sheetHandler(b.dataset.s, b);
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
      const fa = pref(a.id) === 'fav', fb = pref(b.id) === 'fav';
      if (fa !== fb) return fa ? -1 : 1;
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
        ${esc(e.name)} ${prefBadge(e.id)} <span class="muted small" style="font-weight:400">· ${e.cat}${used.has(e.id) ? ' · in workout' : ''}</span>
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

/* ---------- Exercise preferences, demos and progress ---------- */
const PREFS = [['never', '🚫 Never'], ['less', 'Less'], ['normal', 'Normal'], ['more', 'More'], ['fav', '⭐ Fav']];
const PREF_NOTE = {
  never: 'Won’t be suggested in sessions. You can still add it yourself.',
  less: 'Suggested less often.', normal: 'Suggested as usual.', more: 'Suggested more often.',
  fav: 'Suggested much more often, and shown first when you add an exercise.',
};
const BIAS = { less: 0.7, more: -0.35, fav: -0.7 };
const pref = id => S.prefs[id] || 'normal';
function prefControl(id) {
  return `<div class="pref-wrap" data-id="${id}">
    <div class="lbl">How often should this come up?</div>
    <div class="seg full pref">${PREFS.map(([k, l]) => `<button data-s="pref" data-id="${id}" data-v="${k}" class="${pref(id) === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="muted small" style="margin-top:6px">${PREF_NOTE[pref(id)]}</div>
  </div>`;
}
function setPref(id, v) {
  if (v === 'normal') delete S.prefs[id]; else S.prefs[id] = v;
  save();
  document.querySelectorAll(`.pref-wrap[data-id="${id}"]`).forEach(w => { w.outerHTML = prefControl(id); });
}
const prefBadge = id => ({ fav: '⭐', never: '🚫', more: '↑', less: '↓' })[pref(id)] || '';

const demoUrl = name => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(name.replace(/\s*\(secs\)/i, '') + ' exercise how to');
const demoLink = id => `<a class="demo" href="${demoUrl(exName(id, meta(id)?.name))}" target="_blank" rel="noopener">▶ Watch a demo</a>`;

/** Planner context: what's allowed and how to weight it. */
function planCtx(gear = S.settings.gear) {
  const miss = S.settings.noEquip;
  const never = Object.keys(S.prefs).filter(k => S.prefs[k] === 'never');
  const equipOk = c => LP.hasEquip(c, miss);
  return {
    ok: c => gear.includes(c.g) && equipOk(c), equipOk,
    recent: recentIds(), exclude: new Set([...hiddenIds(), ...never]),
    bias: c => BIAS[S.prefs[c.id]] || 0,
  };
}

/** One point per session: best weight (or reps for bodyweight, or seconds for holds). */
function progressSeries(id) {
  const timed = isTimed(id), lvl = isLevel(id);
  const mine = e => e.exId === id && !!e.lvl === lvl;
  const sessions = S.history.filter(w => w.exercises.some(mine)).slice().reverse();
  const allBw = sessions.every(w => w.exercises.filter(mine).every(e => e.sets.every(s => !s.w)));
  const kind = timed ? 'hold' : allBw ? 'reps' : lvl ? 'level' : 'weight';
  const pts = sessions.map(w => {
    const sets = w.exercises.filter(mine).flatMap(e => e.sets);
    const byW = kind === 'weight' || kind === 'level';
    const v = byW ? Math.max(...sets.map(s => s.w)) : Math.max(...sets.map(s => s.r));
    const best = byW ? sets.filter(s => s.w === v).reduce((m, s) => Math.max(m, s.r), 0) : null;
    return { t: w.start, v, reps: best };
  }).slice(-24);
  return { kind, pts };
}

function progressChart(id) {
  const { kind, pts } = progressSeries(id);
  if (pts.length < 2) return pts.length ? '<p class="muted small">Your progress chart appears after two sessions.</p>' : '';
  const title = { weight: `Best weight per session (${unit()})`, level: 'Highest level per session', reps: 'Most reps per session', hold: 'Longest hold per session (s)' }[kind];
  const W = 320, H = 150, L = 34, R = 14, T = 16, B = 22;
  const vals = pts.map(p => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  // Round the axis to friendly numbers (e.g. 50 / 60 / 70).
  const raw = (hi - lo) / 2, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= raw);
  lo = Math.max(0, Math.floor(lo / step) * step); hi = Math.ceil(hi / step) * step;
  if (hi - lo < 2 * step) hi = lo + 2 * step;
  const x = i => L + (i * (W - L - R)) / (pts.length - 1);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo, lo + step, hi];
  const iMax = vals.lastIndexOf(Math.max(...vals)), iLast = pts.length - 1;
  const fmtV = v => (kind === 'weight' ? fmtN(Math.round(v * 10) / 10) : Math.round(v));
  const label = (i, txt) => {
    const anchor = i === 0 ? 'start' : i === iLast ? 'end' : 'middle';
    return `<text class="ch-label" x="${x(i)}" y="${y(pts[i].v) - 10}" text-anchor="${anchor}">${txt}</text>`;
  };
  return `
    <div class="chart" data-id="${id}">
      <div class="ch-title">${esc(title)}</div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}: from ${fmtV(vals[0])} to ${fmtV(vals[iLast])} over ${pts.length} sessions">
        ${ticks.map(t => `<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ch-axis" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${fmtV(t)}</text>`).join('')}
        <text class="ch-axis" x="${L}" y="${H - 4}">${esc(fmtShort(pts[0].t))}</text>
        <text class="ch-axis" x="${W - R}" y="${H - 4}" text-anchor="end">${esc(fmtShort(pts[iLast].t))}</text>
        <polyline class="ch-line" points="${pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')}"/>
        ${pts.map((p, i) => `<circle class="ch-dot" cx="${x(i)}" cy="${y(p.v)}" r="4"/>`).join('')}
        ${label(iLast, fmtV(vals[iLast]))}${iMax !== iLast ? label(iMax, 'best ' + fmtV(vals[iMax])) : ''}
        <line class="ch-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
        <rect class="ch-hit" x="${L - 10}" y="0" width="${W - L - R + 20}" height="${H}" fill="transparent"/>
      </svg>
      <div class="ch-tip" hidden></div>
    </div>`;
}
const fmtShort = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Tap / drag across the chart to read each session. */
function wireChart(root) {
  const box = root.querySelector('.chart');
  if (!box) return;
  const { kind, pts } = progressSeries(box.dataset.id);
  const svg = box.querySelector('svg'), tip = box.querySelector('.ch-tip'), cross = box.querySelector('.ch-cross');
  const dots = [...box.querySelectorAll('.ch-dot')];
  const show = ev => {
    const r = svg.getBoundingClientRect();
    const vx = ((ev.clientX - r.left) / r.width) * 320;
    let best = 0;
    dots.forEach((d, i) => { if (Math.abs(+d.getAttribute('cx') - vx) < Math.abs(+dots[best].getAttribute('cx') - vx)) best = i; });
    const p = pts[best], cx = +dots[best].getAttribute('cx');
    dots.forEach((d, i) => d.classList.toggle('on', i === best));
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(fmtDate(p.t))}</b> ${kind === 'weight' ? `${fmtN(p.v)}${esc(unit())} × ${p.reps}` : kind === 'level' ? `Level ${fmtN(p.v)} × ${p.reps}` : kind === 'hold' ? `${p.v} s` : `${p.v} reps`}`;
    const left = (cx / 320) * r.width;
    tip.style.left = Math.min(Math.max(left, 70), r.width - 70) + 'px';
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dots.forEach(d => d.classList.remove('on')); };
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointermove', ev => { if (ev.pointerType === 'mouse' || ev.buttons) show(ev); });
  svg.addEventListener('pointerleave', hide);
}

function exerciseFields(ex, prefix) {
  return `
    <div class="row" style="margin-top:10px">
      <label class="field">Equipment
        <select id="${prefix}-g"><option value="">—</option>${Object.entries(LP.GEAR_ONE).map(([k, l]) => `<option value="${k}" ${ex.g === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">Works
        <select id="${prefix}-p"><option value="">Not used in plans</option>${Object.entries(LP.PATTERNS).map(([k, l]) => `<option value="${k}" ${ex.p === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <label class="check"><input type="checkbox" id="${prefix}-t" ${ex.t ? 'checked' : ''}> Timed hold (log seconds, not reps)</label>
    <p class="muted small" style="margin:4px 0 0">Set both equipment and what it works, and the session builder can pick it.</p>`;
}
function readFields(ex, prefix) {
  ex.g = $(`#${prefix}-g`).value || undefined;
  ex.p = $(`#${prefix}-p`).value || undefined;
  ex.t = $(`#${prefix}-t`).checked || undefined;
}

function swapEntry(e, id) {
  e.exId = id; e.name = exName(id);
  if (e.plan) {
    const fresh = LP.prescription(id, e.plan.g);
    e.plan = { ...fresh, sets: e.sets.length, rest: e.ss ? e.plan.rest : fresh.rest };
  }
}
function toggleLevel(id) {
  if (S.lvl[id]) delete S.lvl[id]; else S.lvl[id] = true;
  toast(S.lvl[id] ? 'Now logging levels (e.g. pin 7) for this exercise' : `Now logging ${unit()} for this exercise`);
}

function openExMenu(i) {
  const a = S.active, e = a.exercises[i];
  openSheet(`
    <h2>${esc(exName(e.exId, e.name))}</h2>
    <button class="sheet-action" data-s="up" ${i === 0 ? 'disabled' : ''}>Move up</button>
    <button class="sheet-action" data-s="down" ${i === a.exercises.length - 1 ? 'disabled' : ''}>Move down</button>
    ${meta(e.exId) ? '<button class="sheet-action" data-s="similar">Swap for something similar 🔀</button>' : ''}
    <button class="sheet-action" data-s="swap">Swap for another exercise</button>
    <button class="sheet-action" data-s="progress">Progress &amp; history 📈</button>
    <button class="sheet-action" data-s="lvl">${isLevel(e.exId) ? `Weigh in ${esc(unit())} again` : 'This machine shows levels, not kg'}</button>
    <button class="sheet-action" data-s="rm-set" ${e.sets.length ? '' : 'disabled'}>Remove last set</button>
    <button class="sheet-action danger" data-s="rm">Remove exercise</button>
    ${prefControl(e.exId)}`, act => {
    const list = a.exercises;
    if (act === 'progress') return openLibItem(e.exId);
    if (act === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    if (act === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    if (act === 'rm-set') e.sets.pop();
    if (act === 'similar') {
      const id = LP.swapFor(e.exId, planCtx(), new Set(list.map(x => x.exId)));
      if (!id) { closeSheet(); toast('No similar exercise for your equipment'); return; }
      swapEntry(e, id);
      toast(`Swapped to ${e.name}`);
    }
    if (act === 'lvl') { toggleLevel(e.exId); }
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
    if (!['up', 'down', 'rm-set', 'similar', 'rm', 'lvl'].includes(act)) return;
    save(); closeSheet(); rerenderKeepScroll();
  });
}

function openLibItem(id) {
  const ex = exById(id);
  if (!ex) return;
  const sessions = [];
  S.history.forEach(w => w.exercises.forEach(e => { if (e.exId === id) sessions.push({ when: w.start, sets: e.sets, lvl: !!e.lvl }); }));
  const lvl = isLevel(id);
  const all = sessions.filter(x => x.lvl === lvl).flatMap(x => x.sets);
  const heaviest = all.reduce((m, s) => Math.max(m, s.w), 0);
  const best = all.reduce((m, s) => Math.max(m, e1rm(s)), 0);
  const mostReps = all.reduce((m, s) => Math.max(m, s.r), 0);
  const stats = sessions.length ? `
    <div class="stat-grid">
      <div class="stat"><b>${heaviest ? esc(wLabel(heaviest, lvl)) : '—'}</b><span>${lvl ? 'Highest level' : 'Heaviest set'}</span></div>
      <div class="stat"><b>${best && !lvl ? fmtN(Math.round(best * 10) / 10) + esc(unit()) : '—'}</b><span>Est. 1-rep max</span></div>
      <div class="stat"><b>${mostReps}</b><span>${isTimed(id) ? 'Longest hold (s)' : 'Most reps'}</span></div>
      <div class="stat"><b>${sessions.length}</b><span>Sessions</span></div>
    </div>
    ${progressChart(id)}
    <details class="hist-list"><summary>All sessions</summary>
      ${sessions.slice(0, 30).map(s => `<div class="hist-ex"><b>${fmtDate(s.when)}</b><span>${s.sets.map(x => esc(fmtSet(x, id, s.lvl))).join(' · ')}</span></div>`).join('')}
    </details>` : '<p class="muted">Not logged yet.</p>';
  const m = meta(id), builtIn = !!m && !m.custom;
  openSheet(`
    <h2>${esc(ex.name)}</h2>
    ${m ? `<p class="muted small" style="margin-top:-6px">${esc(LP.GEAR_ONE[m.g])}${m.cue ? ' · ' + esc(m.cue) : ''}</p>` : ''}
    ${demoLink(id)}
    ${stats}
    ${prefControl(id)}
    ${m && m.g !== 'bodyweight' ? `<div class="setting" style="border:0;padding:12px 0 0">
      <div>Machine shows levels<div class="muted small">Log the level or pin number (e.g. 7) instead of ${esc(unit())}.</div></div>
      <button class="switch ${lvl ? 'on' : ''}" data-s="lvl" role="switch" aria-checked="${lvl}" aria-label="Machine shows levels"><i></i></button></div>` : ''}
    <details class="edit-ex"><summary>Edit or delete</summary>
    <div class="row" style="margin-top:8px"><input id="ed-name" value="${esc(ex.name)}" aria-label="Name">${catSelect('ed-cat', ex.cat)}</div>
    ${builtIn ? '' : exerciseFields(ex, 'ed')}
    <div class="row" style="margin-top:10px">
      <button class="btn danger" data-s="del">Delete</button>
      <button class="btn primary" data-s="save">Save</button>
    </div></details>`, act => {
    if (act === 'save') {
      const n = $('#ed-name').value.trim();
      if (n) ex.name = n;
      ex.cat = $('#ed-cat').value;
      if (!builtIn) readFields(ex, 'ed');
      touch(ex);
    } else if (act === 'lvl') {
      toggleLevel(id); save(); return openLibItem(id);
    } else if (act === 'del') {
      if (!confirm(`Delete “${ex.name}”? Past workouts keep their records.`)) return;
      S.exercises = S.exercises.filter(e => e.id !== id);
      S.tomb.x[id] = now();
    } else return;
    save(); closeSheet(); render();
  });
  wireChart($('#sheet-body'));
}

function openNewExercise() {
  openSheet(`
    <h2>New exercise</h2>
    <div class="row"><input id="nx-name" placeholder="Name, e.g. Kettlebell Swing">${catSelect('nx-cat')}</div>
    ${exerciseFields({}, 'nx')}
    <button class="btn primary block" data-s="add" style="margin-top:12px">Add exercise</button>`, act => {
    const name = $('#nx-name').value.trim();
    if (act !== 'add' || !name) return;
    if (S.exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) return toast('That exercise already exists');
    const ex = { id: uid(), name, cat: $('#nx-cat').value, u: now() };
    readFields(ex, 'nx');
    S.exercises.push(ex);
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
  const pool = LP.buildPool(focus, planCtx());
  const { items } = LP.fit(pool, minutes, S.settings.goal, { superset: S.settings.superset });
  if (!items.length) return toast('No exercises match your equipment — check Settings');
  startWorkout(`${LP.FOCUS[focus].label} day`, items.map(it => ({ exId: it.exId, sets: it.sets, plan: it.plan, ss: it.ss })), { focus, warm: true });
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
  else if (S.history[0]?.feel && S.history[0].feel <= 2 && since < 4) msg = 'Last session felt rough. Go easier today — the quick 20 minutes still counts.';
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
      ${phaseLine()}
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
    const before = S.history.filter(h => h.id !== w.id).flatMap(h => h.exercises.filter(x => x.exId === e.exId && !!x.lvl === !!e.lvl).flatMap(x => x.sets));
    if (!before.length) continue;
    const timed = isTimed(e.exId);
    const bestNow = e.sets.reduce((m, s) => (timed ? s.r : s.w) > (timed ? m.r : m.w) || ((timed ? s.r : s.w) === (timed ? m.r : m.w) && s.r > m.r) ? s : m, e.sets[0]);
    const prevMax = before.reduce((m, s) => Math.max(m, timed ? s.r : s.w), 0);
    if (timed) { if (bestNow.r > prevMax) prs.push(`${exName(e.exId, e.name)}: longest hold, ${bestNow.r} s`); continue; }
    if (bestNow.w > prevMax && bestNow.w > 0) prs.push(`${exName(e.exId, e.name)}: heaviest yet, ${wLabel(bestNow.w, e.lvl)}`);
    else if (bestNow.w === prevMax) {
      const prevReps = before.filter(s => s.w === prevMax).reduce((m, s) => Math.max(m, s.r), 0);
      if (bestNow.r > prevReps) prs.push(`${exName(e.exId, e.name)}: most reps at ${bestNow.w ? wLabel(bestNow.w, e.lvl) : 'bodyweight'} (${bestNow.r})`);
    }
  }
  return prs;
}

function celebrate(w) {
  const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
  const vol = volumeOf(w.exercises);
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
      <div class="lbl" style="text-align:left">How was the session overall?</div>
      <div class="rate">${SESSION_FEELS.map(([v, ico, l]) => `<button data-s="rate" data-v="${v}" class="${w.feel === v ? 'on' : ''}"><span>${ico}</span>${l}</button>`).join('')}</div>
      <textarea id="cel-note" rows="2" placeholder="Any notes? e.g. knee felt sore, gym was busy, loved the hip thrusts">${esc(w.note || '')}</textarea>
      <button class="btn primary block" data-s="ok" style="margin-top:10px">Save</button>
    </div>`, (act, b) => {
    if (act === 'rate') {
      w.feel = +b.dataset.v; touch(w); save();
      document.querySelectorAll('.rate button').forEach(x => x.classList.toggle('on', x === b));
      return;
    }
    if (act === 'ok') {
      const note = $('#cel-note').value.trim();
      if (note) w.note = note; else delete w.note;
      touch(w); save(); closeSheet(); rerenderKeepScroll();
    }
  });
}
const SESSION_FEELS = [[1, '😫', 'Rough'], [2, '😕', 'Meh'], [3, '🙂', 'OK'], [4, '😊', 'Good'], [5, '🤩', 'Great']];

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
/** One line under the exercise: what to aim for today, based on last time. */
function hint(e, prev) {
  const lastFeel = lastEntry(e.exId)?.feel;
  const hasWeights = prev.some(x => x.w);
  if (S.active?.phase === 4 && hasWeights) return { cls: 'easy', text: '🌿 Easy week — the grey weights are about 80% of usual. Keep it comfortable.' };
  const pr = progression(e.exId, e.plan);
  if (pr && hasWeights) {
    const target = wLabel(prev[0].w + pr.step, isLevel(e.exId));
    return { cls: 'up', text: `↑ ${pr.why} — try ${target}${pr.reps ? ` for ${pr.reps}+ reps` : ''}. It’s filled in for you.` };
  }
  if (lastFeel === 'easy') return { cls: 'up', text: '↑ Felt easy last time — slow each rep down or add a pause at the top.' };
  if (lastFeel === 'hard') return { cls: 'hold', text: '→ Felt tough last time — same weight today, aim for clean reps.' };
  const p = e.plan;
  if (p && !p.t && prev.length && prev.every(x => x.r >= p.hi)) return { cls: 'up', text: `↑ You hit ${p.hi}+ on every set last time — add a pause or hold a dumbbell.` };
  return null;
}

/* ---------- 4-week plan ---------- */
const PHASES = [null,
  { name: 'Build', blurb: 'Find your weights — finish each set with 2–3 reps still in the tank.' },
  { name: 'Build', blurb: 'Same again — try to beat last week by a rep or a little weight.' },
  { name: 'Push', blurb: 'Your strongest week — go for your best numbers.' },
  { name: 'Easy week', blurb: 'Lighter weights and one set fewer, so your body recovers. You’ll come back stronger.' },
];
/** 1–4, or 0 when the plan is switched off. Weeks 1–3 build, week 4 is lighter. */
function cycleWeek() {
  if (!S.settings.cycle) return 0;
  if (!S.cycleStart || (daysSinceLast() ?? 99) >= 14) return 1; // fresh start after a break
  const weeks = Math.round((weekStart(Date.now()) - weekStart(S.cycleStart)) / (7 * DAY));
  return (((weeks % 4) + 4) % 4) + 1;
}

let PL = null; // planner state while the sheet is open
const optSummary = () => [LP.GOALS[PL.goal].label, PL.superset ? 'supersets' : '', PL.gear.length < ALL_GEAR.length ? 'some equipment' : ''].filter(Boolean).join(' · ');

function openPlanner({ focus, session }) {
  const st = S.settings;
  const sess = session && LP.SESSIONS.find(x => x.id === session);
  PL = {
    focus: sess ? sess.focus : focus,
    session: sess?.id || null,
    name: sess ? sess.name : `${LP.FOCUS[focus].label} day`,
    minutes: st.minutes || 45,
    custom: !DURATIONS.includes(st.minutes),
    goal: LP.GOALS[st.goal] ? st.goal : 'tone',
    gear: sess ? sess.gear : [...st.gear],
    superset: !!st.superset,
    open: null,
    msg: '',
  };
  PL.pool = sess ? LP.sessionPool(sess, planCtx(sess.gear)) : LP.buildPool(focus, planCtx(PL.gear));
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
    <details class="more-opts" ${PL.moreOpen ? 'open' : ''}>
    <summary data-s="more-opts">More options <span class="muted small">${esc(optSummary())}</span></summary>
    <div class="lbl">Goal</div>
    <div class="seg full">${Object.entries(LP.GOALS).map(([k, g]) => `<button data-s="goal" data-v="${k}" class="${PL.goal === k ? 'on' : ''}">${g.label}</button>`).join('')}</div>
    <div class="muted small" style="margin-top:6px">${esc(LP.GOALS[PL.goal].blurb)}</div>
    <div class="setting" style="border:0;padding:14px 0 0">
      <div>Supersets<div class="muted small">Do exercises in pairs, back to back, and rest after both. More done in less time.</div></div>
      <button class="switch ${PL.superset ? 'on' : ''}" data-s="superset" role="switch" aria-checked="${PL.superset}" aria-label="Supersets"><i></i></button>
    </div>
    ${PL.session ? '' : `<div class="lbl">Use today</div>
      <div class="chips" style="margin-top:0">${ALL_GEAR.map(g => `<button class="chip toggle ${PL.gear.includes(g) ? 'on' : ''}" data-s="gear" data-v="${g}">${LP.GEAR[g]}</button>`).join('')}</div>`}
    </details>
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
  const { items, seconds } = LP.fit(PL.pool, PL.minutes, PL.goal, { superset: PL.superset });
  PL.items = items;
  const el = $('#pl-list');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<div class="empty">No exercises match — turn on more equipment above, or check “Equipment at your gym” in Settings.</div>`;
    return;
  }
  const mins = Math.round(seconds / 60);
  el.innerHTML = `
    <div class="lbl pl-sum"><span>Your session</span><span>≈ ${mins} min · ${plural(items.length, 'exercise')}</span></div>
    <div class="muted small">Includes a ${PL.minutes <= 20 ? 3 : 5}-minute warm-up. Don’t fancy one? 🔀 swaps it.</div>
    ${cycleWeek() === 4 ? '<div class="rx easy" style="margin-top:6px">🌿 Easy week: you’ll do one set fewer of each, at lighter weights — so it’ll be a bit shorter.</div>' : ''}
    ${items.map((it, i) => {
      const m = LP.META[it.exId], open = PL.open === it.exId;
      return `
      <div class="pl-item ${it.ss ? 'ss ss-' + it.ss[1] : ''}">
        <span class="pl-n">${it.ss || i + 1}</span>
        <button class="grow pl-name" data-s="open" data-id="${it.exId}">
          <b>${esc(exName(it.exId, m?.name))} ${prefBadge(it.exId)}</b>
          <span class="muted small">${esc(rxLine(it.plan))}${m ? ' · ' + esc(LP.GEAR_ONE[m.g]) : ''}</span>
        </button>
        <button class="icon-btn" data-s="swap" data-i="${i}" aria-label="Swap for a similar exercise">🔀</button>
        <button class="icon-btn" data-s="drop" data-i="${i}" aria-label="Remove">✕</button>
      </div>
      ${open ? `<div class="pl-more">${m?.cue ? `<p class="small" style="margin:0 0 6px">${esc(m.cue)}</p>` : ''}${demoLink(it.exId)}${prefControl(it.exId)}</div>` : ''}`;
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
  switch (act) {
    case 'dur': PL.minutes = +b.dataset.v; PL.custom = false; st.minutes = PL.minutes; break;
    case 'dur-custom': PL.custom = true; break;
    case 'more-opts': PL.moreOpen = !PL.moreOpen; return; // <details> toggles itself
    case 'goal': PL.goal = b.dataset.v; st.goal = PL.goal; break;
    case 'superset': PL.superset = !PL.superset; st.superset = PL.superset; break;
    case 'gear': {
      const g = b.dataset.v;
      PL.gear = PL.gear.includes(g) ? PL.gear.filter(x => x !== g) : [...PL.gear, g];
      st.gear = [...PL.gear];
      PL.pool = LP.buildPool(PL.focus, planCtx(PL.gear));
      break;
    }
    case 'reroll':
      if (PL.session) {
        // Remix a ready-made session like-for-like, keeping its equipment.
        const ctx = planCtx(PL.gear), used = new Set();
        PL.pool = PL.pool.map(id => { const n = LP.swapFor(id, ctx, new Set([...used, id])) || id; used.add(n); return n; });
        if (!PL.name.endsWith('(remix)')) PL.name += ' (remix)';
      } else {
        PL.pool = LP.buildPool(PL.focus, planCtx(PL.gear));
      }
      break;
    case 'open': PL.open = PL.open === b.dataset.id ? null : b.dataset.id; return drawPlanList();
    case 'swap': {
      const cur = PL.items[+b.dataset.i].exId;
      const id = LP.swapFor(cur, planCtx(PL.gear), new Set(PL.pool));
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
      const items = PL.items.map(it => ({ exId: it.exId, sets: it.sets, plan: it.plan, ss: it.ss }));
      closeSheet();
      startWorkout(PL.name, items, { focus: PL.focus, warm: true });
      window.scrollTo(0, 0);
      return;
    }
    default: return;
  }
  touch(st); save(); drawPlanner();
}

/** Called after an exercise's "how often" changes while the planner is open. */
function plannerPrefChanged(id, v) {
  if (!PL || !$('#pl-list')) return;
  if (v === 'never' && PL.pool.includes(id)) {
    const n = LP.swapFor(id, planCtx(PL.gear), new Set(PL.pool));
    PL.pool = n ? PL.pool.map(x => (x === id ? n : x)) : PL.pool.filter(x => x !== id);
    PL.open = null;
    PL.msg = `${exName(id)} won’t be suggested again${n ? ` — swapped for ${exName(n)}` : ''}.`;
  }
  drawPlanList();
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
  if (!b) return;
  if (goTimer) { clearTimeout(goTimer); goTimer = null; $('#rest').classList.remove('go'); updateTimers(); return; }
  if (!a?.restEnd) return;
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
  e.target.classList.remove('sug-up');
  save();
});

view.addEventListener('change', e => {
  if (e.target.id === 'rest-sel') { S.settings.rest = Number(e.target.value); touch(S.settings); save(); }
  if (e.target.dataset.equip) {
    const id = e.target.dataset.equip, miss = S.settings.noEquip;
    S.settings.noEquip = e.target.checked ? miss.filter(x => x !== id) : [...miss, id];
    touch(S.settings); save(); rerenderKeepScroll();
  }
  if (e.target.id === 'remind-time') { S.settings.time = e.target.value || '18:00'; touch(S.settings); save(); rerenderKeepScroll(); }
  if (e.target.id === 'target-sel') { S.settings.target = Number(e.target.value); touch(S.settings); save(); }
  if (e.target.id === 'minutes-sel') { S.settings.minutes = Number(e.target.value); touch(S.settings); save(); }
  if (e.target.id === 'goal-sel') { S.settings.goal = e.target.value; touch(S.settings); save(); }
  if (e.target.id === 'import-file') importFile(e.target.files[0]);
});

// Enter on the weight field jumps to reps; Enter on reps ticks the set.
view.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const f = e.target.dataset.f;
  const row = e.target.closest('.set-row');
  if (f === 'w') { e.preventDefault(); row?.querySelector('input[data-f="r"]')?.focus(); }
  if (f === 'r') { e.preventDefault(); row?.querySelector('[data-a="tick"]')?.click(); }
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
          $(`[data-ei="${ei}"] [data-si="${si}"] input[data-f="w"]`)?.focus();
          return;
        }
        s.done = true;
        // Superset: go straight to the partner's matching set, rest after the pair.
        const partner = entry.ss && a.exercises.find(x => x !== entry && x.ss && x.ss[0] === entry.ss[0]);
        const goPartner = partner && partner.sets[si] && !partner.sets[si].done;
        if (!goPartner) startRest(S.settings.rest ? (entry.plan?.rest ?? S.settings.rest) : 0);
        save(); rerenderKeepScroll();
        if (goPartner) {
          const pi = a.exercises.indexOf(partner);
          toast(`Now: ${exName(partner.exId, partner.name)}`);
          setTimeout(() => $(`[data-ei="${pi}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
        } else if (entry.sets.every(x => x.done) && !entry.feel) {
          setTimeout(() => $(`[data-ei="${ei}"] .feel`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        }
      } else {
        s.done = false;
        save(); rerenderKeepScroll();
      }
      break;
    }
    case 'step': {
      const e = a.exercises[ei], s = e.sets[si], f = b.dataset.f, d = +b.dataset.d;
      const sug = suggestion(e, si);
      const st = f === 'w' ? stepFor(e.exId) : isTimed(e.exId) ? 5 : 1;
      const cur = num(s[f]) ?? num(sug[f]) ?? 0;
      s[f] = fmtN(Math.max(0, +(cur + d * st).toFixed(2)));
      const input = b.parentElement.querySelector('input');
      input.value = s[f]; input.classList.remove('sug-up');
      navigator.vibrate?.(8);
      save();
      break;
    }
    case 'busy': {
      // Machine taken? Swap for something that works the same muscles, ideally on different kit.
      const e = a.exercises[ei], m0 = meta(e.exId), ctx = planCtx(ALL_GEAR), base = ctx.bias;
      ctx.bias = c => base(c) + (c.g === m0?.g ? 0.6 : 0);
      const id = LP.swapFor(e.exId, ctx, new Set(a.exercises.map(x => x.exId)));
      if (!id) { toast('Nothing similar available — try ⋯ → Swap for another exercise'); break; }
      swapEntry(e, id);
      e.sets.forEach(x => { x.w = ''; x.r = ''; });
      save(); rerenderKeepScroll();
      toast(`Swapped to ${e.name} — tap again for another`);
      break;
    }
    case 'feel-edit': delete a.exercises[ei].feel; save(); rerenderKeepScroll(); break;
    case 'feel': {
      const entry = a.exercises[ei], v = b.dataset.v;
      entry.feel = v;
      if (v === 'meh' && pref(entry.exId) !== 'never') {
        S.prefs[entry.exId] = 'less';
        toast(`Noted — ${exName(entry.exId, entry.name)} will come up less often`);
      }
      save(); rerenderKeepScroll();
      // Then move on to the next unfinished exercise.
      const next = a.exercises.findIndex((x, k) => k !== ei && !x.sets.every(y => y.done));
      const card = next >= 0 ? $(`[data-ei="${next}"]`) : $('[data-a="finish"]');
      setTimeout(() => card?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
      if (next < 0 && v !== 'meh') toast('All done — tap Finish workout 🎉');
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
    case 'export': shareBackup(); break;
    case 'backup-later': S.backupSnooze = now() + 7 * DAY; save(); rerenderKeepScroll(); break;
    case 'refresh': location.reload(); break;
    case 'recap': showRecap(b.dataset.v); break;
    case 'cooldown': primeAudio(); startCooldown(); break;
    case 'cycle': S.settings.cycle = !S.settings.cycle; touch(S.settings); save(); rerenderKeepScroll(); break;
    case 'toggle-sessions': S.showSessions = !S.showSessions; save(); return;
    case 'help': showWelcome(); break;
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
    case 'equip-all': case 'equip-none': {
      const ids = LP.EQUIP[+b.dataset.v].items.map(x => x[0]);
      const rest = S.settings.noEquip.filter(x => !ids.includes(x));
      S.settings.noEquip = act === 'equip-all' ? rest : [...rest, ...ids];
      touch(S.settings); save(); rerenderKeepScroll(); break;
    }
    case 'ics': downloadIcs(); break;
    case 'awake': S.settings.awake = !S.settings.awake; touch(S.settings); save(); rerenderKeepScroll(); break;
    case 'import': $('#import-file').click(); break;
    case 'wipe':
      if (!confirm('Erase ALL workouts, routines and exercises from this phone?')) return;
      if (!confirm('Really? This can’t be undone unless you have a backup file.')) return;
      S = fresh(); save(); render(); toast('All data erased');
      break;
  }
});

/* ---------- Calendar reminders for gym days ---------- */
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const equipCount = () => {
  const total = LP.EQUIP.reduce((n, g) => n + g.items.length, 0);
  return `${total - S.settings.noEquip.length} of ${total} ticked`;
};
const pad2 = n => String(n).padStart(2, '0');
const icsDate = d => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
const appUrl = () => location.href.split('#')[0].split('?')[0];

/** First upcoming gym day at the chosen time, and the session end. */
function firstSession() {
  const [h, m] = (S.settings.time || '18:00').split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  for (let i = 0; i < 8; i++) {
    if (S.settings.days.includes(dow(d)) && d > new Date()) break;
    d.setDate(d.getDate() + 1);
  }
  return [d, new Date(d.getTime() + (S.settings.minutes || 45) * 60e3)];
}
const rrule = () => `RRULE:FREQ=WEEKLY;BYDAY=${S.settings.days.map(i => BYDAY[i]).join(',')}`;

function googleCalUrl() {
  const [a, b] = firstSession();
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: 'Gym 💪', dates: `${icsDate(a)}/${icsDate(b)}`, recur: rrule(),
    details: `Open Lift Log and tap Start: ${appUrl()}`,
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
  });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

function downloadIcs() {
  const [a, b] = firstSession();
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lift Log//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:liftlog-gym-${Date.now()}@liftlog`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${icsDate(a)}`, `DTEND:${icsDate(b)}`, rrule(), 'SUMMARY:Gym 💪',
    `DESCRIPTION:Open Lift Log and tap Start: ${appUrl()}`, `URL:${appUrl()}`,
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Gym in 30 minutes — bag packed?', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  link.download = 'gym-days.ics';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

function reminderSetting() {
  const s = S.settings;
  return `<div class="setting" style="display:block">
      <div>Reminders<div class="muted small">Put your gym days in your calendar, so your phone reminds you. Pick the time you usually go.</div></div>
      <div class="row" style="margin-top:10px;align-items:center">
        <input type="time" id="remind-time" value="${esc(s.time || '18:00')}" style="flex:0 0 7.5rem">
        <a class="btn primary" href="${esc(googleCalUrl())}" target="_blank" rel="noopener">Add to Google Calendar</a>
      </div>
      <button class="link small" data-a="ics" style="margin-top:8px">Or download a calendar file (.ics) with a 30-minute reminder</button>
    </div>`;
}

/* ---------- Welcome / how it works ---------- */
function showWelcome() {
  openSheet(`
    <div class="welcome">
      <div class="big-emoji">👋</div>
      <h2>Welcome to Lift Log</h2>
      <p class="muted">Going to the gym, made simple. Here’s all you need:</p>
      <ol class="steps">
        <li><b>Tap Start.</b> Your workout for today is already picked for you.</li>
        <li><b>Do a set, then tap ✓.</b> Type the weight and reps first — or just tap ✓ to use the grey numbers.</li>
        <li><b>Rest.</b> A big timer appears at the top and buzzes when it’s time to go again.</li>
        <li><b>Say how it felt,</b> then <b>tap Finish</b> at the end. That’s it!</li>
      </ol>
      <p class="muted small">Not sure how to do an exercise? Tap <b>ⓘ How to</b> for a tip and a demo video. Everything saves on your phone, even with no signal.</p>
      <button class="btn primary block big" data-s="ok">Let’s go</button>
    </div>`, () => { S.seenWelcome = true; save(); closeSheet(); });
  $('#sheet').addEventListener('close', () => { S.seenWelcome = true; save(); }, { once: true });
}

/* ---------- Backup ---------- */
/** Due when she has a few workouts and hasn't backed up for a month (snoozable for a week). */
function backupDue() {
  if (S.active || S.history.length < 5) return false;
  if (S.backupSnooze && now() < S.backupSnooze) return false;
  return !S.lastBackup || now() - S.lastBackup > 30 * DAY;
}
function backupCard() {
  return `<div class="card backup">
    <b>💾 Keep your workouts safe</b>
    <p class="muted small">${S.lastBackup ? `Last backup was ${esc(fmtDate(S.lastBackup))}.` : `You’ve logged ${S.history.length} workouts — they only live on this phone.`} Save a copy to Google Drive or send it to yourself. Takes 10 seconds.</p>
    <div class="row"><button class="btn small-btn" data-a="backup-later">Later</button><button class="btn primary small-btn" data-a="export">Back up now</button></div>
  </div>`;
}
function markBackedUp() {
  S.lastBackup = now(); delete S.backupSnooze;
  save(); rerenderKeepScroll(); toast('Backup saved ✓');
}
const backupName = () => `lift-log-backup-${new Date().toISOString().slice(0, 10)}.txt`;

/** Opens Android's share sheet (Drive, WhatsApp, Gmail…); falls back to a download. */
async function shareBackup() {
  const data = JSON.stringify(S);
  // Chrome only lets web pages share certain file types — plain text is one, JSON isn't.
  const file = new File([data], backupName(), { type: 'text/plain' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Lift Log backup', text: 'Lift Log backup — keep this file safe. To restore: Settings → Restore.' });
      return markBackedUp();
    }
  } catch (e) {
    if (e.name === 'AbortError') return; // she closed the share sheet
  }
  exportData();
  markBackedUp();
}

function exportData() {
  const blob = new Blob([JSON.stringify(S)], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = backupName();
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

/* ---------- App updates ---------- */
let updateReady = false;
function updateBanner() {
  return `<div class="update"><span>✨ A new version of Lift Log is ready${S.active ? ' — your workout is saved' : ''}</span><button class="btn small-btn primary" data-a="refresh">Refresh</button></div>`;
}

/* ---------- Plan display ---------- */
function phaseLine() {
  const wk = cycleWeek();
  if (!wk) return '';
  const ph = PHASES[wk];
  return `<div class="phase"><div class="phase-dots">${[1, 2, 3, 4].map(i => `<i class="${i === wk ? 'on' : i < wk ? 'past' : ''}"></i>`).join('')}</div>
    <div><b>Week ${wk} of 4 · ${esc(ph.name)}</b><span class="muted small">${esc(ph.blurb)}</span></div></div>`;
}

/* ---------- Monthly recap ---------- */
const monthKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
const monthStart = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).getTime(); };
const monthName = key => new Date(monthStart(key)).toLocaleDateString(undefined, { month: 'long' });
const prevMonthKey = key => { const d = new Date(monthStart(key)); d.setMonth(d.getMonth() - 1); return monthKey(d); };
const inMonth = key => S.history.filter(w => monthKey(w.start) === key);

function recapChips() {
  const keys = [...new Set(S.history.map(w => monthKey(w.start)))].slice(0, 3);
  if (!keys.length) return '';
  const cur = monthKey(Date.now());
  return `<div class="chips recap-chips">${keys.map(k => `<button class="chip" data-a="recap" data-v="${k}">📅 ${esc(monthName(k))}${k === cur ? ' so far' : ''}</button>`).join('')}</div>`;
}

/** Biggest weight gains: first time ever vs best in the month. */
function strongerList(key) {
  const end = monthStart(key) + 32 * DAY, out = [];
  const ids = new Set(inMonth(key).flatMap(w => w.exercises.map(e => e.exId)));
  for (const id of ids) {
    const entries = S.history.filter(w => w.start < end).slice().reverse()
      .flatMap(w => w.exercises.filter(e => e.exId === id && e.sets.some(x => x.w)).map(e => ({ t: w.start, lvl: !!e.lvl, top: Math.max(...e.sets.map(x => x.w)) })));
    if (entries.length < 2) continue;
    const lvl = entries[entries.length - 1].lvl, same = entries.filter(x => x.lvl === lvl);
    const first = same[0], best = Math.max(...same.filter(x => monthKey(x.t) === key).map(x => x.top));
    if (!(best > first.top)) continue;
    const since = monthKey(first.t) === key ? 'this month' : 'since you started';
    out.push({ gain: (best - first.top) / first.top, text: `${exName(id)}: ${wLabel(first.top, lvl)} → ${wLabel(best, lvl)} ${since}` });
  }
  return out.sort((a, b) => b.gain - a.gain).slice(0, 3).map(x => x.text);
}

function showRecap(key) {
  const ws = inMonth(key), prev = inMonth(prevMonthKey(key)).length;
  if (!ws.length) return;
  const mins = ws.reduce((n, w) => n + (w.end - w.start) / 60000, 0);
  const sets = ws.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0);
  const weeks = [...new Set(ws.map(w => weekStart(w.start)))];
  const goalWeeks = weeks.filter(wk => daysTrained(wk).size >= target()).length;
  const counts = {};
  ws.forEach(w => w.exercises.forEach(e => { counts[e.exId] = (counts[e.exId] || 0) + 1; }));
  const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const best = ws.filter(w => w.feel).sort((a, b) => b.feel - a.feel || b.start - a.start)[0];
  const stronger = strongerList(key);
  const vs = prev ? (ws.length > prev ? `${ws.length - prev} more than ${monthName(prevMonthKey(key))} 📈` : ws.length === prev ? `Same as ${monthName(prevMonthKey(key))} — nice and steady` : `${monthName(prevMonthKey(key))} was ${prev} — every session counts`) : '';
  const hrs = mins >= 60 ? `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m` : `${Math.round(mins)} min`;
  openSheet(`
    <div class="celebrate recap">
      <div class="big-emoji">🏅</div>
      <h2>Your ${esc(monthName(key))}${key === monthKey(Date.now()) ? ' so far' : ''}</h2>
      ${vs ? `<p class="muted">${esc(vs)}</p>` : ''}
      <div class="stat-grid">
        <div class="stat"><b>${ws.length}</b><span>Workouts</span></div>
        <div class="stat"><b>${hrs}</b><span>In the gym</span></div>
        <div class="stat"><b>${sets}</b><span>Sets</span></div>
        ${goalWeeks ? `<div class="stat"><b>${goalWeeks} of ${weeks.length}</b><span>Weeks goal hit</span></div>` : `<div class="stat"><b>${weeks.length}</b><span>Weeks you trained</span></div>`}
      </div>
      ${stronger.length ? `<div class="prs"><b>Getting stronger 💪</b>${stronger.map(t => `<div>${esc(t)}</div>`).join('')}</div>` : ''}
      <div class="recap-list">
        ${fav ? `<div>⭐ Most done: <b>${esc(exName(fav[0]))}</b> (${plural(fav[1], 'time')})</div>` : ''}
        ${best ? `<div>${SESSION_FEELS[best.feel - 1][1]} Best session: <b>${esc(best.name)}</b>, ${esc(fmtDate(best.start))}</div>` : ''}
      </div>
      <p><b>You’re someone who shows up. Keep going.</b></p>
      <button class="btn primary block" data-s="ok">Close</button>
    </div>`, () => closeSheet());
}

/** Once, in the first days of a new month: show how last month went. */
function maybeShowRecap() {
  const last = prevMonthKey(monthKey(Date.now()));
  if (S.active || S.recapSeen === last || !inMonth(last).length) return false;
  S.recapSeen = last; save();
  showRecap(last);
  return true;
}

/* ---------- Cool-down stretches ---------- */
const STRETCHES = {
  quad: ['Standing quad stretch', 'Hold something for balance, pull one heel to your bum, knees together.', 1],
  ham: ['Hamstring stretch', 'Sit with one leg straight, reach towards your toes with a long, flat back.', 1],
  glute: ['Figure-four stretch', 'Lie on your back, cross one ankle over the other knee and pull the bottom leg towards you.', 1],
  hip: ['Kneeling hip stretch', 'One knee down, tuck your hips under and lean gently forward.', 1],
  calf: ['Calf stretch', 'Hands on a wall, one leg stepped back, press that heel down.', 1],
  child: ['Child’s pose', 'Kneel, sit back on your heels and reach your arms forward. Breathe slowly.', 0],
  chest: ['Chest stretch', 'Forearm on a door frame or post, gently step through until your chest opens.', 1],
  shoulder: ['Cross-body shoulder stretch', 'Pull one arm across your chest with the other hand.', 1],
  tri: ['Overhead triceps stretch', 'Reach one hand down your back, gently press the elbow with the other hand.', 1],
  neck: ['Neck stretch', 'Tilt your ear towards your shoulder, keep the other shoulder relaxed and down.', 1],
  cobra: ['Cobra', 'Lie face down, press up through your hands and lift your chest. Hips stay down.', 0],
  twist: ['Lying twist', 'Lie on your back, drop both knees to one side and look the other way.', 1],
  knees: ['Knees to chest', 'Lie on your back and hug both knees in. Rock gently side to side.', 0],
  catcow: ['Cat–cow', 'On all fours, slowly round then arch your back with your breathing.', 0],
};
const COOL = {
  legs: ['quad', 'ham', 'glute', 'hip', 'calf', 'child'],
  glutes: ['glute', 'hip', 'ham', 'quad', 'twist', 'child'],
  arms: ['tri', 'shoulder', 'chest', 'neck', 'child'],
  upper: ['chest', 'shoulder', 'tri', 'neck', 'cobra', 'child'],
  core: ['cobra', 'catcow', 'twist', 'knees', 'child'],
  full: ['quad', 'ham', 'chest', 'shoulder', 'twist', 'child'],
};
/** Which stretches suit this workout: its focus, or a guess from the exercises. */
function coolFocus(a) {
  if (COOL[a.focus]) return a.focus;
  const cats = a.exercises.map(e => exById(e.exId)?.cat || meta(e.exId)?.cat);
  const lower = cats.filter(c => c === 'Legs' || c === 'Glutes').length, core = cats.filter(c => c === 'Core').length;
  if (lower > cats.length / 2) return 'legs';
  if (core > cats.length / 2) return 'core';
  return lower ? 'full' : 'upper';
}

let CD = null;
function startCooldown() {
  if (S.active.restEnd) { S.active.restEnd = null; save(); updateTimers(); } // no rest timer over the stretches
  const list = COOL[coolFocus(S.active)].map(k => STRETCHES[k]);
  CD = { list, i: 0, end: 0, half: false, timer: null };
  nextStretch(0);
  CD.timer = setInterval(tickCooldown, 250);
  $('#sheet').addEventListener('close', () => { clearInterval(CD?.timer); CD = null; }, { once: true });
}
function nextStretch(i) {
  CD.i = i;
  if (i >= CD.list.length) return finishCooldown();
  const [name, how, sides] = CD.list[i];
  CD.dur = sides ? 40 : 30; CD.end = Date.now() + CD.dur * 1000; CD.half = false;
  openSheet(`
    <div class="cooldown">
      <div class="cd-top"><span class="muted small">Stretch ${i + 1} of ${CD.list.length}</span><button class="link" data-s="stop">Stop</button></div>
      <div class="cd-bar"><i style="width:${(i / CD.list.length) * 100}%"></i></div>
      <h2>${esc(name)}</h2>
      <p>${esc(how)}</p>
      <div class="cd-time" id="cd-time">${CD.dur}</div>
      <div class="cd-side" id="cd-side">${sides ? 'First side' : 'Breathe slowly'}</div>
      <button class="btn block" data-s="skip">Next ›</button>
    </div>`, act => {
    if (act === 'skip') nextStretch(CD.i + 1);
    if (act === 'stop') closeSheet();
    if (act === 'done') { S.active.cooled = true; save(); closeSheet(); rerenderKeepScroll(); }
  });
}
function tickCooldown() {
  if (!CD || CD.i >= CD.list.length) return;
  const left = Math.ceil((CD.end - Date.now()) / 1000);
  const el = $('#cd-time');
  if (el) el.textContent = Math.max(0, left);
  if (CD.list[CD.i][2] && !CD.half && left <= CD.dur / 2) {
    CD.half = true; navigator.vibrate?.(150);
    const side = $('#cd-side'); if (side) side.textContent = 'Switch sides ↔';
  }
  if (left <= 0) { beep(); nextStretch(CD.i + 1); }
}
function finishCooldown() {
  clearInterval(CD?.timer);
  openSheet(`
    <div class="celebrate">
      <div class="big-emoji">🧘</div>
      <h2>Nicely done</h2>
      <p class="muted">Cool-down complete. Drink some water — then tap Finish workout.</p>
      <button class="btn primary block" data-s="done">Done</button>
    </div>`, act => { if (act === 'done') { S.active.cooled = true; save(); closeSheet(); rerenderKeepScroll(); } });
}

/* ---------- Boot ---------- */
render();
if (S.active) { toast('Workout resumed'); syncWakeLock(); }
else if (!S.seenWelcome && !S.history.length) showWelcome();
else maybeShowRecap();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // When a new version installs, offer a refresh (never reload by itself — she might be mid-set).
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || updateReady) return;
      updateReady = true;
      rerenderKeepScroll();
    });
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Look for updates whenever the app is opened again, and hourly while it's open.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      setInterval(() => reg.update().catch(() => {}), 3600e3);
    }).catch(() => {});
  });
}
