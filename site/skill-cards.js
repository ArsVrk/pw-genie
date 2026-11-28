'use strict';
/* ================= CALCULATOR: cards of the selected skills ================= */
/* globals: $, h, esc, BY_ID, ELEMS, ELEM_UK, STATS, STAT_UK, C, TREE, renderTooltip, iconSrc, fmtNum, clamp,
   maxSkillLevel, skillBlockers, myElems, currentStats, renderCalc, openSkillCard, toggleSkill */

/* The game's tooltips never apply the genie's Strength/Agility to the numbers they show; the server applies
   the «Вплив сили/спритності» rules. They are
   simple linear rules, so the bonus is computed here from the genie's current stats (equipment included). */
const INFLUENCE_STAT = { 'сили': 'strength', 'спритності': 'agility' };
const DOWN = /зниж|зменш|скороч|послаб|сниж|умен/i;
const CHANCE = /імовір|ймовір|шанс|вероятн/i;
/** «З імовірністю 100%», «шанс критичного удару на 2%» — the number is the chance itself
 *  (no verb between the chance word and the number); «з імовірністю зменшує … на 4%» is an effect. */
function isChanceNum(n) {
  if (n.unit !== '%') return false;
  const m = n.before.match(/(?:імовір|ймовір|шанс|вероятн)[^]*$/i);
  return !!m && !VERB.test(m[0].replace(/^\S+/, ''));
}

/** «кожне очко збільшує шкоду на 10,2 од.» → { per: 1, value: 10.2, unit: 'од.', sign: +1 } */
function parseInfluence(clause) {
  const m = clause.match(/(?:за )?(?:кожн[еі]|каждые)\s+(?:(\d+)\s+)?(?:оч|бал)\S*/i);   // «очко», «очки», «очок», «бали»
  const v = clause.match(/(?:на|ще|по)\s+(?:на\s+)?(\d+(?:[,.]\d+)?)\s*(%|од\.?|сек\S*|сотих|очко|ци)?/i);
  if (!v) return null;
  if (!m) return { inherit: true, value: parseFloat(v[1].replace(',', '.')), unit: v[2] || '', sign: DOWN.test(clause) ? -1 : 1 };
  return { per: +(m[1] || 1), value: parseFloat(v[1].replace(',', '.')), unit: v[2] || '',
    sign: DOWN.test(clause) ? -1 : 1 };
}
const fmtVal = (x) => (Math.round(x * 100) / 100).toLocaleString('uk-UA', { maximumFractionDigits: 2 });

const CODE = /\^[0-9a-fA-F]{6}/g;
const plainOf = (s) => s.replace(CODE, '');
const unitOf = (u) => (u === '%' ? '%' : /^сек/.test(u) ? 'сек' : /^од/.test(u) ? 'од' : u);
/** Word stems of the thing a rule changes: «знижують швидкість атаки і влучність ще на 1%» → швид, атак, влуч */
const ruleObject = (clause) => clause.replace(/^.*?(?:оч|бал)\S*\s+(?:додатково\s+)?\S+\s+/i, '')
  .split(/\s(?:ще|на|по)\s/)[0].replace(/[.,;]+$/, '').trim();
