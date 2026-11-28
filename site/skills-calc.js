'use strict';
/* ================= CALCULATOR: genie skill slots + in-game skill tree ================= */
/* globals from app.js / calc.js: $, h, esc, SKILLS, BY_ID, ELEMS, ELEM_UK, UI, C, genie, renderCalc, renderGameDialog,
   skillSlots, elementPoints, renderTooltip, iconSrc, fmtNum, totalSpirit, HINTS, clamp, ELEMENT_CAP */

let TREE = null;            // data/skilltree.json
const CAT_OF = {};          // skill id -> category {key, name} (data/categories.json, from guides)
let TW = {};                // rendered tree windows: {1: {root, el}, 2: ...}
const CELL_OF = {};         // skill id -> [cell nodes]
const SLOT_FRAME = 'ui/tex/104e973b0e45.png';   // the purple frame of the game tree cells

const selected = () => C.skills;
const myElems = () => Object.fromEntries(ELEMS.map((e, i) => [e, C.elems[i]]));
/** What blocks a skill right now: element points, genie level. */
function skillBlockers(s) {
  const el = myElems();
  const out = ELEMS.filter((e) => s.elements[e] > el[e]).map((e) => `${ELEM_UK[e]} ${el[e]}/${s.elements[e]}`);
  if (s.levels[0].genie_level > C.level) out.push(`рівень джина ${C.level}/${s.levels[0].genie_level}`);
  return out;
}
/** The highest skill level that can be learned at the current genie level (0 = none). */
const maxSkillLevel = (s) => s.levels.filter((l) => l.genie_level <= C.level).length;

/** One window with all 14 rows: «Початкові вміння» (rows 1-8) + the rows 9-14 of «Додаткові вміння». */
const T2_DX = 5, T2_DY = 315;          // tree 2 columns 195..355 -> 200..360 = tree 1 columns (as in the game); row 9 y 76 -> 391
const T2_EXTRA = 240;                  // 6 more rows
const INIT_ROW = 40;                   // + a first row «Стартові:» with the 4 start skills
const KEEP_TOP = new Set(['Edi_Bg', 'EditBox_14250688', 'Edit_01', 'Img_Title', 'Lbl_Title', 'Btn_Close']);
function mergeTrees(t1, t2) {
  const grow = new Set(['Edi_Bg', 'EditBox_14250688', 'Edit_01']);
  const controls = t1.controls.filter((c) => c.name !== 'Btn_Senior').map((c) => {
    if (grow.has(c.name)) return { ...c, h: c.h + T2_EXTRA + INIT_ROW };
    if (!KEEP_TOP.has(c.name) && c.y >= 60) return { ...c, y: c.y + INIT_ROW };
    return c;
  });
  controls.find((c) => c.name === 'Lbl_Title').text = 'Вміння джина';
  for (const c of t2.controls) {
    const row = /^Lbl_\d+级$/.test(c.name), cell = /^Skill2?_/.test(c.name);
    if ((!row && !cell) || c.x < -500 || c.y < -500) continue;
    controls.push({ ...c, name: `T2:${c.name}`, x: row ? 26 : c.x + T2_DX, y: c.y + T2_DY + INIT_ROW });
  }
  // first row: the start skills (in the game they are not in the tree)
  const lbl = t1.controls.find((c) => c.name === 'Lbl_1级');
  controls.push({ ...lbl, name: 'Lbl_init', text: 'Стартові:', y: lbl.y });
  TREE.initial.forEach((id, i) => {
    const x0 = 120 + (9 - TREE.initial.length) * 20;   // centered over the 9 tree columns
    controls.push({ type: 'IMAGEPICTURE', name: `Init_${i}`, x: x0 + 40 * i, y: 71, w: 34, h: 34, img: { FrameImage: SLOT_FRAME } });
    controls.push({ type: 'IMAGEPICTURE', name: `Init2_${i}`, x: x0 + 2 + 40 * i, y: 73, w: 30, h: 30 });
  });
  return { ...t1, name: 'Win_Elf_SkillTree', h: t1.h + T2_EXTRA + INIT_ROW, controls };
}

