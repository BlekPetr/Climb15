import { dayKey } from '../engine/history';
import { routineDuration, stepDuration, type Routine } from '../engine/routine';
import { disableReminder, downloadIcs, enableReminder, pushStatus, syncReminder } from '../reminder';
import { getHistory, getRoutine, getSettings, resetAll, resetRoutine, saveRoutine, saveSettings } from '../store';
import { $, esc, fmtDuration, type Screen } from '../ui';

const num = (path: string, value: number, label: string, min: number, max: number, suffix: string) => `
  <label class="num-field">
    <span class="num-field__label">${esc(label)}</span>
    <span class="num-field__input">
      <input type="number" inputmode="numeric" data-path="${esc(path)}" value="${value}" min="${min}" max="${max}" step="1" />
      <span class="num-field__suffix" aria-hidden="true">${esc(suffix)}</span>
    </span>
  </label>`;

function routineEditor(r: Routine): string {
  return r.steps
    .map((step, si) => {
      const fields: string[] = [];
      if (step.intervals) {
        if (step.intervals.repeat > 1 || step.id === 'fingers') {
          fields.push(num(`${si}.repeat`, step.intervals.repeat, 'Sets', 1, 20, '×'));
        }
        step.intervals.phases.forEach((p, pi) =>
          fields.push(num(`${si}.phase.${pi}`, p.duration, p.label, 1, 900, 's')),
        );
      } else {
        fields.push(num(`${si}.duration`, step.duration, 'Duration', 10, 1800, 's'));
      }
      step.targets.forEach((t, ti) => {
        const unit = t.unit === 'reps' ? 'reps' : t.unit;
        if (t.max !== undefined) {
          fields.push(num(`${si}.target.${ti}.value`, t.value, `${t.label} · min`, 0, 999, unit));
          fields.push(num(`${si}.target.${ti}.max`, t.max, `${t.label} · max`, 0, 999, unit));
        } else {
          fields.push(num(`${si}.target.${ti}.value`, t.value, t.label, 0, 999, unit));
        }
      });
      return `
        <fieldset class="step-edit">
          <legend><span>${esc(step.name)}</span> <span class="muted num" data-step-dur="${si}">${esc(fmtDuration(stepDuration(step)))}</span></legend>
          ${fields.join('')}
        </fieldset>`;
    })
    .join('');
}

function applyEdit(r: Routine, path: string, v: number): void {
  const [si, kind, a, b] = path.split('.');
  const step = r.steps[Number(si)];
  if (kind === 'duration') step.duration = v;
  else if (kind === 'repeat' && step.intervals) step.intervals.repeat = v;
  else if (kind === 'phase' && step.intervals) step.intervals.phases[Number(a)].duration = v;
  else if (kind === 'target') {
    const t = step.targets[Number(a)];
    if (b === 'max') t.max = v;
    else t.value = v;
  }
}

