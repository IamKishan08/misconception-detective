// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { createLearner, type LearnerState } from '../../src/engine/progression.js';
import type { Question } from '../../src/engine/types.js';
import { App } from '../../src/web/App.js';
import { SolveFlow, type Draft } from '../../src/web/components/SolveFlow.js';
import { StudentFlow } from '../../src/web/components/StudentFlow.js';
import { messages } from '../../src/web/messages.js';
import { loadLearner } from '../../src/web/storage.js';

const m = messages.solve;

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Solve({ aiConfigured = false, onAiSource = () => undefined }: { aiConfigured?: boolean; onAiSource?: (s: 'gemini' | 'fallback') => void }) {
  const [draft, setDraft] = useState<Draft>({ problem: '', answer: '', working: '' });
  return <SolveFlow draft={draft} onDraft={setDraft} aiConfigured={aiConfigured} onAiSource={onAiSource} onHistory={() => undefined} />;
}

async function fill(user: ReturnType<typeof userEvent.setup>, problem: string, answer = '', working = '') {
  const box = screen.getByLabelText(m.problemLabel);
  await user.clear(box);
  await user.type(box, problem);
  if (answer !== '') await user.type(screen.getByLabelText(m.answerLabel), answer);
  if (working !== '') await user.type(screen.getByLabelText(m.workingLabel), working);
}

const stepText = () => screen.queryAllByRole('heading', { level: 4 }).map((h) => h.textContent ?? '');