async function initSkillTree() {
  const [tree, cats] = await Promise.all(['data/skilltree.json', 'data/categories.json'].map((u) => fetch(u).then((r) => r.json())));
  TREE = tree;
  cats.categories.forEach((c) => {
    c.skills.forEach((id) => { CAT_OF[id] = c; });
    $('#t-cat').append(new Option(c.name, c.key));
  });
  const merged = mergeTrees(UI.Win_Elf_Skilltree1, UI.Win_Elf_Skilltree2);
  UI.Win_Elf_SkillTree = merged;
  const T = renderGameDialog(merged, {});
  TW = { 1: T, 2: T };
  const wrap = h('div', { class: 'gwin-wrap tree-wrap' });
  wrap.append(T.root);
  $('#tree-wins').append(wrap);
  // cells -> skills
  for (const c of TREE.cells) {
    const w = T.el;
    const pre = c.tree === 2 ? 'T2:' : '';
    const dx = c.tree === 2 ? T2_DX : 0, dy = (c.tree === 2 ? T2_DY : 0) + INIT_ROW;
    const frame = w[pre + c.cell];
    let icon = c.icon_cell && w[pre + c.icon_cell];
    if (!icon) {   // a cell without its own icon slot
      icon = h('div', { class: 'gc', style: `left:${c.x + dx + 2}px;top:${c.y + dy + 2}px;width:30px;height:30px` });
      T.root.append(icon);
    }
    icon.classList.add('tree-icon');
    if (!c.skill) {          // «Не відкрито»
      icon.dataset.tip = frame?.dataset.tip || 'text:Не відкрито';
      continue;
    }
    icon.style.backgroundImage = `url("${iconSrc(c.skill)}")`;
    icon.dataset.tip = `tree:${c.skill}`;
    icon.dataset.skill = c.skill;
    if (frame) {
      frame.dataset.tip = `tree:${c.skill}`; frame.dataset.skill = c.skill;
      // some cells (Рівновага) have the skill picture baked into the frame: use the common frame so filters dim it
      frame.style.backgroundImage = `url("${SLOT_FRAME}")`;
    }
    (CELL_OF[c.skill] ||= []).push(icon);
    [icon, frame].forEach((n) => n && n.addEventListener('click', () => toggleSkill(c.skill)));
    [icon, frame].forEach((n) => n && n.addEventListener('contextmenu', (ev) => { ev.preventDefault(); openSkillCard(c.skill); }));
  }
  if (T.el.Btn_Close) T.el.Btn_Close.hidden = true;    // the tree is always open next to the genie
  // start skills: the first row «Стартові:»
  TREE.initial.forEach((id, i) => {
    const icon = T.el[`Init2_${i}`], frame = T.el[`Init_${i}`];
    icon.classList.add('tree-icon');
    icon.style.backgroundImage = `url("${iconSrc(id)}")`;
    [icon, frame].forEach((n) => {
      n.dataset.tip = `tree:${id}`;
      n.addEventListener('click', () => toggleSkill(id));
      n.addEventListener('contextmenu', (ev) => { ev.preventDefault(); openSkillCard(id); });
    });
    (CELL_OF[id] ||= []).push(icon);
  });
  initTreeFilters();
  // slots
  const grid = $('#c-skill-slots');
  for (let i = 0; i < 8; i++) {
    const b = h('button', { type: 'button', class: 'sslot', 'data-i': i, style: `--frame:url("${SLOT_FRAME}")` });
    // filled slot: click removes; empty slot: points at the tree
    b.addEventListener('click', () => { const id = C.skills[i]; if (id) toggleSkill(id); else flashTree(); });
    b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); const id = C.skills[i]; if (id) openSkillCard(id); });
    grid.append(b);
  }
  $('#c-fit-elems').addEventListener('click', fitElementsToSkills);
  addEventListener('resize', fitTrees);
  new ResizeObserver(fitTrees).observe($('#tree-wins'));
  fitTrees();
}

function fitTrees() {
  const wrap = document.querySelector('.tree-wrap');
  const dlg = UI.Win_Elf_SkillTree;
  const avail = $('#tree-wins').clientWidth || dlg.w;
  // the whole tree visible without scrolling: from its place on the page down to the bottom of the screen
  const top = $('#tree-wins').getBoundingClientRect().top + scrollY;
  // phones / narrow screens (one column): fit the width, the page scrolls anyway
  const narrow = innerWidth <= 860;
  const s = narrow ? Math.max(0.3, Math.min(1.2, avail / dlg.w))
    : Math.max(0.5, Math.min(1.2, avail / dlg.w, (innerHeight - Math.max(64, top) - 12) / dlg.h));
  wrap.style.width = `${dlg.w * s}px`;
  wrap.style.height = `${dlg.h * s}px`;
  wrap.firstChild.style.transform = `scale(${s})`;
  refitElf();   // the genie window follows the tree height
}
function flashTree() {
  const t = $('#tree-wins');
  t.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
}
/** The full card of a skill (all levels) over the calculator. */
function openSkillCard(id) { location.hash = `skill/${id}`; }

