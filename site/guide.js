'use strict';
/* ================= «Про джинів» (the guide) and the «Білди» page frame ================= */
/* globals: $, h, esc, BY_ID, G, STATS, STAT_UK, iconSrc */
let GUIDE = null;   // data/guide.json (tools/build_guide.py)

const gSkill = (id) => (BY_ID[id]
  ? `<a class="gskill" href="#skill/${id}" data-tip="gtree:${id}"><img src="${iconSrc(id)}" alt="">${esc(BY_ID[id].name)}</a>` : '');
const gSkills = (ids) => `<span class="gskills">${ids.map(gSkill).join('')}</span>`;
const gIcons = (ids) => `<span class="gicons">${ids.filter((id) => BY_ID[id]).map((id) =>
  `<a href="#skill/${id}" data-tip="gtree:${id}"><img src="${iconSrc(id)}" alt="${esc(BY_ID[id].name)}"></a>`).join('')}</span>`;
const STAT_COLOR = { strength: '#ff7a5a', agility: '#7ee35a', vitality: '#ffcb4a', intellect: '#6fb6ff' };

/* ---------- «Білди»: players' builds (builds.js) ---------- */
function renderBuilds() {
  $('#p-list').innerHTML = `
    <div class="g-hero small"><div>
      <h2>Білди</h2>
      <p>Збірки гравців: складіть джина в <a href="#calc">калькуляторі</a> і натисніть «Зберегти» у вікні джина.
        Поради, які скіли брати, — у <a href="#about">гайді</a>.</p></div></div>
    <section id="pb"></section>`;
}

/* ---------- «Про джинів»: the guide ---------- */
const FACTS = [
  ['105', 'максимальний рівень', 'досвід на рівень — 40% досвіду персонажа'],
  ['26', 'очок стихій', '1 + 1 за 5 рівнів до 100-го, далі +1 за рівень; до 8 в одну стихію'],
  ['4–8', 'слотів скілів', 'від очок удачі: >50 → 5, >70 → 6, >80 → 7, >90 → 8'],
  ['100 + Витр', 'енергія', 'відновлення 1 + 0,02 × Інтелект за секунду'],
  ['40', 'дешевих очок', 'перші 40 очок у стат — по 1, далі по 2'],
  ['1–10', 'очок удачі', 'кожні 10 рівнів; у джина з Загадкової лампи — завжди 10'],
];

/* ---------- beginner part: getting, levelling, stamina, equipment, resets ---------- */
const gItem = (id, name) => `<span class="gitem"><img src="icons/items/${id}.png" alt="">${esc(name)}</span>`;
const NPC = '<b class="npc">Дослідник п\'яти стихій</b>';

