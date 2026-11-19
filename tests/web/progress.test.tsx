// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, vi } from 'vitest';
import { DEMO_CONTEXTS, DEMO_SEED, runScript } from '../../src/engine/demo.js';
import { applyEvent, emptyHistory } from '../../src/engine/history.js';
import { frac } from '../../src/engine/solver/frac.js';
import { App } from '../../src/web/App.js';
import { messages } from '../../src/web/messages.js';
import { loadHistory } from '../../src/web/storage.js';

const HISTORY_KEY = 'misconception-detective:history:v1';
const LEARNER_KEY = 'misconception-detective:v1';
const p = messages.myProgress;
const s = messages.solve;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const stored = () => JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? 'null') as { entries: Record<string, unknown>[] } | null;

async function solveOnce(user: ReturnType<typeof userEvent.setup>, problem: string, answer: string, mode: 'check' | 'start' = 'check') {
  const box = screen.getByLabelText(s.problemLabel);
  await user.clear(box);
  await user.type(box, problem);
  const field = screen.getByLabelText(s.answerLabel);
  await user.clear(field);
  if (answer !== '') await user.type(field, answer);
  await user.click(screen.getByRole('button', { name: mode === 'check' ? s.check : s.start }));
}

const goToProgress = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: messages.nav.progress }));

