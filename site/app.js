'use strict';

/* ================= constants ================= */
const ELEMS = ['metal', 'wood', 'water', 'fire', 'earth'];
const ELEM_UK = { metal: 'Метал', wood: 'Дерево', water: 'Вода', fire: 'Вогонь', earth: 'Земля' };
const STATS = ['strength', 'agility', 'intellect', 'vitality'];
const STAT_UK = { strength: 'Сила', agility: 'Спритність', intellect: 'Інтелект', vitality: 'Витривалість' };
const STAT_HINT = {
  strength: 'шкода/шанс скілів, знижка енергії',
  agility: 'тривалість/шанс скілів, знижка енергії',
  intellect: 'відновлення енергії: +0,02/сек за очко',
  vitality: 'макс. енергія: +1 за очко',
};
const TYPE_UK = { attack: 'атака', buff: 'баф', debuff: 'дебаф', special: 'особливий' };
const SLOT_UK = { jade: 'Яшма', amulet: 'Амулет', mirror: 'Дзеркало', pearl: 'Перлина' };
const SLOTS = ['jade', 'amulet', 'mirror', 'pearl'];
const CLASSES = ['Воїн', 'Маг', 'Шаман', 'Друїд', 'Перевертень', 'Вбивця', 'Лучник', 'Жрець', 'Страж', 'Містик', 'Тінь', 'Буревій'];
const MAX_LEVEL = 105;

let SKILLS = [], BY_ID = {}, G = null, calcReady = false;

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const h = (tag, attrs = {}, html = '') => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  if (html) el.innerHTML = html;
  return el;
};
const elemBadges = (el) => ELEMS.filter((e) => el[e]).map((e) =>
  `<span class="el el-${e}">${ELEM_UK[e]} ${el[e]}</span>`).join(' ') || '<span class="el">без стихій</span>';
const iconSrc = (id) => `icons/skills/${id}.png`;
const fmtNum = (n) => Number(n).toLocaleString('uk-UA');
const enVal = (e) => (e === 'all' ? 9999 : e);
const enTxt = (e) => (e === 'all' ? 'вся' : e);

/** Render a game tooltip with ^rrggbb color codes. */
const CLASS_FIX = [[/кроме/g, 'крім'], [/воинов/g, 'воїнів'], [/воин/g, 'воїн'], [/оборотень/g, 'перевертень'],
  [/жрец(?!ь)/g, 'жрець'], [/зооморфов\.?/g, 'звіролюдей'], [/друид/g, 'друїд']];
function renderTooltip(raw, { head: useHead = true } = {}) {
  if (!raw) return '';
  // typos in the game texts: Cyrillic а/е/с inside color codes (e.g. «^ffcb4а»)
  raw = raw.replace(/\^[0-9a-fA-FаАеЕсС]{6}/g, (m) => m.replace(/[аА]/g, 'a').replace(/[еЕ]/g, 'e').replace(/[сС]/g, 'c'));
  // class names in «Обмеження:» were left untranslated in the game texts
  raw = raw.replace(/(Обмеження:)([^\n]*)/g, (m, a, b) => a + CLASS_FIX.reduce((t, [re, uk]) => t.replace(re, uk), b));
  const lines = raw.split('\n');
  const colorize = (txt) => {
    let out = '', open = false;
    for (const part of txt.split(/(\^[0-9a-fA-F]{6})/)) {
      if (/^\^[0-9a-fA-F]{6}$/.test(part)) {
        if (open) out += '</span>';
        out += `<span style="color:#${part.slice(1)}">`; open = true;
      } else out += esc(part).replace(/%%/g, '%');
    }
    return out + (open ? '</span>' : '');
  };
  // first line: "Name<ideographic spaces>Рівень N" → flex row
  const head = useHead ? lines[0].split(/　+/) : [lines[0].replace(/　+/g, ' ')];   // first line «Name   Level N» as a flex row
  const headHtml = head.length > 1
    ? `<div class="tt-head"><span>${colorize(head[0])}</span><span>${colorize(head.slice(1).join(' '))}</span></div>`
    : colorize(lines[0]) + (lines.length > 1 ? '\n' : '');
  return headHtml + colorize(lines.slice(1).join('\n').replace(/　/g, ' '));
}