function newbieSections() {
  const eqLv = [[1, 1, 1], [2, 11, 2], [3, 21, 6], [4, 31, 18], [5, 41, 72], [6, 51, 288]];
  return `
    <section class="g-sec" id="g-start"><h3>Для новачків: перші кроки</h3>
      <ol class="g-steps">
        <li><b>Отримайте джина.</b> Перший джин дається при створенні персонажа. Інший тип можна зробити в NPC ${NPC}
          (є в кожному великому місті й у стартовій локації), «Кування спорядження джина» → вкладка «Джинн»:
          будь-яка з чотирьох Душ коштує ${gItem(11208, '3 × Камінь безсмертних')}.</li>
        <li><b>Вдягніть його.</b> Перетягніть джина в порожній слот спорядження праворуч від кілець. Вікно джина — правий клік по
          його іконці на екрані. <span class="warn">У бойовому режимі змінити джина не можна.</span></li>
        <li><b>Розподіліть очки.</b> Характеристики — у вікні джина (Статус), стихії — кнопкою «Стихії».
          Не знаєте як — зберіть джина в <a href="#calc">калькуляторі</a> або подивіться <a href="#builds">білди гравців</a>.</li>
        <li><b>Вивчіть скіли</b> у ${NPC}. Скіли вчаться за Дух персонажа, кожен рівень скіла —
          з певного рівня джина. Без потрібних стихій скіл не вивчити й не застосувати.</li>
      </ol>
    </section>

    <section class="g-sec" id="g-level"><h3>Прокачка</h3>
      <div class="g-two">
        <div class="g-box"><h4>Три способи</h4>
          <ul>
            <li><b>Камені досвіду</b> — енергію каменя переносять у досвід джина. Завдання ${NPC} на 19, 49 і 79 рівнях дають
              ${gItem(23973, 'Звичайний')} ${gItem(23974, 'Сторічний')} ${gItem(23975, 'Чудовий Юань Ши')} (1&nbsp;000 / 10&nbsp;000 / 100&nbsp;000 досвіду).
              Ще ${gItem(23544, 'Камінь досвіду')} дає розібраний джин — так досвід переходить до нового джина (див. нижче).</li>
            <li><b>Досвід персонажа</b> — витрачається на джина у вікні «Досвід».</li>
            <li><b>Дух персонажа</b> — найпростіший і найпопулярніший спосіб.</li>
          </ul>
          <p class="muted">У вікні «Досвід»: «Покращити» — одразу наступний рівень, якщо вистачає; «Ін'єкція» (утримувати) — заливати
            потроху. <span class="warn">Витрачений досвід / Дух не повертається.</span> Після 100 рівня інколи «Покращити» не спрацьовує —
            тоді тримайте «Ін'єкцію». На рівень джину потрібно 40% досвіду персонажа того ж рівня (1 → 22, 20 → 10 000, 31 → 27 218).</p>
          <p class="muted">Показник <b>«Частка досвіду»</b> залежить від способу: за Дух — 5% × рівень джина, але не менше 50%
            (до 10 рівня 50%, 20 — 100%, 31 — 155%, 40 — 200%); за досвід персонажа — 1% × рівень джина (31 — 31%, 40 — 40%, 50 — 50%).
            Тобто з 10 рівня частка за Дух уп'ятеро більша.</p>
        </div>
        <div class="g-box"><h4>Що дає рівень</h4>
          <ul class="g-gain">
            <li><b>+1</b> очко характеристик за кожен рівень</li>
            <li><b>+1–10</b> очок удачі кожні 10 рівнів (і стільки ж додаткових очок характеристик)</li>
            <li><b>+1</b> очко стихій кожні 5 рівнів до 100-го, далі — щорівня (разом 26)</li>
            <li>з удачею росте кількість слотів (4 → 8) і <b>змінюється вигляд</b> джина</li>
          </ul>
          <div class="g-slots">${[['0–50', 4], ['51–70', 5], ['71–80', 6], ['81–90', 7], ['91–100', 8]].map(([r, n]) =>
    `<div><b>${n}</b><small>удача ${r}</small></div>`).join('')}</div>
        </div>
      </div>
    </section>

    <section class="g-sec" id="g-energy"><h3>Енергія і витривалість</h3>
      <div class="g-two">
        <div class="g-box"><h4>Енергія</h4>
          <p>Витрачається на кожен скіл. Максимум = 100 + Витривалість (характеристика), відновлення = 1 + 0,02 × Інтелект на секунду
            (кожні 50 Інтелекту — +1/с). Коли енергії мало, скіл не спрацює. Тому стандартний джин — «інтелект + витривалість».</p>
        </div>
        <div class="g-box"><h4>Витривалість (до 999 999)</h4>
          <p>Окремий запас, що теж витрачається скілами й сам не відновлюється; на нулі джин не може використовувати скіли.
            Поповнюється каменями 1–10 рівня:</p>
          <div class="g-items">${[[5630, 'Камінь одного джерела'], [5631, 'двох ритуалів'], [5632, 'трьох талантів'], [5633, 'чотирьох напрямків'],
    [5634, "п'яти стихій"], [5635, 'шести союзів'], [5636, 'семи зірок'], [5637, 'восьми триграм'], [5638, "дев'яти палаців"],
    [5639, 'Досконалий камінь']].map(([id, n]) => gItem(id, n)).join('')}</div>
        </div>
      </div>
    </section>

    <section class="g-sec" id="g-gear"><h3>Спорядження джина</h3>
      <p>Чотири слоти: <b>Яшма, Амулет, Дзеркало, Перлина</b>. Кожна річ додає характеристики й рахується в енергії та бонусах скілів.
        <span class="warn">Зняти спорядження не можна — лише замінити іншим, стара річ зникає.</span>
        Робиться в ${NPC} («Кування спорядження джина») — усі рецепти у вкладці <a href="#equip">Спорядження</a>.</p>
      <div class="g-two">
        <div class="g-box"><h4>${gItem(24633, 'За Знаки Бойової пісні')}</h4>
          <table class="g-tbl"><thead><tr><th>Рівень речі</th><th>Рівень джина</th><th>Бонус</th><th>Знаків усього</th></tr></thead>
          <tbody>${eqLv.map(([l, gl, n]) => `<tr><td>${l}</td><td>${gl}+</td><td>+${l} до однієї</td><td>${n}</td></tr>`).join('')}</tbody></table>
          <p class="muted">Максимум — +6 у кожному слоті, разом +24.</p>
        </div>
        <div class="g-box"><h4>${gItem(24673, 'За Медалі Бойової пісні')}</h4>
          <p>Найсильніше спорядження: <b>+4 до двох</b> характеристик (наприклад, витривалість + інтелект), з 65 рівня джина,
            3 медалі за річ. Разом до +16 у дві характеристики.</p>
          <p class="muted">Знаки й медалі вибиваються в Місті Бойових пісень або купуються в гравців.</p>
        </div>
      </div>
    </section>

    <section class="g-sec" id="g-reset"><h3>Скидання, передача, розбирання</h3>
      <div class="g-cards3">
        <div class="g-box"><h4>${gItem(23552, 'Жезл оновлення')}</h4>
          <p>Скидає характеристики: у ${NPC} (скидання характеристик). <b>1 жезл = 1 очко.</b></p></div>
        <div class="g-box"><h4>${gItem(23553, 'Камінь оновлення')}</h4>
          <p>Скидає <b>всі</b> очки стихій: у ${NPC} (скидання стихій). Поки не розподілите стихії знову, вивчені скіли не працюють.</p></div>
        <div class="g-box"><h4>Забути скіл</h4>
          <p>у ${NPC} можна знизити рівень скіла або прибрати його зовсім. Перевчання витрачає Дух.</p></div>
        <div class="g-box"><h4>Продати / передати</h4>
          <p>Джин прив'язаний. Кнопка «Статус» у вікні джина → зміна статусу, після відв'язки його можна продати або передати.
            На CyberPW це швидко: на низьких рівнях — кілька хвилин, максимум — 3 години (опис у грі досі пише 168 годин).</p></div>
        <div class="g-box"><h4>${gItem(23544, 'Розібрати')}</h4>
          <p>У ${NPC} (розділення джина): джин зникає, натомість — Камінь досвіду, який можна влити в іншого джина. Повернути розібраного
            джина не можна. Камінь зберігає лише частину досвіду: джин 10 рівня дав камінь на 1&nbsp;012, хоча прокачка до 10 рівня — 6&nbsp;440.
            Джина від 40 рівня — лише після зміни статусу.</p></div>
      </div>
    </section>`;
}

