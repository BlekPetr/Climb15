import { addDone, currentStreak, dayKey } from '../engine/history';
import { fillTargets, stepDuration, type Routine } from '../engine/routine';
import {
  allCues,
  back,
  buildTimeline,
  cuesBetween,
  elapsedIn,
  isRunning,
  skip,
  snapshot,
  start,
  toggle,
  type Segment,
  type SegmentKind,
  type TimerState,
} from '../engine/timer';
import { cue, keepAwake, unlockAudio } from '../feedback';
import { reportDone } from '../reminder';
import { getHistory, getRoutine, getSession, getSettings, saveHistory, saveSession } from '../store';
import { $, esc, fmtClock, fmtCountdown, ICONS, type Screen } from '../ui';

const STATE_WORD: Record<SegmentKind, string> = {
  ready: 'Get ready',
  work: 'Go',
  hang: 'Hang',
  rest: 'Rest',
  hold: 'Hold',
};

const isCalm = (k: SegmentKind) => k === 'ready' || k === 'rest';

export const sessionScreen: Screen = (root, nav) => {
  // An unfinished session (e.g. the page was reloaded or the app killed) is
  // always resumed; it's discarded only via the close button or after 3 h.
  const stored = getSession();
  const routine: Routine = stored?.routine ?? getRoutine();
  let timer: TimerState = stored?.timer ?? start(Date.now());
  const tl = buildTimeline(routine);
  const cues = allCues(tl);
  const settings = getSettings();
  let lastPos = stored ? elapsedIn(timer, tl, Date.now()) : -1;
  let lastSeg = -1;
  let finished = false;

  unlockAudio(); // we're inside the Start tap's call stack
  const unlockOnTap = () => unlockAudio();
  root.addEventListener('pointerdown', unlockOnTap);
  keepAwake(true);

  const persist = () => saveSession({ routine, timer, savedAt: Date.now() });
  persist();

  root.innerHTML = `
    <div class="session" id="session">
      <header class="session__top">
        <button class="icon-btn" id="close" type="button" aria-label="End session">${ICONS.close}</button>
        <p class="session__meta"><span id="stepno"></span><span class="sep" aria-hidden="true">·</span><span id="left" class="num"></span></p>
      </header>
      <div class="bar" id="bar" role="progressbar" aria-label="Session progress" aria-valuemin="0" aria-valuemax="100">
        <div class="bar__fill" id="barfill"></div>
      </div>
      <main class="session__main">
        <p class="state" id="state"></p>
        <h1 class="step-name" id="name"></h1>
        <p class="phase" id="phase"></p>
        <div class="countdown num" id="count" role="timer" aria-atomic="true"></div>
        <div class="seg-bar" aria-hidden="true"><div class="seg-bar__fill" id="segfill"></div></div>
        <p class="summary" id="summary"></p>
        <p class="cue" id="cue" hidden></p>
      </main>
      <p class="next" id="next"></p>
      <div class="controls">
        <button class="ctrl" id="back" type="button" aria-label="Back">${ICONS.back}</button>
        <button class="ctrl ctrl--main" id="toggle" type="button" aria-label="Pause"></button>
        <button class="ctrl" id="skip" type="button" aria-label="Skip step">${ICONS.skip}</button>
      </div>
      <p class="sr-only" aria-live="assertive" id="announce"></p>
    </div>`;

  const el = {
    session: $(root, '#session'),
    stepno: $(root, '#stepno'),
    left: $(root, '#left'),
    bar: $(root, '#bar'),
    barfill: $(root, '#barfill'),
    state: $(root, '#state'),
    name: $(root, '#name'),
    phase: $(root, '#phase'),
    count: $(root, '#count'),
    segfill: $(root, '#segfill'),
    summary: $(root, '#summary'),
    cue: $(root, '#cue'),
    next: $(root, '#next'),
    toggle: $<HTMLButtonElement>(root, '#toggle'),
    announce: $(root, '#announce'),
  };

  function nextText(seg: Segment, nextInStep: Segment | null): string {
    const step = routine.steps[seg.stepIndex];
    if (nextInStep && seg.kind !== 'ready' && step.intervals) {
      return `Next: <b>${esc(nextInStep.label)}</b> <span class="num">${fmtClock(nextInStep.duration)}</span>`;
    }
    const ns = routine.steps[seg.stepIndex + 1];
    if (!ns) return seg.kind === 'ready' ? '' : 'Last step — almost there';
    return `Next step: <b>${esc(ns.name)}</b> <span class="num">${fmtClock(stepDuration(ns) * 1000)}</span>`;
  }

  function renderSegment(seg: Segment, nextInStep: Segment | null) {
    const step = routine.steps[seg.stepIndex];
    el.session.dataset.kind = seg.kind;
    el.session.dataset.calm = String(isCalm(seg.kind));
    el.stepno.textContent = `Step ${seg.stepIndex + 1} of ${routine.steps.length}`;
    el.state.textContent = STATE_WORD[seg.kind];
    el.name.textContent = step.name;
    let phase = '';
    if (seg.kind === 'ready') phase = fmtClock(stepDuration(step) * 1000) + (step.intervals ? ' · intervals' : '');
    else if (step.intervals) {
      const label = seg.label.toLowerCase() === STATE_WORD[seg.kind].toLowerCase() ? '' : seg.label;
      const set = seg.set ? `Set ${seg.set} of ${seg.sets}` : '';
      phase = [label, set].filter(Boolean).join(' · ');
    }
    el.phase.textContent = phase;
    el.summary.textContent = fillTargets(step.summary, step);
    el.cue.hidden = !step.cue;
    el.cue.textContent = step.cue ?? '';
    el.next.innerHTML = nextText(seg, nextInStep);
    el.announce.textContent = `${STATE_WORD[seg.kind]}. ${step.name}${phase ? `, ${phase}` : ''}.`;
  }

  function renderControls() {
    const running = isRunning(timer);
    el.toggle.innerHTML = running ? ICONS.pause : ICONS.play;
    el.toggle.setAttribute('aria-label', running ? 'Pause' : 'Resume');
    el.session.dataset.paused = String(!running);
  }

  function finish() {
    finished = true;
    const today = dayKey(new Date());
    const history = addDone(getHistory(), today);
    saveHistory(history);
    saveSession(null);
    keepAwake(false);
    void reportDone(today);
    const streak = currentStreak(history, today);
    root.innerHTML = `
      <div class="session session--done" data-kind="done">
        <main class="done">
          <div class="done__check" aria-hidden="true">${ICONS.check}</div>
          <h1 class="title">Done</h1>
          <p class="done__streak"><span class="num">${streak}</span> day${streak === 1 ? '' : 's'} streak</p>
          <p class="muted">Nice work. See you tomorrow.</p>
        </main>
        <div class="start-wrap"><button class="btn btn--primary btn--wide" id="home" type="button">Back to Today</button></div>
      </div>`;
    $(root, '#home').addEventListener('click', () => nav('#/today'));
    $<HTMLButtonElement>(root, '#home').focus();
  }

  function tick() {
    if (finished) return;
    const now = Date.now();
    const pos = elapsedIn(timer, tl, now);
    for (const c of cuesBetween(cues, lastPos, pos)) cue(c.type, settings);
    lastPos = pos;
    const snap = snapshot(tl, pos);
    if (snap.done) return finish();
    if (snap.segmentIndex !== lastSeg) {
      lastSeg = snap.segmentIndex;
      renderSegment(snap.segment, snap.nextInStep);
    }
    const text = fmtCountdown(snap.segmentRemaining);
    if (el.count.textContent !== text) {
      el.count.textContent = text;
      el.count.dataset.long = String(text.length > 2);
    }
    el.left.textContent = `${fmtClock(snap.workRemaining)} left`;
    const pct = Math.round(snap.progress * 1000) / 10;
    el.barfill.style.transform = `scaleX(${snap.progress})`;
    el.bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    el.segfill.style.transform = `scaleX(${1 - snap.segmentRemaining / snap.segment.duration})`;
  }

  function act(fn: (s: TimerState, now: number) => TimerState, seeked: boolean) {
    const now = Date.now();
    timer = fn(timer, now);
    if (seeked) {
      // Let the cue at the landing point (e.g. "get ready") fire once.
      lastPos = elapsedIn(timer, tl, now) - 1;
    }
    persist();
    renderControls();
    tick();
  }

  el.toggle.addEventListener('click', () => act(toggle, false));
  $(root, '#skip').addEventListener('click', () => act((s, n) => skip(s, tl, n), true));
  $(root, '#back').addEventListener('click', () => act((s, n) => back(s, tl, n), true));
  $(root, '#close').addEventListener('click', () => {
    if (!confirm('End this session? Progress will not be saved.')) return;
    saveSession(null);
    nav('#/today');
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault();
      act(toggle, false);
    } else if (e.key === 'ArrowRight') act((s, n) => skip(s, tl, n), true);
    else if (e.key === 'ArrowLeft') act((s, n) => back(s, tl, n), true);
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', tick);

  renderControls();
  tick();
  const iv = window.setInterval(tick, 100);

  return () => {
    clearInterval(iv);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', tick);
    root.removeEventListener('pointerdown', unlockOnTap);
    keepAwake(false);
  };
};