describe('My progress shows only real activity', () => {
  it('starts with an honest empty state: no sample learners, no invented activity, no scores', async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToProgress(user);
    expect(screen.getByRole('heading', { name: p.heading })).toBeTruthy();
    expect(screen.getByText(p.emptyTitle)).toBeTruthy();
    expect(screen.getByText(p.emptyBody)).toBeTruthy();
    expect(document.querySelector('table')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+%|sample|made-up|mastery score/i);
    expect(stored()?.entries ?? []).toEqual([]);
  });

  it('records a custom problem and shows it with its outcome, answer and topic', async () => {
    const user = userEvent.setup();
    render(<App />);
    await solveOnce(user, '1/2 + 1/4', '2/6');
    expect(stored()?.entries).toHaveLength(1);
    await goToProgress(user);
    expect(document.querySelector('.history-item .outcome-badge')?.textContent).toBe(p.outcomeLabel.incorrect);
    expect(screen.getByText(new RegExp(`${p.source.solve}.*${p.topicLabel.add}`))).toBeTruthy();
    expect(screen.getByText(/Your answer: 2\/6/)).toBeTruthy();
    expect(within(screen.getByRole('table')).getByRole('row', { name: /Adding/ })).toBeTruthy();
  });

  it('distinguishes an independent correct answer, a retry that needed the solution, and help-only', async () => {
    const user = userEvent.setup();
    render(<App />);
    await solveOnce(user, '1/2 + 1/4', '3/4'); // independent
    await solveOnce(user, '3/4 - 1/6', '2/6'); // wrong; the solution is shown with it
    await solveOnce(user, '3/4 - 1/6', '7/12'); // correct, but after seeing the solution
    await solveOnce(user, '2/3 × 3/5', '', 'start'); // asked for help, never answered
    await goToProgress(user);
    const items = screen.getAllByRole('listitem').filter((li) => li.classList.contains('history-item'));
    const outcomes = items.map((li) => li.querySelector('.outcome-badge')?.textContent);
    expect(outcomes).toEqual([p.outcomeLabel.explored, p.outcomeLabel.with_help, p.outcomeLabel.independent]);
    // Merely opening a solution is never treated as mastery.
    expect(items[0]?.textContent).toContain(p.outcomeNote.explored);
    expect(items[1]?.textContent).toContain('This is not independent evidence');
  });

  it('a hint-only attempt that is then answered correctly is "with help", never independent', async () => {
    const user = userEvent.setup();
    render(<App />);
    await solveOnce(user, '1/2 + 1/4', '', 'start');
    await solveOnce(user, '1/2 + 1/4', '3/4');
    await goToProgress(user);
    const badges = [...document.querySelectorAll('.history-item .outcome-badge')].map((b) => b.textContent);
    expect(badges).toEqual([p.outcomeLabel.with_help]);
  });

  it('checking the same problem repeatedly never creates duplicates', async () => {
    const user = userEvent.setup();
    render(<App />);
    await solveOnce(user, '1/2 + 1/4', '3/4');
    await solveOnce(user, '1/2 + 1/4', '3/4');
    await solveOnce(user, '1/2 + 1/4', '3/4');
    expect(stored()?.entries).toHaveLength(1);
  });

  it('records Practise attempts, with hints and viewed solutions kept apart from independent answers, without duplicates', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: messages.nav.practise }));
    await user.click(screen.getByRole('button', { name: messages.review.hint }));
    await user.type(screen.getByLabelText(messages.question.numerator), '7');
    await user.type(screen.getByLabelText(messages.question.denominator), '3');
    await user.click(screen.getByRole('button', { name: messages.question.check }));
    await user.click(screen.getByRole('button', { name: messages.review.tryAgain }));
    await user.type(screen.getByLabelText(messages.question.numerator), '8');
    await user.type(screen.getByLabelText(messages.question.denominator), '3');
    await user.click(screen.getByRole('button', { name: messages.question.check }));
    const entries = stored()?.entries ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: 'practice', topic: 'add', hint: true, wrong: 2, correct: false });
    await goToProgress(user);
    expect(document.querySelector('.history-item .outcome-badge')?.textContent).toBe(p.outcomeLabel.incorrect);
    // Support the engine showed by itself after repeated mistakes counts as the solution having been viewed.
    expect(entries[0]?.solution).toBe(true);
  });

  it('lets the student revisit a problem with its built-in explanation, and practise it again', async () => {
    const user = userEvent.setup();
    render(<App />);
    await solveOnce(user, '1/2 + 1/4', '2/6');
    await goToProgress(user);
    await user.click(screen.getByRole('button', { name: p.review }));
    expect(screen.getByText(/The denominator tells us the size of each piece/)).toBeTruthy();
    expect(screen.getByText('1/2 = 2/4')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: p.practiseAgain }));
    expect(screen.getByRole('heading', { name: s.heading })).toBeTruthy();
    expect((screen.getByLabelText(s.problemLabel) as HTMLInputElement).value).toBe('1/2 + 1/4');
    expect((screen.getByLabelText(s.answerLabel) as HTMLInputElement).value).toBe('');
  });

  it('flags topics to revisit by a plain rule and says it is not a score', async () => {
    const user = userEvent.setup();
    render(<App />);
    await solveOnce(user, '1/2 + 1/4', '3/4');
    await solveOnce(user, '3/4 - 1/6', '2/6');
    await goToProgress(user);
    const flagged = [...document.querySelectorAll('.revisit li')].map((li) => li.textContent);
    expect(flagged).toEqual([p.topicLabel.sub]);
    expect(screen.getByText(p.intro).textContent).toContain('not a score');
  });

  it('has no accessibility violations with activity on screen', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await solveOnce(user, '1/2 + 1/4', '2/6');
    await goToProgress(user);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

describe('what is stored', () => {
  it('never keeps free-text working or questions asked of the AI', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ source: 'gemini', selection: { intent: 'help_start' } }) })));
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(s.workingLabel), 'WORKING-MARKER 1+1 and 2+4');
    await solveOnce(user, '1/2 + 1/4', '2/6');
    expect(window.localStorage.getItem(HISTORY_KEY)).not.toContain('WORKING-MARKER');
    const everything = Object.keys(window.localStorage).map((k) => window.localStorage.getItem(k)).join('|');
    expect(everything).not.toContain('WORKING-MARKER');
  });

  it('survives a reload', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await solveOnce(user, '1/2 + 1/4', '2/6');
    first.unmount();
    render(<App />);
    await goToProgress(user);
    expect(document.querySelector('.history-item .outcome-badge')?.textContent).toBe(p.outcomeLabel.incorrect);
  });

  it('keeps earlier practice progress by migrating it, once, without dates or invented entries', async () => {
    const state = runScript(DEMO_SEED, DEMO_CONTEXTS.transferAfterExplanation).state;
    window.localStorage.setItem(LEARNER_KEY, JSON.stringify(state));
    const user = userEvent.setup();
    render(<App />);
    const migrated = stored()?.entries ?? [];
    const attempts = Object.values(state.families).flatMap((f) => f.attempts);
    expect(migrated).toHaveLength(attempts.length);
    expect(migrated.every((e) => e.at === null && e.source === 'practice')).toBe(true);
    await goToProgress(user);
    expect(screen.getAllByText(new RegExp(p.earlier)).length).toBe(attempts.length);
    // Deleting history is not undone by a reload: the empty history is not rebuilt from practice progress.
    await user.click(screen.getByRole('button', { name: p.deleteHistory }));
    cleanup();
    render(<App />);
    expect(stored()?.entries).toEqual([]);
  });

  it('starts empty, rather than guessing, when saved history is corrupt or from another version', () => {
    for (const bad of ['{not json', JSON.stringify({ version: 2, entries: [] }), JSON.stringify({ version: 1, entries: [{ key: 'x' }] }), '"text"']) {
      window.localStorage.setItem(HISTORY_KEY, bad);
      expect(loadHistory(runScript(DEMO_SEED, ['wrong']).state).entries).toEqual([]);
    }
  });

  it('rejects entries with out-of-range numbers or oversized answers when loading', () => {
    const entry = { key: 'a', source: 'solve', topic: 'add', problem: { kind: 'arith', op: 'add', a: { n: 1, d: 2 }, b: { n: 1, d: 4 } }, at: 1, wrong: 0, hint: false, solution: false, correct: true, answer: '3/4' };
    const ok = { version: 1, entries: [entry] };
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(ok));
    expect(loadHistory(runScript(DEMO_SEED, []).state).entries).toHaveLength(1);
    for (const mutated of [{ ...entry, answer: 'x'.repeat(40) }, { ...entry, problem: { ...entry.problem, a: { n: 5000, d: 2 } } }, { ...entry, topic: 'algebra' }]) {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, entries: [mutated] }));
      expect(loadHistory(runScript(DEMO_SEED, []).state).entries).toEqual([]);
    }
  });

  it('copes when storage is unavailable or full: it keeps working for this visit and says so', async () => {
    const user = userEvent.setup();
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    render(<App />);
    await solveOnce(user, '1/2 + 1/4', '2/6');
    expect(await screen.findByText(messages.controls.storageWarning)).toBeTruthy();
    await goToProgress(user);
    expect(document.querySelector('.history-item .outcome-badge')?.textContent).toBe(p.outcomeLabel.incorrect);
    expect(real).toBeTypeOf('function');
  });

  it('is bounded: the oldest items are dropped from the stored list', () => {
    let h = emptyHistory();
    for (let i = 0; i < 130; i += 1) h = applyEvent(h, { type: 'check', key: `k${i}`, source: 'solve', problem: { kind: 'arith', op: 'add', a: frac(1, 2), b: frac(1, 4) }, correct: true, answer: '3/4' }, i);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
    expect(loadHistory(runScript(DEMO_SEED, []).state).entries).toHaveLength(100);
  });
});

