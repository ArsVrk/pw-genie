'use strict';
/* ================= CALCULATOR: game-like genie window ================= */
/* globals from app.js: $, h, esc, G, SKILLS, BY_ID, STATS, STAT_UK, ELEMS, ELEM_UK, SLOTS, SLOT_UK, MAX_LEVEL,
   statCost, maxLucky, totalStatPoints, elementPoints, skillSlots, expToNext, renderTooltip, elemBadges,
   iconSrc, fmtNum, totalSpirit, itemIcon, ITEM, calcReady, F, renderSkills */

const C = {
  genie: null, level: 1, lp: 0, form: 0,             // form 0 = auto
  alloc: [0, 0, 0, 0], elems: [0, 0, 0, 0, 0],
  equip: { jade: 0, amulet: 0, mirror: 0, pearl: 0 }, skills: [],
};
const EQ_BY_ID = {};
const HINTS = {};                 // 'hint:<key>' -> raw tooltip text
let UI = null;                    // dialogs.json
let W = null, WG = null;          // rendered windows: {root, el: {name: node}}
const GROWTH = 50;                // «Зріст» — the same for every genie seen in the game
const ELEMENT_CAP = 8;            // element sprites have 9 frames (0..8)
// genie stat buttons in the game window: XML names -> our stat keys
const STAT_CTRL = { strength: 'STR', agility: 'AGI', vitality: 'VIT', intellect: 'NIG' };
const SLOT_CTRL = { jade: 1, amulet: 2, mirror: 3, pearl: 4 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const genie = () => G.genies.find((g) => g.id === C.genie) || G.genies[0];
const freePoints = () => totalStatPoints(C.level, C.lp) - C.alloc.reduce((t, a) => t + statCost(a), 0);
const freeElems = () => elementPoints(C.level) - C.elems.reduce((t, a) => t + a, 0);
const equipped = () => SLOTS.map((s) => EQ_BY_ID[C.equip[s]]).filter(Boolean);
/** The genie's displayed stats: start value + allocated points + equipment. */
function currentStats() {
  const g = genie(), eq = equipped();
  return Object.fromEntries(STATS.map((s, i) => [s, g.init[s] + C.alloc[i] + eq.reduce((t, e) => t + (e.stats[s] || 0), 0)]));
}

/* ---------- lucky points: one roll every 10 genie levels, 1..10 points with the genie's own chances ---------- */
C.rolls = [];                       // points got on levels 10, 20, ... (simulated)
function randomRoll(g) {
  let x = Math.random() * g.lucky_point_roll.reduce((t, r) => t + r.prob, 0);
  for (const r of g.lucky_point_roll) { x -= r.prob; if (x < 0) return r.points; }
  return g.lucky_point_roll.at(-1).points;
}
/** Change the level; crossing every 10th level rolls (or takes back) lucky points, on top of manual edits. */
/** Genies from «Мисливець за скарбами» always have the maximum lucky points for their level (no rolls). */
// Treasure Hunter genies only look different: same lucky rolls; guaranteed 100/100 — only from «Загадкова лампа»
const fixedLucky = () => false;
function setLevel(v) {
  const g = genie();
  C.level = clamp(Math.round(v) || 1, 1, MAX_LEVEL);
  if (fixedLucky(g)) { C.rolls = []; C.lp = maxLucky(C.level); renderCalc(); return; }
  const n = Math.floor(C.level / 10);
  while (C.rolls.length < n) { const r = randomRoll(g); C.rolls.push(r); C.lp += r; }
  while (C.rolls.length > n) C.lp -= C.rolls.pop();
  C.lp = clamp(C.lp, 0, maxLucky(C.level));
  renderCalc();
}
function rerollLucky() {
  const g = genie();
  C.rolls = Array.from({ length: Math.floor(C.level / 10) }, () => randomRoll(g));
  C.lp = C.rolls.reduce((t, r) => t + r, 0);
}
/** Rolls that add up to a given LP (for links / manual values), so going down a level takes back a fair share. */
function rollsFor(lp, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.floor((lp + i) / n));
  return out;
}
/* Lucky points tier — the color of «Випадковий вибір N/M» in the genie item tooltip: avg = round(10 × mean roll of the genie), max = 100.
   LP ≤ 0.8·avg → green, ≤ avg → blue, ≤ avg + 0.2·(max − avg) → purple, < max → gold, = max → orange. */
