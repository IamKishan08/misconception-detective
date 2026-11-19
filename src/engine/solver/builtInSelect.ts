/**
 * Built-in selector: matches a student's question to a help selection with plain rules. Used when AI is unavailable or not
 * configured, and always labelled as built-in in the interface.
 */
import { CONCEPTS } from './concepts.js';
import type { ConceptId, HelpContext, HelpSelection } from './helpTypes.js';

const MATH_WORDS = /\b(fractions?|denominators?|numerators?|top|bottom|steps?|answer|add(ing)?|subtract(ing)?|multipl\w*|divid\w*|compar\w*|equal|simplif\w*|mixed|improper|negative|pieces?|numbers?|flip|invert|reciprocal|picture|visual|bigger|smaller|larger|halves|half|quarters?|thirds?|problem|method)\b/;

export function builtInSelect(question: string, ctx: HelpContext): HelpSelection {
  const q = question.toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ');
  const { solution } = ctx;
  const concept = (id: ConceptId): HelpSelection | null => (CONCEPTS[id].applies(solution) ? { intent: 'explain_concept', conceptId: id } : null);

  const stepNumber = /\bstep (\d+)\b/.exec(q) ?? /\b(first|second|third|last|final) step\b/.exec(q);
  if (stepNumber !== null) {
    const word = stepNumber[1] ?? '';
    const index = /^\d+$/.test(word) ? Number.parseInt(word, 10) - 1 : { first: 0, second: 1, third: 2, last: solution.steps.length - 1, final: solution.steps.length - 1 }[word];
    const step = index === undefined ? undefined : solution.steps[index];
    if (step !== undefined) return { intent: 'explain_step', stepId: step.id };
  }
  if (/\b(visual|picture|draw|diagram|number line|bars?|show me)\b/.test(q)) return { intent: 'show_visual' };
  if (/\b(wrong|mistake|my answer|what did i do|why (is|was) (it|this) )/.test(q)) {
    const cause = ctx.causes[0];
    return cause === undefined ? { intent: 'clarify' } : { intent: 'explain_mistake', causeId: cause };
  }
  if (/(invert|flip|reciprocal|upside)/.test(q)) return concept('invert_divisor') ?? { intent: 'clarify' };
  if (/(multiply|times).*(both|top and bottom|same number)|both numbers|same number/.test(q)) return concept('multiply_both') ?? { intent: 'clarify' };
  if (/(keep|stay|remain).*(denominator|bottom)|(denominator|bottom).*(stay|remain|not change|doesn.?t change)|why.*(not|don.?t).*add.*(bottom|denominator)/.test(q)) return concept('keep_denominator') ?? { intent: 'clarify' };
  if (/(common|lcm|lowest common)/.test(q)) return concept('common_denominator') ?? concept('equal_denominators') ?? { intent: 'clarify' };
  if (/(denominator|bottom number|same size|equal (parts|pieces)|match)/.test(q)) return concept('equal_denominators') ?? concept('multiply_across') ?? { intent: 'clarify' };
  if (/\b(simplif(y|ied|ying)|lowest terms|reduce)\b/.test(q)) return concept('simplify_fraction') ?? { intent: 'clarify' };
  if (/\b(mixed|improper)\b/.test(q)) return concept('improper_to_mixed') ?? { intent: 'clarify' };
  if (/\b(negative|below zero|minus)\b/.test(q)) return concept('negative_result') ?? { intent: 'clarify' };
  if (/\b(zero|0)\b/.test(q)) return concept('zero_denominator') ?? { intent: 'clarify' };
  if (/\b(bigger|larger|smaller|compare)\b/.test(q)) return concept('compare_common') ?? { intent: 'clarify' };
  if (/(multiply|times|across)/.test(q)) return concept('multiply_across') ?? concept('multiply_both') ?? { intent: 'clarify' };
  if (/(simply|simpler|easier|plain|confus|don.?t understand|didn.?t understand)/.test(q)) return { intent: 'explain_simply' };
  if (/(start|begin|stuck|first|how do i|what do i do|where)/.test(q)) return { intent: 'help_start' };
  return MATH_WORDS.test(q) ? { intent: 'clarify' } : { intent: 'out_of_scope' };
}

/** Plain facts the model may be shown so it can pick relevant identifiers. No prose from the model is ever displayed. */
