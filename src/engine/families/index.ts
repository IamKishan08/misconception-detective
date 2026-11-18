import { pickIndex, type Rng } from '../random.js';
import type { ChoiceId, Difficulty, FamilyDefinition, FamilyId, Question, Stage } from '../types.js';
import { additionFamily } from './addition.js';
import { comparisonFamily } from './comparison.js';
import { equivalenceFamily } from './equivalence.js';

export const FAMILIES: Readonly<Record<FamilyId, FamilyDefinition>> = {
  F1: additionFamily,
  F2: comparisonFamily,
  F3: equivalenceFamily,
};

function shuffledOrder(rng: Rng): ChoiceId[] {
  // The two fraction options in seeded order; "equal" stays last so it reads naturally.
  return rng() < 0.5 ? ['first', 'second', 'equal'] : ['second', 'first', 'equal'];
}

/**
 * Picks a question the learner has not seen yet (falls back to any candidate once all are used).
 * Choice options get a seeded display order.
 */
export function generateQuestion(family: FamilyId, stage: Stage, difficulty: Difficulty, rng: Rng, seen: ReadonlySet<string>): Question {
  const all = FAMILIES[family].candidates(stage, difficulty);
  const fresh = all.filter((q) => !seen.has(q.id));
  const pool = fresh.length > 0 ? fresh : all;
  const picked = pool[pickIndex(rng, pool.length)];
  if (picked === undefined) throw new Error(`No ${family} ${stage} questions at difficulty ${difficulty}`);
  if (picked.body.type === 'compare' || picked.body.type === 'equal_check') {
    return { ...picked, body: { ...picked.body, order: shuffledOrder(rng) } };
  }
  return picked;
}