const LP_TIER_COLORS = ['#6cfb4b', '#8080ff', '#aa32ff', '#ffdc50', '#ff6000'];
const LP_TIER_NAMES = ['зелений', 'блакитний', 'фіолетовий', 'золотий', 'помаранчевий'];
function luckyAvg(g) {
  return Math.floor(10 * g.lucky_point_roll.reduce((t, r) => t + r.points * r.prob, 0) + 0.5);
}
function luckyTier(g, lp) {
  const avg = luckyAvg(g), max = 100;
  if (lp <= 0.8 * avg) return 0;
  if (lp <= avg) return 1;
  if (lp <= avg + 0.2 * (max - avg)) return 2;
  return lp < max ? 3 : 4;
}
// The portrait form (1..4) follows the lucky points tier. Seen in game (Тай Інь): LP 23 (green) → form 1,
// LP 46 (blue) → form 2, LP 56 (purple) → form 3; Тай Чін LP 82 (gold) → form 4. Orange (100) → 4 assumed.
const TIER_FORM = [1, 2, 3, 4, 4];
const autoForm = () => TIER_FORM[luckyTier(genie(), C.lp)];
const currentForm = () => C.form || autoForm();

/* Layout tweaks on top of the game window layout: drop controls that do nothing in a calculator,
   center «Стихії», make both windows the same height. */
const ELF_LAYOUT = {
  h: 640,                                                          // + elements, 2×4 skill slots, actions (see buildElfExtras)
  skip: ['Edit_all', 'Btn_OK', 'Btn_Safe', 'Btn_EXP+', 'Btn_Close', 'Control_280432229', 'Txt_Chengzhang',
    'Progress_EXP', 'Lab_EXP', 'Txt_EXP'],
  // grid of the game window: info box x 98..288 (labels at 104), status box x 30..288 / y 153..273,
  // item slots x 49..264 (center 156.5), stat buttons «+» then «−» with a 16 px step
  move: {
    Txt_Level: { x: 22, y: 52 },                                   // «Рів. [__]» + level buttons (see LEVEL_BTN_X)
    Txt_Name: { x: 98, y: 49, w: 190, h: 15, align: 'center' },    // centered on the info box next to the portrait
    Control_38306375: { h: 61 },                                   // info box 73..134 leaves room for «Статус»
    Control_194810476: { x: 25, w: 263 },                          // status box 25..288: symmetric around the slots axis 156.5
    Control_126851144: { x: 25, y: 132, w: 263, h: 15, align: 'center' },   // «Статус»: 3 px above its box, like «Предмет»
    Txt_PointEx: { x: 201, y: 166 },                               // value column of «Спрт» / «Інтл»
    Btn_Cancel: { x: 118.5, y: 240, w: 76 },                       // on the common axis 156.5
    Control_160645982: { x: 49, y: 272, w: 215, h: 15, align: 'center' },  // «Предмет» centered over the slots
    Btn_Element: { x: 65.5, y: 342 },                              // [Стихії][Стихії під скіли] centered on 156.5
    Edi_Bg: { h: 630 }, Edi_Bg1: { h: 587 },                       // the window grows for the new blocks
  },
};
const GENIUS_LAYOUT = {
  h: 441,
  skip: ['Img_Light', 'Btn_Skilllook'],
  move: { Edi_Bg: { h: 431 }, Edi_Bg2: { h: 132 } },
};