export const settingsScreen: Screen = (root, nav) => {
  let routine = getRoutine();

  function reminderBlock(): string {
    const s = getSettings();
    const st = pushStatus();
    let push = '';
    if (st === 'unsupported') push = '<p class="muted small">Push notifications aren’t supported in this browser. Use the calendar instead.</p>';
    else if (st === 'unconfigured') push = '<p class="muted small">Add a daily event to your calendar — it reminds you at the chosen time.</p>';
    else if (st === 'denied') push = '<p class="muted small">Notifications are blocked for this site. Allow them in the browser’s site settings, or use the calendar.</p>';
    else if (s.reminderEnabled) push = `<p class="status status--done small">Reminder on — daily at <span class="num">${esc(s.reminderTime)}</span>, skipped on days you’re done.</p>
        <button class="btn" id="rem-off" type="button">Turn off reminder</button>`;
    else push = '<button class="btn btn--primary" id="rem-on" type="button">Enable reminder</button>';
    return `
      <label class="row-field">
        <span>Reminder time</span>
        <input type="time" id="rem-time" value="${esc(s.reminderTime)}" required />
      </label>
      <div class="stack">${push}
        <p class="small rem-msg" id="rem-msg" role="status"></p>
        <button class="btn btn--link" id="ics" type="button">Add to calendar (.ics)</button>
      </div>`;
  }

  const s = getSettings();
  root.innerHTML = `
    <header class="page-head"><h1 class="title">Settings</h1></header>

    <section class="card section" aria-labelledby="h-rem">
      <h2 class="section__title" id="h-rem">Daily reminder</h2>
      <div id="rem">${reminderBlock()}</div>
    </section>

    <section class="card section" aria-labelledby="h-fb">
      <h2 class="section__title" id="h-fb">Feedback</h2>
      <label class="switch"><span>Sound</span><input type="checkbox" role="switch" id="sound" ${s.sound ? 'checked' : ''} /></label>
      <label class="switch"><span>Vibration</span><input type="checkbox" role="switch" id="vibration" ${s.vibration ? 'checked' : ''} /></label>
    </section>

    <section class="card section" aria-labelledby="h-rt">
      <h2 class="section__title" id="h-rt">Routine <span class="muted num" id="total"></span></h2>
      <p class="muted small">Adjust durations and rep targets as you progress.</p>
      <div id="editor">${routineEditor(routine)}</div>
      <button class="btn" id="reset-routine" type="button">Restore default routine</button>
    </section>

    <section class="card section" aria-labelledby="h-data">
      <h2 class="section__title" id="h-data">Data</h2>
      <p class="muted small">Everything is stored only on this device.</p>
      <button class="btn btn--danger" id="reset" type="button">Reset all data</button>
    </section>
    <p class="muted small center">Climb 15 · v${esc(__APP_VERSION__)}</p>`;

  const total = $(root, '#total');
  const showTotal = () => (total.textContent = fmtDuration(routineDuration(routine)));
  showTotal();

  // --- reminder
  const rem = $(root, '#rem');
  const msg = (t: string) => {
    const m = root.querySelector('#rem-msg');
    if (m) m.textContent = t;
  };
  const rerenderReminder = (message = '') => {
    rem.innerHTML = reminderBlock();
    msg(message);
  };
  rem.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id !== 'rem-time' || !t.value) return;
    saveSettings({ reminderTime: t.value });
    if (getSettings().reminderEnabled) {
      void syncReminder().then(() => rerenderReminder('Reminder time updated.'));
    } else rerenderReminder();
  });
  rem.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    if (btn.id === 'ics') downloadIcs();
    if (btn.id === 'rem-on') {
      btn.disabled = true;
      btn.textContent = 'Enabling…';
      try {
        await enableReminder(getHistory().includes(dayKey(new Date())));
        rerenderReminder('You’ll get a notification at the chosen time.');
      } catch (err) {
        rerenderReminder(err instanceof Error ? err.message : 'Could not enable the reminder.');
      }
    }
    if (btn.id === 'rem-off') {
      btn.disabled = true;
      await disableReminder();
      rerenderReminder('Reminder turned off.');
    }
  });

  // --- feedback toggles
  for (const key of ['sound', 'vibration'] as const) {
    $<HTMLInputElement>(root, `#${key}`).addEventListener('change', (e) =>
      saveSettings({ [key]: (e.target as HTMLInputElement).checked }),
    );
  }

  // --- routine editor
  const editor = $(root, '#editor');
  editor.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const path = input.dataset.path;
    if (!path) return;
    const min = Number(input.min);
    const max = Number(input.max);
    const v = Math.round(Number(input.value));
    if (!Number.isFinite(v) || input.value === '') {
      input.value = input.defaultValue;
      return;
    }
    const clamped = Math.min(max, Math.max(min, v));
    input.value = String(clamped);
    input.defaultValue = String(clamped);
    applyEdit(routine, path, clamped);
    saveRoutine(routine);
    const si = path.split('.')[0];
    const d = editor.querySelector(`[data-step-dur="${si}"]`);
    if (d) d.textContent = fmtDuration(stepDuration(routine.steps[Number(si)]));
    showTotal();
  });

  $(root, '#reset-routine').addEventListener('click', () => {
    if (!confirm('Restore the default routine? Your duration and target changes will be lost.')) return;
    resetRoutine();
    routine = getRoutine();
    editor.innerHTML = routineEditor(routine);
    showTotal();
  });

  $(root, '#reset').addEventListener('click', async () => {
    if (!confirm('Reset all data? This deletes your history, settings and routine changes.')) return;
    if (getSettings().reminderEnabled) await disableReminder();
    resetAll();
    nav('#/today');
  });
};
