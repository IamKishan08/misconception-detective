/**
 * Every user-facing string lives here so another language can be added without touching components.
 * English only for this MVP.
 */
import type { FamilyStatus, NextAction, ReasonId } from '../engine/progression.js';
import { format, type Rational } from '../engine/rational.js';
import type { FamilyId, InvalidReason, Outcome, Question, VisualNote } from '../engine/types.js';

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINALS: Record<number, string> = {
  2: 'half', 3: 'third', 4: 'quarter', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth',
  11: 'eleventh', 12: 'twelfth', 14: 'fourteenth', 15: 'fifteenth', 16: 'sixteenth', 18: 'eighteenth', 20: 'twentieth',
};

export function numberToWords(value: number): string {
  if (value < 20) return ONES[value] ?? String(value);
  if (value < 100) {
    const tens = TENS[Math.floor(value / 10)] ?? '';
    const ones = value % 10;
    return ones === 0 ? tens : `${tens}-${ONES[ones] ?? ''}`;
  }
  return String(value);
}

/** Screen-reader text for a fraction: 3/4 → "three quarters", 5/24 → "five over twenty-four". */
export function fractionSpeech(r: Rational): string {
  const count = numberToWords(r.n);
  if (r.d === 1) return count;
  const ordinal = ORDINALS[r.d];
  if (ordinal === undefined) return `${count} over ${numberToWords(r.d)}`;
  if (r.n === 1) return `one ${ordinal}`;
  return `${count} ${ordinal === 'half' ? 'halves' : `${ordinal}s`}`;
}

const FAMILY_NAMES: Record<FamilyId, string> = {
  F1: 'Adding fractions',
  F2: 'Comparing fractions',
  F3: 'Equal fractions',
};

const FAMILY_IDEAS: Record<FamilyId, string> = {
  F1: 'adding the top numbers together and the bottom numbers together',
  F2: 'thinking a bigger bottom number always means a bigger fraction',
  F3: 'changing only one number, or adding instead of multiplying, when making an equal fraction',
};

const RETEACH: Record<FamilyId, string> = {
  F1: 'Paper strips: fold one strip into halves and one into thirds, then re-fold both into sixths and count the shaded sixths together. Ask: can the total be smaller than one of the pieces?',
  F2: 'Roti sharing: share one roti among 3 children and an equal roti among 6. Compare one share from each. Then order 1/2, 1/4, 1/8 on a number line.',
  F3: 'Fold and re-fold: shade 1/2 of a strip, fold it again into quarters and eighths, and record each new name for the same shaded amount.',
};

const STATUS: Record<FamilyStatus, string> = {
  not_started: 'Not started',
  checking: 'Checking',
  possible: 'Possible misconception',
  likely: 'Likely misconception',
  improving: 'Improving',
  secure: 'Secure',
};

const REASONS: Record<ReasonId, string> = {
  added_tops_bottoms: 'I added the tops and the bottoms',
  bigger_bottom_bigger: 'Bigger bottom number means bigger',
  changed_one_number: 'I changed only one of the numbers',
  counted_parts: 'I drew it or counted the parts',
  not_sure: 'Not sure',
};

const INVALID: Record<InvalidReason, string> = {
  empty: 'Please fill in every box before checking.',
  not_whole_number: 'Please type whole numbers only, like 3 or 12.',
  out_of_range: 'That number is too big. Please use numbers up to 999.',
  zero_denominator: 'The bottom number cannot be 0. A whole cannot be cut into 0 parts.',
  wrong_answer_kind: 'Please answer using the boxes shown.',
  unknown_option: 'Please choose one of the options.',
};

const HINTS: Record<FamilyId, string> = {
  F1: 'Hint: make both fractions have the same bottom number first, then add only the top numbers.',
  F2: 'Hint: imagine both wholes are the same size. Which one is cut into bigger pieces?',
  F3: 'Hint: whatever you multiply the bottom by, multiply the top by the same number.',
};

function actionLine(action: NextAction): string {
  switch (action) {
    case 'ask_followup':
      return 'Let us check with one more question before deciding anything.';
    case 'show_explanation':
      return 'Let us look at it with fraction bars.';
    case 'ask_another_item':
      return 'Here is another question so we can be sure.';
    case 'ask_transfer':
      return 'Now try one with new numbers.';
    case 'ask_harder_transfer':
      return 'Nice work. Try a slightly harder one.';
    case 'next_family':
      return 'You have secured this idea. On to the next one!';
    case 'all_done':
      return 'You have secured all three ideas. Well done!';
    case 'retry_same':
      return '';
  }
}

