import { fillTargets, routineDuration, stepDuration } from '../engine/routine';
import { getRoutine } from '../store';
import { esc, fmtDuration, type Screen } from '../ui';

export const exercisesScreen: Screen = (root) => {
  const routine = getRoutine();
  const items = routine.steps
    .map((step, i) => {
      const iv = step.intervals;
      const structure = iv
        ? `<ul class="phases">${(iv.repeat > 1 ? [`${iv.repeat} ×`] : [])
            .map((r) => `<li class="phases__rep">${esc(r)}</li>`)
            .concat(
              iv.phases.map(
                (p) =>
                  `<li class="pill pill--${p.kind === 'rest' ? 'rest' : 'active'}">${esc(p.label)} <span class="num">${p.duration} s</span></li>`,
              ),
            )
            .join('')}</ul>`
        : '';
      const targets = step.targets.length
        ? `<dl class="targets">${step.targets
            .map(
              (t) =>
                `<div><dt>${esc(t.label)}</dt><dd class="num">${t.max && t.max > t.value ? `${t.value}–${t.max}` : t.value}${t.unit === 'reps' ? '' : ` ${esc(t.unit)}`}</dd></div>`,
            )
            .join('')}</dl>`
        : '';
      return `
        <li class="card ex">
          <div class="ex__head">
            <span class="ex__no num" aria-hidden="true">${i + 1}</span>
            <h2 class="ex__name">${esc(step.name)}</h2>
            <span class="ex__dur num">${esc(fmtDuration(stepDuration(step)))}</span>
          </div>
          <p class="ex__desc">${esc(fillTargets(step.description, step))}</p>
          ${structure}
          ${targets}
          ${step.cue ? `<p class="cue">${esc(step.cue)}</p>` : ''}
          <ul class="tips">${step.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </li>`;
    })
    .join('');

  root.innerHTML = `
    <header class="page-head">
      <p class="eyebrow">${esc(fmtDuration(routineDuration(routine)))} · ${routine.steps.length} steps</p>
      <h1 class="title">Exercises</h1>
    </header>
    <ol class="ex-list">${items}</ol>
    <p class="muted small center">Change durations and rep targets in Settings.</p>`;
};
