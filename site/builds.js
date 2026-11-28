'use strict';
/* ================= players' builds (Supabase) ================= */
/* globals: SUPABASE, $, h, esc, G, BY_ID, STATS, STAT_UK, SLOTS, EQ_BY_ID, C, iconSrc, clamp, saveCalcState,
   luckyTier, LP_TIER_COLORS, TIER_FORM, maxLucky, skillSlots, renderTooltip */

const BUILD_CLASSES = ['Воїн', 'Маг', 'Жрець', 'Друїд', 'Перевертень', 'Вбивця', 'Лучник', 'Страж', 'Шаман', 'Містик'];
const PB = { list: [], cats: ['ПвП', 'ПвЕ'], editId: null, loaded: false, error: '',
  comments: {}, cmtOn: false, ver: 0 };   // comments by build id; cmtOn = the comments table exists

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
const myComments = () => store.get('pwg_own_c', []);

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
  try {   // comments are optional: the table may not exist yet
    const cm = await sb('build_comments?select=id,build_id,created_at,nick,text&order=created_at.asc&limit=3000');
    PB.comments = {};
    cm.forEach((c) => { (PB.comments[c.build_id] ||= []).push(c); });
    PB.cmtOn = true;
  } catch { PB.cmtOn = false; }
  PB.loaded = true;
  PB.ver++;
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

/* ---------- text with clickable links (links to this site open in place, as a short label) ---------- */
const SITE_URL = 'https://arsvrk.github.io/pw-genie/';
function linkify(text) {
  return esc(text).replace(/https?:\/\/[^\s<]+/g, (u) => {
    const raw = u.replace(/&amp;/g, '&').replace(/[.,;:!?)]+$/, '');
    const tail = u.slice(esc(raw).length);
    const own = raw.startsWith(SITE_URL) || raw.startsWith(location.origin + location.pathname);
    if (own && raw.includes('#')) {
      const hash = raw.slice(raw.indexOf('#'));
      const label = hash.startsWith('#calc/') ? 'білд у калькуляторі' : hash.startsWith('#skill/') ? 'опис скіла' : 'сторінка сайту';
      return `<a class="ilink" href="${esc(hash)}">🔗 ${label}</a>${tail}`;
    }
    const label = raw.length > 48 ? `${raw.slice(0, 45)}…` : raw;
    return `<a class="ilink" href="${esc(raw)}" target="_blank" rel="noopener nofollow ugc">${esc(label)}</a>${tail}`;
  });
}