/* ---------- generic renderer for game-style dialogs (site/ui/dialogs.json) ---------- */
function renderGameDialog(dlg0, opts = {}) {
  const dlg = { ...dlg0, h: opts.h || dlg0.h,
    controls: dlg0.controls.map((c) => ({ ...c, ...((opts.move || {})[c.name] || {}) })) };
  const root = h('div', { class: 'gd', style: `width:${dlg.w}px;height:${dlg.h}px` });
  const el = {};
  for (const c of dlg.controls) {
    if (c.x < -500 || c.y < -500 || (opts.skip || []).includes(c.name)) continue;
    const n = h('div', { class: `gc gc-${c.type.toLowerCase()}`, 'data-name': c.name });
    n.style.left = `${c.x}px`;
    n.style.top = `${c.y}px`;
    if (c.w) n.style.width = `${c.w}px`;
    if (c.h) n.style.height = `${c.h}px`;
    if (c.align === 'center') n.classList.add('center');
    const img = c.img || {};
    const frame = img.FrameImage || img.FrameUpImage;
    if (frame && c.type !== 'PROGRESS') {
      const [tw, th] = c.tex || [c.w, c.h];
      const stretchy = c.w && c.h && (Math.abs(tw - c.w) > 8 || Math.abs(th - c.h) > 8) && tw === th && tw >= 60;
      if (stretchy) {          // 9-slice frame
        const sl = Math.floor(tw / 3);
        n.style.borderStyle = 'solid';
        n.style.borderWidth = `${sl}px`;
        n.style.borderImage = `url("${frame}") ${sl} fill / ${sl}px stretch`;
        n.style.boxSizing = 'border-box';
      } else n.style.backgroundImage = `url("${frame}")`;
    }
    if (c.type === 'STILLIMAGEBUTTON') {
      n.setAttribute('role', 'button');
      n.tabIndex = 0;
      if (img.FrameOnHoverImage) n.style.setProperty('--hover', `url("${img.FrameOnHoverImage}")`);
      if (img.FrameDownImage) n.style.setProperty('--down', `url("${img.FrameDownImage}")`);
    }
    if (c.type === 'PROGRESS') {
      n.style.backgroundImage = `url("${img.FrameImage}")`;
      const fill = h('div', { class: 'fill', style: `background-image:url("${img.FillImage}")` });
      n.append(fill);
    }
    if (c.text != null && c.type !== 'EDIT') {
      const t = h('span', { class: 'txt' });
      t.textContent = c.text;
      t.style.fontSize = `${Math.round(c.size * 1.1)}px`;
      if (c.color) t.style.color = c.color;
      if (c.bold) t.style.fontWeight = '700';
      n.append(t);
    }
    if (c.hint) {
      const key = `${dlg.name}.${c.name}`;
      HINTS[key] = c.hint;
      n.dataset.tip = `hint:${key}`;
    }
    el[c.name] = n;
    root.append(n);
  }
  return { root, el };
}
const setText = (node, text, color) => {
  const t = node.querySelector('.txt') || node.appendChild(h('span', { class: 'txt' }));
  t.textContent = text;
  if (color) t.style.color = color;
};
function fitScale(wrap, dlg, hh) {
  const avail = wrap.parentElement.clientWidth || dlg.w;
  const s = Math.min(1.35, Math.max(0.6, (avail - 2) / dlg.w));
  wrap.style.width = `${dlg.w * s}px`;
  wrap.style.height = `${(hh || dlg.h) * s}px`;
  wrap.firstChild.style.transform = `scale(${s})`;
}

/** The genie window is as tall as the skill tree next to it (side by side), else as wide as the column;
 *  the elements window opens over it at the same scale. */
function refitElf() {
  if (!W) return;
  const wrap = $('#win-elf'), dlg = UI.Win_CharacterELF, hh = ELF_LAYOUT.h;
  const tree = document.querySelector('.tree-wrap');
  const side = innerWidth > 860 && tree && tree.offsetHeight;
  const s = clamp(side ? tree.offsetHeight / hh : (wrap.parentElement.clientWidth - 2) / dlg.w, 0.6, side ? 1.6 : 1.35);
  wrap.style.width = `${dlg.w * s}px`;
  wrap.style.height = `${hh * s}px`;
  wrap.firstChild.style.transform = `scale(${s})`;
  const g = $('#win-genius');
  g.style.width = `${UI.Win_ELFGenius.w * s}px`;
  g.style.height = `${GENIUS_LAYOUT.h * s}px`;
  g.firstChild.style.transform = `scale(${s})`;
}

/* ---------- extra blocks of the genie window (not in the game window, drawn with its controls) ---------- */
const elfCtl = (name) => UI.Win_CharacterELF.controls.find((c) => c.name === name);
/** A copy of a control of the genie window (its texture and font) at another place. */
function gameCtl(tplName, over) {
  const c = { ...elfCtl(tplName), hint: null, ...over };
  const n = renderGameDialog({ ...UI.Win_CharacterELF, controls: [c] }).el[c.name];
  W.root.append(n);
  W.el[c.name] = n;
  return n;
}
/** A small «+» / «−» button of the game. */
function gameBtn(x, y, tplName, tip, fn) {
  const img = elfCtl(tplName).img;
  const b = h('div', { class: 'gc gc-stillimagebutton', role: 'button', tabindex: 0, 'data-tip': `text:${tip}`,
    style: `left:${x}px;top:${y}px;width:14px;height:14px;background-image:url("${img.FrameUpImage}");`
      + `--hover:url("${img.FrameOnHoverImage}");--down:url("${img.FrameDownImage}")` });
  b.addEventListener('click', fn);
  W.root.append(b);
  return b;
}
let EL_IN = [], STAT_IN = [];
const statBase = (s) => genie().init[s] + equipped().reduce((t, x) => t + (x.stats[s] || 0), 0);

