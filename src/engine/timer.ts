/**
 * Pure timer engine.
 *
 * The routine is flattened into a timeline of segments laid end to end on a
 * single millisecond axis. The timer state is just "how much time has elapsed
 * on that axis", stored as `accumulated + (now - runningSince)`. Everything the
 * UI shows (current step, HANG/REST, countdown, progress) is derived from that
 * one number, so:
 *   - there is no drift (no counting of ticks — only timestamp differences);
 *   - a backgrounded/throttled tab is correct the moment it wakes up;
 *   - pause, resume, skip and back are tiny pure state transitions.
 *
 * All functions take `now` explicitly so they are deterministic in tests.
 */
import { type PhaseKind, type Routine, stepDuration } from './routine';

export type SegmentKind = 'ready' | PhaseKind;

export interface Segment {
  stepIndex: number;
  kind: SegmentKind;
  label: string;
  /** Offset from the start of the timeline, ms. */
  start: number;
  duration: number;
  /** 1-based set number and set count for interval steps. */
  set?: number;
  sets?: number;
  /** Workout time (excluding get-ready) elapsed before this segment, ms. */
  workBefore: number;
}

export interface Timeline {
  segments: Segment[];
  /** Total length including get-ready segments, ms. */
  total: number;
  /** Total workout time excluding get-ready, ms (the "15 minutes"). */
  workTotal: number;
  /** For each step, the index of its first segment (its get-ready). */
  stepFirstSegment: number[];
  stepCount: number;
}

export const READY_MS = 3000;

export function buildTimeline(routine: Routine, readyMs = READY_MS): Timeline {
  const segments: Segment[] = [];
  const stepFirstSegment: number[] = [];
  let t = 0;
  let work = 0;
  const push = (s: Omit<Segment, 'start' | 'workBefore'>) => {
    segments.push({ ...s, start: t, workBefore: work });
    t += s.duration;
    if (s.kind !== 'ready') work += s.duration;
  };

  routine.steps.forEach((step, stepIndex) => {
    stepFirstSegment.push(segments.length);
    if (readyMs > 0) push({ stepIndex, kind: 'ready', label: 'Get ready', duration: readyMs });
    if (step.intervals) {
      const { repeat, phases } = step.intervals;
      for (let r = 0; r < repeat; r++) {
        for (const p of phases) {
          push({
            stepIndex,
            kind: p.kind,
            label: p.label,
            duration: p.duration * 1000,
            ...(repeat > 1 ? { set: r + 1, sets: repeat } : {}),
          });
        }
      }
    } else {
      push({ stepIndex, kind: 'work', label: step.name, duration: stepDuration(step) * 1000 });
    }
  });

  return { segments, total: t, workTotal: work, stepFirstSegment, stepCount: routine.steps.length };
}

// ---------------------------------------------------------------------------
// Timer state

export interface TimerState {
  /** Elapsed timeline time banked while not running, ms. */
  accumulated: number;
  /** Wall-clock timestamp the timer last started running, or null if paused. */
  runningSince: number | null;
}

export const initialTimer = (): TimerState => ({ accumulated: 0, runningSince: null });

export function start(now: number): TimerState {
  return { accumulated: 0, runningSince: now };
}

export function isRunning(s: TimerState): boolean {
  return s.runningSince !== null;
}

/** Raw elapsed time. Clamp with the timeline via `elapsedIn`. */
export function elapsed(s: TimerState, now: number): number {
  return s.accumulated + (s.runningSince === null ? 0 : Math.max(0, now - s.runningSince));
}

export function elapsedIn(s: TimerState, tl: Timeline, now: number): number {
  return Math.min(tl.total, Math.max(0, elapsed(s, now)));
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.runningSince === null) return s;
  return { accumulated: elapsed(s, now), runningSince: null };
}

export function resume(s: TimerState, now: number): TimerState {
  if (s.runningSince !== null) return s;
  return { accumulated: s.accumulated, runningSince: now };
}

export function toggle(s: TimerState, now: number): TimerState {
  return isRunning(s) ? pause(s, now) : resume(s, now);
}

/** Jump to an absolute timeline position, keeping running/paused as is. */
export function seek(s: TimerState, tl: Timeline, position: number, now: number): TimerState {
  const p = Math.min(tl.total, Math.max(0, position));
  return { accumulated: p, runningSince: s.runningSince === null ? null : now };
}

export function stepStart(tl: Timeline, stepIndex: number): number {
  return tl.segments[tl.stepFirstSegment[stepIndex]].start;
}

/** Skip to the get-ready of the next step (or to the end after the last). */
export function skip(s: TimerState, tl: Timeline, now: number): TimerState {
  const { stepIndex } = snapshot(tl, elapsedIn(s, tl, now));
  const target = stepIndex + 1 < tl.stepCount ? stepStart(tl, stepIndex + 1) : tl.total;
  return seek(s, tl, target, now);
}

/** Within this many ms of a step's start, "back" goes to the previous step. */
export const BACK_GRACE_MS = 3000;

