/**
 * Every user-facing string lives here so another language can be added without touching components.
 * English only for this MVP.
 */
import type { FamilyStatus, NextAction, ReasonId } from '../engine/progression.js';
import { format, type Rational } from '../engine/rational.js';
import type { Answer, FamilyId, InvalidReason, Outcome, Question } from '../engine/types.js';

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
  if (r.n < 0) return `negative ${fractionSpeech({ n: -r.n, d: r.d })}`;
  const count = numberToWords(r.n);
  if (r.d === 1) return count;
  const ordinal = ORDINALS[r.d];
  if (ordinal === undefined) return `${count} over ${numberToWords(r.d)}`;
  if (r.n === 1) return `one ${ordinal}`;
  return `${count} ${ordinal === 'half' ? 'halves' : `${ordinal}s`}`;
}

/** Reads a line of working aloud: "2/4 + 1/4 = 3/4" → "two quarters plus one quarter equals three quarters". */
export function speakMath(text: string): string {
  return text
    .replace(/([-−])?(\d+)\/(\d+)/g, (_m, sign: string | undefined, n: string, d: string) =>
      fractionSpeech({ n: sign === undefined ? Number(n) : -Number(n), d: Number(d) }))
    .replace(/\)\//g, ') over ')
    .replace(/ × /g, ' times ')
    .replace(/ ÷ /g, ' divided by ')
    .replace(/ \+ /g, ' plus ')
    .replace(/ [-−] /g, ' minus ')
    .replace(/−(\d)/g, 'negative $1')
    .replace(/ = /g, ' equals ')
    .replace(/ < /g, ' is less than ')
    .replace(/ > /g, ' is greater than ');
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
  audience: 'Fractions practice for classes 5 to 8',
  tagline: 'Type a fractions problem and understand it step by step.',
  skipToContent: 'Skip to main content',
  nav: { solve: 'Solve my problem', practise: 'Practise', progress: 'My progress' },
  explanationsLive: 'AI-selected help (Gemini)',
  explanationsOffline: 'Built-in explanations',
  explanationsOfflineDetail: 'The steps are calculated and checked by the app itself. AI help is not active.',
  theme: { label: 'Theme', system: 'System', light: 'Light', dark: 'Dark' },
  familyName: (f: FamilyId) => FAMILY_NAMES[f],
  familyIdea: (f: FamilyId) => FAMILY_IDEAS[f],
  reteach: (f: FamilyId) => RETEACH[f],
  status: (s: FamilyStatus) => STATUS[s],
  reason: (r: ReasonId) => REASONS[r],
  invalid: (r: InvalidReason) => INVALID[r],
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
    top: 'top',
    bottom: 'bottom',
    missingNumber: 'Missing number',
    answerGroup: 'Your answer',
    reasonGroup: 'How did you work it out?',
    reasonToggle: 'Tell us how you worked it out (optional)',
    reasonText: 'Or type your reason (optional, up to 200 characters)',
    reasonCount: (n: number, max: number) => `${n} of ${max} characters`,
    supportLabel: 'Help with this question',
    notSure: 'Not sure where to start? You can get help without answering first.',
    hint: 'Give me a hint',
    anotherHint: 'Give me another hint',
    explain: 'Explain step by step',
    similar: 'Give me a similar problem',
    hintNote: 'Using a hint or the explanation is fine. A question answered with help does not count as independent practice.',
    check: 'Check answer',
    checking: 'Checking…',
  },

  /** An answer as the learner would read it, e.g. "5/6", "1/4", "They are equal". */
  answerText(question: Question, answer: Answer): string {
    if (answer.kind === 'fraction') return `${answer.numerator}/${answer.denominator}`;
    if (answer.kind === 'whole') return answer.value;
    const b = question.body;
    if (answer.optionId === 'equal' || (b.type !== 'compare' && b.type !== 'equal_check')) return 'They are equal';
    if (b.type === 'equal_check') return answer.optionId === 'first' ? `${format(b.first)} is larger` : `${format(b.second)} is larger`;
    return format(answer.optionId === 'first' ? b.first : b.second);
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
    switch (outcome) {
      case 'correct':
        return { title: `Correct: ${display}`, body: actionLine(action) };
      case 'possible_misconception':
        return {
          title: `Not quite yet: ${display}`,
          body: `That is okay, mistakes are how we learn. This answer sometimes comes from ${FAMILY_IDEAS[family]}. That is only a possible reason, not a diagnosis; one answer cannot tell us that.`,
        };
      case 'needs_more_evidence':
        return { title: `Not quite yet: ${display}`, body: 'That is not the answer we were looking for, and that is okay. You can try again, ask for a hint, or see it step by step.' };
      case 'invalid_input':
        return { title: 'Please check your answer', body: '' };
    }
  },

  review: {
    heading: 'Let us look at this together',
    original: 'The question',
    yourAnswer: 'Your answer',
    tryAgain: 'Try again',
    hint: 'Give me a hint',
    anotherHint: 'Give me another hint',
    explain: 'Explain step by step',
    hideExplain: 'Hide the explanation',
    similar: 'Give me a similar problem',
    hintsHeading: 'Hints',
    supportShown: 'You have tried this more than once, so here is some help. Trying again is still a good idea.',
    assistedNote: 'You used a hint or the explanation here, so this question will not count as independent practice. That is fine; new numbers next will show what you can do on your own.',
    correctNow: (display: string) => `Yes, ${display} is correct. Well done for sticking with it.`,
    continueLabel(action: NextAction): string {
      switch (action) {
        case 'ask_followup':
          return 'Try a check question';
        case 'ask_another_item':
          return 'Try a different question';
        default:
          return 'Try one with new numbers';
      }
    },
    whyContinue(action: NextAction): string {
      switch (action) {
        case 'ask_followup':
          return 'Why a check question? One more question helps tell a small slip from an idea that keeps coming back. It is your choice when to move on; you can keep working on this one first.';
        case 'ask_another_item':
          return 'When you are ready, a different question gives a fresh chance to show what you know. You can keep working on this one first.';
        default:
          return 'When you are ready, new numbers check the idea. You can keep working on this one first.';
      }
    },
    aiTitle: (id: string) => TEMPLATE_TITLES[id] ?? 'Explanation',
    aiLoading: 'Loading a short explanation…',
    sameIdeaNote: (family: FamilyId) => `Idea being practised: ${FAMILY_NAMES[family].toLowerCase()}.`,
  },

  solve: {
    heading: 'Solve my problem',
    intro: 'Type a fractions problem. I will show it the way I read it, then explain it step by step or check your working.',
    problemLabel: 'Your fraction problem',
    placeholder: 'for example 1/2 + 1/4',
    readAsLabel: 'I read this as:',
    formatsSummary: 'What can I type?',
    formatsRows: [
      ['Add, subtract, multiply or divide two fractions', '1/2 + 1/4   3/4 - 1/6   2/3 × 3/5   1/2 ÷ 3/4'],
      ['Compare two fractions', 'Compare 2/3 and 3/4'],
      ['Find a missing number in an equal fraction', '1/2 = ?/8   or   3/5 = 9/?'],
    ] as const,
    formatsNote:
      'Numbers can be up to 999. You can type x or * for × and a minus sign for −. Not supported yet: decimals, mixed numbers like 1 1/2 (write 3/2), negative inputs, more than two fractions, word problems and photos.',
    answerLabel: 'Your answer (optional)',
    answerHelp: 'Write it like 3/4, or 1 1/4 for a mixed number.',
    workingLabel: 'Your working (optional)',
    workingHelp: 'This stays on your device and is not saved. The app only looks for specific number patterns in it (like 1 + 1 and 2 + 4). It cannot check your whole working, only your final answer.',
    check: 'Check my working',
    start: 'Help me get started',
    examplesLabel: 'Try an example',
    examples: ['1/2 + 1/4', '3/4 - 1/6', '2/3 × 3/5', '1/2 ÷ 3/4', 'Compare 2/3 and 3/4', '1/2 = ?/8'] as const,
    needAnswer: 'Type your answer first to check it, or choose "Help me get started" if you are not sure where to begin.',
    howHeading: 'How it works',
    howSteps: [
      'Type a problem, or pick an example.',
      'Choose "Help me get started" for hints and one step at a time, or type your answer and choose "Check my working".',
      'Every step is calculated exactly by the app, so the explanation always matches the answer.',
    ] as const,
    resultHeading: 'Your problem',
    edit: 'Not what you meant? Edit it',
    readAs: (text: string) => `I read this as: ${text}`,
    similarReady: (text: string) => `A similar problem is ready: ${text}. Try it yourself, or ask for help.`,
    correctTitle: 'Correct!',
    correctBody: (shown: string) => `Your answer ${shown} is right.`,
    unsimplifiedBody: (shown: string, simplest: string) =>
      `Your answer ${shown} is correct. It can also be simplified to ${simplest}, which is optional here but often asked for in exams.`,
    incorrectTitle: 'Not quite yet',
    observed: (shown: string) => `What I can see: your answer is ${shown}, and it does not match the calculated answer.`,
    possibleHeading: 'A possible reason (not a diagnosis)',
    possibleLead: 'One possibility:',
    similarOffer: 'A similar problem can show whether this happens again.',
    mistakesUseful: 'Mistakes are useful. The steps below show what happens, one move at a time.',
    solutionHeading: 'Worked solution',
    yourAnswer: 'Your answer',
    correctAnswer: 'Correct answer',
    finalAnswer: 'Answer:',
    hintsHeading: 'Hints',
    anotherHint: 'Give me another hint',
    showFirstStep: 'Show the first step',
    showNextStep: 'Show the next step',
    showAllSteps: 'Show all the steps',
    showHow: 'Show how it works',
    toolbarLabel: 'Help with this problem',
    moreSimply: 'Explain more simply',
    whyThisStep: 'Why this step?',
    showVisual: 'Show a visual',
    hideVisual: 'Hide the visual',
    noVisual: 'These numbers are too big to draw clearly. The steps are still exact.',
    similar: 'Give me a similar problem',
    stepOf: (i: number, n: number) => `Step ${i} of ${n}:`,
    stepsShown: (i: number, n: number) => `${i} of ${n} steps shown`,
    compareWhich: (ask: 'larger' | 'smaller') => `Which is ${ask}?`,
    or: 'or',
    equalsMissingTop: (d: number) => `equals a missing top number over ${d}`,
    equalsMissingBottom: (n: number) => `equals ${n} over a missing bottom number`,
    barLabel: (label: string, shaded: number, parts: number, wholes: number) =>
      wholes > 1
        ? `${label}: ${shaded} shaded parts, drawn as ${wholes} bars of ${parts} equal parts each`
        : `${label}: a bar cut into ${parts} equal parts with ${shaded} shaded`,
    lineLabel: (min: number, max: number, marks: string) => `Number line from ${min} to ${max} with ${marks} marked`,
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
    networkError: 'Could not reach the server. Showing the verified built-in explanation instead.',
    storageWarning: 'This browser is not saving progress (private mode or storage blocked). Everything still works for this visit.',
  },

  help: {
    label: 'Ask about this problem',
    placeholder: 'for example: why do the denominators have to match?',
    ask: 'Ask',
    asking: 'Asking…',
    noteAi:
      'Your question and the problem’s numbers are sent to Gemini, which only chooses which built-in explanation to show. The maths always comes from the verified steps.',
    noteBuiltIn: 'The app matches your question to a built-in explanation. Nothing is sent anywhere.',
    tryAsking: 'Or pick an idea to read about:',
    moreHelp: 'More help with this problem:',
    notConfigured: 'AI help is not set up here, so the app matched your question itself.',
    unavailable: 'AI help is not available right now, so the app matched your question itself.',
    origin: {
      ai: 'AI-selected help: Gemini chose this explanation for your question. The content is built in and checked against this problem.',
      fallback: 'Built-in help: AI was not available, so the app matched your question itself.',
      builtin: 'Built-in help: matched to your question by the app. No AI was used.',
      button: 'Built-in help: chosen by you.',
    } as const,
  },

  settings: {
    open: 'Settings',
    heading: 'Settings',
    close: 'Close settings',
    themeHeading: 'Appearance',
    dataHeading: 'Your data',
    deleteHeading: 'Delete saved data',
    deleteHistory: 'Delete my activity history',
    deleteHistoryConfirm: 'This deletes the list of problems on My progress from this device. Your practice progress is kept. Continue?',
    historyDeleted: 'Activity history deleted.',
    reset: 'Reset my practice progress',
    resetConfirm: 'This deletes your Practise progress saved on this device. Your activity history is kept. Continue?',
    resetDone: 'Practice progress cleared. Starting fresh.',
    deleteAll: 'Delete everything on this device',
    deleteAllConfirm: 'This deletes your activity history, your practice progress and your settings from this device. Continue?',
    allDeleted: 'Everything saved on this device was deleted.',
  },

  myProgress: {
    heading: 'My progress',
    intro: 'This is your own activity on this device: problems you solved and practice questions you answered. It is a record of what you did, not a score and not a measure of how much you have learned.',
    emptyTitle: 'Nothing here yet',
    emptyBody: 'When you check an answer or ask for help in Solve my problem or Practise, it appears here. Nothing has been made up to fill this page.',
    topicsHeading: 'Topics you have practised',
    noHistory: 'No problems in your activity history yet.',
    topicLabel: { add: 'Adding', sub: 'Subtracting', mul: 'Multiplying', div: 'Dividing', compare: 'Comparing', equivalent: 'Equal fractions' } as const,
    outcomeLabel: {
      independent: 'Correct on your own',
      retry: 'Correct on a retry',
      with_help: 'Correct with help',
      incorrect: 'Not yet correct',
      explored: 'Help only, no answer',
    } as const,
    outcomeNote: {
      independent: 'First answer, no hint, no solution viewed.',
      retry: 'Correct after at least one wrong answer; no hint or solution.',
      with_help: 'Correct after a hint or after seeing the solution. This is not independent evidence.',
      incorrect: 'Answered, but not yet correct.',
      explored: 'You looked at a hint or the solution without answering.',
    } as const,
    revisitHeading: 'Worth revisiting',
    revisitBody: 'Topics where your latest activity was not a correct answer on your own.',
    revisitNone: 'Nothing flagged. A topic appears here when your latest activity on it was not correct on your own.',
    practiceHeading: 'Practise status',
    practiceNote: 'Where the Practise sequence has got to for each idea. These are simple rules in this app, not a validated measure of understanding.',
    recentHeading: 'Recent activity',
    source: { solve: 'Solve my problem', practice: 'Practise' } as const,
    earlier: 'Earlier session',
    yourAnswer: 'Your answer',
    review: 'Review the explanation',
    hideReview: 'Hide the explanation',
    practiseAgain: 'Practise this again',
    deleteHistory: 'Delete my activity history',
    count: (n: number) => `${n} item${n === 1 ? '' : 's'}`,
    table: { topic: 'Topic', total: 'Items' },
    boundedNote: 'Only the most recent 100 items are kept on this device.',
  },

  data: {
    stored:
      'Stored on this device only (localStorage): your Practise answers and progress, a list of your recent problems and outcomes for My progress (the problem numbers, your numeric answer and whether you used help; at most 100 items), and your theme choice. No name, email or account. What you type as working and any question you ask is never saved.',
    sent:
      'Sent to our server only when needed: the idea id and hint level, to choose a built-in explanation for Practise; if you type a reason and your practice answer matches no known pattern, that reason text (up to 200 characters); and, only if a Gemini key is configured and you use "Ask about this problem", the problem\u2019s numbers, your question (up to 200 characters) and the ids of mistakes the app found. Solving, checking, step-by-step explanations and My progress are calculated in your browser and are never sent.',
    notSent:
      'Never sent: your answers, your typed working, your progress or history, or anything that identifies you. The server does not log what you type. Gemini, when used, only chooses which built-in explanation to show; nothing it writes is displayed.',
    deleting: 'You can delete your history, your practice progress, or everything below. Deleting is permanent on this device.',
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