function ruleStems(clause) {
  // 4-letter stems; a 4-letter word gives 3 letters so «щита» still finds «щит»
  return ruleObject(clause).toLowerCase().split(/[^а-яіїєґ']+/).filter((w) => w.length >= 4)
    .map((w) => w.slice(0, w.length === 4 ? 3 : 4));
}
const VERB = /[а-яіїєґ](?:ує|юють|ують|ють|ить|ять|ає|ають|ється|уються)(?:\s|$)/i;

/** Parse the «Вплив …» rules of a raw tooltip, fold each bonus into the number it changes («15%» → «27% (15% +12%)»);
 *  rules that cannot be matched to a number keep the bonus at the end of their own line. */
function beforeOf(plain, numText, prevLine) {
  const own = plain.slice(0, Math.max(0, plain.indexOf(numText))).split(/[.!?]\s/).pop();
  return VERB.test(own) ? own : `${prevLine.split(/[.!?]\s/).pop()} ${own}`;
}

function withInfluence(raw, stats) {
  const lines = raw.split('\n');
  // 1) numbers in the skill text (not in the rules), with the color active before them
  const nums = [];
  let pastHeader = false;
  lines.forEach((line, li) => {
    const plain = plainOf(line);
    if (!plain.trim()) pastHeader = true;
    if (/^Вплив/.test(plain)) return;
    let color = '^ffffff', pos = 0;
    for (const seg of line.split(/(\^[0-9a-fA-F]{6})/)) {
      if (/^\^[0-9a-fA-F]{6}$/.test(seg)) { color = seg; pos += seg.length; continue; }
      for (const m of seg.matchAll(/(\d+(?:,\d+)?)(\s*)(%|од\.?|сек(?:унд[а-яі]*|\.)?|м\b)?/g)) {
        nums.push({ li, start: pos + m.index, len: m[0].length, text: m[1], ws: m[2], unit: unitOf(m[3] || ''), unitText: m[3] || '',
          color, value: parseFloat(m[1].replace(',', '.')), line: plain.toLowerCase(), desc: pastHeader,
          before: beforeOf(plain, m[0], li ? plainOf(lines[li - 1]) : ''), deltas: [], uses: 0 });
      }
      pos += seg.length;
    }
  });
  // 2) rules → bonus, matched to a number by unit + words of the line
  const ruleLines = {};
  lines.forEach((line, li) => {
    const m = plainOf(line).match(/^Вплив (сили|спритності):\s*(.*)$/);
    if (!m) return;
    const statKey = INFLUENCE_STAT[m[1]], st = stats[statKey];
    const clauses = m[2].split(/,\s*а\s+/);
    const parts = clauses.map(parseInfluence);
    parts.forEach((p, i) => { if (p?.inherit) Object.assign(p, { per: parts[i - 1]?.per || 1, inherit: false }); });
    if (!parts.length || parts.some((p) => !p || p.per === undefined)) return;
    ruleLines[li] = { statKey, st, items: parts.map((p, i) => {
      const mag = (p.per > 1 ? Math.floor(st / p.per) : st) * p.value;
      const unit = unitOf(p.unit), stems = ruleStems(clauses[i]);
      // a chance («з імовірністю 100%») only takes rules about chances
      const aboutChance = CHANCE.test(clauses[i]);
      const fits = nums.filter((n) => (n.unit === unit || (unit === 'од' && !n.unit && /енерг|витрат/.test(n.line)))
        && (aboutChance || !isChanceNum(n)));
      const words = (n) => stems.filter((st4) => new RegExp(`(^|[^а-яіїєґ])${st4}`).test(n.line)).length;
      const score = (n) => words(n) * 4 + (DOWN.test(n.before) === p.sign < 0 ? 2 : 0) - n.uses * 3;
      // candidates: lines with the rule's words, plus the next/previous line when the direction agrees
      // («зменшує отримувану шкоду на 20%, // але потім збільшує її на 20%»)
      const hit = new Set(fits.filter((n) => words(n) > 0).map((n) => n.li));
      const cands = fits.filter((n) => words(n) > 0
        || ((hit.has(n.li - 1) || hit.has(n.li + 1)) && DOWN.test(n.before) === p.sign < 0));
      let target = cands.sort((a, b) => score(b) - score(a))[0];
      // the only number of the description — if it goes the same way as the rule («збільшує» / «зменшує»)
      if (!target) { const d = fits.filter((n) => n.desc); if (d.length === 1 && DOWN.test(d[0].before) === p.sign < 0) [target] = d; }
      let targets = target ? [target] : [];
      // durations («час дії», «час уповільнення і прискорення»): the effect times «на N сек.» of the text —
      // the first one, or all of them when the rule names several effects
      if (!targets.length && unit === 'сек' && /час|трива|дію|дія/i.test(clauses[i])) {
        const durs = fits.filter((n) => n.desc && /(?:^|\s)на\s*$/.test(n.before));
        targets = / і | та /.test(ruleObject(clauses[i])) ? durs : durs.slice(0, 1);
      }
      targets.forEach((t) => { t.uses++; t.deltas.push({ mag, down: p.sign < 0 }); });
      target = targets[0];
      return { mag, unit: p.unit, sign: p.sign, matched: !!target, what: ruleObject(clauses[i]) };
    }) };
  });
  // 3) write the totals into the text (right to left, so positions stay valid)
  for (const n of [...nums].sort((a, b) => b.li - a.li || b.start - a.start)) {
    if (!n.deltas.length) continue;
    const isCost = /витрат/.test(n.line) || n.unit === 'сек';   // costs and durations: the rule's own sign
    const baseDown = DOWN.test(n.before);
    const sum = n.deltas.reduce((t, d) => t + (isCost ? (d.down ? -d.mag : d.mag) : (d.down === baseDown ? d.mag : -d.mag)), 0);
    let total = Math.max(0, n.value + sum);
    if (n.unit === '%' && (isChanceNum(n) || baseDown)) total = Math.min(100, total);   // chances and reductions ≤ 100%
    const dec = (n.text.split(',')[1] || '').length;
    const fmt = (x) => x.toLocaleString('uk-UA', { minimumFractionDigits: dec, maximumFractionDigits: Math.max(dec, 2) });
    const u = n.unit === '%' ? '%' : n.unit ? `${n.ws}${n.unitText}` : '';   // the unit as written («сек.», «секунд»)
    const du = n.unit === '%' ? '%' : n.unit === 'сек' ? ' сек.' : '';
    const rep = `^ffdc50${fmt(total)}${u}^a0a0a0 (${fmt(n.value)}${n.unit === '%' ? '%' : ''} ${sum >= 0 ? '+' : '−'}${fmtVal(Math.abs(sum))}${du})${n.color}`;
    const line = lines[n.li];
    lines[n.li] = line.slice(0, n.start) + rep + line.slice(n.start + n.len);
  }
  // 4) the rule lines: dimmed «враховано» when folded in, else the bonus at the end
  for (const [li, r] of Object.entries(ruleLines)) {
    const tag = `${STAT_UK[r.statKey]} ${r.st}`;
    const uName = (u) => (u === '%' ? '%' : /^сек/.test(u) ? ' сек.' : u ? ` ${u}` : '');
    const bonus = r.items.map((it) => `${it.sign < 0 ? '−' : '+'}${fmtVal(it.mag)}${uName(it.unit)}`).join(', ');
    // the game's own rule line (green = agility, red = strength) + the bonus from the current stats;
    // «✓ у тексті» when the bonus is already written into the skill's number above
    lines[li] = `${lines[li]} ^ffffff→ ^ffdc50${bonus}^a0a0a0 (${tag})`;
  }
  return lines.join('\n');
}

C.skillLv = C.skillLv || {};           // chosen level per skill (default: the max learnable now)
const cardLevel = (s) => clamp(C.skillLv[s.id] || Math.max(1, maxSkillLevel(s)), 1, s.max_level);

function renderSkillCards() {
  const box = $('#c-cards');
  if (!box) return;
  const list = C.skills.map((id) => BY_ID[id]).filter(Boolean);
  $('#c-cards-wrap').hidden = !list.length;
  const stats = currentStats();
  box.replaceChildren(...list.map((s) => {
    const lv = cardLevel(s);
    const L = s.levels[lv - 1];
    const learn = TREE.learn[s.id];
    const el = myElems();
    const req = ELEMS.filter((e) => s.elements[e]).map((e) => `<span class="el el-${e}">${ELEM_UK[e]} ${s.elements[e]}</span>`
      + (el[e] < s.elements[e] ? `<span class="bad-t"> (є ${el[e]})</span>` : '')).join(' ') || 'немає';
    const lvOk = L.genie_level <= C.level;
    const body = withInfluence(L.tooltip.split('\n').slice(1).join('\n').trim(), stats);
    const card = h('article', { class: `skill-card${skillBlockers(s).length || !lvOk ? ' blocked' : ''}` }, `
      <header>
        <img src="${iconSrc(s.id)}" alt="" data-tip="tree:${s.id}">
        <div class="sc-title"><b>${esc(s.name)}</b>${learn && learn.name !== s.name ? `<small>у вікні вивчення: «${esc(learn.name)}»</small>` : ''}</div>
        <div class="sc-lv">
          <button type="button" data-d="-1" aria-label="Нижчий рівень">−</button>
          <span>Рів. <b>${lv}</b>/${s.max_level}</span>
          <button type="button" data-d="1" aria-label="Вищий рівень">+</button>
        </div>
      </header>
      <div class="sc-req">Стихії: ${req} · рівень джина <b class="${lvOk ? '' : 'bad-t'}">${L.genie_level}</b></div>
      <div class="tooltip sc-body">${renderTooltip(body, { head: false })}</div>`);
    card.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
      C.skillLv[s.id] = clamp(lv + +b.dataset.d, 1, s.max_level);
      renderCalc();
    }));
    return card;
  }));
}
