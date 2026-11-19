// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
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
  it('opens on "Solve my problem" with three navigation options and a labelled problem box', async () => {
    const { container } = render(<App />);
    expect(screen.getByRole('heading', { name: messages.solve.heading })).toBeTruthy();
    expect(screen.getByLabelText(messages.solve.problemLabel)).toBeTruthy();
    for (const label of ['Solve my problem', 'Practise', 'My progress']) {
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

  it('has exactly three navigation items and no teacher view or sample students anywhere', async () => {
    const user = userEvent.setup();
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Solve my problem', 'Practise', 'My progress']);
    for (const name of ['Practise', 'My progress']) {
      await user.click(within(nav).getByRole('button', { name }));
      expect(document.body.textContent).not.toMatch(/teacher|sample learner|made-up/i);
    }
  });

  it('settings holds the theme, what is stored and sent, and the deletion controls; Escape closes it', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const button = screen.getByRole('button', { name: messages.settings.open });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: messages.settings.heading }));
    expect(screen.getByText(messages.data.stored)).toBeTruthy();
    expect(screen.getByText(messages.data.sent).textContent).toContain('Ask about this problem');
    expect(screen.getByText(messages.data.notSent).textContent).toContain('typed working');
    for (const name of [messages.settings.deleteHistory, messages.settings.reset, messages.settings.deleteAll]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    await expectNoAxeViolations(container);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('heading', { name: messages.settings.heading })).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe('theme setting', () => {
  it('offers system, light and dark, applies the choice, and remembers it', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await user.click(screen.getByRole('button', { name: messages.settings.open }));
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
    await user.click(screen.getByRole('button', { name: messages.settings.open }));
    expect((screen.getByLabelText(messages.theme.label) as HTMLSelectElement).value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await user.selectOptions(screen.getByLabelText(messages.theme.label), 'system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
