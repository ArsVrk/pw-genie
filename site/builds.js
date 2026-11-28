'use strict';
/* ================= players' builds (Supabase) ================= */
/* globals: SUPABASE, $, h, esc, G, BY_ID, STATS, STAT_UK, SLOTS, EQ_BY_ID, C, iconSrc, clamp, saveCalcState,
   luckyTier, LP_TIER_COLORS, TIER_FORM, maxLucky, skillSlots, renderTooltip */

const BUILD_CLASSES = ['Воїн', 'Маг', 'Жрець', 'Друїд', 'Перевертень', 'Вбивця', 'Лучник', 'Страж', 'Шаман', 'Містик'];
const PB = { list: [], cats: ['ПвП', 'ПвЕ'], editId: null, loaded: false, error: '' };

/* ---------- storage of the author's secret and own builds (this browser only) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
function mySecret() {
  let s = store.get('pwg_secret', '');
  if (!s) {
    s = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
    store.set('pwg_secret', s);
  }
  return s;
}
const myBuilds = () => store.get('pwg_own', []);
const isMine = (id) => myBuilds().includes(id);

/* ---------- Supabase REST ---------- */
const sbOn = () => !!(SUPABASE.url && SUPABASE.key);
async function sb(path, opts = {}) {
  const headers = { apikey: SUPABASE.key, 'Content-Type': 'application/json' };
  if (!SUPABASE.key.startsWith('sb_')) headers.Authorization = `Bearer ${SUPABASE.key}`;   // legacy anon JWT
  const r = await fetch(`${SUPABASE.url.replace(/\/$/, '')}/rest/v1/${path}`, { ...opts, headers });
  const body = await r.text();
  const data = body ? JSON.parse(body) : null;
  if (!r.ok) throw new Error(data?.message || `HTTP ${r.status}`);
  return data;
}
async function loadBuilds() {
  if (!sbOn()) return;
  try {
    const [list, cats] = await Promise.all([
      sb('builds?select=id,created_at,updated_at,nick,class,category,level,genie,skills,state,comment&order=created_at.desc&limit=500'),
      sb('build_categories?select=name&order=created_at.asc'),
    ]);
    PB.list = list;
    PB.cats = [...new Set(['ПвП', 'ПвЕ', ...cats.map((c) => c.name)])];
    PB.error = '';
  } catch (e) { PB.error = e.message; }
  PB.loaded = true;
}

/* ---------- a build's genie from its calculator state (without touching the calculator) ---------- */
function buildGenie(state) {
  const p = new URLSearchParams(state);
  const nums = (k, n) => (p.get(k) || '').split(',').map((x) => +x || 0).concat(Array(n).fill(0)).slice(0, n);
  const g = G.genies.find((x) => x.id === +p.get('g')) || G.genies[0];
  const level = clamp(+p.get('l') || 1, 1, 105);
  const lp = clamp(+p.get('lp') || 0, 0, maxLucky(level));
  const alloc = nums('s', 4);
  const equip = nums('q', 4).map((id) => EQ_BY_ID[id]).filter(Boolean);
  const stats = Object.fromEntries(STATS.map((s, i) => [s, g.init[s] + alloc[i] + equip.reduce((t, x) => t + (x.stats[s] || 0), 0)]));
  const kl = Object.fromEntries((p.get('kl') || '').split(',').filter(Boolean).map((x) => x.split(':').map(Number)));
  const skills = (p.get('k') || '').split(',').map(Number).filter((id) => BY_ID[id]);
  const form = clamp(+p.get('f') || 0, 0, 4) || TIER_FORM[luckyTier(g, lp)];
  return { g, level, lp, stats, equip, skills, kl, form, elems: nums('e', 5) };
}
const skillLevelOf = (bg, id) => bg.kl[id] || BY_ID[id].levels.filter((l) => l.genie_level <= bg.level).length || 1;

/** The game's genie item tooltip, built from the saved state. */
function buildGenieTooltip(id) {
  const b = PB.list.find((x) => x.id === id);
  if (!b) return '';
  const bg = buildGenie(b.state);
  const tier = luckyTier(bg.g, bg.lp);
  const lines = [`<span style="color:#${bg.g.color}">${esc(bg.g.name)}</span>`, `Рівень: ${bg.level}`,
    ...['strength', 'agility', 'vitality', 'intellect'].map((s) => `${STAT_UK[s]} +${bg.stats[s]}`),   // game order
    `<span style="color:${LP_TIER_COLORS[tier]}">Випадковий вибір ${bg.lp}/${maxLucky(bg.level)}</span>`,
    `Енергія: ${100 + bg.stats.vitality}`, `Відновлення енергії: ${(1 + 0.02 * bg.stats.intellect).toFixed(2)} /сек.`,
    ...bg.equip.map((x) => `${SLOT_UK[x.slot]} <span style="color:#${x.color || 'ffffff'}">${esc(x.name)}</span>`),
    ...bg.skills.map((sid) => `<span style="color:#ffdc50">${esc(BY_ID[sid].name)}   ${skillLevelOf(bg, sid)} рів.</span>`)];
  return lines.join('\n');
}

