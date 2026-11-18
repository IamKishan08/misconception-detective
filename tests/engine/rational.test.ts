import { add, addAcross, compare, equals, gcd, lcm, parseFraction, parseWholeNumber, rational, reduce } from '../../src/engine/rational.js';

describe('rational arithmetic', () => {
  it('normalises with gcd and compares exactly', () => {
    expect(gcd(12, 18)).toBe(6);
    expect(lcm(4, 6)).toBe(12);
    expect(reduce({ n: 6, d: 8 })).toEqual({ n: 3, d: 4 });
    expect(equals({ n: 2, d: 4 }, { n: 1, d: 2 })).toBe(true);
    expect(compare({ n: 1, d: 8 }, { n: 1, d: 4 })).toBeLessThan(0);
  });

  it('adds with a common denominator, unlike the across rule', () => {
    expect(add({ n: 1, d: 2 }, { n: 1, d: 3 })).toEqual({ n: 5, d: 6 });
    expect(addAcross({ n: 1, d: 2 }, { n: 1, d: 3 })).toEqual({ n: 2, d: 5 });
  });

  it('rejects zero or invalid denominators when constructing', () => {
    expect(() => rational(1, 0)).toThrow(RangeError);
    expect(() => rational(1.5, 2)).toThrow(RangeError);
    expect(() => rational(-1, 2)).toThrow(RangeError);
  });
});

describe('parsing learner input', () => {
  it('accepts whole numbers within range', () => {
    expect(parseWholeNumber(' 12 ')).toEqual({ ok: true, value: 12 });
    expect(parseFraction('4', '10')).toEqual({ ok: true, value: { n: 4, d: 10 } });
  });

  it.each([
    ['', 'empty'],
    ['1.5', 'not_whole_number'],
    ['-3', 'not_whole_number'],
    ['1e3', 'not_whole_number'],
    ['0x10', 'not_whole_number'],
    ['3/4', 'not_whole_number'],
    ['1000', 'out_of_range'],
  ])('rejects %j as %s', (raw, reason) => {
    expect(parseWholeNumber(raw)).toEqual({ ok: false, reason });
  });

  it('rejects a zero denominator', () => {
    expect(parseFraction('1', '0')).toEqual({ ok: false, reason: 'zero_denominator' });
  });
});
