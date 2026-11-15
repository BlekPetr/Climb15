/**
 * The routine is plain data. The UI renders whatever is here; Settings edits a
 * stored copy of it (durations, repeats, rep targets) for progression.
 */

export type PhaseKind = 'work' | 'hang' | 'rest' | 'hold';

export interface Phase {
  kind: PhaseKind;
  /** Short label shown under the state word, e.g. "Deep squat". */
  label: string;
  /** Seconds. */
  duration: number;
}

export interface Intervals {
  repeat: number;
  phases: Phase[];
}

export interface Target {
  id: string;
  label: string;
  value: number;
  /** Optional upper end of a rep range, e.g. 10–15. */
  max?: number;
  unit: string;
}

export interface Step {
  id: string;
  name: string;
  /**
   * One or two lines shown during the session. `{targetId}` placeholders are
   * replaced with the current target value.
   */
  summary: string;
  /** Full description for the Exercises screen (same placeholders). */
  description: string;
  tips: string[];
  /** Short safety/technique cue, highlighted during the session. */
  cue?: string;
  targets: Target[];
  /** Seconds, used when `intervals` is absent. */
  duration: number;
  intervals?: Intervals;
}

export interface Routine {
  version: 1;
  steps: Step[];
}

export const DEFAULT_ROUTINE: Routine = {
  version: 1,
  steps: [
    {
      id: 'warmup',
      name: 'Warm-up',
      summary:
        'Arm and wrist circles · {pullaparts} expander pull-aparts · {shrugs} scapular shrugs on the bar · {squeezes} ring squeezes per hand',
      description:
        'Get blood into the shoulders, forearms and fingers before loading them. Start with big arm circles both directions and slow wrist circles. Then {pullaparts} pull-aparts with the expander at chest height, {shrugs} scapular shrugs hanging on the bar (straight arms, pull the shoulder blades down and back, then relax), and finish with {squeezes} finger ring squeezes per hand.',
      tips: [
        'Keep the pull-aparts controlled, squeeze the shoulder blades at the end.',
        'Scapular shrugs: arms stay straight — the movement comes from the shoulders only.',
        'If your fingers feel cold, add a few extra squeezes.',
      ],
      targets: [
        { id: 'pullaparts', label: 'Expander pull-aparts', value: 15, unit: 'reps' },
        { id: 'shrugs', label: 'Scapular shrugs', value: 8, unit: 'reps' },
        { id: 'squeezes', label: 'Ring squeezes per hand', value: 20, unit: 'reps' },
      ],
      duration: 120,
    },
    {
      id: 'fingers',
      name: 'Fingers',
      summary: 'Fingerboard · big edge (20 mm+) · open hand or half crimp',
      cue: 'Stop with 3–4 s in reserve; skip if a finger joint aches.',
      description:
        'Three hangs on the fingerboard, each {hang} followed by a long rest. Use a big edge (20 mm or more) with an open-hand or half-crimp grip. Hang with slightly bent arms and engaged shoulders. The load should feel like you could hold on for another 3–4 seconds.',
      tips: [
        'Stop with 3–4 s in reserve — never hang to failure.',
        'Skip this step entirely if a finger joint aches.',
        'Avoid full crimp. Open hand or half crimp only.',
        'Progress by adding seconds, not by shrinking the edge.',
      ],
      targets: [],
      duration: 180,
      intervals: {
        repeat: 3,
        phases: [
          { kind: 'hang', label: 'Hang', duration: 10 },
          { kind: 'rest', label: 'Shake out', duration: 50 },
        ],
      },
    },
    {
      id: 'pulling',
      name: 'Pulling',
      summary: '3 sets of pull-ups · stop {reserve} reps before failure · 45 s rest',
      description:
        'Three sets of pull-ups, stopping each set {reserve} reps before failure, with about 45 s rest between sets. Full range: start from straight arms, chin over the bar. If you can’t do clean reps yet, put a rubber band under your feet for assistance.',
      tips: [
        'Option: rubber band under your feet for assistance.',
        'Control the way down — no dropping into the bottom.',
        'Rest about 45 s between sets; the timer covers all three.',
      ],
      targets: [{ id: 'reserve', label: 'Reps in reserve', value: 2, unit: 'reps' }],
      duration: 180,
    },
    {
      id: 'core',
      name: 'Core',
      summary: '2 × {kneeraises} hanging knee raises · slow lowering',
      description:
        'Two sets of {kneeraises} hanging knee raises. Bring the knees up towards the chest by curling the pelvis, then lower slowly over 2–3 seconds. Avoid swinging; pause at the bottom if needed.',
      tips: [
        'Lower slowly — the eccentric does most of the work.',
        'Keep the shoulders engaged, don’t hang passively.',
        'Rest briefly between the two sets.',
      ],
      targets: [{ id: 'kneeraises', label: 'Knee raises per set', value: 8, max: 10, unit: 'reps' }],
      duration: 120,
    },
    {
      id: 'antagonists',
      name: 'Antagonists',
      summary: '{pushups} push-ups · then {presses} overhead presses per arm, {kettlebell} kettlebell',
      description:
        'Balance all the pulling. Do {pushups} push-ups with a straight body line, then {presses} overhead presses per arm with a {kettlebell} kettlebell. Press straight up, keep the ribs down.',
      tips: [
        'Push-ups: elbows about 45° from the body, chest to fist height.',
        'Press: brace the core, don’t lean back.',
        'Progress by adding reps before adding weight.',
      ],
      targets: [
        { id: 'pushups', label: 'Push-ups', value: 10, max: 15, unit: 'reps' },
        { id: 'presses', label: 'Overhead presses per arm', value: 10, unit: 'reps' },
        { id: 'kettlebell', label: 'Kettlebell', value: 4, unit: 'kg' },
      ],
      duration: 120,
    },
    {
      id: 'flexibility',
      name: 'Flexibility',
      summary: 'Deep squat · frog stretch · high-step stretch per side',
      description:
        'Hip mobility for high feet and good positions on the wall. Sit in a deep squat with heels down, then frog stretch (knees wide, ankles in line with knees, sink the hips back), then a high-step stretch on each side: put one foot high on a chair or step and lean into it.',
      tips: [
        'Breathe slowly and relax into each position.',
        'Deep squat: hold onto something if your heels lift.',
        'No bouncing — gentle, steady stretching only.',
      ],
      targets: [],
      duration: 180,
      intervals: {
        repeat: 1,
        phases: [
          { kind: 'hold', label: 'Deep squat', duration: 60 },
          { kind: 'hold', label: 'Frog stretch', duration: 60 },
          { kind: 'hold', label: 'High step · left', duration: 30 },
          { kind: 'hold', label: 'High step · right', duration: 30 },
        ],
      },
    },
  ],
};