export const messages = {
  appName: 'Misconception Detective',
  tagline: 'Find the idea behind a fractions mistake, then fix it.',
  skipToContent: 'Skip to main content',
  nav: { practise: 'Practise', teacher: 'Teacher view', data: 'Your data' },
  explanationsLive: 'Live explanations (Gemini)',
  explanationsOffline: 'Offline explanations',
  explanationsOfflineDetail: 'Showing verified built-in explanations.',
  familyName: (f: FamilyId) => FAMILY_NAMES[f],
  familyIdea: (f: FamilyId) => FAMILY_IDEAS[f],
  reteach: (f: FamilyId) => RETEACH[f],
  status: (s: FamilyStatus) => STATUS[s],
  reason: (r: ReasonId) => REASONS[r],
  invalid: (r: InvalidReason) => INVALID[r],
  hint: (f: FamilyId) => HINTS[f],
  fractionSpeech,
  stageLabel: { item: 'Question', followup: 'Check question', transfer: 'New numbers' } as const,

  question: {
    add: 'Add the fractions. Write your answer as a fraction.',
    comparePlain: 'Which fraction is larger?',
    compareShare: (a: Rational, b: Rational) =>
      `One roti is shared equally among ${a.d} children. Another roti of the same size is shared equally among ${b.d} children. Which share is larger?`,
    missingNumerator: 'Fill in the missing top number so the fractions are equal.',
    missingDenominator: 'Fill in the missing bottom number so the fractions are equal.',
    equalCheck: 'Are these two fractions equal?',
    optionEqual: 'They are equal',
    optionEqualCheckFirst: (a: Rational) => `No, ${format(a)} is larger`,
    optionEqualCheckSecond: (b: Rational) => `No, ${format(b)} is larger`,
    numerator: 'Top number (numerator)',
    denominator: 'Bottom number (denominator)',
    missingNumber: 'Missing number',
    answerGroup: 'Your answer',
    reasonGroup: 'How did you work it out? (optional)',
    reasonText: 'Or type your reason (optional, up to 200 characters)',
    reasonCount: (n: number, max: number) => `${n} of ${max} characters`,
    showHint: 'Show a hint',
    hintNote: 'Using a hint is fine. A question answered with a hint does not count toward "secure".',
    check: 'Check answer',
    checking: 'Checking…',
  },

  /** Short one-line text of a question, for the teacher table. */
  questionSummary(q: Question): string {
    const b = q.body;
    switch (b.type) {
      case 'add':
        return `${format(b.a)} + ${format(b.b)} = ?`;
      case 'compare':
        return `Larger: ${format(b.first)} or ${format(b.second)}?`;
      case 'missing_numerator':
        return `${format(b.known)} = ?/${b.targetDen}`;
      case 'missing_denominator':
        return `${format(b.known)} = ${b.targetNum}/?`;
      case 'equal_check':
        return `Is ${format(b.first)} equal to ${format(b.second)}?`;
    }
  },

  feedback(outcome: Outcome, action: NextAction, family: FamilyId, display: string): { title: string; body: string } {
    const next = actionLine(action);
    switch (outcome) {
      case 'correct':
        return { title: `Correct: ${display}`, body: action === 'ask_another_item' ? `That is right. We need a little more evidence, so here is a different question. ${next}` : next };
      case 'possible_misconception':
        return {
          title: `Not quite: ${display}`,
          body: `This answer often comes from ${FAMILY_IDEAS[family]}. That is only a possible idea, not a diagnosis. ${next}`,
        };
      case 'needs_more_evidence':
        return { title: `Not quite: ${display}`, body: next };
      case 'invalid_input':
        return { title: 'Please check your answer', body: '' };
    }
  },

  explanation: {
    heading: 'Look at it with fraction bars',
    labelledIntro: (f: FamilyId) => `Your answers matched ${FAMILY_IDEAS[f]} twice. Here is why that does not work.`,
    supportIntro: 'Here is a picture that can help.',
    step: (i: number, n: number) => `Step ${i} of ${n}`,
    previous: 'Previous step',
    next: 'Next step',
    continue: 'Try a question with new numbers',
    loading: 'Loading the explanation…',
    templateTitle: (id: string) => TEMPLATE_TITLES[id] ?? 'Explanation',
    barLabel: (value: Rational, parts: number, shaded: number) =>
      `${fractionSpeech(value)}: a bar cut into ${parts} equal parts with ${shaded} shaded`,
    note(note: VisualNote): string {
      switch (note.key) {
        case 'show_fraction':
          return `This bar shows ${format(note.value)}: ${note.value.n} of ${note.value.d} equal parts are shaded.`;
        case 'common_parts':
          return `Cut both bars into ${note.parts} equal parts. Now the parts are the same size and can be counted together.`;
        case 'total':
          return note.total.n === note.reduced.n && note.total.d === note.reduced.d
            ? `Count the shaded parts: ${format(note.total)} altogether.`
            : `Count the shaded parts: ${format(note.total)}, which is the same amount as ${format(note.reduced)}.`;
        case 'across_not_bigger':
          return `Adding the tops and bottoms gives ${format(note.across)}. But ${format(note.across)} is not bigger than ${format(note.largest)}, and adding must give more than each part.`;
        case 'same_whole':
          return `Both bars are the same whole. ${format(note.smaller)} has more, smaller parts, so it is smaller than ${format(note.bigger)}.`;
        case 'compare_common':
          return `Cut both into ${note.parts} equal parts and count: ${format(note.larger)} has more shaded parts, so it is larger.`;
        case 'split_parts':
          return `Cut every part of ${format(note.from)} into ${note.factor} pieces. The shaded amount stays the same, and it is now ${format(note.to)}.`;
        case 'one_part_scaled':
          return `Changing only the bottom number gives ${format(note.wrong)}: the parts got smaller but the count did not grow, so it is less than ${format(note.right)}.`;
      }
    },
  },

  progress: {
    heading: 'Ideas mastered',
    count: (n: number, total: number) => `${n} of ${total} ideas secure`,
    practise: (f: FamilyId) => `Practise ${FAMILY_NAMES[f]}`,
    current: 'current',
  },

  finished: {
    heading: 'All three ideas are secure',
    body: 'You answered new-number questions correctly without hints. You can practise any idea again from the path above.',
  },

  controls: {
    reset: 'Reset my progress',
    resetConfirm: 'This deletes all progress saved on this device. Continue?',
    resetDone: 'Progress cleared. Starting fresh.',
    networkError: 'Could not reach the server. Showing the verified built-in explanation instead.',
    storageWarning: 'This browser is not saving progress (private mode or storage blocked). Everything still works for this visit.',
  },

  teacher: {
    heading: 'Teacher view',
    deviceNote: 'This view shows only learners on this device. Nothing is shared between devices or sent to a server.',
    showSamples: 'Show sample learners',
    samplesNote: 'Sample learners are made-up examples to show how grouping works. They never affect your own progress.',
    you: 'You (this device)',
    sampleBadge: 'Sample',
    needsReteach: 'May need reteaching',
    improving: 'Improving',
    secure: (n: number) => `${n} learner${n === 1 ? '' : 's'} secure`,
    none: 'No learners in this group yet.',
    activity: 'Suggested reteach activity',
    learner: 'Learner',
    inferred: 'Inferred (suggested, not a diagnosis)',
    observed: 'Observed answers',
    stage: (s: Question['stage']) => ({ item: 'Question', followup: 'Check', transfer: 'New numbers' })[s],
    outcome: (o: Exclude<Outcome, 'invalid_input'>) =>
      ({ correct: 'correct', possible_misconception: 'matched pattern', needs_more_evidence: 'wrong, no pattern' })[o],
    hintUsed: 'hint used',
    answered: 'answered',
  },

  data: {
    heading: 'What is stored and what is sent',
    stored: 'Stored on this device only (localStorage): your answers, the questions you saw, and your progress for each idea. No name, email or account.',
    sent: 'Sent to our server only when needed: the idea id and hint level, to fetch a short explanation; and, only if you type a reason and your answer does not match a known pattern, that reason text (up to 200 characters) so Gemini can suggest which idea it describes.',
    notSent: 'Never sent: your answers, your progress, or anything that identifies you. The server does not log what you type.',
    reset: 'You can delete everything with "Reset my progress".',
  },
} as const;

const TEMPLATE_TITLES: Record<string, string> = {
  'F1.common_parts': 'Make the parts the same size',
  'F1.size_check': 'Check the size of the answer',
  'F2.same_whole': 'More parts means smaller parts',
  'F2.sharing': 'Sharing among more people',
  'F3.split_parts': 'Split every part the same way',
  'F3.same_amount': 'Same amount, different name',
};