function renderGuide(cats) {
  const maxInit = 15;
  const genieCard = (g) => `<div class="g-genie">
    <img src="${g.avatars[g.avatars.length - 1]}" alt="">
    <div class="gg-body"><b style="color:#${g.color}">${esc(g.name)}</b>
      <small class="muted">Дослідник п'яти стихій · 3 Камені безсмертних</small>
      ${STATS.map((s) => `<div class="gbar"><span>${STAT_UK[s]}</span><i style="width:${(g.init[s] / maxInit) * 100}%;background:${STAT_COLOR[s]}"></i><em>${g.init[s]}</em></div>`).join('')}
      <div class="gg-skill">${g.init_skills.map(gSkill).join('')}</div></div></div>`;
  const CAT_COLOR = { immune: '#6fb6ff', cleanse: '#7ee35a', elem: '#ffcb4a', debuff: '#c07aff', dmg: '#ff7a5a',
    control: '#5ad6d6', buff: '#ffdc50', attack: '#ff9f43' };

  $('#about').innerHTML = `
    <div class="g-hero">
      <div class="g-hero-text">
        <h2>Гайд по джинах</h2>
        <p>Джин — маленький помічник, що б'ється поруч: дає імуни, знімає контроль, прискорює і послаблює ворогів.
          Тут — як він працює, які скіли брати і чому, з урахуванням правил сервера CyberPW.</p>
        <nav class="guide-toc">${[['basics', 'Основи'], ['start', 'Для новачків'], ['types', 'Джини'], ['rules', 'Правила'], ['cats', 'Категорії'],
    ['classes', 'Класи']].map(([id, t]) => `<a href="#about" data-to="g-${id}">${t}</a>`).join('')}</nav>
      </div>
      <div class="g-hero-pics">${G.genies.filter((g) => g.source === 'npc').map((g) => `<img src="${g.avatars[g.avatars.length - 1]}" alt="">`).join('')}</div>
    </div>

    <section class="g-sec" id="g-basics"><h3>Основи</h3>
      <div class="g-facts">${FACTS.map(([n, t, d]) => `<div class="g-fact"><b>${n}</b><span>${t}</span><small>${d}</small></div>`).join('')}</div>
      <div class="g-callout"><b>Сила і Спритність</b> посилюють окремі скіли — шкоду, шанс, тривалість, знижку енергії
        (рядки «Вплив сили/спритності» в описі скіла). Гра в підказці показує лише базове число, а калькулятор — уже з бонусом.
        Скіли вчаться у NPC «Дослідник п'яти стихій» за Дух персонажа, потрібні стихії мають бути в джина на момент застосування.</div>
    </section>

    ${newbieSections()}

    <section class="g-sec" id="g-types"><h3>Джини</h3>
      <p class="muted">Від джина залежать лише стартові характеристики і стартовий скіл — решту визначаєте ви.
        Найчастіше радять Тай Сюань (витривалість) або Тай Бо (інтелект).</p>
      <div class="g-genies">${G.genies.filter((g) => g.source === 'npc').map(genieCard).join('')}</div>
      <div class="g-two g-gextra">
        <div class="g-box lamp"><h4>${gItem(53635, 'Загадкова лампа — джин 100/100')}</h4>
          <p>Єдиний спосіб отримати джина з <b>гарантовано максимальною удачею</b>: 10 очок кожні 10 рівнів, отже 8 слотів і
            100 додаткових очок характеристик на 100 рівні. Це окремі Душі ☆☆☆ (Тай Чін, Тай Інь, Тай Бо, Тай Сюань) з тими самими
            стартовими характеристиками, що й звичайні.</p></div>
        <div class="g-box"><h4>Джини Мисливця за скарбами</h4>
          <p>Душі Амон Ра, Таран Тул, Бан Зай і Кан Міл відрізняються лише іконкою та червоним підписом. Характеристики й шанси
            на очки удачі — такі самі, як у звичайних Душ, тож у калькуляторі їх окремо немає.</p></div>
      </div>
    </section>

    <section class="g-sec" id="g-rules"><h3>Головні правила</h3>
      <div class="g-rules">${GUIDE.rules.map((r, i) => `<div class="g-rule"><span class="num">${i + 1}</span>
        <div><b>${esc(r.title)}</b><p>${esc(r.text)}</p>${r.skills.length ? gIcons(r.skills) : ''}</div></div>`).join('')}</div>
    </section>

    <section class="g-sec" id="g-cats"><h3>Категорії скілів</h3>
      <p class="muted">У калькуляторі за категорією можна фільтрувати дерево скілів.</p>
      <div class="g-cats">${cats.categories.map((c) => `<div class="g-cat" style="--cc:${CAT_COLOR[c.key] || '#ffcb4a'}">
        <div class="gc-head"><b>${esc(c.name)}</b><span>${c.skills.length}</span></div>
        <p>${esc(GUIDE.cat_desc[c.key] || '')}</p>${gIcons(c.skills)}</div>`).join('')}</div>
    </section>

    <section class="g-sec" id="g-classes"><h3>Скіли по класах</h3>
      <p class="g-disclaimer">Зібрано з гайдів і порад гравців в інтернеті — це <b>лише приклади</b>, а не єдино правильні набори.
        Підбирайте скіли під свій стиль гри й перевіряйте в калькуляторі.</p>
      <div class="g-ctabs" role="tablist">${GUIDE.classes.map((c, i) => `<button type="button" role="tab" data-ci="${i}"${i ? '' : ' aria-selected="true"'}>${esc(c.name)}</button>`).join('')}</div>
      ${GUIDE.classes.map((c, i) => `<div class="g-class" data-ci="${i}"${i ? ' hidden' : ''}>
        <div class="g-cols">
          <div class="g-col pvp"><h4>ПвП</h4>${gSkills(c.pvp)}</div>
          <div class="g-col pve"><h4>ПвЕ</h4>${gSkills(c.pve)}</div>
        </div>
        <p class="g-note">${esc(c.note)}</p>
        <p class="g-stats"><span>Стати джина</span> ${esc(c.stats)}</p>
      </div>`).join('')}
    </section>
    `;

  const root = $('#about');
  root.querySelectorAll('[data-to]').forEach((a) => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    document.getElementById(a.dataset.to).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  root.querySelectorAll('.g-ctabs button').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('.g-ctabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    root.querySelectorAll('.g-class').forEach((p) => { p.hidden = p.dataset.ci !== b.dataset.ci; });
  }));
}
