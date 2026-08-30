/* Я — тридцать третья буква и единственная, которая сама себя называет.
   Поэтому её рисует не автор, а участники: клетка достаётся за игру в других
   буквах и ставится сюда. К 18 сентября большая Я собирается из чужих «я».

   Сцена показывает холст целиком и всё, что вокруг него: лидеров игровых
   букв, свой запас клеток, имя и правила. Канва — контур в одну клетку:
   подсказывает форму, но не запирает в ней, ставить можно и мимо. */

import { YA_AREA, YA_MASK, maskCells } from '../ya-mask.js?v=1';
import { joinPlayer, loadState, plural, putMark, renamePlayer } from '../wall.js?v=12';

const BOX = { x: 0.06, y: 0.14, size: 0.56 };
/* На телефоне холст занимает всю ширину окна: отступ оставлен ровно под
   рамку, которая обводит поле снаружи. */
const NARROW = { x: 0.028, y: 0.028, size: 0.944 };
const GRID = YA_MASK.length;

/* Клетки контура: те, у кого хотя бы один сосед снаружи буквы. */
function outline() {
  const inside = new Set(maskCells());
  const edge = [];
  for (const index of inside) {
    const x = index % GRID;
    const y = Math.floor(index / GRID);
    const empty = (dx, dy) => {
      const nx = x + dx;
      const ny = y + dy;
      return nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || !inside.has(ny * GRID + nx);
    };
    if (empty(-1, 0) || empty(1, 0) || empty(0, -1) || empty(0, 1)) edge.push(index);
  }
  return edge;
}

const EDGE = outline();