/**
 * Like a music player: restart the current step, or go to the previous step
 * if we're already near the start of this one.
 */
export function back(s: TimerState, tl: Timeline, now: number): TimerState {
  const pos = elapsedIn(s, tl, now);
  if (pos >= tl.total) return seek(s, tl, stepStart(tl, tl.stepCount - 1), now);
  const { stepIndex } = snapshot(tl, pos);
  const here = stepStart(tl, stepIndex);
  // The get-ready lead-in counts as "the start".
  const grace = tl.segments[tl.stepFirstSegment[stepIndex]].kind === 'ready'
    ? tl.segments[tl.stepFirstSegment[stepIndex]].duration + BACK_GRACE_MS
    : BACK_GRACE_MS;
  const target = pos - here < grace && stepIndex > 0 ? stepStart(tl, stepIndex - 1) : here;
  return seek(s, tl, target, now);
}

// ---------------------------------------------------------------------------
// Derived view

export interface Snapshot {
  position: number;
  done: boolean;
  segmentIndex: number;
  segment: Segment;
  stepIndex: number;
  /** ms left in the current segment. */
  segmentRemaining: number;
  /** ms left in the current step (including any remaining get-ready). */
  stepRemaining: number;
  /** 0..1 progress through workout time (get-ready excluded). */
  progress: number;
  /** Workout ms remaining. */
  workRemaining: number;
  /** The next segment within the same step, if any (e.g. REST after HANG). */
  nextInStep: Segment | null;
}

export function segmentIndexAt(tl: Timeline, position: number): number {
  // Binary search: last segment whose start <= position.
  let lo = 0;
  let hi = tl.segments.length - 1;
  if (position >= tl.total) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tl.segments[mid].start <= position) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function snapshot(tl: Timeline, position: number): Snapshot {
  const pos = Math.min(tl.total, Math.max(0, position));
  const done = pos >= tl.total;
  const i = segmentIndexAt(tl, pos);
  const seg = tl.segments[i];
  const segEnd = seg.start + seg.duration;
  const stepEndIdx =
    seg.stepIndex + 1 < tl.stepCount ? tl.stepFirstSegment[seg.stepIndex + 1] : tl.segments.length;
  const stepEnd =
    stepEndIdx < tl.segments.length ? tl.segments[stepEndIdx].start : tl.total;
  const inSeg = pos - seg.start;
  const workDone = seg.workBefore + (seg.kind === 'ready' ? 0 : Math.min(inSeg, seg.duration));
  const next = tl.segments[i + 1];
  return {
    position: pos,
    done,
    segmentIndex: i,
    segment: seg,
    stepIndex: seg.stepIndex,
    segmentRemaining: done ? 0 : segEnd - pos,
    stepRemaining: done ? 0 : stepEnd - pos,
    progress: tl.workTotal === 0 ? 1 : done ? 1 : workDone / tl.workTotal,
    workRemaining: done ? 0 : tl.workTotal - workDone,
    nextInStep: next && next.stepIndex === seg.stepIndex ? next : null,
  };
}

// ---------------------------------------------------------------------------
// Cues (beeps / vibration)

export type CueType = 'ready' | 'go' | 'rest' | 'tick' | 'finish';

export interface Cue {
  type: CueType;
  at: number;
  segmentIndex: number;
}

const isActive = (k: SegmentKind) => k === 'work' || k === 'hang' || k === 'hold';

/** All cues on the timeline, in order. */
export function allCues(tl: Timeline): Cue[] {
  const cues: Cue[] = [];
  tl.segments.forEach((seg, i) => {
    const type: CueType = seg.kind === 'ready' ? 'ready' : seg.kind === 'rest' ? 'rest' : 'go';
    cues.push({ type, at: seg.start, segmentIndex: i });
    const next = tl.segments[i + 1];
    // 3-2-1 countdown before anything active starts (not at the end of a long
    // WORK block, which is followed by the next step's get-ready anyway).
    if (next && isActive(next.kind) && seg.kind !== 'work') {
      for (const s of [3, 2, 1]) {
        const at = seg.start + seg.duration - s * 1000;
        if (at > seg.start) cues.push({ type: 'tick', at, segmentIndex: i });
      }
    }
  });
  cues.push({ type: 'finish', at: tl.total, segmentIndex: tl.segments.length - 1 });
  return cues.sort((a, b) => a.at - b.at);
}

/**
 * Cues whose time falls in (from, to]. If the gap is large (the tab was
 * backgrounded, or the user seeked) only the most recent cue is returned so
 * we don't fire a burst of stale beeps on wake-up.
 */
export function cuesBetween(cues: Cue[], from: number, to: number, maxGapMs = 1500): Cue[] {
  if (to <= from) return [];
  const hits = cues.filter((c) => c.at > from && c.at <= to);
  if (to - from > maxGapMs && hits.length > 1) return [hits[hits.length - 1]];
  return hits;
}