/* ================= rules ================= */
const statCost = (alloc) => (alloc <= 40 ? alloc : 2 * alloc - 40);
const maxLucky = (lvl) => 10 * Math.floor(lvl / 10);
const totalStatPoints = (lvl, lp) => (lvl - 1) + lp;
// 1 + 1 per 5 levels up to 100, then +1 per level (confirmed in game: 13@62, 15@74, 22@101, 23@102)
const elementPoints = (lvl) => 1 + Math.floor(Math.min(lvl, 100) / 5) + Math.max(0, lvl - 100);
const skillSlots = (lp) => (lp > 90 ? 8 : lp > 80 ? 7 : lp > 70 ? 6 : lp > 50 ? 5 : 4);
const expToNext = (lvl, factor) => (lvl >= MAX_LEVEL ? 0 : Math.floor(G.player_exp[lvl - 1] * factor));

/* ================= routing ================= */
function route() {
  const hash = location.hash.slice(1) || 'calc';
  const [tab, arg] = hash.split('/');
  const name = ['calc', 'equip', 'presets', 'about', 'skill'].includes(tab) ? tab : 'calc';
  const shown = name === 'skill' ? 'calc' : name;   // skill cards open over the calculator
  document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.id !== `tab-${shown}`; });
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === shown));
  if (name === 'skill' && arg) openSkill(+arg);
  if (name === 'calc' && arg) loadCalcState(arg);
}

/* ================= SKILLS TAB ================= */
const F = { elems: new Set(), my: Object.fromEntries(ELEMS.map((e) => [e, 0])) };

function initSkillFilters() {
  const cls = $('#f-class');
  const used = new Set(SKILLS.flatMap((s) => s.classes));
  CLASSES.filter((c) => used.has(c)).forEach((c) => cls.append(new Option(c, c)));

  const chips = $('#f-elems');
  for (const e of ELEMS) {
    const b = h('button', { type: 'button', class: `chip el-${e}`, 'aria-pressed': 'false' }, ELEM_UK[e]);
    b.onclick = () => {
      F.elems.has(e) ? F.elems.delete(e) : F.elems.add(e);
      b.setAttribute('aria-pressed', F.elems.has(e));
      renderSkills();
    };
    chips.append(b);
  }
  const my = $('#f-my-elems');
  for (const e of ELEMS) {
    const inp = h('input', { type: 'number', min: 0, max: 30, value: 0 });
    inp.oninput = () => { F.my[e] = +inp.value || 0; renderSkills(); };
    const lab = h('label', { class: `el el-${e}` }, ELEM_UK[e] + ' ');
    lab.append(inp);
    my.append(lab);
  }
  ['#f-search', '#f-type', '#f-class', '#f-sort', '#f-lvl', '#f-fit'].forEach((s) =>
    $(s).addEventListener('input', renderSkills));
}

function skillMatches(s) {
  const q = $('#f-search').value.trim().toLowerCase();
  if (q && !(s.name.toLowerCase().includes(q) || s.native.includes(q) ||
    s.levels[0].tooltip.toLowerCase().includes(q))) return false;
  const type = $('#f-type').value;
  if (type && s.type !== type) return false;
  const cls = $('#f-class').value;
  if (cls === 'none' && s.classes.length) return false;
  if (cls && cls !== 'none' && s.classes.length && !s.classes.includes(cls)) return false;
  if (s.levels[0].genie_level > +$('#f-lvl').value) return false;
  for (const e of F.elems) if (!s.elements[e]) return false;
  if ($('#f-fit').checked && ELEMS.some((e) => s.elements[e] > F.my[e])) return false;
  return true;
}

const SORTS = {
  level: (a, b) => a.levels[0].genie_level - b.levels[0].genie_level || a.element_sum - b.element_sum,
  name: (a, b) => a.name.localeCompare(b.name, 'uk'),
  elsum: (a, b) => a.element_sum - b.element_sum || a.levels[0].genie_level - b.levels[0].genie_level,
  energy: (a, b) => enVal(a.levels.at(-1).energy) - enVal(b.levels.at(-1).energy),
  stamina: (a, b) => a.levels.at(-1).stamina - b.levels.at(-1).stamina,
  cooldown: (a, b) => a.levels[0].cooldown - b.levels[0].cooldown,
  spirit: (a, b) => totalSpirit(a) - totalSpirit(b),
  id: (a, b) => a.id - b.id,
};
const totalSpirit = (s) => s.levels.reduce((t, l) => t + l.spirit, 0);

