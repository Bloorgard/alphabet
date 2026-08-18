import { mountA } from './letters/a.js';
import { mountB } from './letters/b.js';

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
  ['Б', mountB]
]);

const grid = document.querySelector('#letter-grid');
const dialog = document.querySelector('#letter-dialog');
const workspace = document.querySelector('#letter-workspace');
const workspaceLabel = document.querySelector('#workspace-label');
let unmountCurrent = null;

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
  unmountCurrent = mount(workspace) || null;
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
