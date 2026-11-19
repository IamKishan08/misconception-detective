/**
 * Teaching help for a solved problem. The ENGINE owns every word and number of the mathematical content: it is rendered
 * from the verified solution and reviewed concept templates below. A model (or the built-in matcher) can only SELECT
 * what to show, using identifiers that are validated here for this exact problem. Nothing a model writes is displayed.
 */
import type { CauseId } from './check.js';
import { lcm, show } from './frac.js';
import { pieceName, type Solution, type Step, type Visual } from './solve.js';

export const INTENTS = [
  'explain_step',
  'explain_concept',
  'explain_simply',
  'show_visual',
  'explain_mistake',
  'help_start',
  'clarify',
  'out_of_scope',
] as const;
export type Intent = (typeof INTENTS)[number];

export const CONCEPT_IDS = [
  'equal_denominators',
  'common_denominator',
  'multiply_both',
  'keep_denominator',
  'invert_divisor',
  'multiply_across',
  'simplify_fraction',
  'improper_to_mixed',
  'negative_result',
  'compare_common',
  'zero_denominator',
] as const;
export type ConceptId = (typeof CONCEPT_IDS)[number];

export const CAUSE_IDS = [
  'added_across',
  'subtracted_across',
  'reversed_order',
  'added_instead',
  'no_flip',
  'flipped_first',
  'bigger_denominator',
  'added_same_number',
  'changed_one_number',
] as const satisfies readonly CauseId[];

/** What the selector (model or built-in matcher) picked. Parameters not used by the intent are always dropped. */
export interface HelpSelection {
  readonly intent: Intent;
  readonly stepId?: string;
  readonly conceptId?: ConceptId;
  readonly causeId?: CauseId;
}

export interface HelpContext {
  readonly solution: Solution;
  /** Possible mistakes the app itself found in the student's checked answer (never from the model). */
  readonly causes: readonly CauseId[];
}

export type SelectionCheck = { ok: true; selection: HelpSelection } | { ok: false; reason: string };

// ---------------------------------------------------------------------------------------------
// Concepts: reviewed explanations, filled in with the problem's own numbers.

interface Concept {
  readonly title: string;
  readonly applies: (s: Solution) => boolean;
  readonly body: (s: Solution) => string[];
  /** The worked step that shows the idea in action, when there is one. */
  readonly stepId?: string;
}

const hasStep = (s: Solution, id: string) => s.steps.some((st) => st.id === id);

function denominators(s: Solution): [number, number] | null {
  const p = s.problem;
  if (p.kind === 'arith' || p.kind === 'compare') return [p.a.d, p.b.d];
  return null;
}

/** "halves" → "half", "quarters" → "quarter": for sentences about a single piece. */
function onePiece(d: number): string {
  const name = pieceName(d);
  return name === 'halves' ? 'half' : name.replace(/s( of size)/, '$1').replace(/s$/, '');
}