function renderSkills() {
  $('#f-lvl-out').textContent = $('#f-lvl').value;
  const list = SKILLS.filter(skillMatches).sort(SORTS[$('#f-sort').value]);
  $('#f-count').textContent = `Знайдено: ${list.length} з ${SKILLS.length}`;
  const grid = $('#skill-grid');
  grid.replaceChildren(...list.map((s) => {
    const l0 = s.levels[0], ll = s.levels.at(-1);
    const card = h('button', { type: 'button', class: 'card' }, `
      <img src="${iconSrc(s.id)}" alt="" loading="lazy" data-tip="skill:${s.id}">
      <div><div class="nm">${esc(s.name)}</div>
        <div>${elemBadges(s.elements)}</div></div>
      <div class="sub">
        <span>рів. джина ${l0.genie_level}${s.max_level > 1 ? `–${ll.genie_level}` : ''}</span>
        <span>енергія ${enTxt(l0.energy)}${ll.energy !== l0.energy ? `–${enTxt(ll.energy)}` : ''}</span>
        <span>витрив. ${l0.stamina}${ll.stamina !== l0.stamina ? `–${ll.stamina}` : ''}</span>
        <span>КД ${l0.cooldown} с</span>
        <span class="tag ${s.type}">${TYPE_UK[s.type]}</span>
        ${s.classes.length ? `<span class="tag cls">${s.classes.join(', ')}</span>` : ''}
      </div>`);
    card.onclick = () => { location.hash = `skill/${s.id}`; };
    return card;
  }));
}

function openSkill(id) {
  const s = BY_ID[id];
  if (!s) return;
  const dlg = $('#skill-dlg');
  $('#d-icon').src = iconSrc(id);
  $('#d-name').textContent = s.name;
  $('#d-meta').innerHTML = `${elemBadges(s.elements)}
    <span class="tag ${s.type}">${TYPE_UK[s.type]}</span>
    ${s.classes.length ? `<span class="tag cls">лише: ${s.classes.join(', ')}</span>` : ''}
    <span>Дух усього: ${fmtNum(totalSpirit(s))}</span><span>ID ${s.id}</span>`;
  const slider = $('#d-lvl');
  slider.max = s.max_level; slider.value = 1;
  slider.parentElement.hidden = s.max_level === 1;
  const show = () => {
    const i = +slider.value - 1;
    $('#d-lvl-out').textContent = slider.value;
    $('#d-tooltip').innerHTML = renderTooltip(s.levels[i].tooltip);
    [...$('#d-table').tBodies[0].rows].forEach((r, k) => r.classList.toggle('cur', k === i));
  };
  $('#d-table').innerHTML = `<thead><tr><th>Рів.</th><th>Рів. джина</th><th>Дух</th><th>Енергія</th><th>Витрив.</th><th>КД, с</th>${
    s.levels[0].range ? '<th>Дальність</th>' : ''}</tr></thead><tbody>${s.levels.map((l, i) => `<tr>
      <td>${i + 1}</td><td>${l.genie_level}</td><td>${fmtNum(l.spirit)}</td><td>${enTxt(l.energy)}</td><td>${l.stamina}</td>
      <td>${l.cooldown}</td>${s.levels[0].range ? `<td>${l.range} м</td>` : ''}</tr>`).join('')}</tbody>`;
  [...$('#d-table').tBodies[0].rows].forEach((r, k) => { r.onclick = () => { slider.value = k + 1; show(); }; });
  slider.oninput = show;
  show();
  if (!dlg.open) dlg.showModal();
}

/* CALCULATOR: see calc.js */

/* ================= EQUIPMENT TAB ================= */
const CRAFT_TABS = ['Дзерк.', 'Яшма', 'Амулет', 'Перли', 'Медаль'];
const ITEM = {};          // id -> equipment or material
let craftTab = 'Яшма', craftSel = null;

const itemIcon = (id, cls = 'ii') => `<img class="${cls}" src="icons/items/${id}.png" alt="" data-tip="item:${id}" onerror="this.style.visibility='hidden'">`;
const statLine = (e) => STATS.filter((s) => e.stats[s]).map((s) => `${STAT_UK[s]} +${e.stats[s]}`).join(', ');

/** Game-like item tooltip. */
function itemTooltip(id) {
  const it = ITEM[id];
  if (!it) return '';
  const lines = [`<span style="color:#${it.color}">${esc(it.name)}</span>`];
  if (it.slot) {
    lines.push(`Обладнання: ${SLOT_UK[it.slot]}`, `Потрібний рівень джина: ${it.req_level}`, `Ціна: ${it.price}`);
    STATS.filter((s) => it.stats[s]).forEach((s) => lines.push(`${STAT_UK[s]} +${it.stats[s]}`));
  }
  return lines.join('\n') + (it.desc ? `\n\n${renderTooltip(it.desc)}` : '');
}

