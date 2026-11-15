import { bestStreak, currentStreak, dayKey, monthGrid, parseDay } from '../engine/history';
import { getHistory } from '../store';
import { $, esc, ICONS, type Screen } from '../ui';

export const historyScreen: Screen = (root) => {
  const history = getHistory();
  const done = new Set(history);
  const today = dayKey(new Date());
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();

  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 10, 16 + i).toLocaleDateString(undefined, { weekday: 'narrow' }),
  ); // 2026-11-16 is a Monday

  root.innerHTML = `
    <header class="page-head">
      <p class="eyebrow">${history.length} session${history.length === 1 ? '' : 's'} total</p>
      <h1 class="title">History</h1>
    </header>
    <section class="stats" aria-label="Streaks">
      <div class="card stat"><span class="stat__num num">${currentStreak(history, today)}</span><span class="stat__label">Current streak</span></div>
      <div class="card stat"><span class="stat__num num">${bestStreak(history)}</span><span class="stat__label">Best streak</span></div>
    </section>
    <section class="card cal" aria-labelledby="cal-title">
      <div class="cal__head">
        <button class="icon-btn" id="prev" type="button" aria-label="Previous month">${ICONS.left}</button>
        <h2 class="cal__title" id="cal-title" aria-live="polite"></h2>
        <button class="icon-btn" id="nextm" type="button" aria-label="Next month">${ICONS.right}</button>
      </div>
      <table class="cal__grid">
        <thead><tr>${weekdayNames.map((d) => `<th scope="col" aria-hidden="true">${esc(d)}</th>`).join('')}</tr></thead>
        <tbody id="cal-body"></tbody>
      </table>
      <p class="cal__count muted small" id="cal-count"></p>
    </section>`;

  const title = $(root, '#cal-title');
  const body = $(root, '#cal-body');
  const count = $(root, '#cal-count');
  const nextBtn = $<HTMLButtonElement>(root, '#nextm');

  function render() {
    title.textContent = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const weeks = monthGrid(year, month);
    let n = 0;
    body.innerHTML = weeks
      .map(
        (w) =>
          `<tr>${w
            .map((d) => {
              if (!d) return '<td></td>';
              const isDone = done.has(d);
              if (isDone) n++;
              const label = parseDay(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
              return `<td><span class="day${isDone ? ' is-done' : ''}${d === today ? ' is-today' : ''}${d > today ? ' is-future' : ''}" aria-label="${esc(label)}${isDone ? ', done' : ''}">${Number(d.slice(8))}</span></td>`;
            })
            .join('')}</tr>`,
      )
      .join('');
    count.textContent = `${n} day${n === 1 ? '' : 's'} this month`;
    nextBtn.disabled = year === now.getFullYear() && month === now.getMonth();
  }

  $(root, '#prev').addEventListener('click', () => {
    month--;
    if (month < 0) { month = 11; year--; }
    render();
  });
  nextBtn.addEventListener('click', () => {
    month++;
    if (month > 11) { month = 0; year++; }
    render();
  });
  render();
};