const CONCEPTS: Record<ConceptId, Concept> = {
  equal_denominators: {
    title: 'Why the denominators have to match',
    applies: (s) => s.problem.kind === 'compare' || (s.problem.kind === 'arith' && (s.problem.op === 'add' || s.problem.op === 'sub')),
    stepId: 'common',
    body: (s) => {
      const d = denominators(s);
      const [x, y] = d ?? [1, 1];
      const verb = s.problem.kind === 'compare' ? 'compare' : s.problem.kind === 'arith' && s.problem.op === 'sub' ? 'take away' : 'add';
      return [
        'The denominator tells us the size of each piece. We can only count, add, take away or compare pieces that are the same size.',
        x === y
          ? `Here both fractions use ${pieceName(x)}, so the pieces already match and we can ${verb} the top numbers straight away.`
          : `Here one fraction uses ${pieceName(x)} and the other uses ${pieceName(y)}. A ${onePiece(x)} and a ${onePiece(y)} are different sizes, so counting them together would be like adding centimetres to kilograms. We rewrite both with the same piece size first, then ${verb} them.`,
      ];
    },
  },
  common_denominator: {
    title: 'How to find a common denominator',
    applies: (s) => {
      const d = denominators(s);
      return d !== null && d[0] !== d[1];
    },
    stepId: 'common',
    body: (s) => {
      const [x, y] = denominators(s) ?? [1, 1];
      const L = lcm(x, y);
      return [
        `A common denominator is a number that both bottom numbers divide into. For ${x} and ${y}, one is ${L}: ${x} × ${L / x} = ${L} and ${y} × ${L / y} = ${L}.`,
        'Any common multiple works. Using the smallest one keeps the numbers small.',
      ];
    },
  },
  multiply_both: {
    title: 'Why we multiply the top and the bottom by the same number',
    applies: (s) => hasStep(s, 'common') || s.problem.kind === 'equivalent',
    stepId: 'common',
    body: (s) => {
      const lines = [
        'Multiplying the bottom number by 2 cuts every piece into 2 smaller equal pieces, so there are twice as many pieces. To keep the same amount we then need twice as many shaded pieces too, so the top is multiplied by 2 as well.',
        'Multiplying only one of the two numbers would change the amount. Multiplying both by the same number only changes the name of the fraction.',
      ];
      const common = s.steps.find((st) => st.id === 'common' || st.id === 'apply');
      if (common !== undefined && common.lines.length > 0) lines.push(`In this problem: ${common.lines.map((l) => l.text).join(' and ')}.`);
      return lines;
    },
  },
  keep_denominator: {
    title: 'Why the denominator stays the same when adding or subtracting',
    applies: (s) => s.problem.kind === 'arith' && (s.problem.op === 'add' || s.problem.op === 'sub'),
    stepId: 'combine',
    body: (s) => {
      const step = s.steps.find((st) => st.id === 'combine');
      return [
        'The denominator names the kind of piece, such as quarters. Adding 2 quarters and 1 quarter gives 3 quarters: we count how many pieces, and the pieces are still quarters.',
        'That is why only the top numbers are added or subtracted. Adding the bottoms too would change the size of the pieces.',
        ...(step !== undefined && step.lines[0] !== undefined ? [`In this problem: ${step.lines[0].text}.`] : []),
      ];
    },
  },
  invert_divisor: {
    title: 'Why we flip the fraction we divide by',
    applies: (s) => s.problem.kind === 'arith' && s.problem.op === 'div',
    stepId: 'flip',
    body: (s) => {
      const p = s.problem;
      if (p.kind !== 'arith') return [];
      return [
        `Dividing ${show(p.a)} by ${show(p.b)} asks: how many ${show(p.b)}s fit into ${show(p.a)}?`,
        `The flipped fraction ${show({ n: p.b.d, d: p.b.n })} is the one that multiplies with ${show(p.b)} to make exactly 1: ${show(p.b)} × ${show({ n: p.b.d, d: p.b.n })} = 1. Multiplying by it undoes the division, so dividing by ${show(p.b)} gives the same result as multiplying by ${show({ n: p.b.d, d: p.b.n })}.`,
      ];
    },
  },
  multiply_across: {
    title: 'Why we multiply the tops and the bottoms',
    applies: (s) => s.problem.kind === 'arith' && s.problem.op === 'mul',
    stepId: 'multiply',
    body: (s) => {
      const p = s.problem;
      if (p.kind !== 'arith') return [];
      return [
        `${show(p.a)} × ${show(p.b)} means taking ${show(p.a)} of ${show(p.b)}. The bottom numbers multiply (${p.a.d} × ${p.b.d}) because each piece is cut into smaller pieces; the top numbers multiply (${p.a.n} × ${p.b.n}) because we count how many of those small pieces we keep.`,
        'No common denominator is needed, because we are not joining pieces of different sizes.',
      ];
    },
  },
  simplify_fraction: {
    title: 'What simplifying means',
    applies: (s) => hasStep(s, 'simplify'),
    stepId: 'simplify',
    body: (s) => {
      const step = s.steps.find((st) => st.id === 'simplify');
      return [
        'Simplifying means dividing the top and the bottom by the same number. The amount does not change; the same amount is written with bigger pieces and fewer of them.',
        'A fraction is in simplest form when no number other than 1 divides both the top and the bottom.',
        ...(step !== undefined && step.lines[0] !== undefined ? [`In this problem: ${step.lines[0].text}.`] : []),
      ];
    },
  },
  improper_to_mixed: {
    title: 'Improper fractions and mixed numbers',
    applies: (s) => hasStep(s, 'mixed'),
    stepId: 'mixed',
    body: (s) => {
      const step = s.steps.find((st) => st.id === 'mixed');
      return [
        'When the top number is bigger than the bottom number, the fraction is more than one whole. A mixed number writes the whole ones first and the leftover pieces after.',
        ...(step !== undefined && step.lines[0] !== undefined ? [`In this problem: ${step.lines[0].text}.`] : []),
      ];
    },
  },
  negative_result: {
    title: 'Why the answer can be negative',
    applies: (s) => s.result.type === 'value' && s.result.value.n < 0,
    stepId: 'combine',
    body: (s) => [
      'If we take away more than we started with, we end up below zero, which is a negative number.',
      s.result.type === 'value' ? `Here the answer is ${show(s.result.value)}, so we land to the left of zero on the number line.` : '',
    ],
  },
  compare_common: {
    title: 'How same-sized pieces let us compare',
    applies: (s) => s.problem.kind === 'compare',
    stepId: 'compare',
    body: () => [
      'When the pieces are the same size, the fraction with more pieces is bigger. So after writing both fractions with the same denominator we only compare the top numbers.',
      'A bigger bottom number alone does not make a fraction bigger: it only means the pieces are smaller.',
    ],
  },
  zero_denominator: {
    title: 'Why the bottom number can never be 0',
    applies: () => true,
    body: () => [
      'The bottom number says how many equal parts the whole is cut into. A whole cannot be cut into 0 parts, so a fraction with 0 on the bottom has no meaning.',
      'Dividing by a fraction whose value is 0 is also impossible, because no number of groups of size 0 can make a non-zero amount.',
    ],
  },
};