function initEquip() {
  G.equipment.forEach((e) => { ITEM[e.id] = e; });
  (G.materials || []).forEach((m) => { ITEM[m.id] = m; });
  $('#e-tabs').replaceChildren(...CRAFT_TABS.map((t) => {
    const b = h('button', { type: 'button', role: 'tab', class: 'ctab' }, esc(t));
    b.onclick = () => { craftTab = t; craftSel = null; renderEquip(); };
    return b;
  }));
}

function renderEquip() {
  [...$('#e-tabs').children].forEach((b) => b.setAttribute('aria-selected', b.textContent === craftTab));
  const items = G.equipment.filter((e) => e.tab === craftTab);
  const medal = craftTab === 'Медаль';
  const at = (r, c) => items.find((e) => e.row === r && e.col === c);
  // column headers: levels 1..6, or stat pairs on the medal tab
  const heads = [...Array(6)].map((_, c) => (medal
    ? STATS.filter((s) => at(0, c).stats[s]).map((s) => STAT_UK[s].slice(0, 4) + '.').join(' + ')
    : `${c + 1} рів.`));
  const rowName = (r) => (medal ? SLOT_UK[at(r, 0).slot] : STAT_UK[STATS.find((s) => at(r, 0).stats[s])]);
  const grid = $('#e-grid');
  grid.innerHTML = `<div></div>${heads.map((t) => `<div class="ch">${esc(t)}</div>`).join('')}`;
  for (let r = 0; r < 4; r++) {
    grid.append(h('div', { class: 'rh' }, esc(rowName(r))));
    for (let c = 0; c < 6; c++) {
      const e = at(r, c);
      const cell = h('button', { type: 'button', class: `cell${craftSel === e.id ? ' sel' : ''}`, style: `--ic:#${e.color}`,
        'aria-label': e.name }, itemIcon(e.id, 'ci'));
      cell.onclick = () => { craftSel = e.id; renderEquip(); };
      grid.append(cell);
    }
  }
  if (craftSel == null) craftSel = items[0].id;
  [...grid.querySelectorAll('.cell')].forEach((c) => c.classList.toggle('sel', c.getAttribute('aria-label') === ITEM[craftSel].name));
  renderCraftDetail(craftSel);
}

function renderCraftDetail(id) {
  const e = ITEM[id];
  // the whole line of this item (levels 1..6 in one grid row; a single item on the medal tab)
  const line = e.tab === 'Медаль' ? [e]
    : G.equipment.filter((x) => x.tab === e.tab && x.row === e.row).sort((a, b) => a.col - b.col);
  const chainHtml = line.map((x, i) => {
    const t = x.total[0];
    return `${i ? `<span class="arr">×${x.recipe[0].num}<br>→</span>` : ''}
      <span class="step${x.id === id ? ' cur' : ''}">${itemIcon(x.id)}
        <small>${x.tab === 'Медаль' ? '&nbsp;' : `${x.col + 1} рів.`}</small>
        <span class="cost">${itemIcon(t.id, 'tiny')}${fmtNum(t.num)}</span></span>`;
  }).join('');
  const matLi = (m, bold) => `<li>${itemIcon(m.id)} <span style="color:#${ITEM[m.id]?.color || 'fff'}">${esc(m.name)}</span> × ${bold ? `<b>${fmtNum(m.num)}</b>` : m.num}</li>`;
  $('#e-detail').innerHTML = `
    <div class="det-head">${itemIcon(id, 'big')}<div class="tooltip inline">${itemTooltip(id)}</div></div>
    <h3>Рецепт</h3>
    <ul class="mats">${e.recipe.map((m) => matLi(m)).join('')}</ul>
    <h3>${line.length > 1 ? 'Лінійка злиття' : 'Вартість'} <small>під іконкою — скільки всього потрібно на цей етап</small></h3>
    <div class="chain">${chainHtml}</div>
    <h3>Усього з нуля</h3>
    <ul class="mats">${e.total.map((m) => matLi(m, true)).join('')}</ul>`;
  $('#e-detail').querySelectorAll('img[data-tip]').forEach((img) => {
    const tid = +img.dataset.tip.split(':')[1];
    if (tid !== id && ITEM[tid]?.slot) {
      img.classList.add('link');
      img.onclick = () => { craftTab = ITEM[tid].tab; craftSel = tid; renderEquip(); };
    }
  });
}

