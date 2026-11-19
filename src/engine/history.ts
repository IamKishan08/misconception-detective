/**
 * The student's own activity, for "My progress". Pure functions: no storage, no I/O, no sample data.
 *
 * One entry per problem attempt run, updated by events, so a retry or a second look at the same problem never counts twice.
 * Only structured data is kept (the problem's numbers, a short numeric answer, counts and flags). Free-text working and
 * questions asked of the AI are never stored.
 */
import type { LearnerState } from './progression.js';
import { questionToProblem } from './solver/fromQuestion.js';
import type { Problem } from './solver/problem.js';

export type Topic = 'add' | 'sub' | 'mul' | 'div' | 'compare' | 'equivalent';
export const TOPICS: readonly Topic[] = ['add', 'sub', 'mul', 'div', 'compare', 'equivalent'];

/**
 * - independent: correct on the first answer with no hint and no solution viewed.
 * - retry: correct after at least one wrong answer, with no hint and no solution viewed.
 * - with_help: correct after a hint or after the worked solution was shown. Never mastery.
 * - incorrect: answered wrongly and not yet answered correctly.
 * - explored: asked for a hint or solution without giving an answer.
 */
export type Outcome = 'independent' | 'retry' | 'with_help' | 'incorrect' | 'explored';

export interface HistoryEntry {
  readonly key: string;
  readonly source: 'solve' | 'practice';
  readonly topic: Topic;
  readonly problem: Problem;
  /** Epoch milliseconds of the latest event, or null for activity migrated from before dates were kept. */
  readonly at: number | null;
  readonly wrong: number;
  readonly hint: boolean;
  readonly solution: boolean;
  readonly correct: boolean;
  /** The student's latest numeric answer, kept so they can revisit it. At most a few characters. */
  readonly answer: string | null;
}

export interface History {
  readonly version: 1;
  /** Oldest first. */
  readonly entries: readonly HistoryEntry[];
}

/** Bounded so storage stays small; the oldest entries are dropped first. */
export const MAX_ENTRIES = 100;
export const MAX_ANSWER_CHARS = 24;

export type HistoryEvent =
  | { readonly type: 'check'; readonly key: string; readonly source: HistoryEntry['source']; readonly problem: Problem; readonly correct: boolean; readonly answer: string }
  | { readonly type: 'help'; readonly key: string; readonly source: HistoryEntry['source']; readonly problem: Problem; readonly kind: 'hint' | 'solution' };

export function emptyHistory(): History {
  return { version: 1, entries: [] };
}

export function topicOf(p: Problem): Topic {
  return p.kind === 'arith' ? p.op : p.kind;
}

export function outcomeOf(e: HistoryEntry): Outcome {
  const helped = e.hint || e.solution;
  if (e.correct) return e.wrong === 0 && !helped ? 'independent' : !helped ? 'retry' : 'with_help';
  return e.wrong > 0 ? 'incorrect' : 'explored';
}

/** Applies one event. Safe to repeat: help flags are idempotent, and nothing changes once an entry is answered correctly. */
export function applyEvent(history: History, event: HistoryEvent, now: number): History {
  const existing = history.entries.find((e) => e.key === event.key);
  const base: HistoryEntry = existing ?? {
    key: event.key,
    source: event.source,
    topic: topicOf(event.problem),
    problem: event.problem,
    at: now,
    wrong: 0,
    hint: false,
    solution: false,
    correct: false,
    answer: null,
  };
  let next: HistoryEntry;
  if (event.type === 'help') {
    // Looking at help after a correct answer says nothing about how that answer was reached.
    if (base.correct) return history;
    next = { ...base, hint: base.hint || event.kind === 'hint', solution: base.solution || event.kind === 'solution', at: now };
  } else if (!base.correct) {
    const answer = event.answer.slice(0, MAX_ANSWER_CHARS);
    next = { ...base, wrong: base.wrong + (event.correct ? 0 : 1), correct: event.correct, answer, at: now };
  } else {
    return history;
  }
  const others = history.entries.filter((e) => e.key !== event.key);
  return { version: 1, entries: [...others, next].slice(-MAX_ENTRIES) };
}

/** Builds history from guided-practice progress saved before history existed, so nothing is lost. No dates are known. */
export function historyFromLearner(state: LearnerState): History {
  const entries: HistoryEntry[] = [];
  for (const family of Object.values(state.families)) {
    for (const a of family.attempts) {
      const problem = questionToProblem(a.question);
      const correct = a.outcome === 'correct';
      entries.push({
        key: `legacy-${a.seq}`,
        source: 'practice',
        topic: topicOf(problem),
        problem,
        at: null,
        // A correct answer that was neither independent nor helped must have been a repeat answer.
        wrong: correct ? (!a.independent && !a.hintUsed ? 1 : 0) : 1,
        hint: a.hintUsed,
        solution: false,
        correct,
        answer: a.answerDisplay.slice(0, MAX_ANSWER_CHARS),
      });
    }
  }
  entries.sort((x, y) => Number(x.key.slice(7)) - Number(y.key.slice(7)));
  return { version: 1, entries: entries.slice(-MAX_ENTRIES) };
}

export interface TopicSummary {
  readonly topic: Topic;
  readonly total: number;
  readonly counts: Readonly<Record<Outcome, number>>;
  /** True when the most recent activity on this topic was not an independent correct answer. */
  readonly revisit: boolean;
}

/** Counts only; no scores, percentages or mastery claims. Topics never practised are left out. */
export function summarise(history: History): TopicSummary[] {
  const out: TopicSummary[] = [];
  for (const topic of TOPICS) {
    const entries = history.entries.filter((e) => e.topic === topic);
    const last = entries.at(-1);
    if (last === undefined) continue;
    const counts: Record<Outcome, number> = { independent: 0, retry: 0, with_help: 0, incorrect: 0, explored: 0 };
    for (const e of entries) counts[outcomeOf(e)] += 1;
    out.push({ topic, total: entries.length, counts, revisit: outcomeOf(last) !== 'independent' });
  }
  return out;
}