/* ---------- filters: category, class, terrain, element, influence, available now ---------- */
function initTreeFilters() {
  const cls = $('#t-class');
  const used = new Set(SKILLS.flatMap((s) => s.classes));
  const NOT_ON_SERVER = ['Тінь', 'Буревій'];
  CLASSES.filter((c) => used.has(c) && !NOT_ON_SERVER.includes(c)).forEach((c) => cls.append(new Option(c, c)));
  ['#t-cat', '#t-class', '#t-terrain', '#t-elem', '#t-infl', '#t-avail']
    .forEach((q) => $(q).addEventListener('input', renderTreeState));
}
function skillPassesFilters(s) {
  const cls = $('#t-class').value, ter = $('#t-terrain').value, cat = $('#t-cat').value;
  if (cat && CAT_OF[s.id]?.key !== cat) return false;
  if (cls && s.classes.length && !s.classes.includes(cls)) return false;
  const where = TREE.terrain[s.id];                 // no entry = usable anywhere
  if (ter && where && !where.includes(ter)) return false;
  const el = $('#t-elem').value;
  if (el === 'none' ? ELEMS.some((e) => s.elements[e]) : el && !s.elements[el]) return false;
  const infl = $('#t-infl').value;
  if (infl) {
    const text = s.levels[0].tooltip.replace(/\^[0-9a-fA-F]{6}/g, '');
    const has = { strength: /Вплив сили/.test(text), agility: /Вплив спритності/.test(text) };
    if (infl === 'none' ? has.strength || has.agility : !has[infl]) return false;
  }
  if ($('#t-avail').checked && skillBlockers(s).length) return false;
  return true;
}

function toggleSkill(id) {
  const i = C.skills.indexOf(id);
  if (i >= 0) C.skills.splice(i, 1);
  else if (C.skills.length < 8) C.skills.push(id);
  renderCalc();
}

/** Fill the element points needed by the selected skills (if they fit). */
function fitElementsToSkills() {
  if (!C.skills.length) return;
  const need = ELEMS.map((e) => Math.max(0, ...C.skills.map((id) => BY_ID[id].elements[e])));
  const total = elementPoints(C.level);
  const sum = need.reduce((t, v) => t + v, 0);
  if (sum > total) {
    $('#c-fit-msg').textContent = `Не вистачає очок стихій: потрібно ${sum}, є ${total}.`;
    return;
  }
  C.elems = need.map((v) => clamp(v, 0, ELEMENT_CAP));
  $('#c-fit-msg').textContent = '';
  renderCalc();
}

/** States of the tree cells: selected / can learn now / blocked. */
function renderTreeState() {
  const slots = skillSlots(C.lp);
  let shown = 0;
  for (const [id, nodes] of Object.entries(CELL_OF)) {
    const s = BY_ID[id];
    const sel = C.skills.includes(+id);
    const blocked = skillBlockers(s).length > 0;
    const pass = skillPassesFilters(s);
    if (pass) shown++;
    nodes.forEach((n) => {
      n.classList.toggle('sel', sel);
      n.classList.toggle('blocked', blocked && !sel);
      n.classList.toggle('filtered', !pass && !sel);
    });
  }
  $('#t-count').textContent = `показано ${shown} з ${Object.keys(CELL_OF).length}`;
}

/** One tooltip for the two the game has: the learning one (NPC / tree: name, max level, element requirement,
 *  learning levels, short text) on top, then the skill itself at level 1 (genie window tooltip). */