describe('deleting data asks first and works', () => {
  async function withActivity(user: ReturnType<typeof userEvent.setup>) {
    render(<App />);
    await solveOnce(user, '1/2 + 1/4', '2/6');
    await user.click(screen.getByRole('button', { name: messages.nav.practise }));
    await user.type(screen.getByLabelText(messages.question.numerator), '7');
    await user.type(screen.getByLabelText(messages.question.denominator), '3');
    await user.click(screen.getByRole('button', { name: messages.question.check }));
  }

  it('does nothing when the confirmation is declined', async () => {
    const user = userEvent.setup();
    await withActivity(user);
    vi.mocked(window.confirm).mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: messages.settings.open }));
    for (const name of [messages.settings.deleteHistory, messages.settings.reset, messages.settings.deleteAll]) await user.click(screen.getByRole('button', { name }));
    expect(window.confirm).toHaveBeenCalledTimes(3);
    expect(stored()?.entries.length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(LEARNER_KEY)).not.toBeNull();
  });

  it('deletes only the history, keeping practice progress, and announces it', async () => {
    const user = userEvent.setup();
    await withActivity(user);
    const before = window.localStorage.getItem(LEARNER_KEY);
    await user.click(screen.getByRole('button', { name: messages.settings.open }));
    await user.click(screen.getByRole('button', { name: messages.settings.deleteHistory }));
    expect(stored()?.entries).toEqual([]);
    expect(window.localStorage.getItem(LEARNER_KEY)).toBe(before);
    expect(screen.getByText(messages.settings.historyDeleted)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: messages.nav.progress }));
    expect(document.querySelector('.history-item')).toBeNull();
    expect(screen.queryByRole('heading', { name: p.recentHeading })).toBeNull();
    expect(screen.getByText(p.noHistory)).toBeTruthy();
  });

  it('resets only practice progress, keeping history', async () => {
    const user = userEvent.setup();
    await withActivity(user);
    const before = window.localStorage.getItem(LEARNER_KEY);
    await user.click(screen.getByRole('button', { name: messages.settings.open }));
    await user.click(screen.getByRole('button', { name: messages.settings.reset }));
    expect(window.localStorage.getItem(LEARNER_KEY)).not.toBe(before);
    expect(stored()?.entries.length).toBeGreaterThan(0);
    expect(screen.getByText(messages.settings.resetDone)).toBeTruthy();
  });

  it('deletes everything, including settings', async () => {
    const user = userEvent.setup();
    await withActivity(user);
    await user.click(screen.getByRole('button', { name: messages.settings.open }));
    await user.selectOptions(screen.getByLabelText(messages.theme.label), 'dark');
    await user.click(screen.getByRole('button', { name: messages.settings.deleteAll }));
    expect(stored()?.entries).toEqual([]);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(screen.getByText(messages.settings.allDeleted)).toBeTruthy();
    const settings = window.localStorage.getItem('misconception-detective:settings:v1');
    expect(settings === null || !settings.includes('dark')).toBe(true);
  });
});