function when(stamp) {
  return new Date(stamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function mountYa(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  workspace.dataset.ground = 'paper';

  const panel = document.createElement('div');
  panel.className = 'ya-panel';
  panel.dataset.letterLayer = '';
  panel.innerHTML = `
    <p class="ya-title" id="ya-leaders-title">Лидеры</p>
    <ul class="ya-leaders" id="ya-leaders"></ul>
    <p class="ya-me" id="ya-me" hidden><span id="ya-me-name"></span> <button type="button" id="ya-me-change">(сменить)</button></p>
    <p class="ya-wallet" id="ya-wallet">—</p>
    <p class="ya-daily" id="ya-daily" hidden></p>
    <div class="ya-place" id="ya-place" hidden>
      <p id="ya-place-note"></p>
      <button type="button" id="ya-place-do">поставить клетку</button>
    </div>
    <form class="ya-name" id="ya-name">
      <input id="ya-name-input" maxlength="5" placeholder="имя" aria-label="Твоё имя">
      <button type="submit">вписать</button>
    </form>
  `;

  const count = document.createElement('p');
  count.className = 'ya-count';
  count.dataset.letterLayer = '';

  const rules = document.createElement('details');
  rules.className = 'ya-rules';
  rules.dataset.letterLayer = '';
  rules.innerHTML = `
    <summary>правила</summary>
    <p>Клетка достаётся за игру: за личный рекорд в букве и за подъём
    в десятке. В день ставится не больше пяти. Ставить можно куда угодно —
    контур только подсказывает. 18 сентября Я выйдет такой, какой вы её
    нарисуете.</p>
  `;

  workspace.append(panel, count, rules);

  const leaders = panel.querySelector('#ya-leaders');
  const leadersTitle = panel.querySelector('#ya-leaders-title');
  const wallet = panel.querySelector('#ya-wallet');
  const daily = panel.querySelector('#ya-daily');
  const place = panel.querySelector('#ya-place');
  const placeNote = panel.querySelector('#ya-place-note');
  const placeDo = panel.querySelector('#ya-place-do');
  const nameForm = panel.querySelector('#ya-name');
  const nameInput = panel.querySelector('#ya-name-input');
  const me = panel.querySelector('#ya-me');
  const meName = panel.querySelector('#ya-me-name');
  const meChange = panel.querySelector('#ya-me-change');

  let state = null;
  let size = 0;
  let box = BOX;
  let hover = null;
  let chosen = null;
  let renaming = false;
  let opened = null;    // буква, чью десятку сейчас смотрят
  let spotlight = null; // имя, чьи клетки подсвечены

  function grid() {
    return GRID * (2 ** (state?.level || 0));
  }

  function cellAt(event) {
    const bounds = canvas.getBoundingClientRect();
    const step = (box.size * size) / grid();
    const x = Math.floor((event.clientX - bounds.left - box.x * size) / step);
    const y = Math.floor((event.clientY - bounds.top - box.y * size) / step);
    if (x < 0 || y < 0 || x >= grid() || y >= grid()) return null;
    return { x, y };
  }

  function markAt(cell) {
    return state?.marks.find((mark) => mark.x === cell.x && mark.y === cell.y && mark.level === state.level);
  }

  /* Имя и клетки — две стороны одного: наведение на строку таблицы зажигает
     клетки этого человека, выбор клетки подсвечивает его строку. */
  function ownerName(mark) {
    return mark ? state.names[mark.owner] || null : null;
  }

  function draw() {
    const bounds = canvas.getBoundingClientRect();
    size = bounds.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(bounds.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, bounds.height);
    /* Порог тот же, что у стилей: там холст становится отдельным квадратом
       во всю ширину, и буква обязана занять его целиком. */
    box = window.innerWidth <= 560 ? NARROW : BOX;
    if (!state) return;

    const cells = grid();
    const step = (box.size * size) / cells;
    const gap = Math.max(0.5, step * 0.1);
    const left = box.x * size;
    const top = box.y * size;
    const styles = getComputedStyle(document.documentElement);
    const ink = styles.getPropertyValue('--ink').trim();
    const red = styles.getPropertyValue('--red').trim();
    const side = box.size * size;

    ctx.strokeStyle = 'rgba(22, 22, 22, .14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left - 8.5, top - 8.5, side + 17, side + 17);

    /* Канва — только на нулевом уровне: дальше буква уже набрана людьми. */
    if (!state.level) {
      ctx.fillStyle = 'rgba(22, 22, 22, .16)';
      for (const index of EDGE) {
        ctx.fillRect(left + (index % GRID) * step, top + Math.floor(index / GRID) * step, step - gap, step - gap);
      }
    }

    let mine = 0;
    for (const mark of state.marks) {
      const own = state.me && mark.owner === state.me;
      const lit = spotlight && ownerName(mark) === spotlight;
      if (own) mine += 1;
      const span = 2 ** (state.level - mark.level);
      ctx.globalAlpha = lit ? 1 : spotlight ? 0.16 : own ? 1 : Math.max(0.25, 0.72 / span);
      /* Выделенный игрок проступает тем, что гаснут все прочие, а не краской:
         красный на сайте означает ровно одно — эту клетку поставил ты. */
      ctx.fillStyle = own ? red : ink;
      ctx.fillRect(left + mark.x * span * step, top + mark.y * span * step, step * span - gap, step * span - gap);
    }
    ctx.globalAlpha = 1;

    for (const cell of [hover, chosen]) {
      if (!cell) continue;
      ctx.strokeStyle = cell === chosen ? red : ink;
      ctx.lineWidth = Math.max(1, step * 0.14);
      ctx.strokeRect(left + cell.x * step, top + cell.y * step, step, step);
    }

    count.textContent = mine
      ? `${state.marks.length}/${YA_AREA} · ${plural(mine, ['твоя', 'твои', 'твоих'])} ${mine}`
      : `${state.marks.length}/${YA_AREA}`;
  }

  /* Одна фраза про клетку: кто занял и когда, или что она свободна.
     Нужна и наведению, и выбору — текст обязан быть один и тот же. */
  const REFUSALS = {
    taken: 'эту клетку успели занять',
    daily: 'на сегодня клетки кончились',
    address: 'с этого адреса сегодня поставили всё, что можно',
    wallet: 'клеток не хватает',
    unknown: 'клетка не встала — попробуй ещё раз',
  };

  function describe(cell) {
    if (!cell) return '';
    const mark = markAt(cell);
    if (!mark) return `клетка ${cell.x}, ${cell.y} свободна`;
    const owner = state.names[mark.owner];
    const day = mark.createdAt ? `, ${when(mark.createdAt)}` : '';
    return `занято${owner ? `: ${owner}` : ''}${day}`;
  }

  /* Результат приходит от буквы как есть: у Ё это пройденная дистанция с
     дробью в семнадцать знаков. В таблице она не значит ничего, кроме шума,
     и вдобавок выталкивает строку за край телефона. */
  function score(value) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value));
  }

  /* Строка таблицы: слева место или буква, дальше имя и результат. */
  function row(head, name, value, picked, letter) {
    const tag = letter ? `data-letter-top="${letter}"` : '';
    return `<li class="ya-row${picked ? ' is-picked' : ''}"><button type="button" data-name="${name}" ${tag}><b>${head}</b><span>${name}</span><i>${score(value)}</i></button></li>`;
  }

  function render() {
    if (!state) return;

    const picked = ownerName(chosen && markAt(chosen));
    /* Возврат живёт в самом заголовке: отдельная строка «← лидеры» под
       заголовком читалась как второй заголовок и ломала таблицу, потому
       что стояла её строкой. */
    leadersTitle.innerHTML = opened
      ? `<button type="button" data-back>← лучшие в ${opened}</button>`
      : 'Лидеры';
    if (opened) {
      /* Десятка раскрывается на месте лидеров: в неё попадают за игру,
         значит смотреть её ходят отсюда же. */
      const rows = state.top?.[opened] || [];
      leaders.innerHTML = (rows.length
          ? rows.map(([name, value], i) => row(`${i + 1}`, name, value, name === picked)).join('')
          : '<li class="ya-empty">в этой букве ещё не играли</li>');
    } else {
      leaders.innerHTML = state.leaders.length
        ? state.leaders.map(([letter, name, value]) => row(letter, name, value, name === picked, letter)).join('')
        : '<li class="ya-empty">пока никто не играл</li>';
    }

    /* Величина одна: сколько клеток человек может поставить прямо сейчас.
       Запас и суточный лимит — два ограничителя, но держать в голове две
       цифры не нужно, важно меньшее из них. */
    const left = Math.max(0, state.limit - state.today);
    const ready = Math.min(state.wallet, left);
    wallet.textContent = state.name
      ? `у тебя ${ready} ${plural(ready, ['клетка', 'клетки', 'клеток'])}`
      : 'сначала имя';

    /* Вторая строка появляется только тогда, когда сутки придержали часть
       запаса: иначе она повторяла бы первую другими словами. */
    const held = state.wallet - ready;
    daily.hidden = !state.name || !held;
    daily.textContent = held ? `ещё ${held} ${plural(held, ['клетка', 'клетки', 'клеток'])} завтра` : '';
    daily.dataset.spent = String(!ready);

    nameForm.hidden = Boolean(state.name) && !renaming;
    me.hidden = !state.name || renaming;
    meName.textContent = state.name ? `ты — ${state.name}` : '';

    /* Постановка в два шага: клетка выбирается, потом подтверждается.
       На телефоне навести нечем, а промахнуться легко. */
    const shown = chosen || hover;
    if (shown) {
      place.hidden = false;
      if (placeNote.dataset.refused !== 'true') placeNote.textContent = describe(shown);
      placeDo.hidden = !chosen || Boolean(markAt(chosen)) || !state.name
        || !Math.min(state.wallet, Math.max(0, state.limit - state.today));
    } else {
      place.hidden = true;
    }
    draw();
  }

  async function refresh() {
    state = await loadState();
    render();
    document.dispatchEvent(new CustomEvent('wall-changed', { detail: state }));
  }

  const onMove = (event) => {
    const cell = cellAt(event);
    const same = hover && cell && hover.x === cell.x && hover.y === cell.y;
    if (same) return;
    hover = cell;
    canvas.style.cursor = cell ? 'pointer' : 'default';
    if (!chosen) {
      place.hidden = !cell;
      delete placeNote.dataset.refused;
      placeNote.textContent = describe(cell);
      placeDo.hidden = true;
    }
    draw();
  };

  const onDown = (event) => {
    const cell = cellAt(event);
    if (!cell) return;
    chosen = cell;
    render();
  };

  const onPlace = async () => {
    if (!chosen) return;
    const result = await putMark(chosen.x, chosen.y);
    if (!result.ok) {
      /* Молчащий отказ читается как поломка: человек жмёт, и ничего не
         происходит. Причина известна серверу — значит, её и показываем. */
      placeNote.textContent = REFUSALS[result.reason] || REFUSALS.unknown;
      placeNote.dataset.refused = 'true';
      await refresh();
      return;
    }
    chosen = null;
    await refresh();
  };

  const onName = async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim().toUpperCase();
    if (!/^[A-ZА-ЯЁ]{1,5}$/.test(name)) {
      nameInput.setAttribute('aria-invalid', 'true');
      return;
    }
    /* Имя хранится у участника, поэтому смена переподписывает и прежние
       клетки: человек остаётся собой, меняется только подпись. */
    await (state?.name ? renamePlayer(name) : joinPlayer(name));
    renaming = false;
    nameInput.value = '';
    await refresh();
  };

  const onRename = () => {
    renaming = true;
    nameInput.value = state?.name || '';
    render();
    nameInput.focus();
    nameInput.select();
  };

  /* Enter в поле имени: неявная отправка формы срабатывает не везде,
     а это единственное место, где человека просят что-то ввести. */
  const onKey = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    nameForm.requestSubmit();
  };

  const onLeaderHover = (event) => {
    const row = event.target.closest('[data-name]');
    const name = row?.dataset.name || null;
    if (name === spotlight) return;
    spotlight = name;
    draw();
  };

  const onLeaders = (event) => {
    const back = event.target.closest('[data-back]');
    if (back) {
      opened = null;
      render();
      return;
    }
    const row = event.target.closest('[data-letter-top]');
    if (!row) return;
    opened = row.dataset.letterTop;
    render();
  };

  const onResize = () => draw();

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  placeDo.addEventListener('click', onPlace);
  nameForm.addEventListener('submit', onName);
  nameInput.addEventListener('keydown', onKey);
  meChange.addEventListener('click', onRename);
  leaders.addEventListener('click', onLeaders);
  leadersTitle.addEventListener('click', onLeaders);
  leaders.addEventListener('pointerover', onLeaderHover);
  leaders.addEventListener('pointerleave', onLeaderHover);
  window.addEventListener('resize', onResize);

  refresh().catch(() => {
    wallet.textContent = 'холст недоступен';
  });

  return () => {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    placeDo.removeEventListener('click', onPlace);
    nameForm.removeEventListener('submit', onName);
    nameInput.removeEventListener('keydown', onKey);
    meChange.removeEventListener('click', onRename);
    leaders.removeEventListener('click', onLeaders);
    leadersTitle.removeEventListener('click', onLeaders);
    leaders.removeEventListener('pointerover', onLeaderHover);
    leaders.removeEventListener('pointerleave', onLeaderHover);
    window.removeEventListener('resize', onResize);
    panel.remove();
    count.remove();
    rules.remove();
    delete workspace.dataset.ground;
  };
}
