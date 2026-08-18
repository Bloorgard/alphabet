import { mountA } from './letters/a.js';

const LETTERS = [
  'А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ё', 'Ж', 'З', 'И', 'Й',
  'К', 'Л', 'М', 'Н', 'О', 'П', 'Р', 'С', 'Т', 'У', 'Ф', 'Х',
  'Ц', 'Ч', 'Ш', 'Щ', 'Ъ', 'Ы', 'Ь', 'Э', 'Ю', 'Я'
];

const READY = new Map([
  ['А', {
    number: '01',
    status: 'готово',
    description: 'Первая буква. Поле для будущей идеи.',
    mount: mountA
  }]
]);

const grid = document.querySelector('#letter-grid');
const dialog = document.querySelector('#letter-dialog');
const workspace = document.querySelector('#letter-workspace');
const dialogTitle = document.querySelector('#dialog-title');
const dialogKicker = document.querySelector('#dialog-kicker');
const dialogStatus = document.querySelector('#dialog-status');
const dialogDescription = document.querySelector('#dialog-description');
let unmountCurrent = null;

function renderGrid() {
  grid.innerHTML = LETTERS.map((letter, index) => {
    const item = READY.get(letter);
    const number = String(index + 1).padStart(2, '0');
    const state = item ? item.status : 'скоро';
    return `
      <button class="letter-card ${item ? 'ready' : ''}" type="button"
        ${item ? `data-letter="${letter}"` : 'aria-disabled="true" disabled'}
        aria-label="Буква ${letter}, ${state}">
        <span class="letter-glyph" aria-hidden="true">${letter}</span>
        <span class="letter-meta">
          <span>${number} / 33</span>
          <span class="letter-state">${state}</span>
          ${item ? '<span class="letter-arrow" aria-hidden="true">↗</span>' : ''}
        </span>
      </button>`;
  }).join('');
}

function openLetter(letter) {
  const item = READY.get(letter);
  if (!item) return;
  if (unmountCurrent) unmountCurrent();
  dialogTitle.textContent = letter;
  dialogKicker.textContent = `буква ${item.number} / 33`;
  dialogStatus.textContent = item.status;
  dialogDescription.textContent = item.description;
  workspace.querySelectorAll('[data-letter-layer]').forEach((node) => node.remove());
  dialog.showModal();
  unmountCurrent = item.mount(workspace) || null;
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
const initialLetter = new URLSearchParams(window.location.search).get('letter');
if (initialLetter === 'а' || initialLetter === 'a') openLetter('А');