function buildElfExtras() {
  // [Стихії][Стихії під скіли] in one row
  const fit = gameCtl('Btn_Element', { name: 'Btn_FitElems', x: 143.5, y: 342, w: 104, text: 'Стихії під скіли' });
  fit.id = 'c-fit-elems';
  fit.dataset.tip = 'text:Виставити стихії, потрібні вибраним скілам';
  // «Стихії»: a box like «Статус», two columns like the stats: label, input, «+», «−»
  gameCtl('Control_126851144', { name: 'Lbl_Elems', x: 25, y: 366.5, w: 263, h: 15, align: 'center', text: 'Стихії' });
  gameCtl('Control_194810476', { name: 'Box_Elems', x: 25, y: 389, w: 263, h: 70 });
  const cell = (k) => ({ col: k < 3 ? 0 : 1, y: 393 + 21 * (k % 3) });
  const COLX = [{ lab: 36, inp: 86, btn: 116 }, { lab: 160, inp: 212, btn: 242 }];   // left: as the stats
  ELEMS.forEach((el, i) => {
    const { col, y } = cell(i), X = COLX[col];
    const lab = gameCtl('Lab_STR', { name: `Lab_El${i}`, x: X.lab, y, text: `${ELEM_UK[el]}:` });
    lab.querySelector('.txt').classList.add('el', `el-${el}`);
    const box = gameCtl('Txt_AGI', { name: `Txt_El${i}`, x: X.inp, y, w: 26, h: 19, text: '' });
    EL_IN[i] = inlineInput(box, { width: 26, label: `${ELEM_UK[el]}: очки стихії (0–${ELEMENT_CAP})`,
      onInput: (v) => {
        if (v === '') return;
        C.elems[i] = clamp(+v || 0, 0, Math.min(ELEMENT_CAP, C.elems[i] + freeElems()));
        renderCalc();
      } });
    const change = (d) => {
      const next = C.elems[i] + d;
      if (next < 0 || next > ELEMENT_CAP || (d > 0 && freeElems() <= 0)) return;
      C.elems[i] = next; renderCalc();
    };
    gameBtn(X.btn, y + 1, 'Btn_AddSTR', `+1 до «${ELEM_UK[el]}» (Shift — до максимуму)`,
      (ev) => { for (let n = ev.shiftKey ? ELEMENT_CAP : 1; n-- > 0;) change(1); });
    gameBtn(X.btn + 16, y + 1, 'Btn_MinusSTR', `−1 до «${ELEM_UK[el]}» (Shift — до нуля)`,
      (ev) => { for (let n = ev.shiftKey ? ELEMENT_CAP : 1; n-- > 0;) change(-1); });
  });
  const { y } = cell(5);
  gameCtl('Lab_STR', { name: 'Lab_ElFree', x: COLX[1].lab, y, text: 'Вільні:' });
  gameCtl('Txt_AGI', { name: 'Txt_ElFree', x: COLX[1].inp, y, w: 60, h: 19, text: '' }).dataset.tip =
    'text:Вільні очки стихій / усього: 1 + 1 за кожні 5 рівнів до 100, далі +1 за рівень';
  // «Скіли N/M» + 2×4 slots on the columns of the item slots
  gameCtl('Control_160645982', { name: 'Lbl_Skills', x: 49, y: 459, w: 215, h: 15, align: 'center', text: '' })
    .querySelector('.txt').innerHTML = 'Скіли <span id="c-slots"></span>';
  W.root.append(h('div', { id: 'c-skill-slots', class: 'gc skill-slots-g', style: 'left:49px;top:482px' }));
  // what the skills need + actions
  W.root.append(h('div', { class: 'gc gneed', style: 'left:25px;top:562px;width:263px;height:48px' },
    '<div id="c-need"></div><div id="c-fit-msg"></div>'));
  const save = gameCtl('Btn_Cancel', { name: 'Btn_Save', x: 34.5, y: 604, w: 76, text: 'Зберегти' });
  const share = gameCtl('Btn_Cancel', { name: 'Btn_Share', x: 118.5, y: 604, w: 76, text: 'Посилання' });
  const reset = gameCtl('Btn_Cancel', { name: 'Btn_Reset', x: 202.5, y: 604, w: 76, text: 'Скинути' });
  Object.assign(save, { id: 'c-save' }).dataset.tip = 'text:Зберегти білд у вкладку «Білди» (нік, клас, категорія, коментар)';
  save.addEventListener('click', () => openSaveBuild());
  Object.assign(share, { id: 'c-share' }).dataset.tip = 'text:Скопіювати посилання на цю збірку';
  Object.assign(reset, { id: 'c-reset' }).dataset.tip = 'text:Почати збірку з нуля';
}

