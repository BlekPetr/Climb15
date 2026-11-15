import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTINE, fillTargets, isValidRoutine, routineDuration, type Routine } from './routine';
import {
  allCues,
  back,
  buildTimeline,
  cuesBetween,
  elapsed,
  elapsedIn,
  pause,
  READY_MS,
  resume,
  seek,
  skip,
  snapshot,
  start,
  stepStart,
  toggle,
} from './timer';

const T0 = 1_700_000_000_000;
const tl = buildTimeline(DEFAULT_ROUTINE);

describe('routine data', () => {
  it('default routine is exactly 900 s of work', () => {
    expect(routineDuration(DEFAULT_ROUTINE)).toBe(900);
    expect(DEFAULT_ROUTINE.steps.map((s) => s.id)).toEqual([
      'warmup', 'fingers', 'pulling', 'core', 'antagonists', 'flexibility',
    ]);
    expect(isValidRoutine(DEFAULT_ROUTINE)).toBe(true);
  });

  it('fills target placeholders, including ranges and units', () => {
    const anta = DEFAULT_ROUTINE.steps[4];
    expect(fillTargets(anta.summary, anta)).toBe(
      '10–15 push-ups · then 10 overhead presses per arm, 4 kg kettlebell',
    );
    const fingers = DEFAULT_ROUTINE.steps[1];
    expect(fillTargets('{hang}', fingers)).toBe('10 s');
    expect(fillTargets('{nope}', fingers)).toBe('{nope}');
  });

  it('rejects broken routines', () => {
    expect(isValidRoutine(null)).toBe(false);
    expect(isValidRoutine({ version: 1, steps: [] })).toBe(false);
    const bad = structuredClone(DEFAULT_ROUTINE) as Routine;
    bad.steps[1].intervals!.phases[0].duration = 0;
    expect(isValidRoutine(bad)).toBe(false);
  });
});

describe('timeline', () => {
  it('lays out ready + phases per step', () => {
    expect(tl.workTotal).toBe(900_000);
    expect(tl.total).toBe(900_000 + 6 * READY_MS);
    expect(tl.stepCount).toBe(6);
    // warm-up: ready + work
    expect(tl.segments.slice(0, 2).map((s) => s.kind)).toEqual(['ready', 'work']);
    // fingers: ready + 3 x (hang, rest)
    const fingers = tl.segments.filter((s) => s.stepIndex === 1);
    expect(fingers.map((s) => s.kind)).toEqual(['ready', 'hang', 'rest', 'hang', 'rest', 'hang', 'rest']);
    expect(fingers[1]).toMatchObject({ duration: 10_000, set: 1, sets: 3 });
    expect(fingers[6]).toMatchObject({ duration: 50_000, set: 3, sets: 3 });
    // flexibility: ready + 4 holds, no set numbers (repeat 1)
    const flex = tl.segments.filter((s) => s.stepIndex === 5);
    expect(flex.map((s) => s.duration)).toEqual([3000, 60_000, 60_000, 30_000, 30_000]);
    expect(flex[1].set).toBeUndefined();
  });

  it('segments are contiguous', () => {
    for (let i = 1; i < tl.segments.length; i++) {
      const p = tl.segments[i - 1];
      expect(tl.segments[i].start).toBe(p.start + p.duration);
    }
  });

  it('can be built without get-ready', () => {
    const t = buildTimeline(DEFAULT_ROUTINE, 0);
    expect(t.total).toBe(900_000);
    expect(t.segments.some((s) => s.kind === 'ready')).toBe(false);
  });
});