export function applicableConcepts(solution: Solution): ConceptId[] {
  return CONCEPT_IDS.filter((id) => CONCEPTS[id].applies(solution));
}

// ---------------------------------------------------------------------------------------------
// Validation: identifiers must exist and apply to THIS problem.

const CAUSE_TEXT: Record<CauseId, string> = {
  added_across: 'adding the tops and the bottoms separately',
  subtracted_across: 'subtracting the tops and the bottoms separately',
  reversed_order: 'subtracting the smaller fraction from the larger one',
  added_instead: 'adding instead of multiplying',
  no_flip: 'multiplying without flipping the second fraction',
  flipped_first: 'flipping the first fraction instead of the second',
  bigger_denominator: 'thinking a bigger bottom number means a bigger fraction',
  added_same_number: 'adding the same number to the top and bottom',
  changed_one_number: 'changing only one of the two numbers',
};

export function validateSelection(raw: unknown, ctx: HelpContext): SelectionCheck {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'not_an_object' };
  const field = (key: string): unknown => Reflect.get(raw, key);
  const r = { intent: field('intent'), stepId: field('stepId'), conceptId: field('conceptId'), causeId: field('causeId') };
  const intent = INTENTS.find((i) => i === r.intent);
  if (intent === undefined) return { ok: false, reason: 'unknown_intent' };
  const stepIds = ctx.solution.steps.map((s) => s.id);
  const step = typeof r.stepId === 'string' ? stepIds.find((id) => id === r.stepId) : undefined;
  const concept = typeof r.conceptId === 'string' ? CONCEPT_IDS.find((id) => id === r.conceptId) : undefined;
  const cause = typeof r.causeId === 'string' ? CAUSE_IDS.find((id) => id === r.causeId) : undefined;

  switch (intent) {
    case 'explain_step':
      return step === undefined ? { ok: false, reason: 'step_not_in_this_problem' } : { ok: true, selection: { intent, stepId: step } };
    case 'explain_concept':
      if (concept === undefined) return { ok: false, reason: 'unknown_concept' };
      return CONCEPTS[concept].applies(ctx.solution) ? { ok: true, selection: { intent, conceptId: concept } } : { ok: false, reason: 'concept_not_applicable' };
    case 'explain_mistake':
      if (cause === undefined) return { ok: false, reason: 'unknown_cause' };
      return ctx.causes.includes(cause) ? { ok: true, selection: { intent, causeId: cause } } : { ok: false, reason: 'cause_not_found_in_answer' };
    case 'explain_simply':
    case 'show_visual':
      if (typeof r.stepId === 'string' && step === undefined) return { ok: false, reason: 'step_not_in_this_problem' };
      return { ok: true, selection: step === undefined ? { intent } : { intent, stepId: step } };
    case 'help_start':
    case 'clarify':
    case 'out_of_scope':
      return { ok: true, selection: { intent } };
  }
}

// ---------------------------------------------------------------------------------------------
// Rendering: everything shown comes from here.

export interface NextHelp {
  readonly label: string;
  readonly selection: HelpSelection;
}

export interface HelpContent {
  readonly intent: Intent;
  readonly title: string;
  readonly paragraphs: readonly string[];
  /** Verified lines of working related to the help. */
  readonly lines: readonly string[];
  readonly visual?: Visual;
  /** Built-in help the student can try next: each is a selection the app can render without any model. */
  readonly nextHelp: readonly NextHelp[];
}

const stepWork = (s: Step) => s.lines.map((l) => l.text);

function conceptOffers(solution: Solution): NextHelp[] {
  return applicableConcepts(solution)
    .filter((id) => id !== 'zero_denominator')
    .slice(0, 3)
    .map((id) => ({ label: CONCEPTS[id].title, selection: { intent: 'explain_concept', conceptId: id } }));
}