/* ---------- init ---------- */
async function initCalc() {
  G.equipment.forEach((e) => { EQ_BY_ID[e.id] = e; });
  UI = await fetch('ui/dialogs.json').then((r) => r.json());
  C.genie = G.genies[0].id;
  C.skills = [...G.genies[0].init_skills];   // a fresh genie comes with its start skill

  // genie picker (top bar)
  const pick = $('#c-genies');
  for (const [src, title] of [['npc', "Джин"]]) {
    const grp = h('div', { class: 'gpick' }, `<small>${esc(title)}</small>`);
    const row = h('div', { class: 'gpick-row' });
    G.genies.filter((g) => g.source === src).forEach((g) => {
      const b = h('button', { type: 'button', class: 'gbtn', 'data-tip': `genie:${g.id}`, 'aria-label': g.name },
        `<img src="${g.forms[0]}" alt="">`);
      b.onclick = () => {
        // a new genie comes with its start skill (as in the game); swap it if only the old start skill was there
        const old = genie().init_skills;
        C.skills = [...g.init_skills, ...C.skills.filter((id) => !old.includes(id) && !g.init_skills.includes(id))].slice(0, 8);
        C.genie = g.id;
        if (fixedLucky(g)) { C.rolls = []; C.lp = maxLucky(C.level); }
        renderCalc();
      };
      row.append(b);
    });
    grp.append(row);
    pick.append(grp);
  }
  // the two game windows
  W = renderGameDialog(UI.Win_CharacterELF, ELF_LAYOUT);
  buildElfExtras();
  WG = renderGameDialog(UI.Win_ELFGenius, GENIUS_LAYOUT);
  $('#win-elf').append(W.root);
  $('#win-genius').append(WG.root);
  wireElfWindow();
  wireGeniusWindow();
  addEventListener('resize', refitElf);
  new ResizeObserver(() => requestAnimationFrame(refitElf)).observe($('#tab-calc'));

  // skills: 2×4 slots + the in-game skill tree picker
  await initSkillTree();
  $('#c-share').onclick = async () => {
    const url = `${location.origin}${location.pathname}#calc/${saveCalcState()}`;
    try { await navigator.clipboard.writeText(url); setText($('#c-share'), 'Скопійовано ✓'); } catch { prompt('Посилання на збірку:', url); }
    setTimeout(() => { setText($('#c-share'), 'Посилання'); }, 1500);
  };
  $('#c-reset').onclick = () => {
    Object.assign(C, { level: 1, lp: 0, form: 0, rolls: [], alloc: [0, 0, 0, 0], elems: [0, 0, 0, 0, 0],
      equip: { jade: 0, amulet: 0, mirror: 0, pearl: 0 }, skills: [], build: '' });
    renderCalc();
  };
  initEquipPicker();
}

let FORCE_INPUTS = false;
/** The user is typing in this input: do not overwrite it while rendering (except after «change»). */
const typing = (inp) => !FORCE_INPUTS && document.activeElement === inp;
/** Replace a label of the game window with an inline number input («Ур.[  ]», «[  ]/60»). */
function inlineInput(node, { prefix = '', suffix = false, width, label, onInput }) {
  node.replaceChildren();
  node.classList.add('has-input');
  if (prefix) node.append(h('span', { class: 'txt' }, esc(prefix)));
  const inp = h('input', { type: 'number', class: 'ginput', inputmode: 'numeric', 'aria-label': label,
    style: `width:${width}px` });
  inp.addEventListener('input', () => onInput(inp.value));
  inp.addEventListener('change', () => { FORCE_INPUTS = true; renderCalc(); FORCE_INPUTS = false; });   // show the clamped value
  inp.addEventListener('focus', () => inp.select());
  node.append(inp);
  if (suffix) node.append(h('span', { class: 'txt suffix' }));
  node.dataset.tip = `text:${label}`;
  return inp;
}
let IN_LEVEL = null, IN_LP = null;
const LEVEL_BTN_X = 70;            // «Рів.» 22..42, input 44..68, «+» 70..84, «−» 86..100, name at 104

