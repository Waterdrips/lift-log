'use strict';
// Built-in exercise catalogue, ready-made sessions and the session builder.
//
// Each exercise: g = gear, p = movement pattern (sessions are built from patterns, and
// "swap" replaces like-for-like), f = flags (c = compound → longer rest, u = one side
// at a time, t = timed hold), cue = one-line form tip.
(function () {
  const X = (name, cat, g, p, f, cue) => ({ name, cat, g, p, f, cue });

  const CATALOG = [
    // Legs
    X('Back Squat', 'Legs', 'barbell', 'squat', 'c', 'Bar on upper back, sit down between your heels, chest up.'),
    X('Front Squat', 'Legs', 'barbell', 'squat', 'c', 'Bar on the front of your shoulders, elbows high, stay upright.'),
    X('Goblet Squat', 'Legs', 'dumbbell', 'squat', 'c', 'Hold one dumbbell at your chest, sit deep, knees out.'),
    X('Leg Press', 'Legs', 'machine', 'squat', 'c', 'Feet shoulder-width, lower until knees are ~90°, don’t lock out.'),
    X('Hack Squat', 'Legs', 'machine', 'squat', 'c', 'Back flat on the pad, lower slowly, push through mid-foot.'),
    X('Smith Machine Squat', 'Legs', 'machine', 'squat', 'c', 'Feet a little in front of the bar, sit straight down.'),
    X('Romanian Deadlift', 'Legs', 'barbell', 'hinge', 'c', 'Soft knees, push hips back, bar close to your legs, flat back.'),
    X('Dumbbell Romanian Deadlift', 'Legs', 'dumbbell', 'hinge', 'c', 'Dumbbells slide down your thighs as hips go back; feel the hamstring stretch.'),
    X('Bulgarian Split Squat', 'Legs', 'dumbbell', 'lunge', 'u', 'Back foot on a bench, drop straight down, front heel planted.'),
    X('Walking Lunge', 'Legs', 'dumbbell', 'lunge', 'u', 'Long steps, back knee just above the floor, stay tall.'),
    X('Reverse Lunge', 'Legs', 'dumbbell', 'lunge', 'u', 'Step back, lower under control, drive up through the front heel.'),
    X('Leg Extension', 'Legs', 'machine', 'quad', '', 'Pad on your lower shins, squeeze at the top for a second.'),
    X('Lying Leg Curl', 'Legs', 'machine', 'ham', '', 'Hips pressed down, curl heels to glutes, lower slowly.'),
    X('Seated Leg Curl', 'Legs', 'machine', 'ham', '', 'Thigh pad snug, pull heels under, control the return.'),
    X('Standing Calf Raise', 'Legs', 'machine', 'calf', '', 'Full stretch at the bottom, pause at the top.'),
    X('Seated Calf Raise', 'Legs', 'machine', 'calf', '', 'Knees under the pad, slow up and down, pause at the top.'),
    X('Dumbbell Calf Raise', 'Legs', 'dumbbell', 'calf', '', 'Balls of your feet on a step, dumbbell in each hand, full range.'),
    X('Hip Adduction Machine', 'Legs', 'machine', 'adduct', '', 'Squeeze your legs together slowly, resist on the way out.'),
    // Glutes
    X('Hip Thrust', 'Glutes', 'barbell', 'thrust', 'c', 'Upper back on a bench, chin tucked, drive hips up and squeeze for 1 s.'),
    X('Hip Thrust Machine', 'Glutes', 'machine', 'thrust', 'c', 'Pad across your hips, push up through your heels, pause at the top.'),
    X('Glute Bridge', 'Glutes', 'bodyweight', 'thrust', '', 'Feet close to your glutes, ribs down, squeeze at the top. Rest a dumbbell on your hips when it gets easy.'),
    X('Single-Leg Glute Bridge', 'Glutes', 'bodyweight', 'thrust', 'u', 'One foot down, other knee up, drive through the heel.'),
    X('Cable Pull-Through', 'Glutes', 'cable', 'hinge', '', 'Rope between your legs, hinge back, snap hips forward and squeeze.'),
    X('Step-Up', 'Glutes', 'dumbbell', 'lunge', 'u', 'Whole foot on the box, push through that heel, don’t bounce off the back foot.'),
    X('Cable Kickback', 'Glutes', 'cable', 'glute', 'u', 'Ankle strap on, slight lean forward, kick back without arching your lower back.'),
    X('Glute Kickback Machine', 'Glutes', 'machine', 'glute', 'u', 'Push the pad back with your heel, squeeze, return slowly.'),
    X('Hip Abduction Machine', 'Glutes', 'machine', 'abduct', '', 'Lean forward slightly, push knees out, slow on the way back.'),
    X('Cable Hip Abduction', 'Glutes', 'cable', 'abduct', 'u', 'Strap on the outside ankle, sweep the leg out to the side, no swinging.'),
    // Chest
    X('Bench Press', 'Chest', 'barbell', 'pushh', 'c', 'Shoulder blades pinched, bar to lower chest, feet planted.'),
    X('Dumbbell Bench Press', 'Chest', 'dumbbell', 'pushh', 'c', 'Lower dumbbells to chest level, press up and slightly in.'),
    X('Incline Dumbbell Press', 'Chest', 'dumbbell', 'pushh', 'c', 'Bench at ~30°, lower to upper chest, elbows at 45°.'),
    X('Chest Press Machine', 'Chest', 'machine', 'pushh', 'c', 'Handles at mid-chest height, press out, control the way back.'),
    X('Push-Up', 'Chest', 'bodyweight', 'pushh', '', 'Body in a straight line. From your knees or hands on a bench is fine.'),
    X('Cable Fly', 'Chest', 'cable', 'fly', '', 'Slight bend in the elbows, hug a big tree, squeeze in the middle.'),
    X('Pec Deck', 'Chest', 'machine', 'fly', '', 'Soft elbows, bring the pads together, open slowly.'),
    // Back
    X('Deadlift', 'Back', 'barbell', 'hinge', 'c', 'Bar over mid-foot, brace your stomach, push the floor away.'),
    X('Lat Pulldown', 'Back', 'cable', 'pullv', 'c', 'Pull the bar to your upper chest, elbows down and back, don’t lean far.'),
    X('Assisted Pull-Up', 'Back', 'machine', 'pullv', 'c', 'More assistance = easier. Chest to the bar, lower all the way.'),
    X('Straight-Arm Pulldown', 'Back', 'cable', 'pullv', '', 'Arms long, sweep the bar down to your thighs using your back.'),
    X('Seated Cable Row', 'Back', 'cable', 'pullh', 'c', 'Sit tall, pull the handle to your belly, squeeze shoulder blades.'),
    X('Seated Row Machine', 'Back', 'machine', 'pullh', 'c', 'Chest on the pad, pull elbows back, pause, return slowly.'),
    X('One-Arm Dumbbell Row', 'Back', 'dumbbell', 'pullh', 'u', 'Hand and knee on a bench, pull the dumbbell to your hip, flat back.'),
    X('Barbell Row', 'Back', 'barbell', 'pullh', 'c', 'Hinge to ~45°, pull the bar to your lower ribs, no jerking.'),
    X('Back Extension', 'Back', 'machine', 'backext', '', 'Hips over the pad, rise to a straight line, squeeze your glutes.'),
    // Shoulders
    X('Overhead Press', 'Shoulders', 'barbell', 'pushv', 'c', 'Squeeze glutes, press the bar straight up, head through at the top.'),
    X('Dumbbell Shoulder Press', 'Shoulders', 'dumbbell', 'pushv', 'c', 'Press up from ear height, don’t arch your back.'),
    X('Shoulder Press Machine', 'Shoulders', 'machine', 'pushv', 'c', 'Handles at shoulder height, press up, control down.'),
    X('Arnold Press', 'Shoulders', 'dumbbell', 'pushv', '', 'Start palms facing you, rotate them out as you press up.'),
    X('Lateral Raise', 'Shoulders', 'dumbbell', 'lateral', '', 'Lead with your elbows, raise to shoulder height. Light is fine.'),
    X('Cable Lateral Raise', 'Shoulders', 'cable', 'lateral', 'u', 'Low pulley across your body, raise out to the side.'),
    X('Face Pull', 'Shoulders', 'cable', 'rear', '', 'Rope at face height, pull towards your forehead, elbows high.'),
    X('Reverse Pec Deck', 'Shoulders', 'machine', 'rear', '', 'Face the pad, arms out, sweep back squeezing your upper back.'),
    X('Bent-Over Reverse Fly', 'Shoulders', 'dumbbell', 'rear', '', 'Hinge forward, light dumbbells, raise them out wide.'),
    // Arms
    X('Dumbbell Curl', 'Arms', 'dumbbell', 'bi', '', 'Elbows pinned to your sides, no swinging, lower slowly.'),
    X('Hammer Curl', 'Arms', 'dumbbell', 'bi', '', 'Palms facing each other, curl up, control down.'),
    X('Cable Curl', 'Arms', 'cable', 'bi', '', 'Elbows still, curl the bar up, squeeze, lower slowly.'),
    X('Barbell Curl', 'Arms', 'barbell', 'bi', '', 'Shoulder-width grip, elbows still, don’t lean back.'),
    X('Preacher Curl Machine', 'Arms', 'machine', 'bi', '', 'Arms flat on the pad, curl up, don’t let the weight drop.'),
    X('Triceps Pushdown', 'Arms', 'cable', 'tri', '', 'Elbows tucked, push down until your arms are straight, squeeze.'),
    X('Overhead Triceps Extension', 'Arms', 'dumbbell', 'tri', '', 'One dumbbell overhead in both hands, lower behind your head, elbows in.'),
    X('Triceps Kickback', 'Arms', 'dumbbell', 'tri', 'u', 'Hinge forward, upper arm still, straighten the arm back.'),
    X('Assisted Dip', 'Arms', 'machine', 'tri', 'c', 'Stay upright, lower until elbows reach 90°, press up.'),
    X('Bench Dip', 'Arms', 'bodyweight', 'tri', '', 'Hands on a bench edge, bend elbows straight back. Bend your knees to make it easier.'),
    X('Skull Crusher', 'Arms', 'barbell', 'tri', '', 'EZ bar or barbell, lower towards your forehead, elbows pointing up.'),
    // Core
    X('Plank (secs)', 'Core', 'bodyweight', 'anti', 't', 'Elbows under shoulders, squeeze glutes, don’t let your hips sag.'),
    X('Side Plank (secs)', 'Core', 'bodyweight', 'anti', 'tu', 'Hips high, body in one line.'),
    X('Dead Bug', 'Core', 'bodyweight', 'anti', '', 'Lower back pressed down, slowly extend opposite arm and leg. Count each side.'),
    X('Bird Dog', 'Core', 'bodyweight', 'anti', '', 'On all fours, reach opposite arm and leg, hold 2 s, swap.'),
    X('Pallof Press', 'Core', 'cable', 'anti', 'u', 'Stand side-on to the cable, press the handle straight out, resist the twist.'),
    X('Cable Crunch', 'Core', 'cable', 'flex', '', 'Kneel, rope by your ears, crunch ribs towards hips — don’t sit back.'),
    X('Hanging Knee Raise', 'Core', 'bodyweight', 'flex', '', 'Hang or use the captain’s chair, lift knees up, no swinging.'),
    X('Ab Crunch Machine', 'Core', 'machine', 'flex', '', 'Curl your chest towards your knees, slow return.'),
    X('Reverse Crunch', 'Core', 'bodyweight', 'flex', '', 'Lie back, curl your hips off the floor bringing knees to chest.'),
    X('Bicycle Crunch', 'Core', 'bodyweight', 'rot', '', 'Elbow towards the opposite knee, slow and controlled. Count each side.'),
    X('Russian Twist', 'Core', 'dumbbell', 'rot', '', 'Lean back a little, rotate side to side holding a dumbbell.'),
    X('Cable Woodchop', 'Core', 'cable', 'rot', 'u', 'Arms long, rotate from hips and torso, high to low.'),
  ];

  // Gym equipment checklist (Settings). Each exercise lists what it needs; "a|b" means either.
  const EQUIP = [
    { group: 'Free weights', items: [['dumbbells', 'Dumbbells'], ['barbell', 'Barbell & plates'], ['ezbar', 'EZ curl bar'], ['rack', 'Squat rack'], ['bench', 'Bench (flat / adjustable)'], ['box', 'Step or plyo box']] },
    { group: 'Cables', items: [['cable', 'Cable machine (adjustable pulley)'], ['pulldown', 'Lat pulldown'], ['cablerow', 'Seated cable row']] },
    { group: 'Leg & glute machines', items: [['legpress', 'Leg press'], ['hack', 'Hack squat'], ['smith', 'Smith machine'], ['legext', 'Leg extension'], ['curl_lying', 'Lying leg curl'], ['curl_seated', 'Seated leg curl'], ['thrustm', 'Hip thrust machine'], ['kickm', 'Glute kickback machine'], ['abductor', 'Hip abduction (outer thigh)'], ['adductor', 'Hip adduction (inner thigh)'], ['calf_stand', 'Standing calf raise'], ['calf_seat', 'Seated calf raise']] },
    { group: 'Upper body machines', items: [['chestpress', 'Chest press'], ['pecdeck', 'Pec deck / rear delt fly'], ['shoulderm', 'Shoulder press'], ['rowm', 'Seated row machine'], ['preacher', 'Preacher curl'], ['assist', 'Assisted pull-up / dip']] },
    { group: 'Core & stations', items: [['backext', 'Back extension bench'], ['captain', 'Pull-up bar / captain’s chair'], ['abm', 'Ab crunch machine']] },
  ];
  const REQ = {
    'Back Squat': 'barbell rack', 'Front Squat': 'barbell rack', 'Goblet Squat': 'dumbbells', 'Leg Press': 'legpress', 'Hack Squat': 'hack',
    'Smith Machine Squat': 'smith', 'Romanian Deadlift': 'barbell', 'Dumbbell Romanian Deadlift': 'dumbbells', 'Bulgarian Split Squat': 'dumbbells bench',
    'Walking Lunge': 'dumbbells', 'Reverse Lunge': 'dumbbells', 'Leg Extension': 'legext', 'Lying Leg Curl': 'curl_lying', 'Seated Leg Curl': 'curl_seated',
    'Standing Calf Raise': 'calf_stand', 'Seated Calf Raise': 'calf_seat', 'Dumbbell Calf Raise': 'dumbbells box', 'Hip Adduction Machine': 'adductor',
    'Hip Thrust': 'barbell bench', 'Hip Thrust Machine': 'thrustm', 'Cable Pull-Through': 'cable', 'Step-Up': 'dumbbells box', 'Cable Kickback': 'cable',
    'Glute Kickback Machine': 'kickm', 'Hip Abduction Machine': 'abductor', 'Cable Hip Abduction': 'cable',
    'Bench Press': 'barbell bench', 'Dumbbell Bench Press': 'dumbbells bench', 'Incline Dumbbell Press': 'dumbbells bench', 'Chest Press Machine': 'chestpress',
    'Cable Fly': 'cable', 'Pec Deck': 'pecdeck', 'Deadlift': 'barbell', 'Lat Pulldown': 'pulldown', 'Assisted Pull-Up': 'assist', 'Straight-Arm Pulldown': 'cable|pulldown',
    'Seated Cable Row': 'cablerow|cable', 'Seated Row Machine': 'rowm', 'One-Arm Dumbbell Row': 'dumbbells bench', 'Barbell Row': 'barbell', 'Back Extension': 'backext',
    'Overhead Press': 'barbell', 'Dumbbell Shoulder Press': 'dumbbells', 'Shoulder Press Machine': 'shoulderm', 'Arnold Press': 'dumbbells', 'Lateral Raise': 'dumbbells',
    'Cable Lateral Raise': 'cable', 'Face Pull': 'cable', 'Reverse Pec Deck': 'pecdeck', 'Bent-Over Reverse Fly': 'dumbbells',
    'Dumbbell Curl': 'dumbbells', 'Hammer Curl': 'dumbbells', 'Cable Curl': 'cable', 'Barbell Curl': 'barbell|ezbar', 'Preacher Curl Machine': 'preacher',
    'Triceps Pushdown': 'cable', 'Overhead Triceps Extension': 'dumbbells', 'Triceps Kickback': 'dumbbells', 'Assisted Dip': 'assist', 'Bench Dip': 'bench',
    'Skull Crusher': 'barbell|ezbar bench', 'Pallof Press': 'cable', 'Cable Crunch': 'cable', 'Hanging Knee Raise': 'captain', 'Ab Crunch Machine': 'abm',
    'Russian Twist': 'dumbbells', 'Cable Woodchop': 'cable',
  };

  // Friendly names for movement patterns (used when she tags her own exercises).
  const PATTERNS = {
    squat: 'Squat', hinge: 'Hinge / deadlift', lunge: 'Lunge / step-up', thrust: 'Hip thrust / bridge', glute: 'Glute kickback',
    abduct: 'Outer thigh', adduct: 'Inner thigh', quad: 'Quads (extension)', ham: 'Hamstring curl', calf: 'Calves',
    pushh: 'Chest press / push-up', fly: 'Chest fly', pullv: 'Pulldown / pull-up', pullh: 'Row', pushv: 'Shoulder press',
    lateral: 'Side raise', rear: 'Rear shoulders', bi: 'Biceps', tri: 'Triceps',
    flex: 'Abs (crunch / raise)', anti: 'Plank / stability', rot: 'Obliques / twist', backext: 'Lower back',
  };

  const slug = n => 'd-' + n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const META = {};
  CATALOG.forEach(c => {
    c.id = slug(c.name);
    c.req = (REQ[c.name] || '').split(' ').filter(Boolean).map(r => r.split('|'));
    META[c.id] = c;
  });

  /** Her own exercises that she has tagged with equipment + movement, so plans can use them. */
  let CUSTOM = [];
  function setCustom(list) {
    CUSTOM.forEach(c => { delete META[c.id]; });
    CUSTOM = list.filter(e => !META[e.id] && e.g && e.p && PATTERNS[e.p])
      .map(e => ({ id: e.id, name: e.name, cat: e.cat, g: e.g, p: e.p, f: e.t ? 't' : '', cue: e.cue || '', req: [], custom: true }));
    CUSTOM.forEach(c => { META[c.id] = c; });
  }
  /** Has the gym got everything this exercise needs? */
  const hasEquip = (c, missing) => c.req.every(any => any.some(r => !missing.includes(r)));

  const GEAR = { machine: 'Machines', cable: 'Cables', dumbbell: 'Dumbbells', barbell: 'Barbell', bodyweight: 'Bodyweight' };
  const GEAR_ONE = { machine: 'Machine', cable: 'Cable', dumbbell: 'Dumbbells', barbell: 'Barbell', bodyweight: 'Bodyweight' };

  // Rep schemes. c = compound lifts, a = smaller "accessory" moves, t = timed holds (seconds).
  // tempo = rough seconds per rep, used for the time estimate.
  const GOALS = {
    tone: { label: 'Tone', blurb: 'Moderate weights, 10–15 reps, short rests', c: { sets: 3, lo: 10, hi: 12, rest: 60 }, a: { sets: 3, lo: 12, hi: 15, rest: 45 }, t: [30, 45], max: 4, tempo: 3 },
    strength: { label: 'Strength', blurb: 'Heavier weights, fewer reps, longer rests', c: { sets: 4, lo: 6, hi: 8, rest: 120 }, a: { sets: 3, lo: 10, hi: 12, rest: 60 }, t: [30, 45], max: 5, tempo: 3.5 },
    endurance: { label: 'Endurance', blurb: 'Lighter weights, 15–20 reps, quick pace', c: { sets: 3, lo: 15, hi: 20, rest: 45 }, a: { sets: 3, lo: 15, hi: 20, rest: 30 }, t: [45, 60], max: 4, tempo: 2.5 },
  };

  // Focus days: movement patterns in priority order. Shorter sessions use the first few.
  const FOCUS = {
    legs: { label: 'Legs', icon: '🦵', slots: ['squat', 'hinge', 'lunge', 'thrust', 'quad', 'ham', 'abduct', 'calf', 'adduct'] },
    glutes: { label: 'Glutes', icon: '🍑', slots: ['thrust', 'hinge', 'lunge', 'glute', 'abduct', 'ham', 'squat', 'backext', 'glute'] },
    arms: { label: 'Arms & shoulders', icon: '💪', slots: ['pushv', 'bi', 'tri', 'lateral', 'bi', 'tri', 'rear', 'pushh', 'lateral'] },
    core: { label: 'Core', icon: '🔥', slots: ['flex', 'anti', 'rot', 'backext', 'flex', 'anti', 'rot', 'anti', 'flex'] },
    upper: { label: 'Upper body', icon: '🏋️', slots: ['pullv', 'pushh', 'pullh', 'pushv', 'lateral', 'bi', 'tri', 'rear', 'fly'] },
    full: { label: 'Full body', icon: '⚡', slots: ['squat', 'pullv', 'pushh', 'hinge', 'pullh', 'lunge', 'pushv', 'flex', 'thrust'] },
  };

  // Ready-made sessions (fixed exercise lists, in priority order).
  const SESSIONS = [
    { id: 'lower-sculpt', name: 'Lower Body Sculpt', focus: 'legs', desc: 'Squat, hinge, lunge, then machines to finish.',
      ex: ['Leg Press', 'Romanian Deadlift', 'Walking Lunge', 'Hip Thrust', 'Leg Extension', 'Lying Leg Curl', 'Hip Abduction Machine', 'Standing Calf Raise'] },
    { id: 'glute-focus', name: 'Glute Focus', focus: 'glutes', desc: 'Thrusts, split squats and kickbacks.',
      ex: ['Hip Thrust', 'Bulgarian Split Squat', 'Dumbbell Romanian Deadlift', 'Cable Kickback', 'Hip Abduction Machine', 'Seated Leg Curl', 'Back Extension', 'Glute Bridge'] },
    { id: 'toned-arms', name: 'Toned Arms & Shoulders', focus: 'arms', desc: 'Presses, curls, triceps and raises.',
      ex: ['Dumbbell Shoulder Press', 'Triceps Pushdown', 'Dumbbell Curl', 'Lateral Raise', 'Overhead Triceps Extension', 'Hammer Curl', 'Face Pull', 'Push-Up'] },
    { id: 'upper-tone', name: 'Upper Body Tone', focus: 'upper', desc: 'Back, chest and shoulders in balance.',
      ex: ['Lat Pulldown', 'Incline Dumbbell Press', 'Seated Cable Row', 'Shoulder Press Machine', 'Cable Fly', 'Lateral Raise', 'Cable Curl', 'Triceps Pushdown'] },
    { id: 'core-strong', name: 'Core Strong', focus: 'core', desc: 'Front, sides and back of your core.',
      ex: ['Dead Bug', 'Cable Crunch', 'Pallof Press', 'Hanging Knee Raise', 'Side Plank (secs)', 'Russian Twist', 'Plank (secs)', 'Back Extension'] },
    { id: 'machine-circuit', name: 'Machine Full Body', focus: 'full', desc: 'All machines and cables — easy to set up.',
      ex: ['Leg Press', 'Chest Press Machine', 'Seated Row Machine', 'Lying Leg Curl', 'Shoulder Press Machine', 'Lat Pulldown', 'Hip Abduction Machine', 'Ab Crunch Machine'] },
    { id: 'dumbbell-full', name: 'Dumbbell Full Body', focus: 'full', desc: 'Just a pair of dumbbells and a bench.',
      ex: ['Goblet Squat', 'Dumbbell Bench Press', 'One-Arm Dumbbell Row', 'Dumbbell Romanian Deadlift', 'Reverse Lunge', 'Dumbbell Shoulder Press', 'Hammer Curl', 'Russian Twist'] },
    { id: 'barbell-basics', name: 'Barbell Basics', focus: 'full', desc: 'The big barbell lifts, done well.',
      ex: ['Back Squat', 'Bench Press', 'Barbell Row', 'Romanian Deadlift', 'Overhead Press', 'Hip Thrust', 'Plank (secs)'] },
  ];
  SESSIONS.forEach(s => {
    s.pool = s.ex.map(slug);
    s.gear = [...new Set(s.pool.map(id => META[id].g))];
  });

  /** Sets/reps/rest for one exercise under a goal. */
  function prescription(id, goalKey) {
    const m = META[id], G = GOALS[goalKey] || GOALS.tone;
    const role = m && m.f.includes('c') ? G.c : G.a;
    const timed = !!m && m.f.includes('t');
    return {
      g: goalKey, sets: role.sets, rest: role.rest,
      lo: timed ? G.t[0] : role.lo, hi: timed ? G.t[1] : role.hi,
      t: timed, bw: m?.g === 'bodyweight', u: !!m && m.f.includes('u'),
    };
  }

  function setWork(p) {
    const G = GOALS[p.g] || GOALS.tone;
    const one = p.t ? p.hi + 10 : ((p.lo + p.hi) / 2) * G.tempo + 15;
    return p.u ? one * 2 + 10 : one;
  }
  const CHANGEOVER = 90; // walking to the next machine, setting up
  const itemCost = it => it.sets * setWork(it.plan) + (it.sets - 1) * it.plan.rest + CHANGEOVER;
  const warmup = minutes => (minutes <= 20 ? 180 : 300);
  const estimate = (items, minutes) => warmup(minutes) + items.reduce((n, it) => n + itemCost(it), 0);

  // Superset = two exercises back to back, resting only after the pair.
  const SWITCH = 15;
  function unitCost(u) {
    if (u.length === 1) return itemCost(u[0]);
    const [a, b] = u, sets = a.sets;
    return sets * (setWork(a.plan) + setWork(b.plan) + SWITCH) + (sets - 1) * Math.max(a.plan.rest, b.plan.rest) + 2 * CHANGEOVER;
  }
  const unitExtra = u => u.reduce((n, it) => n + setWork(it.plan), 0) + (u.length > 1 ? SWITCH : 0) + Math.max(...u.map(it => it.plan.rest));

  /** Take exercises from the pool in order until the time runs out, then add sets to fill the rest. */
  function fit(pool, minutes, goalKey, opts = {}) {
    const budget = minutes * 60 + 60, G = GOALS[goalKey] || GOALS.tone;
    const mk = id => { const it = { exId: id, plan: prescription(id, goalKey) }; it.sets = it.plan.sets; return it; };
    const group = (ids, size) => { const out = []; for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size).map(mk)); return out; };
    const size = opts.superset ? 2 : 1;
    let units = [], total = warmup(minutes);
    for (const u of group(pool, size)) {
      if (u.length > 1) { const sets = Math.max(...u.map(it => it.sets)); u.forEach(it => { it.sets = sets; }); }
      if (total + unitCost(u) > budget) break;
      units.push(u); total += unitCost(u);
    }
    if (units.flat().length < 2) { // very short: two exercises, two sets each
      units = group(pool.slice(0, 2), size);
      units.flat().forEach(it => { it.sets = 2; });
      total = warmup(minutes) + units.reduce((n, u) => n + unitCost(u), 0);
    }
    for (let grew = true; grew;) {
      grew = false;
      for (const u of units) {
        const extra = unitExtra(u);
        if (u[0].sets < G.max && total + extra <= budget) { u.forEach(it => { it.sets++; }); total += extra; grew = true; }
      }
    }
    let letter = 0;
    units.forEach(u => {
      const ss = u.length > 1 ? 'ABCDEFGH'[letter++] : null;
      const rest = Math.max(...u.map(it => it.plan.rest));
      u.forEach((it, k) => { it.plan.sets = it.sets; if (ss) { it.ss = ss + (k + 1); it.plan.rest = rest; } });
    });
    return { items: units.flat(), seconds: total };
  }

  const rand = () => Math.random();

  // ctx = { ok(c): allowed with today's gear + equipment, equipOk(c): allowed ignoring the gear filter,
  //         recent: Set of ids done lately, exclude: Set of ids never to pick, bias(c): score tweak (lower = more likely) }
  function pick(pat, ctx, used, preferCompound = false, okFn = ctx.ok) {
    const opts = CATALOG.concat(CUSTOM).filter(c => c.p === pat && okFn(c) && !used.has(c.id) && !ctx.exclude.has(c.id));
    if (!opts.length) return null;
    opts.forEach(c => {
      c._r = rand() + (ctx.recent.has(c.id) ? 0.8 : 0) + (preferCompound && !c.f.includes('c') && !c.custom ? 0.6 : 0) + (ctx.bias ? ctx.bias(c) : 0);
    });
    opts.sort((a, b) => a._r - b._r);
    return opts[0].id;
  }

  function buildPool(focusKey, ctx) {
    const used = new Set(), pool = [];
    // The first two slots lean towards big compound lifts — that's where most of the work happens.
    for (const [i, pat] of FOCUS[focusKey].slots.entries()) {
      const id = pick(pat, ctx, used, i < 2);
      if (id) { used.add(id); pool.push(id); }
    }
    return pool;
  }

  /** A similar exercise (same movement). Prefers today's gear, falls back to the same kind of kit. */
  function swapFor(id, ctx, used) {
    const m = META[id];
    if (!m) return null;
    return pick(m.p, ctx, used) || pick(m.p, ctx, used, false, c => ctx.equipOk(c) && c.g === m.g);
  }

  /** A ready-made session, with anything unavailable or unwanted swapped for something similar. */
  function sessionPool(sess, ctx) {
    const used = new Set(), pool = [];
    for (const id of sess.pool) {
      const c = META[id];
      const fine = c && ctx.equipOk(c) && !ctx.exclude.has(id) && !used.has(id);
      const n = fine ? id : swapFor(id, { ...ctx, ok: ctx.equipOk }, used);
      if (n) { used.add(n); pool.push(n); }
    }
    return pool;
  }

  window.LiftPlans = { CATALOG, META, GEAR, GEAR_ONE, GOALS, FOCUS, SESSIONS, EQUIP, PATTERNS, slug, prescription, fit, buildPool, swapFor, sessionPool, estimate, setCustom, hasEquip };
})();