export function renderHelp(selection: HelpSelection, ctx: HelpContext): HelpContent {
  const { solution } = ctx;
  const nextHelp = conceptOffers(solution);
  switch (selection.intent) {
    case 'explain_step': {
      const step = solution.steps.find((s) => s.id === selection.stepId);
      if (step === undefined) return renderHelp({ intent: 'clarify' }, ctx);
      return {
        intent: 'explain_step',
        title: step.title,
        paragraphs: [step.why, step.reason],
        lines: stepWork(step),
        ...(step.visual === undefined ? {} : { visual: step.visual }),
        nextHelp,
      };
    }
    case 'explain_concept': {
      const concept = selection.conceptId === undefined ? undefined : CONCEPTS[selection.conceptId];
      if (concept === undefined) return renderHelp({ intent: 'clarify' }, ctx);
      const step = concept.stepId === undefined ? undefined : solution.steps.find((s) => s.id === concept.stepId);
      return {
        intent: 'explain_concept',
        title: concept.title,
        paragraphs: concept.body(solution).filter((p) => p !== ''),
        lines: step === undefined ? [] : stepWork(step),
        ...(step?.visual === undefined ? {} : { visual: step.visual }),
        nextHelp: nextHelp.filter((n) => n.label !== concept.title),
      };
    }
    case 'explain_simply': {
      const steps = selection.stepId === undefined ? solution.steps : solution.steps.filter((s) => s.id === selection.stepId);
      return {
        intent: 'explain_simply',
        title: 'The same thing, more simply',
        paragraphs: steps.map((s) => s.simple),
        lines: steps.flatMap(stepWork),
        nextHelp,
      };
    }
    case 'show_visual': {
      const step = selection.stepId === undefined ? solution.steps.find((s) => s.visual !== undefined) : solution.steps.find((s) => s.id === selection.stepId);
      if (step?.visual === undefined) {
        return {
          intent: 'show_visual',
          title: 'No picture for this one',
          paragraphs: ['These numbers are too big or too awkward to draw clearly, so I do not want to show a misleading picture. The steps are still exact.'],
          lines: [],
          nextHelp,
        };
      }
      return { intent: 'show_visual', title: `A picture of: ${step.title}`, paragraphs: [step.visual.caption], lines: stepWork(step), visual: step.visual, nextHelp };
    }
    case 'explain_mistake': {
      const cause = selection.causeId;
      if (cause === undefined || !ctx.causes.includes(cause)) return renderHelp({ intent: 'clarify' }, ctx);
      const key = solution.steps.find((s) => s.id === 'combine' || s.id === 'multiply' || s.id === 'compare' || s.id === 'apply') ?? solution.steps[0];
      return {
        intent: 'explain_mistake',
        title: 'A possible reason for the mistake',
        paragraphs: [
          `One possibility is ${CAUSE_TEXT[cause]}. This is only a possibility: a final answer cannot show how it was reached.`,
          'To check, compare with the worked step below, where the same move is done in a way that keeps the amount correct.',
        ],
        lines: key === undefined ? [] : stepWork(key),
        ...(key?.visual === undefined ? {} : { visual: key.visual }),
        nextHelp,
      };
    }
    case 'help_start': {
      const first = solution.steps[0];
      return {
        intent: 'help_start',
        title: 'Where to start',
        paragraphs: [...solution.hints, ...(first === undefined ? [] : [`The first step is: ${first.title.toLowerCase()}.`])],
        lines: [],
        nextHelp,
      };
    }
    case 'clarify':
      return {
        intent: 'clarify',
        title: 'Which part would you like explained?',
        paragraphs: ['I am not sure which part you mean, and I would rather ask than guess. You can pick a step, or one of these ideas:'],
        lines: solution.steps.map((s, i) => `Step ${i + 1}: ${s.title}`),
        nextHelp,
      };
    case 'out_of_scope':
      return {
        intent: 'out_of_scope',
        title: 'That is outside what I can help with here',
        paragraphs: ['I can only explain this fractions problem. You can ask about a step, why a method works, or ask for a picture or a simpler explanation.'],
        lines: [],
        nextHelp,
      };
  }
}

// ---------------------------------------------------------------------------------------------
// Built-in selector: used when AI is unavailable, and always labelled as built-in.

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
export function selectionMenu(ctx: HelpContext) {
  return {
    steps: ctx.solution.steps.map((s) => ({ id: s.id, title: s.title })),
    concepts: applicableConcepts(ctx.solution).map((id) => ({ id, title: CONCEPTS[id].title })),
    possibleMistakes: ctx.causes.map((id) => ({ id, description: CAUSE_TEXT[id] })),
  };
}