function wireElfWindow() {
  const e = W.el;
  IN_LEVEL = inlineInput(e.Txt_Level, { prefix: 'Рів.', width: 26,
    label: 'Рівень джина (1–105). Кожні 10 рівнів джин випадково отримує додаткові очки — вони нарахуються самі',
    onInput: (v) => { if (v !== '') setLevel(+v || 1); } });
  IN_LP = inlineInput(e.Txt_PointEx, { suffix: true, width: 28,
    label: 'Додаткові очки (очки удачі): кожні 10 рівнів джин отримує 1–10 очок. Можна змінити вручну',
    onInput: (v) => { if (v !== '') { C.lp = clamp(+v || 0, 0, maxLucky(C.level)); renderCalc(); } } });
  // ▲▼ next to the level and a dice next to the lucky points — drawn with the game's own +/- textures
  // same order and step as the stat buttons: «+» then «−», 16 px apart; vertically centered on the input
  gameBtn(LEVEL_BTN_X, 54, 'Btn_AddSTR', '+1 рівень (Shift — +10). На кожному 10-му рівні — кидок додаткових очок',
    (ev) => setLevel(C.level + (ev.shiftKey ? 10 : 1)));
  gameBtn(LEVEL_BTN_X + 16, 54, 'Btn_MinusSTR', '−1 рівень (Shift — −10)', (ev) => setLevel(C.level - (ev.shiftKey ? 10 : 1)));
  // the dice follows the «/max» text inside the same row, so it never drifts
  const dice = h('span', { class: 'dice', role: 'button', tabindex: 0,
    'data-tip': 'text:Перекинути всі кидки додаткових очок (за шансами цього джина)' }, '🎲');
  dice.addEventListener('click', (ev) => { ev.stopPropagation(); rerollLucky(); renderCalc(); });
  e.Txt_PointEx.append(dice);
  const click = (node, fn) => { if (node) node.addEventListener('click', fn); };
  STATS.forEach((s, i) => {
    const k = STAT_CTRL[s];
    // the value is an input: type the stat you want, the points are spent (as far as they go)
    STAT_IN[i] = inlineInput(e[`Txt_${k}`], { width: 28, label: `${STAT_UK[s]}: введіть потрібне значення`,
      onInput: (v) => {
        if (v === '') return;
        const free = freePoints() + statCost(C.alloc[i]);
        let want = Math.max(0, (+v || 0) - statBase(s));
        while (want > 0 && statCost(want) > free) want--;
        C.alloc[i] = want; renderCalc();
      } });
    const change = (d) => {
      const next = C.alloc[i] + d;
      if (next < 0) return;
      if (d > 0 && freePoints() - (statCost(next) - statCost(C.alloc[i])) < 0) return;
      C.alloc[i] = next; renderCalc();
    };
    click(e[`Btn_Add${k}`], (ev) => { for (let n = ev.shiftKey ? 10 : 1; n-- > 0;) change(1); });
    click(e[`Btn_Minus${k}`], (ev) => { for (let n = ev.shiftKey ? 10 : 1; n-- > 0;) change(-1); });
    [`Btn_Add${k}`, `Btn_Minus${k}`].forEach((b) => {
      if (e[b]) e[b].dataset.tip = `text:${b.includes('Add') ? '+1' : '−1'} до «${STAT_UK[s]}» (Shift — по 10)`;
    });
  });
  click(e.Btn_Cancel, () => { C.alloc = [0, 0, 0, 0]; renderCalc(); });
  if (e.Btn_Cancel) e.Btn_Cancel.dataset.tip = 'text:Скинути розподілені очки характеристик';
  if (e.Btn_OK) e.Btn_OK.dataset.tip = 'text:У калькуляторі зміни застосовуються одразу';
  click(e.Btn_Element, () => { $('#win-genius').hidden = !$('#win-genius').hidden; renderCalc(); });
  ['Btn_Safe', 'Btn_EXP+', 'Btn_Close'].forEach((b) => { if (e[b]) { e[b].classList.add('off'); e[b].dataset.tip = 'text:Недоступно в калькуляторі'; } });
  // portrait: click cycles the form
  click(e.Img_Elf, () => { C.form = currentForm() % 4 + 1; if (C.form === autoForm()) C.form = 0; renderCalc(); });
  if (e.Img_Elf) e.Img_Elf.dataset.tip = 'portrait';
  if (e.Txt_Name) { e.Txt_Name.classList.add('link'); e.Txt_Name.dataset.tip = 'text:Оберіть джина у верхній панелі'; }
  // equipment slots
  for (const [slot, n] of Object.entries(SLOT_CTRL)) {
    const box = e[`Img_0${n}`], item = e[`Item_${n}`];
    [box, item].forEach((x) => { if (x) { x.classList.add('slot'); x.addEventListener('click', () => openEquipPicker(slot)); } });
  }
}

function wireGeniusWindow() {
  const e = WG.el;
  ELEMS.forEach((el, i) => {
    const btn = e[`Btn_${i}`];
    if (!btn) return;
    const change = (d) => {
      const next = C.elems[i] + d;
      if (next < 0 || next > ELEMENT_CAP || (d > 0 && freeElems() <= 0)) return;
      C.elems[i] = next; renderCalc();
    };
    btn.addEventListener('click', (ev) => change(ev.shiftKey ? -1 : 1));
    btn.addEventListener('contextmenu', (ev) => { ev.preventDefault(); change(-1); });
    HINTS[`Win_ELFGenius.Btn_${i}`] += '\n^a0a0a0Права кнопка миші або Shift+клік — зменшити.';
  });
  e.Btn_Close?.addEventListener('click', () => { $('#win-genius').hidden = true; });
  if (e.Btn_Skilllook) {
    e.Btn_Skilllook.dataset.tip = 'text:Показати скіли, які підходять під ці стихії';
    e.Btn_Skilllook.addEventListener('click', () => {
      ELEMS.forEach((el, i) => { F.my[el] = C.elems[i]; });
      document.querySelectorAll('#f-my-elems input').forEach((inp, i) => { inp.value = C.elems[i]; });
      $('#f-fit').checked = true;
      $('#f-lvl').value = C.level;
      document.querySelector('.fits').open = true;
      location.hash = 'skills';
      renderSkills();
    });
  }
}

