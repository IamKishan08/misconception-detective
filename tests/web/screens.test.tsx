// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, vi } from 'vitest';
import { App } from '../../src/web/App.js';
import { messages } from '../../src/web/messages.js';

async function expectNoAxeViolations(container: HTMLElement) {
  // Colour contrast needs real layout, which jsdom does not provide; it is checked in the browser tests and manually (see README).
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  // No server in these tests: the status call fails and the app must show built-in mode.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('screens', () => {
  it('opens on "Solve my problem" with four navigation options and a labelled problem box', async () => {
    const { container } = render(<App />);
    expect(screen.getByRole('heading', { name: messages.solve.heading })).toBeTruthy();
    expect(screen.getByLabelText(messages.solve.problemLabel)).toBeTruthy();
    for (const label of ['Solve my problem', 'Guided practice', 'Teacher view', 'Your data']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Solve my problem', current: 'page' })).toBeTruthy();
    expect(screen.getByRole('button', { name: messages.solve.check })).toBeTruthy();
    expect(screen.getByRole('button', { name: messages.solve.start })).toBeTruthy();
    for (const example of messages.solve.examples) expect(screen.getByRole('button', { name: example })).toBeTruthy();
    // Nothing for photos or other subjects: those are out of scope and must not appear as dead controls.
    expect(screen.queryByText(/upload|camera|photo/i, { selector: 'button, label, input' })).toBeNull();
    expect(await screen.findByText(messages.explanationsOffline)).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it('guided practice question screen has no axe violations and labelled fraction inputs', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole('button', { name: messages.nav.practise }));
    expect(screen.getByLabelText(messages.question.numerator)).toBeTruthy();
    expect(screen.getByLabelText(messages.question.denominator)).toBeTruthy();
    expect(screen.getByRole('button', { name: messages.review.hint })).toBeTruthy();
    expect(screen.getByRole('button', { name: messages.review.explain })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it('keyboard-only answer gives feedback in a live region and saves progress', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: messages.nav.practise }));
    screen.getByLabelText(messages.question.numerator).focus();
    await user.keyboard('1{Tab}0{Enter}');
    const message = await screen.findByText(messages.invalid('zero_denominator'));
    expect(message.closest('[aria-live="polite"]')).not.toBeNull();
    expect(window.localStorage.length).toBeGreaterThan(0);
  });

  it('the skip link is the first tab stop', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.tab();
    expect(document.activeElement?.textContent).toBe(messages.skipToContent);
  });

  it('teacher view has no axe violations, states its limits, and shows no sample students unless asked', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole('button', { name: messages.nav.teacher }));
    expect(screen.getByText(messages.teacher.limits)).toBeTruthy();
    expect(screen.queryAllByText(messages.teacher.sampleBadge)).toHaveLength(0);
    await user.click(screen.getByLabelText(messages.teacher.showSamples));
    expect(screen.getAllByText(messages.teacher.sampleBadge).length).toBeGreaterThan(0);
    expect(screen.getByText(messages.teacher.samplesNote)).toBeTruthy();
    await expectNoAxeViolations(container);
    await user.click(screen.getByLabelText(messages.teacher.showSamples));
    expect(screen.queryAllByText(messages.teacher.sampleBadge)).toHaveLength(0);
  });

  it('data screen explains what is stored and sent, including the follow-up question', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole('button', { name: messages.nav.data }));
    expect(screen.getByText(messages.data.stored)).toBeTruthy();
    expect(screen.getByText(messages.data.sent).textContent).toContain('Ask a short question');
    expect(screen.getByText(messages.data.notSent).textContent).toContain('typed working');
    await expectNoAxeViolations(container);
  });
});

describe('theme setting', () => {
  it('offers system, light and dark, applies the choice, and remembers it', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    const select = screen.getByLabelText(messages.theme.label);
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual(['System', 'Light', 'Dark']);
    expect((select as HTMLSelectElement).value).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    await user.selectOptions(select, 'dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await user.selectOptions(select, 'light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    await user.selectOptions(select, 'dark');
    first.unmount();

    document.documentElement.removeAttribute('data-theme');
    render(<App />);
    expect((screen.getByLabelText(messages.theme.label) as HTMLSelectElement).value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await user.selectOptions(screen.getByLabelText(messages.theme.label), 'system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
