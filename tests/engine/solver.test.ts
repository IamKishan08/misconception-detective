import { describe, expect, it } from 'vitest';
import { checkAnswer } from '../../src/engine/solver/check.js';
import { cmp, eq, frac, fmt, reduce, toMixed, type Frac } from '../../src/engine/solver/frac.js';
import { parseAnswer, parseProblem, SUPPORTED_FORMATS, type ParseErrorCode } from '../../src/engine/solver/parse.js';
import { problemText, type Op, type Problem } from '../../src/engine/solver/problem.js';
import { similarProblem } from '../../src/engine/solver/similar.js';
import { solve, stepsEndValue, verifySolution } from '../../src/engine/solver/solve.js';

function mustParse(text: string): Problem {
  const out = parseProblem(text);
  if (!out.ok) throw new Error(`"${text}" should parse but: ${out.message}`);
  return out.problem;
}
const arith = (op: Op, a: Frac, b: Frac): Problem => ({ kind: 'arith', op, a, b });
const value = (p: Problem): Frac => {
  const r = solve(p).result;
  if (r.type !== 'value') throw new Error('expected a value result');
  return r.value;
};
const compareOf = (a: Frac, b: Frac, ask: 'larger' | 'smaller' = 'larger'): Problem => ({ kind: 'compare', a, b, ask });

describe('parsing supported problem formats', () => {
  it.each([
    ['1/2 + 1/4', arith('add', frac(1, 2), frac(1, 4))],
    ['3/4 - 1/6', arith('sub', frac(3, 4), frac(1, 6))],
    ['2/3 × 3/5', arith('mul', frac(2, 3), frac(3, 5))],
    ['1/2 ÷ 3/4', arith('div', frac(1, 2), frac(3, 4))],
    ['  1 / 2   +   1 / 4  ', arith('add', frac(1, 2), frac(1, 4))],
    ['1/2+1/4', arith('add', frac(1, 2), frac(1, 4))],
    ['3/4 − 1/6', arith('sub', frac(3, 4), frac(1, 6))],
    ['2/3 x 3/5', arith('mul', frac(2, 3), frac(3, 5))],
    ['2/3x3/5', arith('mul', frac(2, 3), frac(3, 5))],
    ['2/3 * 3/5', arith('mul', frac(2, 3), frac(3, 5))],
    ['1/2 divided by 3/4', arith('div', frac(1, 2), frac(3, 4))],
    ['1/2 plus 1/4', arith('add', frac(1, 2), frac(1, 4))],
    ['2 × 3/5', arith('mul', frac(2, 1), frac(3, 5))],
    ['½ + ¼', arith('add', frac(1, 2), frac(1, 4))],
    ['Compare 2/3 and 3/4', compareOf(frac(2, 3), frac(3, 4))],
    ['Which is bigger, 2/3 or 3/4?', compareOf(frac(2, 3), frac(3, 4))],
    ['which is smaller 2/3 or 3/4', compareOf(frac(2, 3), frac(3, 4), 'smaller')],
    ['2/3 vs 3/4', compareOf(frac(2, 3), frac(3, 4))],
    ['2/3 < 3/4', compareOf(frac(2, 3), frac(3, 4))],
    ['1/2 = ?/8', { kind: 'equivalent', known: frac(1, 2), blank: 'numerator', other: 8 }],
    ['1/2 = _/8', { kind: 'equivalent', known: frac(1, 2), blank: 'numerator', other: 8 }],
    ['3/5 = 9/?', { kind: 'equivalent', known: frac(3, 5), blank: 'denominator', other: 9 }],
    ['?/8 = 1/2', { kind: 'equivalent', known: frac(1, 2), blank: 'numerator', other: 8 }],
  ] as [string, Problem][])('"%s"', (text, expected) => {
    expect(mustParse(text)).toEqual(expected);
  });

  it('every advertised format parses, and canonical text round-trips', () => {
    for (const text of SUPPORTED_FORMATS) {
      const p = mustParse(text);
      expect(mustParse(problemText(p))).toEqual(p);
    }
  });
});