/** Tooltip of a genie item, like in the NPC craft window. */
function genieTooltip(id) {
  const g = G.genies.find((x) => x.id === id);
  if (!g) return '';
  const lines = [`<span style="color:#${g.color}">${esc(g.name)}</span>`, 'Рівень: 1',
    ...STATS.map((s) => `${STAT_UK[s]} +${g.init[s]}`),
    'Підсилення: 50', '<span style="color:#6cfb4b">Випадковий вибір 0/0</span>', `Енергія: ${100 + g.init.vitality}`,
    `Відновлення енергії: ${(1 + 0.02 * g.init.intellect).toFixed(2)} /сек.`,
    `<span style="color:#ffcb4a">${esc(g.init_skills.map((sid) => BY_ID[sid]?.name || sid).join(', '))}  1 рів.</span>`];
  return lines.join('\n') + (g.desc ? `\n\n${renderTooltip(g.desc)}` : '');
}
function portraitTooltip() {
  const t = luckyTier(genie(), C.lp);
  return `Форма ${currentForm()} з 4${C.form ? ' (вибрано вручну)'
    : ` — за додатковими очками (<span style="color:${LP_TIER_COLORS[t]}">${LP_TIER_NAMES[t]}</span>)`}`
    + '\n<span style="color:#a0a0a0">Натисніть, щоб перемкнути форму вручну</span>';
}

/* ================= HOVER TOOLTIPS ================= */
function initTips() {
  const tip = $('#tip');
  if (!matchMedia('(hover: hover)').matches) return;
  const place = (ev) => {
    const pad = 14, w = tip.offsetWidth, hgt = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + hgt > innerHeight - 8) y = Math.max(8, innerHeight - hgt - 8);
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${y}px`;
  };
  document.addEventListener('mouseover', (ev) => {
    const el = ev.target.closest('[data-tip]');
    if (!el) { tip.hidden = true; return; }
    // a modal <dialog> sits in the top layer: the tooltip must live inside it to be drawn above
    const host = el.closest('dialog[open]') || document.body;
    if (tip.parentElement !== host) host.append(tip);
    const tipKey = el.dataset.tip;
    const kind = tipKey.split(':')[0], id = tipKey.slice(kind.length + 1);
    const html = kind === 'item' ? itemTooltip(+id)
      : kind === 'skill' ? renderTooltip(BY_ID[+id]?.levels[0].tooltip)
        : kind === 'hint' ? renderTooltip(HINTS[id])
          : kind === 'text' ? esc(id)
            : kind === 'genie' ? genieTooltip(+id)
              : kind === 'portrait' ? portraitTooltip()
                : kind === 'tree' ? treeTooltip(+id)
                  : kind === 'gtree' ? treeTooltip(+id, 1, { plain: true }) : '';
    if (!html) { tip.hidden = true; return; }
    tip.innerHTML = html;
    tip.hidden = false;
    place(ev);
  });
  document.addEventListener('mousemove', (ev) => { if (!tip.hidden) place(ev); });
  document.addEventListener('scroll', () => { tip.hidden = true; }, true);
}

/* «Білди» and «Про джинів» — guide.js */

/* ================= boot ================= */
async function boot() {
  const [skills, genie, guide, cats] = await Promise.all(
    ['data/skills.json', 'data/genie.json', 'data/guide.json', 'data/categories.json'].map((u) => fetch(u).then((r) => r.json())));
  SKILLS = skills; G = genie; GUIDE = guide;
  SKILLS.forEach((s) => { BY_ID[s.id] = s; });
  await initCalc(); renderCalc();
  initEquip(); renderEquip(); initTips();
  renderBuilds(); renderGuide(cats);
  $('#skill-dlg').addEventListener('close', () => {
    if (location.hash.startsWith('#skill/')) history.replaceState(null, '', `#calc/${saveCalcState()}`);
  });
  window.addEventListener('hashchange', route);
  route();
  calcReady = true;
}
// start only after calc.js / skills-calc.js are parsed too (otherwise the data may arrive first)
const start = () => boot().catch((e) => {
  document.querySelector('main').innerHTML = `<div class="panel">Не вдалося завантажити дані: ${esc(e.message)}.
    Відкривайте сайт через веб-сервер (GitHub Pages або <code>python -m http.server</code> у папці <code>site</code>).</div>`;
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
