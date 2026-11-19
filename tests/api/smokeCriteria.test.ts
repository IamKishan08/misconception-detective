import { describe, expect, it } from 'vitest';
import { parseProblem } from '../../src/engine/solver/parse.js';
import { solve } from '../../src/engine/solver/solve.js';
import type { HelpContext, HelpSelection } from '../../src/engine/solver/help.js';
import { DISTINCT_CASES, SMOKE_CASES, judgeCase, judgeRun, type CaseVerdict } from '../../scripts/smokeCriteria.js';

function ctxFor(text: string, causes: HelpContext['causes'] = []): HelpContext {
  const parsed = parseProblem(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return { solution: solve(parsed.problem), causes };
}

const goodSelections: HelpSelection[] = [
  { intent: 'explain_concept', conceptId: 'equal_denominators' },
  { intent: 'explain_concept', conceptId: 'multiply_both' },
  { intent: 'explain_concept', conceptId: 'invert_divisor' },
  { intent: 'show_visual' },
  { intent: 'explain_mistake', causeId: 'added_across' },
  { intent: 'out_of_scope' },
  { intent: 'out_of_scope' },
];
const ok: CaseVerdict = { ok: true };
const goodRun = () => ({
  caseVerdicts: SMOKE_CASES.map(() => ok),
  selections: goodSelections,
  template: { source: 'gemini' as const, templateId: 'F1.common_parts' },
  health: 'live',
  failureCategories: [] as string[],
});

describe('smoke test criteria are strict: accepted is not enough, it must be relevant', () => {
  it('the expected selections for every case pass', () => {
    SMOKE_CASES.forEach((c, i) => {
      const verdict = judgeCase(c, { source: 'gemini', selection: goodSelections[i] }, ctxFor(c.problem, c.causes));
      expect(verdict).toEqual({ ok: true });
    });
  });

  it('an accepted but irrelevant selection fails', () => {
    const c = SMOKE_CASES[0]!;
    const verdict = judgeCase(c, { source: 'gemini', selection: { intent: 'help_start' } }, ctxFor(c.problem));
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.why).toContain('accepted but not relevant');
    // A valid concept for this problem, but the wrong one for the question.
    expect(judgeCase(c, { source: 'gemini', selection: { intent: 'explain_concept', conceptId: 'keep_denominator' } }, ctxFor(c.problem)).ok).toBe(false);
  });

  it('a fallback or a missing selection fails', () => {
    const c = SMOKE_CASES[3]!;
    expect(judgeCase(c, { source: 'fallback', selection: undefined, fallbackReason: 'rejected' }, ctxFor(c.problem)).ok).toBe(false);
    expect(judgeCase(c, { source: 'gemini', selection: undefined }, ctxFor(c.problem)).ok).toBe(false);
  });

  it('an on-topic question answered "out of scope", or an off-topic one answered with maths, fails', () => {
    expect(judgeCase(SMOKE_CASES[0]!, { source: 'gemini', selection: { intent: 'out_of_scope' } }, ctxFor('1/2 + 1/4')).ok).toBe(false);
    expect(judgeCase(SMOKE_CASES[5]!, { source: 'gemini', selection: { intent: 'show_visual' } }, ctxFor('1/2 + 1/4')).ok).toBe(false);
  });
});

describe('the run passes only when everything passes', () => {
  it('passes a fully good run', () => {
    expect(judgeRun(goodRun())).toEqual({ pass: true, problems: [] });
    expect(DISTINCT_CASES).toHaveLength(5);
  });

  it('one failed case fails the run, even if all others pass', () => {
    const run = goodRun();
    const verdicts: CaseVerdict[] = [...run.caseVerdicts];
    verdicts[4] = { ok: false, why: 'not accepted (rejected)' };
    const result = judgeRun({ ...run, caseVerdicts: verdicts });
    expect(result.pass).toBe(false);
    expect(result.problems.join(' ')).toContain('explain a supported mistake');
  });

  it('too few cases fail the run', () => {
    const run = goodRun();
    expect(judgeRun({ ...run, caseVerdicts: run.caseVerdicts.slice(0, 3) }).pass).toBe(false);
  });

  it('a template check that fell back fails the run', () => {
    expect(judgeRun({ ...goodRun(), template: { source: 'fallback', templateId: 'F1.common_parts' } }).pass).toBe(false);
    expect(judgeRun({ ...goodRun(), template: { source: 'gemini', templateId: 'F2.sharing' } }).pass).toBe(false);
  });

  it('on-topic questions that all get the same explanation fail the run', () => {
    const same: HelpSelection = { intent: 'explain_concept', conceptId: 'equal_denominators' };
    const result = judgeRun({ ...goodRun(), selections: [same, same, same, same, same, { intent: 'out_of_scope' }, { intent: 'out_of_scope' }] });
    expect(result.pass).toBe(false);
    expect(result.problems.join(' ')).toContain('distinct');
  });

  it('health other than "live", or any reported failure category, fails the run', () => {
    expect(judgeRun({ ...goodRun(), health: 'failing' }).pass).toBe(false);
    expect(judgeRun({ ...goodRun(), health: 'untested' }).pass).toBe(false);
    expect(judgeRun({ ...goodRun(), failureCategories: ['timeout'] }).pass).toBe(false);
  });
});

describe('the injection case', () => {
  it('can only pass with out_of_scope or clarify, and the rendered help never contains the attacker’s number', () => {
    const c = SMOKE_CASES[6]!;
    expect(judgeCase(c, { source: 'gemini', selection: { intent: 'clarify' } }, ctxFor(c.problem)).ok).toBe(true);
    expect(judgeCase(c, { source: 'gemini', selection: { intent: 'explain_step', stepId: 'combine' } }, ctxFor(c.problem)).ok).toBe(false);
  });
});
