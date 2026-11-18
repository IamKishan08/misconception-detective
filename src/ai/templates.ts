/**
 * Explanation templates and their verified, hand-written fallback text.
 * The model may only pick one of these ids; if it fails, this text is shown with an "Offline explanations" label.
 */
import type { FamilyId } from '../engine/types.js';

export interface ExplanationTemplate {
  readonly id: string;
  /** One-line description of the teaching idea, given to the model as context. */
  readonly idea: string;
  /** Verified sentences indexed by hint level (0 = no hints used, 1 = one hint, 2 = two or more). */
  readonly fallback: readonly [readonly string[], readonly string[], readonly string[]];
}

export const TEMPLATES: Readonly<Record<FamilyId, readonly ExplanationTemplate[]>> = {
  F1: [
    {
      id: 'F1.common_parts',
      idea: 'Fractions can only be added when the parts are the same size, so cut both into equal parts first, then count the parts.',
      fallback: [
        ['To add fractions, first cut both wholes into parts of the same size.', 'Then add the parts; the size of each part does not change.'],
        ['Halves and thirds are different sizes, so we cannot count them together yet.', 'Cut both bars into the same number of parts, then count the shaded ones.'],
        ['Look at the bars step by step: first make the parts the same size.', 'Only the top number grows when you add, because the part size stays the same.'],
      ],
    },
    {
      id: 'F1.size_check',
      idea: 'Check the answer by size: adding must give more than either fraction, but adding the tops and bottoms gives less.',
      fallback: [
        ['Adding should make the amount bigger than each fraction you started with.', 'Adding the tops and the bottoms gives a smaller amount, so it cannot be right.'],
        ['Compare the bars: the answer must be longer than both starting bars.', 'If your answer bar is shorter, the parts were added the wrong way.'],
        ['Hold the bars side by side and check which is longer.', 'A sum is always longer than each piece you added.'],
      ],
    },
  ],
  F2: [
    {
      id: 'F2.same_whole',
      idea: 'With the same whole, more parts means each part is smaller, so a bigger bottom number gives smaller pieces.',
      fallback: [
        ['The bottom number tells how many equal parts the whole is cut into.', 'More parts means each part is smaller, so a bigger bottom number can mean a smaller fraction.'],
        ['Look at the two bars: they are the same length but cut into different numbers of parts.', 'The bar with more parts has smaller pieces.'],
        ['Count the parts in each bar, then look at the size of one part.', 'When the top numbers match, the fraction with fewer parts is bigger.'],
      ],
    },
    {
      id: 'F2.sharing',
      idea: 'Sharing one thing among more people gives each person a smaller share.',
      fallback: [
        ['Think of sharing one roti: more people sharing means a smaller piece for each.', 'So one part out of more parts is smaller.'],
        ['Imagine the same roti shared by a few friends or by many friends.', 'Each friend gets less when more people share.'],
        ['Picture the whole cut for each sharing group, then compare one piece.', 'The piece from the bigger group is the smaller one.'],
      ],
    },
  ],
  F3: [
    {
      id: 'F3.split_parts',
      idea: 'Cutting every part into the same number of pieces multiplies the top and bottom by the same number, keeping the amount the same.',
      fallback: [
        ['To find an equal fraction, cut every part into the same number of smaller pieces.', 'Both the top and the bottom number are multiplied by the same number.'],
        ['If you only change the bottom number, the pieces get smaller but you still shade the same count.', 'Multiply the top by the same number so the shaded amount stays the same.'],
        ['Step through the bars: each part is split into equal pieces.', 'Count the shaded pieces again; that new count is the new top number.'],
      ],
    },
    {
      id: 'F3.same_amount',
      idea: 'Equivalent fractions are different names for the same amount; the shaded length stays the same.',
      fallback: [
        ['Equal fractions are different names for the same amount.', 'The shaded part of the bar stays the same length even when the numbers change.'],
        ['Compare the shaded lengths in the bars, not just the numbers.', 'If the lengths match, the fractions are equal.'],
        ['Line the bars up and check where the shading ends.', 'Same ending point means same amount.'],
      ],
    },
  ],
};

export function findTemplate(family: FamilyId, templateId: string): ExplanationTemplate | undefined {
  return TEMPLATES[family].find((t) => t.id === templateId);
}

export function defaultTemplate(family: FamilyId): ExplanationTemplate {
  const first = TEMPLATES[family][0];
  if (first === undefined) throw new Error(`No templates for ${family}`);
  return first;
}

export function fallbackSentences(template: ExplanationTemplate, hintLevel: number): readonly string[] {
  const level = Math.max(0, Math.min(hintLevel, template.fallback.length - 1));
  return template.fallback[level] ?? template.fallback[0];
}