/** Fill `{targetId}` placeholders with "value unit" (unit omitted for reps). */
export function fillTargets(text: string, step: Step): string {
  return text.replace(/\{(\w+)\}/g, (m, id: string) => {
    if (id === 'hang' && step.intervals) {
      const hang = step.intervals.phases.find((p) => p.kind === 'hang');
      return hang ? `${hang.duration} s` : m;
    }
    const t = step.targets.find((x) => x.id === id);
    if (!t) return m;
    const v = t.max && t.max > t.value ? `${t.value}–${t.max}` : String(t.value);
    return t.unit === 'reps' ? v : `${v} ${t.unit}`;
  });
}

export function stepDuration(step: Step): number {
  if (!step.intervals) return step.duration;
  const one = step.intervals.phases.reduce((s, p) => s + p.duration, 0);
  return one * step.intervals.repeat;
}

export function routineDuration(routine: Routine): number {
  return routine.steps.reduce((s, st) => s + stepDuration(st), 0);
}

/** Basic structural validation for stored/edited routines. */
export function isValidRoutine(r: unknown): r is Routine {
  if (!r || typeof r !== 'object') return false;
  const rr = r as Routine;
  if (rr.version !== 1 || !Array.isArray(rr.steps) || rr.steps.length === 0) return false;
  return rr.steps.every((s) => {
    if (typeof s.id !== 'string' || typeof s.name !== 'string') return false;
    if (!Array.isArray(s.targets)) return false;
    if (s.intervals) {
      const iv = s.intervals;
      return (
        Number.isInteger(iv.repeat) &&
        iv.repeat >= 1 &&
        Array.isArray(iv.phases) &&
        iv.phases.length > 0 &&
        iv.phases.every((p) => Number.isFinite(p.duration) && p.duration > 0)
      );
    }
    return Number.isFinite(s.duration) && s.duration > 0;
  });
}