/* ---------- the list in «Білди» ---------- */
function playerBuildCard(b) {
  const bg = buildGenie(b.state);
  const date = new Date(b.updated_at || b.created_at).toLocaleDateString('uk-UA');
  return `<article class="pbuild" data-id="${b.id}">
    <header><b class="pb-nick">${esc(b.nick)}</b><span class="tag cls">${esc(b.class)}</span>
      <span class="tag mode">${esc(b.category)}</span><span class="pb-lv">Рів. ${b.level}</span></header>
    <div class="pb-genie">
      <img class="pb-ava" src="${bg.g.avatars[bg.form - 1]}" alt="" data-tip="bgenie:${b.id}">
      <div class="pb-gbody"><b style="color:#${bg.g.color}">${esc(bg.g.name)}</b>
        <div class="pb-skills">${bg.skills.map((sid) => `<a href="#skill/${sid}" data-tip="gtree:${sid}"><img src="${iconSrc(sid)}" alt="">
          <i>${skillLevelOf(bg, sid)}</i></a>`).join('')}</div></div>
    </div>
    ${b.comment ? `<p class="pb-comment">${esc(b.comment)}</p>` : ''}
    <div class="b-foot"><span class="muted">${date}</span><span class="pb-act">
      ${isMine(b.id) ? '<button type="button" class="ghost" data-act="edit">Редагувати</button><button type="button" class="ghost" data-act="del">Видалити</button>' : ''}
      <a class="btn-link" href="#calc/${esc(b.state)}">У калькулятор →</a></span></div>
  </article>`;
}

function renderPlayerBuilds() {
  const box = $('#pb');
  if (!box) return;
  if (!sbOn()) {
    box.innerHTML = '<p class="muted">Збереження білдів гравців скоро запрацює.</p>';
    return;
  }
  if (!PB.loaded) { box.innerHTML = '<p class="muted">Завантаження білдів…</p>'; return; }
  const f = { cls: $('#pb-cls')?.value || '', cat: $('#pb-cat')?.value || '', q: ($('#pb-q')?.value || '').trim().toLowerCase() };
  const list = PB.list.filter((b) => (!f.cls || b.class === f.cls) && (!f.cat || b.category === f.cat)
    && (!f.q || b.nick.toLowerCase().includes(f.q) || b.comment.toLowerCase().includes(f.q)));
  if (!$('#pb-filters')) {
    box.innerHTML = `<div id="pb-filters" class="tf-row pb-filters">
        <label>Клас <select id="pb-cls"><option value="">усі</option>${BUILD_CLASSES.map((c) => `<option>${c}</option>`).join('')}</select></label>
        <label>Категорія <select id="pb-cat"><option value="">усі</option></select></label>
        <input id="pb-q" type="search" placeholder="Нік або коментар…">
        <span class="count" id="pb-count"></span>
        <a class="btn-link" href="#calc">+ Зберегти свій білд</a></div>
      <div id="pb-list" class="builds"></div>`;
    ['#pb-cls', '#pb-cat', '#pb-q'].forEach((q) => $(q).addEventListener('input', renderPlayerBuilds));
    $('#pb-list').addEventListener('click', onBuildAction);
  }
  const cat = $('#pb-cat'), cur = cat.value;
  cat.innerHTML = `<option value="">усі</option>${PB.cats.map((c) => `<option>${esc(c)}</option>`).join('')}`;
  cat.value = cur;
  $('#pb-count').textContent = PB.error ? `помилка: ${PB.error}` : `білдів: ${list.length}`;
  $('#pb-list').innerHTML = list.length ? list.map(playerBuildCard).join('')
    : '<p class="muted">Поки немає білдів — збережіть перший у калькуляторі (кнопка «Зберегти» у вікні джина).</p>';
}