/* ---------- the list in «Білди» ---------- */
const buildHref = (b) => `#calc/${esc(b.state)}&amp;b=${b.id}`;
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
    ${b.comment ? `<p class="pb-comment">${linkify(b.comment)}</p>` : ''}
    <div class="b-foot"><span class="muted">${date}</span><span class="pb-act">
      ${isMine(b.id) ? '<button type="button" class="ghost" data-act="edit">Редагувати</button><button type="button" class="ghost" data-act="del">Видалити</button>' : ''}
      ${PB.cmtOn ? `<a class="btn-link dim" data-act="cmts" href="${buildHref(b)}&amp;c=1" title="Коментарі — у калькуляторі під білдом">💬 ${(PB.comments[b.id] || []).length}</a>` : ''}
      <a class="btn-link" href="${buildHref(b)}">У калькулятор →</a></span></div>
  </article>`;
}

function commentsBlock(b) {
  const list = PB.comments[b.id] || [];
  const mine = myComments();
  const last = store.get('pwg_last', {});
  return `<div class="pb-cmts"><h3>Коментарі <small>${list.length}</small></h3>
    <div class="pb-clist">${list.map((c) => `<div class="pb-c" data-cid="${c.id}"><div><b>${esc(c.nick)}</b>
      <span class="muted">${new Date(c.created_at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}</span>
      ${mine.includes(c.id) ? '<button type="button" class="pb-cdel" data-act="cdel" title="Видалити свій коментар">×</button>' : ''}</div>
      <p>${linkify(c.text)}</p></div>`).join('') || '<p class="muted">Поки немає коментарів.</p>'}</div>
    <form class="pb-cform"><input name="nick" maxlength="32" placeholder="Нік" value="${esc(last.nick || '')}" required>
      <textarea name="text" maxlength="500" rows="2" placeholder="Ваш коментар…" required></textarea>
      <button type="submit">Надіслати</button></form>
  </div>`;
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
  const id = btn.closest('[data-id]').dataset.id;
  const b = PB.list.find((x) => x.id === id);
  if (btn.dataset.act === 'cmts') {   // the link navigates; then show the comments under the calculator
    setTimeout(() => $('#c-build').scrollIntoView({ behavior: 'smooth' }), 350);
  } else if (btn.dataset.act === 'close') {
    C.build = ''; renderCalc();
  } else if (btn.dataset.act === 'edit') {
    PB.editId = id;
    location.hash = `calc/${b.state}&b=${id}`;
    setTimeout(() => openSaveBuild(b), 300);
  } else if (btn.dataset.act === 'cdel') {
    const cid = btn.closest('.pb-c').dataset.cid;
    if (!confirm('Видалити свій коментар?')) return;
    try {
      await sb('rpc/delete_comment', { method: 'POST', body: JSON.stringify({ p_id: cid, p_secret: mySecret() }) });
      store.set('pwg_own_c', myComments().filter((x) => x !== cid));
      await loadBuilds(); renderPlayerBuilds(); renderCalcBuild();
    } catch (e) { alert(`Не вдалося видалити: ${e.message}`); }
  } else if (btn.dataset.act === 'del') {
    if (!confirm(`Видалити білд «${b.nick} · ${b.category}»? Повернути не можна.`)) return;
    try {
      await sb('rpc/delete_build', { method: 'POST', body: JSON.stringify({ p_id: id, p_secret: mySecret() }) });
      store.set('pwg_own', myBuilds().filter((x) => x !== id));
      await loadBuilds(); renderPlayerBuilds();
    } catch (e) { alert(`Не вдалося видалити: ${e.message}`); }
  }
}

async function onCommentSubmit(ev) {
  const form = ev.target.closest('.pb-cform');
  if (!form) return;
  ev.preventDefault();
  const id = form.closest('[data-id]').dataset.id;
  const nick = form.nick.value.trim(), text = form.text.value.trim();
  if (!nick || !text) return;
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const cid = await sb('rpc/add_comment', { method: 'POST', body: JSON.stringify({ p_build: id, p_secret: mySecret(), p_nick: nick, p_text: text }) });
    store.set('pwg_own_c', [...myComments(), cid]);
    store.set('pwg_last', { ...store.get('pwg_last', {}), nick });
    await loadBuilds(); renderPlayerBuilds(); renderCalcBuild();
    $('#c-build .pb-clist')?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  } catch (e) { alert(`Не вдалося надіслати: ${e.message}`); btn.disabled = false; }
}

/* ---------- «Зберегти білд» dialog ---------- */
function openSaveBuild(edit = null) {
  const dlg = $('#build-dlg');
  if (!sbOn()) { alert('Збереження білдів ще не підключене. Поки що можна поділитися посиланням.'); return; }
  if (!edit && !PB.editId && C.build && isMine(C.build)) PB.editId = C.build;   // own build open in the calculator
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
      p_category: category, p_level: C.level, p_genie: C.genie, p_skills: C.skills, p_state: saveCalcState({ withBuild: false }),
      p_comment: $('#bd-comment').value.trim() }) });
    store.set('pwg_own', [...new Set([...myBuilds(), id])]);
    store.set('pwg_last', { nick, class: $('#bd-class').value });
    PB.editId = null;
    C.build = id;
    $('#build-dlg').close();
    await loadBuilds();
    renderPlayerBuilds();
    location.hash = 'builds';
  } catch (e) {
    $('#bd-msg').textContent = `Не вдалося зберегти: ${e.message}`;
  } finally { btn.disabled = false; }
}

/* ---------- the player's build open in the calculator: author's note + comments under the windows ---------- */
let calcBuildKey = '';
function renderCalcBuild() {
  const box = $('#c-build');
  if (!box) return;
  const b = C.build && PB.list.find((x) => x.id === C.build);
  if (!b) { box.hidden = true; calcBuildKey = ''; return; }
  const key = `${b.id}|${PB.ver}`;
  if (key !== calcBuildKey) {   // re-render only when the build or the data changed (keeps typed text)
    calcBuildKey = key;
    box.dataset.id = b.id;
    box.innerHTML = `<div class="cb-head"><span class="muted">Білд гравця</span> <b class="pb-nick">${esc(b.nick)}</b>
        <span class="tag cls">${esc(b.class)}</span><span class="tag mode">${esc(b.category)}</span>
        <span class="pb-lv">Рів. ${b.level}</span>
        <span class="tag warn cb-changed" title="Можна зберегти як новий білд${isMine(b.id) ? ' або оновити свій' : ''} кнопкою «Зберегти»">змінено</span>
        <span class="cb-act"><a class="btn-link" href="#builds">До білдів</a>
        <button type="button" class="ghost" data-act="close" title="Закрити — далі звичайний калькулятор">×</button></span></div>
      ${b.comment ? `<p class="pb-comment">${linkify(b.comment)}</p>` : ''}
      ${PB.cmtOn ? commentsBlock(b) : ''}`;
  }
  box.querySelector('.cb-changed').hidden = saveCalcState({ withBuild: false }) === b.state;
  box.hidden = false;
}

async function initPlayerBuilds() {
  $('#c-build').addEventListener('click', onBuildAction);
  $('#c-build').addEventListener('submit', onCommentSubmit);
  $('#bd-cat').addEventListener('change', () => {
    $('#bd-newcat').hidden = $('#bd-cat').value !== '__new';
    if (!$('#bd-newcat').hidden) $('#bd-newcat').focus();
  });
  $('#build-form').addEventListener('submit', submitBuild);
  $('#bd-cancel').addEventListener('click', () => { PB.editId = null; $('#build-dlg').close(); });
  renderPlayerBuilds();
  await loadBuilds();
  renderPlayerBuilds();
  renderCalcBuild();
  if (/[&?]c=1/.test(location.hash)) $('#c-build').scrollIntoView({ behavior: 'smooth' });
}