describe('Solve my problem', () => {
  it('shows how the problem was read before solving, and the built-in steps work with no AI and no network', async () => {
    const user = userEvent.setup();
    render(<Solve />);
    await fill(user, '1/2 + 1/4');
    expect(screen.getByText(m.readAsLabel)).toBeTruthy();
    expect(screen.getByText(/Add 1\/2 and 1\/4/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: m.start }));
    expect(screen.getByRole('heading', { name: m.resultHeading })).toBeTruthy();
    expect(screen.getByLabelText(messages.help.label)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('wrong answer: the problem stays visible, the answer is shown apart from the correct one, and the explanation follows', async () => {
    const user = userEvent.setup();
    const { container } = render(<Solve />);
    await fill(user, '1/2 + 1/4', '2/6');
    await user.click(screen.getByRole('button', { name: m.check }));

    // Original problem still visible.
    const result = screen.getByRole('region', { name: m.resultHeading });
    expect(within(result).getAllByRole('img', { name: /one half|one quarter/ }).length).toBe(2);
    // Observed answer vs correct answer, in separate tiles.
    const tiles = [...container.querySelectorAll('.answer-tile')].map((t) => t.textContent);
    expect(tiles).toEqual([`${m.yourAnswer}2/6`, `${m.correctAnswer}3/4`]);
    // Supportive, specific, hedged.
    expect(screen.getByText(m.incorrectTitle)).toBeTruthy();
    expect(screen.getByText(/smaller than 1\/2/)).toBeTruthy();
    expect(screen.getByText(m.possibleHeading)).toBeTruthy();
    expect(screen.getByText(/adding the tops and the bottoms/i)).toBeTruthy();
    expect(screen.getAllByText(/not a diagnosis/).length).toBeGreaterThan(0);
    // Every step with its reason.
    expect(stepText().join('|')).toContain('Make the pieces the same size');
    expect(container.textContent).toContain('The denominator tells us the size of each piece');
    expect(container.textContent).toContain('1/2 = 2/4');
    expect(container.textContent).toContain('keep the denominator 4 because the pieces are still quarters');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not diagnose from the answer alone, and upgrades the evidence only when working shows it', async () => {
    const user = userEvent.setup();
    render(<Solve />);
    await fill(user, '1/2 + 1/4', '5/7');
    await user.click(screen.getByRole('button', { name: m.check }));
    expect(screen.queryByText(m.possibleHeading)).toBeNull();
    expect(screen.getByText(m.incorrectTitle)).toBeTruthy();
    cleanup();

    const user2 = userEvent.setup();
    render(<Solve />);
    await fill(user2, '1/2 + 1/4', '2/6', '1+1 over 2+4');
    await user2.click(screen.getByRole('button', { name: m.check }));
    expect(screen.getByText(/Your working includes 1 \+ 1 and 2 \+ 4/)).toBeTruthy();
  });

  it('a correct but unsimplified answer is acknowledged as correct, with optional simplification', async () => {
    const user = userEvent.setup();
    render(<Solve />);
    await fill(user, '1/6 + 1/3', '3/6');
    await user.click(screen.getByRole('button', { name: m.check }));
    expect(screen.getByText(m.correctTitle)).toBeTruthy();
    expect(screen.getByText(m.unsimplifiedBody('3/6', '1/2'))).toBeTruthy();
    expect(screen.queryByText(m.incorrectTitle)).toBeNull();
    // Steps are offered, not forced.
    await user.click(screen.getByRole('button', { name: m.showHow }));
    expect(stepText().join('|')).toContain('Simplify (optional)');
  });

  it('negative and improper results are drawn on a number line and stacked bars, not a single whole', async () => {
    const user = userEvent.setup();
    const first = render(<Solve />);
    await fill(user, '1/4 - 1/2', '-1/4');
    await user.click(screen.getByRole('button', { name: m.check }));
    expect(screen.getByText(m.correctTitle)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: m.showHow }));
    await user.click(screen.getByRole('button', { name: m.showVisual }));
    expect(screen.getByRole('img', { name: /Number line from -1 to 1/ })).toBeTruthy();
    first.unmount();

    const user2 = userEvent.setup();
    render(<Solve />);
    await fill(user2, '3/4 + 1/2', '1 1/4');
    await user2.click(screen.getByRole('button', { name: m.check }));
    expect(screen.getByText(m.correctTitle)).toBeTruthy();
    await user2.click(screen.getByRole('button', { name: m.showHow }));
    await user2.click(screen.getByRole('button', { name: m.showVisual }));
    expect(screen.getByRole('img', { name: /5\/4: 5 shaded parts, drawn as 2 bars of 4 equal parts each/ })).toBeTruthy();
  });

  it('"Help me get started" gives a hint and one step at a time without any wrong answer', async () => {
    const user = userEvent.setup();
    render(<Solve />);
    await fill(user, '2/3 × 3/5');
    await user.click(screen.getByRole('button', { name: m.start }));
    expect(screen.getByText(/multiply across/i)).toBeTruthy();
    expect(stepText()).not.toContain(expect.stringContaining('Multiply across'));
    expect(screen.queryByText(m.correctAnswer)).toBeNull();

    await user.click(screen.getByRole('button', { name: m.showFirstStep }));
    expect(stepText().join('|')).toContain('Multiply across');
    // The correct answer stays hidden until the learner has seen every step.
    expect(screen.queryByText(m.correctAnswer)).toBeNull();
    await user.click(screen.getByRole('button', { name: m.showAllSteps }));
    expect(screen.getByText(m.correctAnswer)).toBeTruthy();
    expect(screen.getByText(m.finalAnswer).parentElement?.textContent).toContain('2/5');
  });

  it('contextual help: explain more simply, why this step, show a visual, similar problem', async () => {
    const user = userEvent.setup();
    render(<Solve />);
    await fill(user, '1/2 + 1/4', '2/6');
    await user.click(screen.getByRole('button', { name: m.check }));

    const longText = screen.getAllByText(/denominator tells us the size of each piece/)[0];
    expect(longText).toBeTruthy();
    await user.click(screen.getByRole('button', { name: m.moreSimply }));
    expect(screen.getByText(/Make both fractions use quarters/)).toBeTruthy();
    expect(screen.queryByText(/denominator tells us the size of each piece/)).toBeNull();
    await user.click(screen.getByRole('button', { name: m.moreSimply }));
    expect(screen.getAllByText(/denominator tells us the size of each piece/).length).toBeGreaterThan(0);

    expect(screen.queryByText(/Because pieces can only be added/)).toBeNull();
    await user.click(screen.getByRole('button', { name: m.whyThisStep }));
    expect(screen.getByText(/Because pieces can only be added/)).toBeTruthy();

    // Wrong answers show the explanation with visuals already on; the button hides them and shows them again.
    expect(document.querySelectorAll('figure.visual').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: m.hideVisual }));
    expect(document.querySelectorAll('figure.visual')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: m.showVisual }));
    expect(document.querySelectorAll('figure.visual').length).toBeGreaterThan(0);
  });

  it('"Give me a similar problem" fills a different, solvable problem and leaves the answer for the student', async () => {
    const user = userEvent.setup();
    render(<Solve />);
    await fill(user, '1/2 + 1/4', '2/6');
    await user.click(screen.getByRole('button', { name: m.check }));
    const before = (screen.getByLabelText(m.problemLabel) as HTMLInputElement).value;
    await user.click(screen.getAllByRole('button', { name: m.similar })[0] as HTMLElement);
    const after = (screen.getByLabelText(m.problemLabel) as HTMLInputElement).value;
    expect(after).not.toBe(before);
    expect(after).toMatch(/^\d+\/\d+ \+ \d+\/\d+$/);
    expect((screen.getByLabelText(m.answerLabel) as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('region', { name: m.resultHeading })).toBeNull();
    expect(screen.getByText(m.readAsLabel)).toBeTruthy();
    // The new problem can be worked on straight away.
    await user.click(screen.getByRole('button', { name: m.start }));
    expect(screen.getByRole('region', { name: m.resultHeading })).toBeTruthy();
  });

  it('clicking an example fills the box and does not solve it for the student', async () => {
    const user = userEvent.setup();
    render(<Solve />);
    await user.click(screen.getByRole('button', { name: '1/2 ÷ 3/4' }));
    expect((screen.getByLabelText(m.problemLabel) as HTMLInputElement).value).toBe('1/2 ÷ 3/4');
    expect(screen.queryByRole('region', { name: m.resultHeading })).toBeNull();
  });

  it('asks for an answer instead of guessing when "Check my working" has nothing to check', async () => {
    const user = userEvent.setup();
    render(<Solve />);
    await fill(user, '1/2 + 1/4');
    await user.click(screen.getByRole('button', { name: m.check }));
    expect((await screen.findByRole('alert')).textContent).toBe(m.needAnswer);
    expect(screen.queryByRole('region', { name: m.resultHeading })).toBeNull();
  });

  it('reports unreadable answers without calling them wrong', async () => {
    const user = userEvent.setup();
    render(<Solve />);
    await fill(user, '1/2 + 1/4', '0.75');
    await user.click(screen.getByRole('button', { name: m.check }));
    expect((await screen.findByRole('alert')).textContent).toContain('decimal');
    expect(screen.queryByText(m.incorrectTitle)).toBeNull();
  });

  it.each([
    ['1/0 + 1/2', 'cannot be 0'],
    ['1/2 ÷ 0/5', 'cannot divide by zero'],
    ['1 1/2 + 1/4', 'Mixed numbers'],
    ['0.5 + 1/4', 'Decimals'],
    ['1/2 + 1/4 + 1/8', 'two fractions at a time'],
    ['what is the capital of France', 'I could not understand'],
    ['1/2', 'I need an operation'],
  ])('"%s" shows a helpful message and never a substituted or solved problem', async (text, expected) => {
    const user = userEvent.setup();
    render(<Solve />);
    await fill(user, text);
    await user.click(screen.getByRole('button', { name: m.start }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(expected);
    expect(screen.queryByRole('region', { name: m.resultHeading })).toBeNull();
    expect(screen.queryByText(m.readAsLabel)).toBeNull();
  });

  it('the result has no accessibility violations and moves focus to the heading', async () => {
    const user = userEvent.setup();
    const { container } = render(<Solve />);
    await fill(user, '3/4 - 1/6', '7/12');
    await user.click(screen.getByRole('button', { name: m.check }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: m.resultHeading }));
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  it('is fully operable from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Solve />);
    screen.getByLabelText(m.problemLabel).focus();
    await user.keyboard('1/2 + 1/4');
    await user.tab(); // the "What can I type?" disclosure
    await user.tab(); // answer
    expect(document.activeElement).toBe(screen.getByLabelText(m.answerLabel));
    await user.keyboard('2/6{Enter}');
    expect(screen.getByText(m.incorrectTitle)).toBeTruthy();
  });
});

describe('Ask about this problem: AI selects, the engine explains', () => {
  const ok = (body: unknown) => ({ ok: true, json: async () => body });
  const h = messages.help;

  async function openProblem(user: ReturnType<typeof userEvent.setup>, aiConfigured: boolean, onAiSource = vi.fn()) {
    render(<Solve aiConfigured={aiConfigured} onAiSource={onAiSource} />);
    await fill(user, '1/2 + 1/4', '2/6');
    await user.click(screen.getByRole('button', { name: m.check }));
    return onAiSource;
  }

  it('without AI the question is matched by the app, labelled as built-in, and nothing is sent anywhere', async () => {
    const user = userEvent.setup();
    await openProblem(user, false);
    await user.type(screen.getByLabelText(h.label), 'Why do the denominators have to match?');
    await user.click(screen.getByRole('button', { name: h.ask }));
    expect(screen.getByText('Why the denominators have to match')).toBeTruthy();
    expect(screen.getByText(/The denominator tells us the size of each piece/, { selector: '.help-card p' })).toBeTruthy();
    expect(screen.getByText(h.origin.builtin)).toBeTruthy();
    expect(screen.queryByText(h.origin.ai)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('with AI, the model’s accepted choice is shown with built-in content and labelled as AI-selected', async () => {
    const fetchMock = vi.fn(async () => ok({ source: 'gemini', selection: { intent: 'explain_concept', conceptId: 'multiply_both' } }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const onAiSource = await openProblem(user, true);
    await user.type(screen.getByLabelText(h.label), 'why times both?');
    await user.click(screen.getByRole('button', { name: h.ask }));
    expect(await screen.findByText('Why we multiply the top and the bottom by the same number')).toBeTruthy();
    expect(screen.getByText(h.origin.ai)).toBeTruthy();
    expect(onAiSource).toHaveBeenCalledWith('gemini');
    // Only the problem, the question and the mistake ids the app found were sent.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ask');
    expect(JSON.parse(String(init.body))).toEqual({
      problem: { kind: 'arith', op: 'add', a: { n: 1, d: 2 }, b: { n: 1, d: 4 } },
      question: 'why times both?',
      causes: ['added_across'],
    });
  });

  it('a model choice that does not apply to this problem is rejected in the browser too, and the built-in match is labelled as a fallback', async () => {
    const onAiSource = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ok({ source: 'gemini', selection: { intent: 'explain_concept', conceptId: 'invert_divisor' } })));
    const user = userEvent.setup();
    await openProblem(user, true, onAiSource);
    await user.type(screen.getByLabelText(h.label), 'why do denominators match');
    await user.click(screen.getByRole('button', { name: h.ask }));
    expect(await screen.findByText(h.origin.fallback)).toBeTruthy();
    expect(screen.queryByText(h.origin.ai)).toBeNull();
    expect(screen.queryByText('Why we flip the fraction we divide by')).toBeNull();
    expect(screen.getByText(h.unavailable)).toBeTruthy();
    expect(onAiSource).toHaveBeenCalledWith('fallback');
    expect(onAiSource).not.toHaveBeenCalledWith('gemini');
  });

  it('server-side fallbacks (rejected, quota, auth, timeout) all give one simple message and a useful built-in answer', async () => {
    for (const reason of ['rejected', 'quota', 'auth', 'timeout', 'malformed']) {
      vi.stubGlobal('fetch', vi.fn(async () => ok({ source: 'fallback', fallbackReason: reason })));
      const user = userEvent.setup();
      await openProblem(user, true);
      await user.type(screen.getByLabelText(h.label), 'show me a picture');
      await user.click(screen.getByRole('button', { name: h.ask }));
      expect(await screen.findByText(h.unavailable)).toBeTruthy();
      expect(screen.getByText(h.origin.fallback)).toBeTruthy();
      expect(document.body.textContent).not.toContain(reason);
      cleanup();
    }
  });

  it('a missing key is reported as "not set up", not as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ source: 'fallback', fallbackReason: 'no_key' })));
    const user = userEvent.setup();
    await openProblem(user, true);
    await user.type(screen.getByLabelText(h.label), 'help me start');
    await user.click(screen.getByRole('button', { name: h.ask }));
    expect(await screen.findByText(h.notConfigured)).toBeTruthy();
  });

  it('a network failure recovers: the built-in help appears and the button works again', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    const user = userEvent.setup();
    await openProblem(user, true);
    await user.type(screen.getByLabelText(h.label), 'show me a picture');
    await user.click(screen.getByRole('button', { name: h.ask }));
    expect(await screen.findByText(h.origin.fallback)).toBeTruthy();
    expect((screen.getByRole('button', { name: h.ask }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('different questions give different explanations', async () => {
    const user = userEvent.setup();
    await openProblem(user, false);
    const box = screen.getByLabelText(h.label);
    await user.type(box, 'Why do the denominators have to match?');
    await user.click(screen.getByRole('button', { name: h.ask }));
    const first = document.querySelector('.help-card h4')?.textContent;
    await user.clear(box);
    await user.type(box, 'why does the bottom number stay the same');
    await user.click(screen.getByRole('button', { name: h.ask }));
    const second = document.querySelector('.help-card h4')?.textContent;
    expect(first).toBe('Why the denominators have to match');
    expect(second).toBe('Why the denominator stays the same when adding or subtracting');
    await user.clear(box);
    await user.type(box, 'what is the weather');
    await user.click(screen.getByRole('button', { name: h.ask }));
    expect(document.querySelector('.help-card h4')?.textContent).toBe('That is outside what I can help with here');
  });

  it('explains a possible mistake only because the app found it, and only tentatively', async () => {
    const user = userEvent.setup();
    await openProblem(user, false);
    await user.type(screen.getByLabelText(h.label), 'why is my answer wrong?');
    await user.click(screen.getByRole('button', { name: h.ask }));
    expect(screen.getByText(/One possibility is adding the tops and the bottoms separately/)).toBeTruthy();
    expect(screen.getByText(/cannot show how it was reached/)).toBeTruthy();
  });

  it('repeated clicks send one request, and leaving the view while it is pending applies nothing', async () => {
    let release: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onAiSource = vi.fn();
    const view = render(<Solve aiConfigured onAiSource={onAiSource} />);
    await fill(user, '1/2 + 1/4');
    await user.click(screen.getByRole('button', { name: m.start }));
    await user.type(screen.getByLabelText(h.label), 'Why?');
    const ask = screen.getByRole('button', { name: h.ask });
    await user.click(ask);
    await user.click(ask);
    await user.keyboard('{Enter}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: h.asking })).toBeTruthy();

    view.unmount();
    await act(async () => {
      release(ok({ source: 'gemini', selection: { intent: 'help_start' } }));
      await Promise.resolve();
    });
    expect(errors).not.toHaveBeenCalled();
    expect(onAiSource).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('a new problem while a question is pending discards the old answer and does not claim AI worked', async () => {
    let release: (value: unknown) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => (release = resolve))));
    const user = userEvent.setup();
    const onAiSource = vi.fn();
    render(<Solve aiConfigured onAiSource={onAiSource} />);
    await fill(user, '1/2 + 1/4');
    await user.click(screen.getByRole('button', { name: m.start }));
    await user.type(screen.getByLabelText(h.label), 'Why?');
    await user.click(screen.getByRole('button', { name: h.ask }));
    await fill(user, '3/4 - 1/6');
    await user.click(screen.getByRole('button', { name: m.start }));
    await act(async () => {
      release(ok({ source: 'gemini', selection: { intent: 'help_start' } }));
      await Promise.resolve();
    });
    expect(document.querySelector('.help-card')).toBeNull();
    expect(onAiSource).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: h.ask }) as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------

function Practice({ onChange, initial }: { onChange: (s: LearnerState) => void; initial?: LearnerState }) {
  const [state, setState] = useState<LearnerState>(() => initial ?? createLearner(9));
  return (
    <>
      <p data-testid="counter">{state.counter}</p>
      <StudentFlow
        state={state}
        onChange={(s) => {
          onChange(s);
          setState(s);
        }}
        onExplanationSource={() => undefined}
        onHistory={() => undefined}
        aiConfigured={false}
      />
    </>
  );
}

async function answerFraction(user: ReturnType<typeof userEvent.setup>, n: string, d: string) {
  const top = screen.getByLabelText(messages.question.numerator);
  await user.clear(top);
  await user.type(top, n);
  const bottom = screen.getByLabelText(messages.question.denominator);
  await user.clear(bottom);
  await user.type(bottom, d);
  await user.click(screen.getByRole('button', { name: messages.question.check }));
}

const expressionLabels = () => screen.getAllByRole('img').map((i) => i.getAttribute('aria-label') ?? '');

describe('Guided practice: a wrong answer never removes the question', () => {
  it('shows supportive, specific feedback, keeps the question, and offers Try again, a hint and a step-by-step explanation', async () => {
    const user = userEvent.setup();
    render(<Practice onChange={() => undefined} />);
    const before = expressionLabels();
    await answerFraction(user, '7', '3');

    expect(screen.getByRole('heading', { name: messages.review.heading })).toBeTruthy();
    expect(screen.getByText(/Not quite yet: 7\/3/)).toBeTruthy();
    expect(expressionLabels().slice(0, 2)).toEqual(before.slice(0, 2));
    expect(screen.getByRole('button', { name: messages.review.tryAgain })).toBeTruthy();
    expect(screen.getByRole('button', { name: messages.review.hint })).toBeTruthy();
    expect(screen.getByRole('button', { name: messages.review.explain })).toBeTruthy();
    // The next question is offered, never forced.
    expect(screen.getByRole('button', { name: /Try a different question|Try a check question|Try one with new numbers/ })).toBeTruthy();
  });

  it('Try again returns to the same question with the cursor in the answer box', async () => {
    const user = userEvent.setup();
    render(<Practice onChange={() => undefined} />);
    const before = expressionLabels();
    await answerFraction(user, '7', '3');
    await user.click(screen.getByRole('button', { name: messages.review.tryAgain }));
    expect(expressionLabels().slice(0, 2)).toEqual(before.slice(0, 2));
    expect(document.activeElement).toBe(screen.getByLabelText(messages.question.numerator));
  });

  it('a hint and the explanation are available without any answer, and are marked as support, not independent work', async () => {
    const user = userEvent.setup();
    const changes: LearnerState[] = [];
    render(<Practice onChange={(s) => changes.push(s)} />);
    await user.click(screen.getByRole('button', { name: messages.review.hint }));
    expect(screen.getByRole('note')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: messages.review.explain }));
    expect(stepText().join('|')).toContain('Make the pieces the same size');
    expect(screen.getByText(messages.question.hintNote)).toBeTruthy();
    const last = changes.at(-1);
    expect(last?.step).toMatchObject({ kind: 'question', run: { hints: 1, solutionViewed: true } });
    expect(last?.families.F1.attempts).toHaveLength(0);

    const asked = changes.at(-1)?.step;
    if (asked?.kind !== 'question') throw new Error('expected a question');
    const [n, d] = correctFor(asked.question.body);
    await answerFraction(user, String(n), String(d));
    // Correct, but helped: no mastery credit.
    const after = changes.at(-1);
    expect(after?.families.F1.transferStreak).toBe(0);
    expect(after?.families.F1.attempts.at(-1)).toMatchObject({ outcome: 'correct', hintUsed: true, independent: false });
    expect(after?.families.F1.status).not.toBe('secure');
  });

  it('after repeated wrong answers the explanation appears by itself, and the question is still there', async () => {
    const user = userEvent.setup();
    render(<Practice onChange={() => undefined} />);
    const before = expressionLabels();
    await answerFraction(user, '7', '3');
    expect(screen.queryByText(messages.review.supportShown)).toBeNull();
    await user.click(screen.getByRole('button', { name: messages.review.tryAgain }));
    await answerFraction(user, '8', '3');
    expect(screen.getByText(messages.review.supportShown)).toBeTruthy();
    expect(stepText().join('|')).toContain('Make the pieces the same size');
    expect(expressionLabels().slice(0, 2)).toEqual(before.slice(0, 2));
    // Built-in explanation works with no server: the label is honest.
    expect(await screen.findByText(messages.explanationsOffline)).toBeTruthy();
  });

  it('continuing is the learner’s choice; only then does a new question appear', async () => {
    const user = userEvent.setup();
    const changes: LearnerState[] = [];
    render(<Practice onChange={(s) => changes.push(s)} />);
    const before = expressionLabels();
    await answerFraction(user, '7', '3');
    expect(changes.at(-1)?.step.kind).toBe('review');
    await user.click(screen.getByRole('button', { name: /Try a different question|Try a check question|Try one with new numbers/ }));
    expect(changes.at(-1)?.step.kind).toBe('question');
    expect(expressionLabels().slice(0, 2)).not.toEqual(before.slice(0, 2));
  });

  it('can complete a path: independent correct answers still lead to "secure"', async () => {
    const user = userEvent.setup();
    const changes: LearnerState[] = [];
    render(<Practice onChange={(s) => changes.push(s)} initial={createLearner(7)} />);
    // seed 7 item: use the engine's own correct answer by reading the question from state.
    for (let i = 0; i < 2; i += 1) {
      const step = changes.at(-1)?.step ?? createLearner(7).step;
      if (step.kind !== 'question') throw new Error('expected a question');
      const [n, d] = correctFor(step.question.body);
      await answerFraction(user, String(n), String(d));
    }
    expect(changes.at(-1)?.families.F1.status).toBe('secure');
  });
});

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** The correct sum of an addition question, over a common denominator. */
function correctFor(body: Question['body']): [number, number] {
  if (body.type !== 'add') throw new Error('expected an addition question');
  const L = (body.a.d * body.b.d) / gcd(body.a.d, body.b.d);
  return [body.a.n * (L / body.a.d) + body.b.n * (L / body.b.d), L];
}

describe('stale asynchronous updates', () => {
  const ok = (body: unknown) => ({ ok: true, json: async () => body });

  /** Gives a wrong, unmatched answer with a typed reason, which triggers the (slow) interpretation request. */
  async function submitWithReason(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(new RegExp(messages.question.reasonText.slice(0, 20))), 'I did something else');
    await answerFraction(user, '7', '3');
  }

  function pendingFetch() {
    const calls: { url: string; release: (value: unknown) => void }[] = [];
    const mock = vi.fn((url: string) => new Promise((resolve) => calls.push({ url, release: resolve })));
    vi.stubGlobal('fetch', mock);
    return { calls, mock };
  }

  it('switching topic while the model is working: the old response cannot overwrite the new topic', async () => {
    const { calls } = pendingFetch();
    const changes: LearnerState[] = [];
    const user = userEvent.setup();
    render(<Practice onChange={(s) => changes.push(s)} />);
    await submitWithReason(user);
    expect(calls.map((c) => c.url)).toEqual(['/api/interpret']);
    expect((screen.getByRole('button', { name: messages.question.checking }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: /^Comparing fractions/ }));
    const afterPick = changes.length;
    expect(changes.at(-1)?.activeFamily).toBe('F2');
    // Loading state recovered immediately, so the new topic is usable.
    expect((screen.getByRole('button', { name: messages.question.check }) as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      calls[0]?.release(ok({ source: 'gemini', family: 'F1' }));
      await Promise.resolve();
    });
    expect(changes).toHaveLength(afterPick);
    expect(changes.at(-1)?.activeFamily).toBe('F2');
    expect(changes.at(-1)?.step).toMatchObject({ kind: 'question', question: { family: 'F2' } });
    expect(screen.getByText('Comparing fractions', { selector: '.stage-label span' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: messages.review.heading })).toBeNull();
  });

  it('resetting (the screen is rebuilt) while the model is working: the old response applies nothing', async () => {
    const { calls } = pendingFetch();
    const changes: LearnerState[] = [];
    const user = userEvent.setup();
    const Host = ({ epoch }: { epoch: number }) => <Practice key={epoch} onChange={(s) => changes.push(s)} initial={createLearner(100 + epoch)} />;
    const view = render(<Host epoch={0} />);
    await submitWithReason(user);
    expect(calls).toHaveLength(1);
    view.rerender(<Host epoch={1} />);
    await act(async () => {
      calls[0]?.release(ok({ source: 'gemini', family: 'F1' }));
      await Promise.resolve();
    });
    expect(changes).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: messages.review.heading })).toBeNull();
    expect((screen.getByRole('button', { name: messages.question.check }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('leaving the view while the model is working: the response applies nothing', async () => {
    const { calls } = pendingFetch();
    const changes: LearnerState[] = [];
    const user = userEvent.setup();
    const view = render(<Practice onChange={(s) => changes.push(s)} />);
    await submitWithReason(user);
    view.unmount();
    await act(async () => {
      calls[0]?.release(ok({ source: 'gemini', family: 'F1' }));
      await Promise.resolve();
    });
    expect(changes).toHaveLength(0);
  });

  it('through the real App: switching to another tab mid-request leaves saved progress untouched', async () => {
    const { calls } = pendingFetch();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: messages.nav.practise }));
    const saved = window.localStorage.getItem('misconception-detective:v1');
    await submitWithReason(user);
    await user.click(screen.getByRole('button', { name: messages.nav.progress }));
    const afterLeave = window.localStorage.getItem('misconception-detective:v1');
    await act(async () => {
      for (const call of calls) if (call.url === '/api/interpret') call.release(ok({ source: 'gemini', family: 'F1' }));
      await Promise.resolve();
    });
    expect(window.localStorage.getItem('misconception-detective:v1')).toBe(afterLeave);
    expect(afterLeave).toBe(saved);
  });

  it('repeated clicks while waiting submit the answer once', async () => {
    const { calls } = pendingFetch();
    const changes: LearnerState[] = [];
    const user = userEvent.setup();
    render(<Practice onChange={(s) => changes.push(s)} />);
    await user.type(screen.getByLabelText(new RegExp(messages.question.reasonText.slice(0, 20))), 'I did something else');
    await answerFraction(user, '7', '3');
    const button = screen.getByRole('button', { name: messages.question.checking });
    await user.click(button);
    await user.click(button);
    expect(calls).toHaveLength(1);
    await act(async () => {
      calls[0]?.release(ok({ source: 'gemini', family: 'none' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(changes).toHaveLength(1));
    expect(Number(screen.getByTestId('counter').textContent)).toBe(createLearner(9).counter + 1);
  });

  it('a failed request recovers: the answer is still processed and the loading state clears', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    const changes: LearnerState[] = [];
    const user = userEvent.setup();
    render(<Practice onChange={(s) => changes.push(s)} />);
    await submitWithReason(user);
    await waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0]?.step.kind).toBe('review');
    expect(screen.queryByRole('button', { name: messages.question.checking })).toBeNull();
    await user.click(screen.getByRole('button', { name: messages.review.tryAgain }));
    expect((screen.getByRole('button', { name: messages.question.check }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('saved progress from the earlier version', () => {
  it('an old saved "explanation" step becomes the same question again instead of discarding progress', () => {
    const old = createLearner(5);
    const legacy = { ...old, step: { kind: 'explanation', question: old.step.kind === 'question' ? old.step.question : null, labelled: true } };
    window.localStorage.setItem('misconception-detective:v1', JSON.stringify(legacy));
    const loaded = loadLearner();
    expect(loaded.seedBase).toBe(old.seedBase);
    expect(loaded.step).toMatchObject({ kind: 'question', run: { hints: 0, solutionViewed: false, tries: 0 } });
  });

  it('old attempts without the new field are treated as independent unless a hint was used', () => {
    const base = createLearner(5);
    if (base.step.kind !== 'question') throw new Error('expected a question');
    const attempt = { seq: 0, stage: 'item', question: base.step.question, answerDisplay: '1/2', outcome: 'correct', pattern: null, reasonId: null };
    const legacy = {
      ...base,
      families: { ...base.families, F1: { ...base.families.F1, attempts: [{ ...attempt, hintUsed: false }, { ...attempt, seq: 1, hintUsed: true }] } },
    };
    window.localStorage.setItem('misconception-detective:v1', JSON.stringify(legacy));
    expect(loadLearner().families.F1.attempts.map((a) => a.independent)).toEqual([true, false]);
  });
});
