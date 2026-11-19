/**
 * Teaching help for a solved problem. The ENGINE owns every word and number of the mathematical content: it is rendered
 * from the verified solution and the reviewed concept templates (concepts.ts). A model (or the built-in matcher in
 * builtInSelect.ts) can only SELECT what to show, using identifiers that are validated here for this exact problem.
 * Nothing a model writes is displayed.
 */
import { CAUSE_TEXT, CONCEPTS, applicableConcepts } from './concepts.js';
import {
  CAUSE_IDS,
  CONCEPT_IDS,
  INTENTS,
  type HelpContent,
  type HelpContext,
  type HelpSelection,
  type NextHelp,
  type SelectionCheck,
} from './helpTypes.js';
import type { Solution, Step } from './solve.js';

export * from './helpTypes.js';
export { applicableConcepts } from './concepts.js';
export { builtInSelect } from './builtInSelect.js';

// ---------------------------------------------------------------------------------------------
// Validation: identifiers must exist and apply to THIS problem.

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

/** Plain facts the model may be shown so it can pick relevant identifiers. No prose from the model is ever displayed. */
export function selectionMenu(ctx: HelpContext) {
  return {
    steps: ctx.solution.steps.map((s) => ({ id: s.id, title: s.title })),
    concepts: applicableConcepts(ctx.solution).map((id) => ({ id, title: CONCEPTS[id].title })),
    possibleMistakes: ctx.causes.map((id) => ({ id, description: CAUSE_TEXT[id] })),
  };
}

