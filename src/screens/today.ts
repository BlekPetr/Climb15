import { currentStreak, dayKey, lastDays, parseDay } from '../engine/history';
import { routineDuration } from '../engine/routine';
import { getHistory, getRoutine, getSession } from '../store';
import { esc, ICONS, type Screen } from '../ui';

export const todayScreen: Screen = (root, nav) => {
  const today = dayKey(new Date());
  const history = getHistory();
  const done = new Set(history);
  const doneToday = done.has(today);
  const streak = currentStreak(history, today);
  const minutes = Math.round(routineDuration(getRoutine()) / 60);
  const resumable = getSession() !== null;

  const week = lastDays(today, 7)
    .map((d) => {
      const date = parseDay(d);
      const wd = date.toLocaleDateString(undefined, { weekday: 'narrow' });
      const full = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
      const isDone = done.has(d);
      return `<li class="dot${isDone ? ' is-done' : ''}${d === today ? ' is-today' : ''}">
        <span class="dot__mark" aria-hidden="true"></span>
        <span class="dot__day" aria-hidden="true">${esc(wd)}</span>
        <span class="sr-only">${esc(full)}: ${isDone ? 'done' : 'not done'}</span>
      </li>`;
    })
    .join('');

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const label = resumable ? 'Resume' : doneToday ? 'Go again' : 'Start';

  root.innerHTML = `
    <header class="page-head">
      <p class="eyebrow">${esc(dateLabel)}</p>
      <h1 class="title">Climb 15</h1>
    </header>

    <section class="today-status" aria-live="polite">
      ${
        doneToday
          ? `<p class="status status--done">${ICONS.check}<span>Done today</span></p>`
          : `<p class="status">Not done yet today</p>`
      }
    </section>

    <div class="start-wrap">
      <button class="start${doneToday && !resumable ? ' start--again' : ''}" id="start" type="button">
        <span class="start__label">${label}</span>
        <span class="start__sub">${minutes} min</span>
      </button>
    </div>

    <section class="card streak-card" aria-label="Streak">
      <div class="streak">
        <span class="streak__num">${streak}</span>
        <span class="streak__label">day${streak === 1 ? '' : 's'} streak</span>
      </div>
      <ol class="week" aria-label="Last 7 days">${week}</ol>
    </section>
  `;

  root.querySelector('#start')!.addEventListener('click', () => nav('#/session'));
};