async function onBuildAction(ev) {
  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.pbuild').dataset.id;
  const b = PB.list.find((x) => x.id === id);
  if (btn.dataset.act === 'edit') {
    PB.editId = id;
    location.hash = `calc/${b.state}`;
    setTimeout(() => openSaveBuild(b), 300);
  } else if (btn.dataset.act === 'del') {
    if (!confirm(`Видалити білд «${b.nick} · ${b.category}»? Повернути не можна.`)) return;
    try {
      await sb('rpc/delete_build', { method: 'POST', body: JSON.stringify({ p_id: id, p_secret: mySecret() }) });
      store.set('pwg_own', myBuilds().filter((x) => x !== id));
      await loadBuilds(); renderPlayerBuilds();
    } catch (e) { alert(`Не вдалося видалити: ${e.message}`); }
  }
}

/* ---------- «Зберегти білд» dialog ---------- */
function openSaveBuild(edit = null) {
  const dlg = $('#build-dlg');
  if (!sbOn()) { alert('Збереження білдів ще не підключене. Поки що можна поділитися посиланням.'); return; }
  if (!edit && PB.editId) edit = PB.list.find((x) => x.id === PB.editId) || null;
  const last = store.get('pwg_last', {});
  $('#bd-nick').value = edit?.nick || last.nick || '';
  $('#bd-class').innerHTML = BUILD_CLASSES.map((c) => `<option>${c}</option>`).join('');
  $('#bd-class').value = edit?.class || last.class || BUILD_CLASSES[0];
  const cat = $('#bd-cat');
  cat.innerHTML = PB.cats.map((c) => `<option>${esc(c)}</option>`).join('') + '<option value="__new">Своя категорія…</option>';
  cat.value = edit?.category && PB.cats.includes(edit.category) ? edit.category : 'ПвП';
  $('#bd-newcat').value = '';
  $('#bd-newcat').hidden = true;
  $('#bd-comment').value = edit?.comment || '';
  $('#bd-msg').textContent = '';
  $('#bd-update-row').hidden = !edit;
  $('#bd-update').checked = !!edit;
  if (edit) $('#bd-update-name').textContent = `${edit.nick} · ${edit.category}`;
  // what will be saved (taken from the calculator)
  const g = G.genies.find((x) => x.id === C.genie);
  const slots = skillSlots(C.lp);
  $('#bd-preview').innerHTML = `<img class="pb-ava" src="${g.avatars[(C.form || TIER_FORM[luckyTier(g, C.lp)]) - 1]}" alt="">
    <div><b style="color:#${g.color}">${esc(g.name)}</b> · рівень <b>${C.level}</b> · удача ${C.lp}
      <div class="pb-skills">${C.skills.map((id) => `<img src="${iconSrc(id)}" alt="" title="${esc(BY_ID[id].name)}">`).join('')}</div>
      ${C.skills.length > slots ? `<small class="bad-t">Скілів більше, ніж слотів (${slots}).</small>` : ''}</div>`;
  dlg.showModal();
}

async function submitBuild(ev) {
  ev.preventDefault();
  const nick = $('#bd-nick').value.trim();
  const category = $('#bd-cat').value === '__new' ? $('#bd-newcat').value.trim() : $('#bd-cat').value;
  if (!nick) { $('#bd-msg').textContent = 'Вкажіть нік.'; return; }
  if (!category) { $('#bd-msg').textContent = 'Вкажіть категорію.'; return; }
  if (!C.skills.length) { $('#bd-msg').textContent = 'Додайте хоча б один скіл.'; return; }
  const update = $('#bd-update').checked && PB.editId;
  const btn = $('#bd-save');
  btn.disabled = true;
  try {
    const id = await sb('rpc/save_build', { method: 'POST', body: JSON.stringify({
      p_id: update ? PB.editId : null, p_secret: mySecret(), p_nick: nick, p_class: $('#bd-class').value,
      p_category: category, p_level: C.level, p_genie: C.genie, p_skills: C.skills, p_state: saveCalcState(),
      p_comment: $('#bd-comment').value.trim() }) });
    store.set('pwg_own', [...new Set([...myBuilds(), id])]);
    store.set('pwg_last', { nick, class: $('#bd-class').value });
    PB.editId = null;
    $('#build-dlg').close();
    await loadBuilds();
    renderPlayerBuilds();
    location.hash = 'builds';
  } catch (e) {
    $('#bd-msg').textContent = `Не вдалося зберегти: ${e.message}`;
  } finally { btn.disabled = false; }
}

async function initPlayerBuilds() {
  $('#bd-cat').addEventListener('change', () => {
    $('#bd-newcat').hidden = $('#bd-cat').value !== '__new';
    if (!$('#bd-newcat').hidden) $('#bd-newcat').focus();
  });
  $('#build-form').addEventListener('submit', submitBuild);
  $('#bd-cancel').addEventListener('click', () => { PB.editId = null; $('#build-dlg').close(); });
  renderPlayerBuilds();
  await loadBuilds();
  renderPlayerBuilds();
}