describe('invalid or unsupported input is explained, never guessed', () => {
  const cases: [string, ParseErrorCode][] = [
    ['', 'empty'],
    ['   ', 'empty'],
    ['1/0 + 1/2', 'zero_denominator'],
    ['1/2 + 3/0', 'zero_denominator'],
    ['1/2 = ?/0', 'zero_denominator'],
    ['1/2 ÷ 0/5', 'divide_by_zero'],
    ['1/2 ÷ 0', 'divide_by_zero'],
    ['0.5 + 1/4', 'decimals'],
    ['1 1/2 + 1/4', 'mixed_number'],
    ['-1/2 + 1/4', 'negative_operand'],
    ['1/2 + -1/4', 'negative_operand'],
    ['1/2 + 1/4 + 1/8', 'too_many_fractions'],
    ['1/2', 'no_operation'],
    ['1/2 / 3/4', 'slash_division'],
    ['1/2 = 2/4', 'no_blank'],
    ['?/2 = 3/?', 'two_blanks'],
    ['1000/2 + 1/2', 'out_of_range'],
    ['what is the capital of France', 'unknown_text'],
    ['solve x + 2 = 5', 'no_blank'],
    ['Compare 1/2', 'compare_count'],
    ['Compare 1/2 and 1/3 and 1/4', 'compare_count'],
    ['1/2 + ', 'incomplete'],
    ['x'.repeat(200), 'too_long'],
  ];
  it.each(cases)('"%s" → %s', (text, code) => {
    const out = parseProblem(text);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe(code);
      expect(out.message.length).toBeGreaterThan(10);
    }
  });

  it('does not evaluate code-like input', () => {
    for (const text of ['process.exit(1)', '1/2 + constructor', '__proto__', '(1/2)+(1/4)', '1/2 + 1/4; alert(1)']) {
      expect(parseProblem(text).ok).toBe(false);
    }
  });
});

