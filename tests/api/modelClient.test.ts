import { thinkingFor } from '../../src/ai/modelClient.js';

describe('thinkingFor', () => {
  it('turns thinking off by budget on Gemini 2.x and by level on newer models', () => {
    expect(thinkingFor('gemini-2.5-flash')).toEqual({ thinkingBudget: 0 });
    expect(thinkingFor('gemini-3.5-flash-lite')).toEqual({ thinkingLevel: 'MINIMAL' });
  });
});