function treeTooltip(id, level = 1, { plain = false } = {}) {   // plain: no calculator state (guide pages)
  const s = BY_ID[id];
  if (!s) return '';
  const learn = TREE.learn[id];
  const el = myElems();
  const muted = (t) => `<span style="color:#a0a0a0">${t}</span>`;
  const req = ELEMS.filter((e) => s.elements[e]).map((e) => {
    const ok = plain || el[e] >= s.elements[e];
    return `<span class="el el-${e}">${ELEM_UK[e]} ${s.elements[e]}</span>${ok ? '' : `<span style="color:#ff6a5a"> (є ${el[e]})</span>`}`;
  }).join(' ') || 'немає';
  const lvls = s.levels.map((l) => (plain || l.genie_level <= C.level ? `<span style="color:#fff">${l.genie_level}</span>`
    : muted(l.genie_level))).join(', ');
  const body = s.levels[level - 1].tooltip.split('\n').slice(1).join('\n').trim();
  const blockers = skillBlockers(s);
  const status = C.skills.includes(id) ? '<span style="color:#ffcb4a">✓ Вибрано — натисніть, щоб прибрати</span>'
    : blockers.length ? '<span style="color:#ff6a5a">Зараз не вивчити (чого бракує — вгорі); можна додати для планування</span>'
      : '<span style="color:#7dff5a">Можна вивчити — натисніть, щоб додати</span>';
  return `<div class="tt-head"><span style="color:#fff;font-weight:600">${esc(s.name)}</span><span>Рівень ${level} / ${s.max_level}</span></div>`
    + (learn && learn.name && learn.name !== s.name ? muted(`у вікні вивчення: «${esc(learn.name)}»`) + '\n' : '')
    + (CAT_OF[id] ? `<span style="color:#ffcb4a">Категорія:</span> ${esc(CAT_OF[id].name)}\n` : '')
    + `<span style="color:#ffcb4a">Вимога до елемента:</span> ${req}\n`
    + `<span style="color:#ffcb4a">Вивчається на рівнях джина:</span> ${lvls}`
    + '<hr class="tt-sep">'
    + renderTooltip(body, { head: false })
    + (plain ? `\n\n${muted('Клік — опис по всіх рівнях')}` : `\n\n${status}\n${muted('Правий клік — опис по всіх рівнях')}`);
}

function renderSkillSlots() {
  const slots = skillSlots(C.lp);
  $('#c-slots').textContent = `${C.skills.length}/${slots}`;
  $('#c-slots').style.color = C.skills.length > slots ? '#ff6a5a' : '#ffffff';
  document.querySelectorAll('#c-skill-slots .sslot').forEach((b, i) => {
    const id = C.skills[i];
    const s = id && BY_ID[id];
    b.classList.toggle('locked', i >= slots && !s);
    b.classList.toggle('over', i >= slots && !!s);
    b.classList.toggle('filled', !!s);
    b.innerHTML = s ? `<img src="${iconSrc(id)}" alt="">${maxSkillLevel(s) ? `<span class="lv">${maxSkillLevel(s)}</span>` : ''}` : '';
    b.classList.toggle('blocked', !!s && skillBlockers(s).length > 0);
    b.dataset.tip = s ? `tree:${id}` : i >= slots
      ? `text:Слот закритий: потрібно більше додаткових очок (>${[50, 70, 80, 90][i - 4] ?? 90})`
      : 'text:Порожній слот — виберіть скіл кліком у дереві праворуч';
    b.setAttribute('aria-label', s ? s.name : `Слот ${i + 1}`);
  });
  // what the selected skills need
  if (C.skills.length) {
    const need = Object.fromEntries(ELEMS.map((e) => [e, Math.max(0, ...C.skills.map((id) => BY_ID[id].elements[e]))]));
    const sum = ELEMS.reduce((t, e) => t + need[e], 0);
    const minLvl = Math.max(...C.skills.map((id) => BY_ID[id].levels[0].genie_level));
    const fullLvl = Math.max(...C.skills.map((id) => BY_ID[id].levels.at(-1).genie_level));
    const fits = sum <= elementPoints(C.level);
    $('#c-need').innerHTML = `Потрібно: ${ELEMS.filter((e) => need[e]).map((e) => `<span class="el el-${e}">${ELEM_UK[e]} ${need[e]}</span>`).join(' ') || '—'}
      — <b>${sum}</b>/${elementPoints(C.level)} <span class="${fits ? 'ok-t' : 'bad-t'}">${fits ? '✓' : '✗'}</span><br>
      Рівень джина від <b>${minLvl}</b>, усі на макс. — <b>${fullLvl}</b>`;
  } else $('#c-need').innerHTML = '<span class="muted">Виберіть скіли кліком у дереві праворуч.</span>';
  $('#c-fit-elems').classList.toggle('off', !C.skills.length);
  renderSkillCards();
}
