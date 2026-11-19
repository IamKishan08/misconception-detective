import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

/** Fails the test on any console error, CSP violation or uncaught exception in the built app. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const results = await axe.run(document);
    return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
}

/** The text of an expression, independent of line breaks from the stacked-fraction layout. */
const expression = (locator: Locator) => locator.evaluate((el) => (el.textContent ?? '').replace(/\s+/g, ''));

/** Reads the current addition question and returns the "add across" (misconception) answer. */
async function acrossAnswer(page: Page): Promise<[number, number]> {
  const parts = await page.locator('.prompt .expression .fraction').evaluateAll((els) =>
    els.map((el) => [Number(el.children[0]?.textContent), Number(el.children[1]?.textContent)]),
  );
  const [a, b] = parts;
  if (a === undefined || b === undefined) throw new Error('addition question not found');
  return [(a[0] ?? 0) + (b[0] ?? 0), (a[1] ?? 0) + (b[1] ?? 0)];
}

async function answerFraction(page: Page, [n, d]: [number, number]) {
  await page.getByLabel('Top number (numerator)').fill(String(n));
  await page.getByLabel('Bottom number (denominator)').fill(String(d));
  await page.getByRole('button', { name: 'Check answer' }).click();
}

test.describe('Solve my problem', () => {
  test('enter a problem, submit a wrong answer, read the explanation, ask for a similar problem', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Solve my problem', level: 2 })).toBeVisible();
    await expect(page.getByText('Built-in explanations').first()).toBeVisible();
    // Out-of-scope controls are not present.
    await expect(page.getByRole('button', { name: /upload|photo|camera/i })).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);

    const problem = page.getByLabel('Your fraction problem');
    await problem.fill('1/2 + 1/4');
    await expect(page.getByText('I read this as:')).toBeVisible();
    await page.getByLabel('Your answer (optional)').fill('2/6');
    await page.getByRole('button', { name: 'Check my working' }).click();

    const result = page.getByRole('region', { name: 'Your problem' });
    await expect(result).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your problem' })).toBeFocused();
    // The original problem is still visible next to the explanation.
    await expect(result.getByRole('img', { name: 'one half' })).toBeVisible();
    await expect(result.getByText('Not quite yet')).toBeVisible();
    await expect(result.locator('.answer-tile.wrong')).toContainText('2/6');
    await expect(result.locator('.answer-tile.right')).toContainText('3/4');
    await expect(result.getByText('A possible reason (not a diagnosis)')).toBeVisible();
    await expect(result.getByText('1/2 = 2/4')).toBeVisible();
    await expect(result.getByText(/keep the denominator 4 because the pieces are still quarters/)).toBeVisible();

    // Contextual help.
    await result.getByRole('button', { name: 'Explain more simply' }).click();
    await expect(result.getByText(/Make both fractions use quarters/)).toBeVisible();
    await result.getByRole('button', { name: 'Why this step?' }).click();
    await expect(result.getByText(/Because pieces can only be added/)).toBeVisible();
    await expect(result.locator('figure.visual').first()).toBeVisible();
    // Ask about the problem: with no Gemini key the app matches the question itself and says so.
    await result.getByLabel('Ask about this problem').fill('Why do the denominators have to match?');
    await result.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(result.getByRole('heading', { name: 'Why the denominators have to match' })).toBeVisible();
    await expect(result.getByText(/Built-in help: matched to your question by the app/)).toBeVisible();
    await expect(result.getByText(/AI-selected help: Gemini chose/)).toHaveCount(0);

    await result.getByRole('button', { name: 'Give me a similar problem' }).first().click();
    await expect(problem).not.toHaveValue('1/2 + 1/4');
    await expect(problem).toHaveValue(/^\d+\/\d+ \+ \d+\/\d+$/);
    await expect(page.getByLabel('Your answer (optional)')).toHaveValue('');
    await expect(page.getByRole('region', { name: 'Your problem' })).toHaveCount(0);

    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('help without any answer: hints and one step at a time', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '2/3 × 3/5' }).click();
    await page.getByRole('button', { name: 'Help me get started' }).click();
    const result = page.getByRole('region', { name: 'Your problem' });
    await expect(result.getByText(/multiply across/i).first()).toBeVisible();
    await expect(result.getByText('Correct answer')).toHaveCount(0);
    await result.getByRole('button', { name: 'Show the first step' }).click();
    await expect(result.getByRole('heading', { name: /Multiply across/ })).toBeVisible();
    await result.getByRole('button', { name: 'Show all the steps' }).click();
    await expect(result.locator('.final-answer')).toContainText('2/5');
  });

  test('unsupported and invalid problems get a helpful message, never a different problem', async ({ page }) => {
    await page.goto('/');
    const problem = page.getByLabel('Your fraction problem');
    for (const [text, message] of [
      ['1/0 + 1/2', /cannot be 0/],
      ['1/2 ÷ 0', /cannot divide by zero/],
      ['1 1/2 + 1/4', /Mixed numbers/],
      ['what is the capital of France', /could not understand/],
    ] as const) {
      await problem.fill(text);
      await page.getByRole('button', { name: 'Help me get started' }).click();
      await expect(page.getByRole('alert').first()).toContainText(message);
      await expect(page.getByRole('region', { name: 'Your problem' })).toHaveCount(0);
    }
  });

  test('negative and improper answers are explained with a number line and stacked bars', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your fraction problem').fill('1/4 - 1/2');
    await page.getByLabel('Your answer (optional)').fill('-1/4');
    await page.getByRole('button', { name: 'Check my working' }).click();
    await expect(page.getByText('Correct!')).toBeVisible();
    await page.getByRole('button', { name: 'Show how it works' }).click();
    await page.getByRole('button', { name: 'Show a visual' }).click();
    await expect(page.getByRole('img', { name: /Number line from -1 to 1/ })).toBeVisible();
  });

  test('layout: side by side on desktop, a single column on a phone', async ({ page }, info) => {
    await page.goto('/');
    await page.getByLabel('Your fraction problem').fill('3/4 + 1/2');
    await page.getByLabel('Your answer (optional)').fill('4/6');
    await page.getByRole('button', { name: 'Check my working' }).click();
    const form = await page.locator('.input-card').boundingBox();
    const result = await page.locator('.result').boundingBox();
    if (form === null || result === null) throw new Error('layout boxes not found');
    if (info.project.name === 'desktop') {
      expect(result.x).toBeGreaterThan(form.x + form.width - 2);
      expect(Math.abs(result.y - form.y)).toBeLessThan(40);
    } else {
      expect(result.y).toBeGreaterThanOrEqual(form.y + form.height - 2);
      expect(Math.abs(result.x - form.x)).toBeLessThan(4);
      expect(result.width).toBeGreaterThan(300);
    }
    await noHorizontalScroll(page);
  });

  test('keyboard only: type, tab to the answer, Enter to check, then reveal steps', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.getByLabel('Your fraction problem').focus();
    await page.keyboard.type('3/4 - 1/6');
    await page.keyboard.press('Tab'); // What can I type?
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Your answer (optional)')).toBeFocused();
    await page.keyboard.type('2/3');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Your problem' })).toBeFocused();
    await expect(page.getByText('Not quite yet')).toBeVisible();
    // Buttons are reachable and operable with the keyboard.
    await page.getByRole('button', { name: 'Explain more simply' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Explain more simply' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Practise', () => {
  test('wrong answer keeps the question, offers three ways to get help, and completes the original flow', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Practise', exact: true }).click();
    await expect(page.getByText('Not sure where to start?')).toBeVisible();

    // Item: the "add across" answer → possible idea, question stays on screen.
    const before = await expression(page.locator('.prompt .expression'));
    await answerFraction(page, await acrossAnswer(page));
    await expect(page.getByRole('heading', { name: 'Let us look at this together' })).toBeFocused();
    await expect(page.getByText('only a possible reason')).toBeVisible();
    expect(await expression(page.locator('.review .prompt .expression'))).toBe(before);
    await expect(page.locator('.review .answer-tile.wrong')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Give me a hint' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explain step by step' })).toBeVisible();
    await expect(page.getByText(/Why a check question\?/)).toBeVisible();

    // Hint, then the explanation, without leaving the question.
    await page.getByRole('button', { name: 'Give me a hint' }).click();
    await expect(page.locator('.hint-list li').first()).toBeVisible();
    await page.getByRole('button', { name: 'Explain step by step' }).click();
    await expect(page.getByText('Make the pieces the same size')).toBeVisible();
    await expect(page.getByText('Built-in explanations').first()).toBeVisible();
    await expect(page.getByText(/will not count as independent practice/)).toBeVisible();

    // Try again returns to the same question.
    await page.getByRole('button', { name: 'Try again' }).click();
    expect(await expression(page.locator('.prompt .expression'))).toBe(before);

    // Move on only by choice: check question, same idea again → explanation shown, then new numbers.
    await answerFraction(page, await acrossAnswer(page));
    await page.getByRole('button', { name: 'Try a check question' }).click();
    await expect(page.getByText('Check question')).toBeVisible();
    await answerFraction(page, await acrossAnswer(page));
    await expect(page.getByRole('heading', { name: 'Let us look at this together' })).toBeFocused();
    await expect(page.getByRole('heading', { name: /same size/ })).toBeVisible();
    await page.getByRole('button', { name: 'Try one with new numbers' }).click();
    await expect(page.getByText('New numbers').first()).toBeVisible();

    // My progress: this student's real activity only, each outcome kept apart, no sample data.
    await page.getByRole('button', { name: 'My progress' }).click();
    await expect(page.getByRole('heading', { name: 'My progress', level: 2 })).toBeVisible();
    await expect(page.getByText(/not a score and not a measure/)).toBeVisible();
    // The question and the check question are two separate attempts, both answered wrongly so far.
    await expect(page.locator('.history-item')).toHaveCount(2);
    await expect(page.locator('.history-item .outcome-badge')).toHaveText(['Not yet correct', 'Not yet correct']);
    await expect(page.getByText(/teacher|sample|made-up/i)).toHaveCount(0);
    await page.getByRole('button', { name: 'Review the explanation' }).first().click();
    await expect(page.locator('.history-item .step').first()).toBeVisible();

    // Progress survives a reload.
    await page.reload();
    await page.getByRole('button', { name: 'My progress' }).click();
    await expect(page.locator('.history-item')).toHaveCount(2);

    // Settings: deleting practice progress asks first.
    await page.getByRole('button', { name: 'Settings' }).click();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Reset my practice progress' }).click();
    await expect(page.getByText('Practice progress cleared. Starting fresh.')).toBeAttached();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.locator('#settings-panel').getByRole('button', { name: 'Delete my activity history' }).click();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await expect(page.locator('.history-item')).toHaveCount(0);
    await expect(page.getByText('Nothing here yet')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('the whole path can be completed independently, and it is keyboard operable', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Practise', exact: true }).click();
    await page.getByLabel('Top number (numerator)').focus();
    // Correct answers, computed from the question on screen: item then transfer → idea secure.
    for (let i = 0; i < 2; i += 1) {
      const parts = await page.locator('.prompt .expression .fraction').evaluateAll((els) =>
        els.map((el) => [Number(el.children[0]?.textContent), Number(el.children[1]?.textContent)] as const),
      );
      const [a, b] = parts;
      if (a === undefined || b === undefined) throw new Error('addition question not found');
      const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
      const L = (a[1] * b[1]) / gcd(a[1], b[1]);
      const n = a[0] * (L / a[1]) + b[0] * (L / b[1]);
      await page.getByLabel('Top number (numerator)').focus();
      await page.keyboard.type(String(n));
      await page.keyboard.press('Tab');
      await page.keyboard.type(String(L));
      await page.keyboard.press('Enter');
      if (i === 0) await expect(page.getByText(/Correct: /)).toBeVisible();
    }
    await expect(page.locator('.path-item.status-secure')).toHaveCount(1);
  });
});

test.describe('Theme, motion and contrast', () => {
  // Only axe needs to inject a script; every other test runs with the app's strict content security policy enforced.
  test.use({ bypassCSP: false });

  test('a light, dark or system theme is available and remembered', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.getByLabel('Theme').selectOption('light');
    const light = await bg();
    await page.getByLabel('Theme').selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const dark = await bg();
    expect(dark).not.toBe(light);
    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('Theme')).toHaveValue('dark');
    expect(await bg()).toBe(dark);
    await page.getByLabel('Theme').selectOption('system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  });

  test('system theme follows the operating system preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(18, 17, 28)');
  });

  test('reduced motion removes the reveal animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByLabel('Your fraction problem').fill('1/2 + 1/4');
    await page.getByLabel('Your answer (optional)').fill('2/6');
    await page.getByRole('button', { name: 'Check my working' }).click();
    const name = await page.locator('.step').first().evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe('none');
  });

  for (const theme of ['light', 'dark'] as const) {
    test.describe(`axe ${theme}`, () => {
      test.use({ bypassCSP: true });
      test(`no accessibility violations, including colour contrast, in the ${theme} theme`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByLabel('Theme').selectOption(theme);
      await expect(await axeViolations(page)).toEqual([]);
      await page.getByRole('button', { name: 'Close settings' }).click();
      await page.getByLabel('Your fraction problem').fill('3/4 - 1/6');
      await page.getByLabel('Your answer (optional)').fill('2/3');
      await page.getByRole('button', { name: 'Check my working' }).click();
      await page.getByRole('button', { name: 'Why this step?' }).click();
      await page.getByLabel('Ask about this problem').fill('why do the denominators match');
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      // Contrast is only meaningful once the gentle reveal animation has finished.
      await expect(page.locator('.help-card')).toHaveCSS('opacity', '1');
      await expect(page.locator('.step').last()).toHaveCSS('opacity', '1');
      await expect(await axeViolations(page)).toEqual([]);
      await page.getByRole('button', { name: 'My progress' }).click();
      await expect(await axeViolations(page)).toEqual([]);
      await page.getByRole('button', { name: 'Practise', exact: true }).click();
      await expect(await axeViolations(page)).toEqual([]);
    });
    });
  }
});