/* ---------- render ---------- */
function renderCalc() {
  const g = genie();
  C.level = clamp(C.level, 1, MAX_LEVEL);
  C.lp = clamp(C.lp, 0, maxLucky(C.level));
  while (freePoints() < 0) { const i = C.alloc.findLastIndex((a) => a > 0); if (i < 0) break; C.alloc[i]--; }
  while (freeElems() < 0) { const i = C.elems.findLastIndex((a) => a > 0); if (i < 0) break; C.elems[i]--; }
  for (const s of SLOTS) if (EQ_BY_ID[C.equip[s]]?.req_level > C.level) C.equip[s] = 0;

  // top bar
  document.querySelectorAll('.gbtn').forEach((b) => b.classList.toggle('sel', b.dataset.tip === `genie:${C.genie}`));

  const eq = equipped();
  const eqStat = (s) => eq.reduce((t, x) => t + (x.stats[s] || 0), 0);
  const stat = {};
  STATS.forEach((s, i) => { stat[s] = g.init[s] + C.alloc[i] + eqStat(s); });
  const energy = 100 + stat.vitality;
  const regen = 1 + 0.02 * stat.intellect;

  // genie window
  const e = W.el;
  setText(e.Txt_Name, g.name, `#${g.color}`);
  if (!typing(IN_LEVEL)) IN_LEVEL.value = C.level;
  if (fixedLucky(g)) C.lp = maxLucky(C.level);
  if (!typing(IN_LP)) IN_LP.value = C.lp;
  IN_LP.max = maxLucky(C.level);
  IN_LP.disabled = fixedLucky(g);
  e.Txt_PointEx.dataset.tip = fixedLucky(g)
    ? 'text:Джин із Загадкової лампи завжди має максимум додаткових очок'
    : 'text:Додаткові очки (очки удачі): кожні 10 рівнів джин отримує 1–10 очок. Можна змінити вручну';
  e.Txt_PointEx.querySelector('.dice').hidden = fixedLucky(g);
  e.Txt_PointEx.querySelector('.suffix').textContent = `/${maxLucky(C.level)}`;
  e.Img_Elf.style.backgroundImage = `url("${g.avatars[currentForm() - 1]}")`;
  const tier = luckyTier(g, C.lp);
  IN_LP.style.color = LP_TIER_COLORS[tier];
  e.Txt_PointEx.querySelector('.suffix').style.color = LP_TIER_COLORS[tier];
  setText(e.Txt_Power, `${energy}/${energy}`);
  setText(e.Txt_ReplyPower, `${regen.toFixed(2)}/сек.`);
  setText(e.Txt_Endurance, '999999/999999');
  setText(e.Txt_Shengyudian, String(freePoints()));
  // like the game: the value is green when equipment adds to this stat
  STATS.forEach((s, i) => {
    if (!typing(STAT_IN[i])) STAT_IN[i].value = stat[s];
    STAT_IN[i].style.color = eqStat(s) ? '#00ff00' : '#ffffff';
  });
  ELEMS.forEach((el, i) => { if (!typing(EL_IN[i])) EL_IN[i].value = C.elems[i]; });
  setText(e.Txt_ElFree, `${freeElems()}/${elementPoints(C.level)}`, freeElems() ? '#ffffff' : '#a0a0a0');
  for (const [slot, n] of Object.entries(SLOT_CTRL)) {
    const it = EQ_BY_ID[C.equip[slot]];
    const node = e[`Item_${n}`];
    node.style.backgroundImage = it ? `url("icons/items/${it.id}.png")` : '';
    node.dataset.tip = it ? `item:${it.id}` : `text:${SLOT_UK[slot]}: порожньо — натисніть, щоб вибрати`;
  }
  e.Btn_Element.classList.toggle('on', !$('#win-genius').hidden);

  // element window
  const ge = WG.el;
  setText(ge.Txt_Total, String(elementPoints(C.level)));
  setText(ge.Txt_Remain, String(freeElems()));
  ELEMS.forEach((el, i) => {
    setText(ge[`Txt_${i}`], String(C.elems[i]));
    const bar = ge[`Img_${i}`];
    const c = UI.Win_ELFGenius.controls.find((x) => x.name === `Img_${i}`);
    const frames = Math.round(c.tex[1] / c.h);
    bar.style.backgroundSize = `100% ${frames * 100}%`;
    bar.style.backgroundPosition = `0 ${(C.elems[i] / (frames - 1)) * 100}%`;
  });

  renderSkillSlots();
  renderTreeState();
  if ($('#eq-dlg').open) renderEquipPicker();
  if (calcReady && location.hash.startsWith('#calc')) history.replaceState(null, '', `#calc/${saveCalcState()}`);
  if (typeof renderCalcBuild === 'function') renderCalcBuild();
}