describe('exact arithmetic', () => {
  it('matches independent floating-point results and every step is true, for all small operands', () => {
    let checked = 0;
    for (const op of ['add', 'sub', 'mul', 'div'] as const) {
      for (let an = 0; an <= 9; an += 1) {
        for (let ad = 1; ad <= 9; ad += 1) {
          for (let bn = op === 'div' ? 1 : 0; bn <= 9; bn += 1) {
            for (let bd = 1; bd <= 9; bd += 1) {
              const p = arith(op, frac(an, ad), frac(bn, bd));
              const solution = solve(p);
              const x = an / ad;
              const y = bn / bd;
              const expected = op === 'add' ? x + y : op === 'sub' ? x - y : op === 'mul' ? x * y : x / y;
              const got = value(p);
              expect(got.n / got.d).toBeCloseTo(expected, 12);
              expect(verifySolution(solution)).toEqual([]);
              const end = stepsEndValue(solution);
              expect(end !== null && eq(end, got)).toBe(true);
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(30000);
  });

  it('stays exact at the input bounds where floating point would not', () => {
    const p = mustParse('999/998 × 997/996');
    expect(value(p)).toEqual(reduce(frac(999 * 997, 998 * 996)));
    const q = mustParse('999/998 - 997/996');
    expect(value(q)).toEqual(reduce(frac(999 * 996 - 997 * 998, 998 * 996)));
    expect(verifySolution(solve(q))).toEqual([]);
    const sum = mustParse('999/997 + 998/991');
    expect(verifySolution(solve(sum))).toEqual([]);
    expect(fmt(value(sum))).toBe(fmt(reduce(frac(999 * 991 + 998 * 997, 997 * 991))));
  });

  it('keeps a negative result negative and explains it', () => {
    const solution = solve(mustParse('1/4 - 1/2'));
    expect(solution.result).toEqual({ type: 'value', value: frac(-1, 4) });
    expect(solution.answerText).toBe('−1/4');
    const combine = solution.steps.find((s) => s.id === 'combine');
    expect(combine?.why).toContain('negative');
    expect(combine?.visual?.kind).toBe('line');
  });

  it('handles improper results with a mixed-number step and a stacked bar, not a single whole', () => {
    const solution = solve(mustParse('3/4 + 1/2'));
    expect(solution.answerText).toBe('5/4 (or 1 1/4)');
    expect(solution.steps.some((s) => s.id === 'mixed')).toBe(true);
    const combine = solution.steps.find((s) => s.id === 'combine');
    expect(combine?.visual?.kind).toBe('bars');
    if (combine?.visual?.kind === 'bars') {
      expect(combine.visual.bars.at(-1)).toMatchObject({ parts: 4, shaded: 5 });
    }
    expect(toMixed(frac(5, 4))).toEqual({ negative: false, whole: 1, n: 1, d: 4 });
  });

  it('does not draw bars for numbers that would be unreadable', () => {
    const solution = solve(mustParse('7/13 + 5/11'));
    expect(solution.steps.every((s) => s.visual === undefined || s.visual.kind === 'line')).toBe(true);
  });

  it('zero results and whole-number results are written correctly', () => {
    expect(solve(mustParse('1/2 - 2/4')).answerText).toBe('0');
    expect(solve(mustParse('1/2 + 1/2')).answerText).toBe('1');
    expect(solve(mustParse('4 ÷ 2/3')).answerText).toBe('6');
    expect(solve(mustParse('0/5 + 1/3')).answerText).toBe('1/3');
  });
});

describe('worked example from the product brief: 1/2 + 1/4', () => {
  const solution = solve(mustParse('1/2 + 1/4'));
  it('shows equal-sized pieces, 1/2 = 2/4, 2/4 + 1/4 = 3/4 and keeps the denominator', () => {
    const lines = solution.steps.flatMap((s) => s.lines.map((l) => l.text));
    expect(lines).toContain('1/2 = 2/4');
    expect(lines.some((l) => l.startsWith('2/4 + 1/4 = (2 + 1)/4 = 3/4'))).toBe(true);
    expect(solution.steps[0]?.why).toContain('The denominator tells us the size of each piece');
    expect(solution.steps[0]?.why).toContain('equal-sized pieces');
    expect(solution.steps.find((s) => s.id === 'combine')?.why).toContain('keep the denominator 4 because the pieces are still quarters');
    expect(solution.answerText).toBe('3/4');
  });
  it('treats 2/6 as an observed wrong answer with only a possible, hedged explanation', () => {
    const check = checkAnswer(solution, '2/6', '');
    expect(check.verdict).toBe('incorrect');
    expect(check.shown).toBe('2/6');
    expect(check.causes).toHaveLength(1);
    expect(check.causes[0]).toMatchObject({ id: 'added_across', evidence: 'answer' });
    expect(check.causes[0]?.evidenceText).toContain('not a diagnosis');
    expect(check.observations[0]).toContain('smaller than 1/2');
  });
  it('upgrades the evidence only when the working actually shows it', () => {
    const withWorking = checkAnswer(solution, '2/6', 'I did 1 + 1 = 2 and 2 + 4 = 6');
    expect(withWorking.causes[0]?.evidence).toBe('working');
    expect(withWorking.causes[0]?.evidenceText).toContain('1 + 1');
    const unrelated = checkAnswer(solution, '2/6', 'I just guessed');
    expect(unrelated.causes[0]?.evidence).toBe('answer');
  });
  it('does not diagnose a wrong answer that matches no known pattern', () => {
    const check = checkAnswer(solution, '5/7', '');
    expect(check.verdict).toBe('incorrect');
    expect(check.causes).toEqual([]);
  });
});

describe('checking answers: equivalent, unsimplified, improper, invalid', () => {
  const sum = solve(mustParse('1/2 + 1/4'));
  it('accepts equivalent but unsimplified answers and offers the simplest form', () => {
    const check = checkAnswer(sum, '6/8', '');
    expect(check.verdict).toBe('correct_unsimplified');
    expect(check.simplest).toBe('3/4');
    expect(checkAnswer(sum, '3 / 4', '').verdict).toBe('correct');
  });
  it('accepts improper and mixed forms of a correct answer', () => {
    const p = solve(mustParse('3/4 + 1/2'));
    expect(checkAnswer(p, '5/4', '').verdict).toBe('correct');
    expect(checkAnswer(p, '1 1/4', '').verdict).toBe('correct');
    expect(checkAnswer(p, '1 2/8', '').verdict).toBe('correct_unsimplified');
  });
  it('accepts negative answers with either minus sign', () => {
    const p = solve(mustParse('1/4 - 1/2'));
    expect(checkAnswer(p, '-1/4', '').verdict).toBe('correct');
    expect(checkAnswer(p, '−2/8', '').verdict).toBe('correct_unsimplified');
    const reversed = checkAnswer(p, '1/4', '');
    expect(reversed.verdict).toBe('incorrect');
    expect(reversed.causes.map((c) => c.id)).toContain('reversed_order');
  });
  it('reports unreadable answers as invalid, not wrong', () => {
    for (const text of ['abc', '1/0', '0.75', '50%', '1/2/3', '--1']) {
      expect(checkAnswer(sum, text, '').verdict).toBe('invalid');
    }
    expect(checkAnswer(sum, '', '').verdict).toBe('blank');
  });
  it('knows the common division slips', () => {
    const p = solve(mustParse('1/2 ÷ 3/4'));
    expect(checkAnswer(p, '2/3', '').verdict).toBe('correct');
    expect(checkAnswer(p, '3/8', '').causes.map((c) => c.id)).toEqual(['no_flip']);
    expect(checkAnswer(p, '3/2', '').causes.map((c) => c.id)).toEqual(['flipped_first']);
  });
  it('compare: accepts the larger fraction or the word equal', () => {
    const c = solve(mustParse('Compare 2/3 and 3/4'));
    expect(checkAnswer(c, '3/4', '').verdict).toBe('correct');
    expect(checkAnswer(c, '6/8', '').verdict).toBe('correct');
    const wrong = checkAnswer(c, '2/3', '');
    expect(wrong.verdict).toBe('incorrect');
    expect(wrong.causes).toEqual([]);
    const sameValue = solve(mustParse('Compare 1/2 and 2/4'));
    expect(sameValue.result).toEqual({ type: 'compare', relation: 'equal' });
    expect(checkAnswer(sameValue, 'equal', '').verdict).toBe('correct');
    expect(checkAnswer(sameValue, '1/2', '').verdict).toBe('incorrect');
    const bigDen = checkAnswer(solve(mustParse('Compare 3/4 and 5/8')), '5/8', '');
    expect(bigDen.causes.map((c) => c.id)).toEqual(['bigger_denominator']);
  });
});

describe('equivalent fractions with a missing number', () => {
  it.each([
    ['1/2 = ?/8', 4],
    ['3/5 = 9/?', 15],
    ['2/4 = ?/2', 1],
    ['6/8 = ?/12', 9],
    ['0/3 = ?/7', 0],
    ['2/6 = 1/?', 3],
  ] as [string, number][])('%s → %i with true steps', (text, missing) => {
    const solution = solve(mustParse(text));
    expect(solution.result).toMatchObject({ type: 'missing', value: missing });
    expect(verifySolution(solution)).toEqual([]);
    const last = solution.steps.at(-1);
    expect(last?.lines.some((l) => l.text.includes('/'))).toBe(true);
  });

  it.each(['2/3 = ?/4', '2/3 = 1/?', '1/2 = 0/?'])('%s has no whole-number answer and says so', (text) => {
    const solution = solve(mustParse(text));
    expect(solution.result.type).toBe('no_integer');
    expect(solution.steps.at(-1)?.title).toBe('No whole number works');
    expect(checkAnswer(solution, '3', '').verdict).toBe('incorrect');
  });

  it('0/5 = 0/? accepts any whole number', () => {
    const solution = solve(mustParse('0/5 = 0/?'));
    expect(solution.result.type).toBe('any');
    expect(checkAnswer(solution, '7', '').verdict).toBe('correct');
  });

  it('accepts the full fraction and flags an equal fraction of the wrong form', () => {
    const solution = solve(mustParse('1/2 = ?/8'));
    expect(checkAnswer(solution, '4', '').verdict).toBe('correct');
    expect(checkAnswer(solution, '4/8', '').verdict).toBe('correct');
    const wrongForm = checkAnswer(solution, '2/4', '');
    expect(wrongForm.verdict).toBe('incorrect');
    expect(wrongForm.observations[0]).toContain('equal fraction');
  });

  it('recognises additive-scaling and one-number slips as possibilities', () => {
    const solution = solve(mustParse('1/2 = ?/8'));
    expect(checkAnswer(solution, '7', '').causes.map((c) => c.id)).toEqual(['added_same_number']);
    expect(checkAnswer(solution, '1', '').causes.map((c) => c.id)).toEqual(['changed_one_number']);
  });
});

describe('comparison steps', () => {
  it('compares exactly and states the relation in steps that are true', () => {
    for (let an = 1; an <= 8; an += 1) {
      for (let ad = 2; ad <= 9; ad += 1) {
        for (let bn = 1; bn <= 8; bn += 1) {
          for (let bd = 2; bd <= 9; bd += 1) {
            for (const ask of ['larger', 'smaller'] as const) {
              const a = frac(an, ad);
              const b = frac(bn, bd);
              const s = solve(compareOf(a, b, ask));
              expect(verifySolution(s)).toEqual([]);
              const c = cmp(a, b);
              const expected = c === 0 ? 'equal' : c > 0 === (ask === 'larger') ? 'first' : 'second';
              expect(s.result).toEqual({ type: 'compare', relation: expected });
            }
          }
        }
      }
    }
  });
});

describe('similar problems', () => {
  const originals = ['1/2 + 1/4', '3/4 - 1/6', '1/4 - 1/2', '2/3 × 3/5', '1/2 ÷ 3/4', 'Compare 2/3 and 3/4', 'Compare 1/2 and 2/4', '1/2 = ?/8', '3/5 = 9/?'];
  it.each(originals)('for "%s" gives different, solvable, parseable problems of the same kind', (text) => {
    const original = mustParse(text);
    const seen = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const next = similarProblem(original, i);
      expect(next.kind).toBe(original.kind);
      expect(problemText(next)).not.toBe(problemText(original));
      expect(mustParse(problemText(next))).toEqual(next);
      expect(verifySolution(solve(next))).toEqual([]);
      if (next.kind === 'equivalent') expect(solve(next).result.type).toBe('missing');
      if (next.kind === 'arith' && original.kind === 'arith') expect(next.op).toBe(original.op);
      seen.add(problemText(next));
      expect(problemText(similarProblem(original, i))).toBe(problemText(next));
    }
    expect(seen.size).toBeGreaterThan(3);
  });
  it('keeps a negative-answer subtraction negative', () => {
    for (let i = 0; i < 10; i += 1) expect(cmp(value(similarProblem(mustParse('1/4 - 1/2'), i)), frac(0, 1))).toBeLessThan(0);
  });
});

describe('answer parsing', () => {
  it('reads fractions, wholes, mixed numbers and signs', () => {
    expect(parseAnswer('3/4', false)).toMatchObject({ ok: true, value: frac(3, 4) });
    expect(parseAnswer(' 5 ', false)).toMatchObject({ ok: true, value: frac(5, 1) });
    expect(parseAnswer('1 1/4', false)).toMatchObject({ ok: true, value: frac(5, 4) });
    expect(parseAnswer('-1 1/4', false)).toMatchObject({ ok: true, value: frac(-5, 4) });
    expect(parseAnswer('999999999/999999998', false).ok).toBe(true);
    expect(parseAnswer('1234567890/1', false).ok).toBe(false);
  });
});
