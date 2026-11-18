// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, vi } from 'vitest';
import { App } from '../../src/web/App.js';
import { ExplanationPanel } from '../../src/web/components/ExplanationPanel.js';
import { messages } from '../../src/web/messages.js';
import type { Question } from '../../src/engine/types.js';

async function expectNoAxeViolations(container: HTMLElement) {
  // Colour contrast needs real layout, which jsdom does not provide; it is checked manually (see README).
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

beforeEach(() => {
  window.localStorage.clear();
  // No server in these tests: the status call fails and the app must show offline mode.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('screens', () => {
  it('student question screen has no axe violations and labelled fraction inputs', async () => {
    const { container } = render(<App />);
    expect(screen.getByLabelText(messages.question.numerator)).toBeTruthy();
    expect(screen.getByLabelText(messages.question.denominator)).toBeTruthy();
    expect(await screen.findByText(messages.explanationsOffline)).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it('keyboard-only answer gives feedback in a live region and saves progress', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.tab();
    expect(document.activeElement?.textContent).toBe(messages.skipToContent);
    screen.getByLabelText(messages.question.numerator).focus();
    await user.keyboard('1{Tab}0{Enter}');
    const message = await screen.findByText(messages.invalid('zero_denominator'));
    expect(message.closest('[aria-live="polite"]')).not.toBeNull();
    expect(window.localStorage.length).toBeGreaterThan(0);
  });

  it('teacher view has no axe violations and labels samples', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole('button', { name: messages.nav.teacher }));
    expect(screen.getAllByText(messages.teacher.sampleBadge).length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
    await user.click(screen.getByLabelText(messages.teacher.showSamples));
    expect(screen.queryAllByText(messages.teacher.sampleBadge)).toHaveLength(0);
  });

  it('explanation screen has no axe violations and shows the offline label honestly', async () => {
    const question: Question = { id: 'q', family: 'F1', stage: 'followup', difficulty: 1, body: { type: 'add', a: { n: 1, d: 5 }, b: { n: 2, d: 5 } } };
    const { container } = render(
      <ExplanationPanel question={question} labelled explanation={{ source: 'fallback', templateId: 'F1.size_check', sentences: ['Adding makes it bigger.'] }} onContinue={() => undefined} />,
    );
    expect(screen.getByText(messages.explanationsOffline)).toBeTruthy();
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
  });

  it('data screen explains what is stored and sent', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole('button', { name: messages.nav.data }));
    expect(screen.getByText(messages.data.stored)).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});