describe('timer state', () => {
  it('elapsed is based on timestamps only (no drift)', () => {
    const s = start(T0);
    expect(elapsed(s, T0)).toBe(0);
    expect(elapsed(s, T0 + 12_345)).toBe(12_345);
    // Huge jump, e.g. tab backgrounded for an hour: clamps to the end.
    expect(elapsedIn(s, tl, T0 + 3_600_000)).toBe(tl.total);
    expect(snapshot(tl, elapsedIn(s, tl, T0 + 3_600_000)).done).toBe(true);
  });

  it('pause freezes time and resume continues from the same point', () => {
    let s = start(T0);
    s = pause(s, T0 + 5000);
    expect(elapsed(s, T0 + 60_000)).toBe(5000);
    expect(pause(s, T0 + 70_000)).toBe(s); // idempotent
    s = resume(s, T0 + 60_000);
    expect(elapsed(s, T0 + 61_000)).toBe(6000);
    expect(resume(s, T0 + 62_000)).toBe(s); // idempotent
    s = toggle(s, T0 + 62_000);
    expect(s.runningSince).toBeNull();
    expect(elapsed(s, T0 + 99_000)).toBe(7000);
  });

  it('a backwards clock jump never produces negative progress', () => {
    const s = start(T0);
    expect(elapsed(s, T0 - 10_000)).toBe(0);
  });

  it('skip jumps to the next step get-ready, preserving running state', () => {
    let s = start(T0);
    s = skip(s, tl, T0 + 10_000);
    expect(elapsed(s, T0 + 10_000)).toBe(stepStart(tl, 1));
    expect(s.runningSince).toBe(T0 + 10_000);
    const snap = snapshot(tl, elapsed(s, T0 + 10_000));
    expect(snap.stepIndex).toBe(1);
    expect(snap.segment.kind).toBe('ready');

    const paused = pause(start(T0), T0 + 1000);
    const skipped = skip(paused, tl, T0 + 2000);
    expect(skipped.runningSince).toBeNull();
    expect(skipped.accumulated).toBe(stepStart(tl, 1));
  });

  it('skip on the last step finishes the session', () => {
    let s = seek(start(T0), tl, stepStart(tl, 5) + 1000, T0);
    s = skip(s, tl, T0);
    expect(snapshot(tl, elapsedIn(s, tl, T0)).done).toBe(true);
  });

  it('back restarts the current step, or goes to the previous one near its start', () => {
    const inFingers = stepStart(tl, 1) + 30_000;
    let s = seek(start(T0), tl, inFingers, T0);
    s = back(s, tl, T0);
    expect(elapsed(s, T0)).toBe(stepStart(tl, 1));
    s = back(s, tl, T0 + 1000); // within grace → previous step
    expect(elapsed(s, T0 + 1000)).toBe(stepStart(tl, 0));
    s = back(s, tl, T0 + 1000); // first step → stays
    expect(elapsed(s, T0 + 1000)).toBe(0);
  });

  it('back from the finished state goes to the last step', () => {
    const s = seek(start(T0), tl, tl.total, T0);
    expect(elapsed(back(s, tl, T0), T0)).toBe(stepStart(tl, 5));
  });
});

describe('snapshot', () => {
  it('reports the current segment, remaining time and progress', () => {
    const s0 = snapshot(tl, 0);
    expect(s0).toMatchObject({ stepIndex: 0, segmentRemaining: 3000, progress: 0, done: false });
    expect(s0.segment.kind).toBe('ready');
    expect(s0.nextInStep?.kind).toBe('work');

    // 1 s into warm-up work → progress counts only workout time
    const s1 = snapshot(tl, 4000);
    expect(s1.segment.kind).toBe('work');
    expect(s1.segmentRemaining).toBe(119_000);
    expect(s1.progress).toBeCloseTo(1000 / 900_000);

    // First hang of fingers
    const hangStart = stepStart(tl, 1) + READY_MS;
    const s2 = snapshot(tl, hangStart + 4000);
    expect(s2.segment).toMatchObject({ kind: 'hang', set: 1 });
    expect(s2.segmentRemaining).toBe(6000);
    expect(s2.nextInStep?.kind).toBe('rest');
    expect(s2.stepRemaining).toBe(176_000);
    expect(s2.workRemaining).toBe(900_000 - 120_000 - 4000);

    // Exactly at a boundary we're in the new segment
    const s3 = snapshot(tl, hangStart + 10_000);
    expect(s3.segment.kind).toBe('rest');
  });

  it('progress is monotonic across the whole session', () => {
    let prev = -1;
    for (let p = 0; p <= tl.total; p += 997) {
      const pr = snapshot(tl, p).progress;
      expect(pr).toBeGreaterThanOrEqual(prev);
      prev = pr;
    }
    expect(snapshot(tl, tl.total)).toMatchObject({ done: true, progress: 1, segmentRemaining: 0 });
  });
});

describe('cues', () => {
  const cues = allCues(tl);

  it('has a go cue for every active segment and a final finish', () => {
    const go = cues.filter((c) => c.type === 'go').length;
    const active = tl.segments.filter((s) => s.kind !== 'ready' && s.kind !== 'rest').length;
    expect(go).toBe(active);
    expect(cues.at(-1)).toMatchObject({ type: 'finish', at: tl.total });
  });

  it('counts down 3-2-1 before each hang (during the rest)', () => {
    const hang2 = tl.segments.findIndex((s) => s.kind === 'hang' && s.set === 2);
    const at = tl.segments[hang2].start;
    const ticks = cues.filter((c) => c.type === 'tick' && c.at < at && c.at >= at - 3000);
    expect(ticks.map((c) => at - c.at)).toEqual([3000, 2000, 1000]);
  });

  it('get-ready ticks 2-1 after its own ready cue', () => {
    const ready = cues.filter((c) => c.at < 3000);
    expect(ready.map((c) => [c.type, c.at])).toEqual([
      ['ready', 0],
      ['tick', 1000],
      ['tick', 2000],
    ]);
  });

  it('cuesBetween returns cues in (from, to], collapsing big gaps', () => {
    expect(cuesBetween(cues, -1, 0).map((c) => c.type)).toEqual(['ready']);
    expect(cuesBetween(cues, 2500, 3100).map((c) => c.type)).toEqual(['go']);
    expect(cuesBetween(cues, 3100, 3100)).toEqual([]);
    // backgrounded for 10 minutes: only the latest cue
    const late = cuesBetween(cues, 0, 600_000);
    expect(late).toHaveLength(1);
    expect(late[0].at).toBeLessThanOrEqual(600_000);
  });
});
