import { mountA } from './letters/a.js';
import { mountB } from './letters/b.js';
import { mountV } from './letters/v.js';
import { mountG } from './letters/g.js';
import { mountD } from './letters/d.js';
import { mountE } from './letters/e.js?v=2';

const LETTERS = [
  'А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ё', 'Ж', 'З', 'И', 'Й',
  'К', 'Л', 'М', 'Н', 'О', 'П', 'Р', 'С', 'Т', 'У', 'Ф', 'Х',
  'Ц', 'Ч', 'Ш', 'Щ', 'Ъ', 'Ы', 'Ь', 'Э', 'Ю', 'Я'
];

// Челлендж стартовал с А: каждая следующая буква — следующий день.
const START = Date.UTC(2026, 7, 17);
const DAY = 86400000;

// Буква считается готовой, когда у неё есть mount-модуль.
const READY = new Map([
  ['А', mountA],
  ['Б', mountB],
  ['В', mountV],
  ['Г', mountG],
  ['Д', mountD],
  ['Е', mountE]
]);

const grid = document.querySelector('#letter-grid');
const dialog = document.querySelector('#letter-dialog');
const workspace = document.querySelector('#letter-workspace');
const workspaceLabel = document.querySelector('#workspace-label');
let unmountCurrent = null;

function mountWorkspaceHint(letter) {
  const hint = workspace.querySelector('.workspace-hint');
  if (!hint) return () => {};

  hint.dataset.mobileOpen = 'false';
  hint.id ||= `workspace-hint-${letter.toLowerCase()}`;

  const info = document.createElement('button');
  info.type = 'button';
  info.className = 'workspace-info';
  info.dataset.letterLayer = '';
  info.textContent = 'i';
  info.setAttribute('aria-label', 'Показать подсказку');
  info.setAttribute('aria-controls', hint.id);
  info.setAttribute('aria-expanded', 'false');

  const closeHint = () => {
    hint.dataset.mobileOpen = 'false';
    info.setAttribute('aria-label', 'Показать подсказку');
    info.setAttribute('aria-expanded', 'false');
  };

  const onInfoClick = () => {
    const open = hint.dataset.mobileOpen !== 'true';
    if (!open) {
      closeHint();
      return;
    }
    hint.dataset.mobileOpen = 'true';
    info.setAttribute('aria-label', 'Скрыть подсказку');
    info.setAttribute('aria-expanded', 'true');
    const panel = workspace.querySelector('.sketch-panel');
    const toggle = workspace.querySelector('.sketch-toggle');
    if (panel) panel.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  };

  const onWorkspaceClick = (event) => {
    if (event.target.closest('.sketch-toggle')) closeHint();
  };

  info.addEventListener('click', onInfoClick);
  workspace.addEventListener('click', onWorkspaceClick);
  workspace.append(info);

  return () => {
    info.removeEventListener('click', onInfoClick);
    workspace.removeEventListener('click', onWorkspaceClick);
    info.remove();
  };
}

function numberOf(letter) {
  return String(LETTERS.indexOf(letter) + 1).padStart(2, '0');
}

function dateOf(letter) {
  const date = new Date(START + LETTERS.indexOf(letter) * DAY);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

function renderGrid() {
  grid.innerHTML = LETTERS.map((letter) => {
    const ready = READY.has(letter);
    const state = ready ? 'готово' : dateOf(letter);
    return `
      <button class="letter-card ${ready ? 'ready' : ''}" type="button"
        ${ready ? `data-letter="${letter}"` : 'aria-disabled="true" disabled'}
        aria-label="Буква ${letter}, ${ready ? 'готово' : `появится ${state}`}">
        <span class="letter-glyph" aria-hidden="true">${letter}</span>
        <span class="letter-meta">
          <span>${numberOf(letter)} / 33</span>
          <span class="letter-state">${state}</span>
        </span>
      </button>`;
  }).join('');
  document.querySelector('#ready-count').textContent = READY.size;
}

function openLetter(letter) {
  const mount = READY.get(letter);
  if (!mount) return;
  if (unmountCurrent) unmountCurrent();
  workspace.querySelectorAll('[data-letter-layer]').forEach((node) => node.remove());
  workspaceLabel.textContent = `${letter} · ${numberOf(letter)} / 33`;
  dialog.setAttribute('aria-label', `Буква ${letter}`);
  dialog.showModal();
  const unmountLetter = mount(workspace) || null;
  const unmountHint = mountWorkspaceHint(letter);
  unmountCurrent = () => {
    unmountHint();
    if (unmountLetter) unmountLetter();
  };
  history.replaceState(null, '', `?letter=${encodeURIComponent(letter.toLowerCase())}`);
}

function closeLetter() {
  if (!dialog.open) return;
  dialog.close();
  if (unmountCurrent) unmountCurrent();
  unmountCurrent = null;
  history.replaceState(null, '', window.location.pathname);
}

grid.addEventListener('click', (event) => {
  const card = event.target.closest('[data-letter]');
  if (card) openLetter(card.dataset.letter);
});
document.querySelector('[data-close-dialog]').addEventListener('click', closeLetter);
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) closeLetter();
});
dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeLetter();
});

renderGrid();
const initialLetter = (new URLSearchParams(window.location.search).get('letter') || '').toUpperCase();
if (READY.has(initialLetter)) openLetter(initialLetter);