/* ---------- equipment picker (opens from the empty slots in «Предмет») ---------- */
let pickSlot = 'jade';
function initEquipPicker() {
  $('#eq-dlg-remove').onclick = () => { C.equip[pickSlot] = 0; $('#eq-dlg').close(); renderCalc(); };
}
function openEquipPicker(slot) {
  pickSlot = slot;
  renderEquipPicker();
  $('#eq-dlg').showModal();
}
function renderEquipPicker() {
  const items = G.equipment.filter((x) => x.slot === pickSlot);
  $('#eq-dlg-title').textContent = `${SLOT_UK[pickSlot]} — рівень джина ${C.level}`;
  const lines = [...new Set(items.filter((x) => x.tab !== 'Медаль').map((x) => x.row))];
  const grid = $('#eq-dlg-grid');
  grid.innerHTML = `<div></div>${[1, 2, 3, 4, 5, 6].map((n) => `<div class="ch">${n} рів.</div>`).join('')}`;
  const cell = (x) => {
    const ok = x.req_level <= C.level;
    const b = h('button', { type: 'button', class: `cell${C.equip[pickSlot] === x.id ? ' sel' : ''}${ok ? '' : ' locked'}`,
      'aria-label': x.name }, itemIcon(x.id, 'ci'));
    b.onclick = () => {
      if (!ok) return;
      C.equip[pickSlot] = x.id; $('#eq-dlg').close(); renderCalc();
    };
    return b;
  };
  for (const r of lines) {
    const row = items.filter((x) => x.tab !== 'Медаль' && x.row === r).sort((a, b) => a.col - b.col);
    grid.append(h('div', { class: 'rh' }, esc(STAT_UK[STATS.find((s) => row[0].stats[s])])));
    row.forEach((x) => grid.append(cell(x)));
  }
  const medal = items.filter((x) => x.tab === 'Медаль').sort((a, b) => a.col - b.col);
  if (medal.length) {
    grid.append(h('div', { class: 'rh' }, 'Медаль'));
    medal.forEach((x) => grid.append(cell(x)));
  }
  $('#eq-dlg-remove').disabled = !C.equip[pickSlot];
}

/* ---------- URL state ---------- */
/** The calculator state as URL params. withBuild: keep «b» — the id of the player's build this state came from. */
function saveCalcState({ withBuild = true } = {}) {
  const p = new URLSearchParams({
    g: C.genie, l: C.level, lp: C.lp, s: C.alloc.join(','), e: C.elems.join(','),
    q: SLOTS.map((s) => C.equip[s]).join(','), k: C.skills.join(','),
  });
  if (C.form) p.set('f', C.form);
  const kl = C.skills.filter((id) => C.skillLv?.[id]).map((id) => `${id}:${C.skillLv[id]}`).join(',');
  if (kl) p.set('kl', kl);
  if (withBuild && C.build) p.set('b', C.build);
  return p.toString().replace(/%2C/g, ',').replace(/%3A/g, ':');
}
function loadCalcState(str) {
  const p = new URLSearchParams(str);
  const nums = (k, n) => (p.get(k) || '').split(',').map((x) => +x || 0).concat(Array(n).fill(0)).slice(0, n);
  if (p.has('g')) C.genie = +p.get('g');
  if (!G.genies.some((g) => g.id === C.genie && g.source === 'npc')) C.genie = G.genies[0].id;
  C.level = +p.get('l') || 1;
  C.lp = +p.get('lp') || 0;
  C.rolls = rollsFor(C.lp, Math.floor(clamp(C.level, 1, MAX_LEVEL) / 10));
  C.form = clamp(+p.get('f') || 0, 0, 4);
  C.alloc = nums('s', 4);
  C.elems = nums('e', 5).map((v) => clamp(v, 0, ELEMENT_CAP));
  const q = nums('q', 4);
  SLOTS.forEach((s, i) => { C.equip[s] = EQ_BY_ID[q[i]] && EQ_BY_ID[q[i]].slot === s ? q[i] : 0; });
  C.skills = (p.get('k') || '').split(',').map(Number).filter((id) => BY_ID[id]).slice(0, 8);
  C.skillLv = Object.fromEntries((p.get('kl') || '').split(',').map((x) => x.split(':').map(Number))
    .filter(([id, lv]) => BY_ID[id] && lv > 0));
  C.build = /^[0-9a-f-]{36}$/.test(p.get('b') || '') ? p.get('b') : '';
  renderCalc();
}
