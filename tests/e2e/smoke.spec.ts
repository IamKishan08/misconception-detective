import { expect, test, type Page } from '@playwright/test';

/** Reads the current addition question from the screen-reader labels and returns the across (misconception) answer. */
async function acrossAnswer(page: Page): Promise<[number, number]> {
  const labels = await page.locator('.expression .fraction[role="img"]').evaluateAll((els) =>
    els.map((el) => [Number(el.children[0]?.textContent), Number(el.children[1]?.textContent)]),
  );
  const [a, b] = labels;
  if (a === undefined || b === undefined) throw new Error('addition question not found');
  return [(a[0] ?? 0) + (b[0] ?? 0), (a[1] ?? 0) + (b[1] ?? 0)];
}

async function answerFraction(page: Page, [n, d]: [number, number]) {
  await page.getByLabel('Top number (numerator)').focus();
  await page.keyboard.type(String(n));
  await page.keyboard.press('Tab');
  await page.keyboard.type(String(d));
  await page.keyboard.press('Enter');
}

test('one full loop with the keyboard at a mobile viewport, persisted across reload, cleared by reset', async ({ page }) => {
  // Any CSP violation or script error in the built app fails the test.
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Offline explanations').first()).toBeVisible();

  // Item: give the "add across" answer → possible misconception and a follow-up.
  await answerFraction(page, await acrossAnswer(page));
  await expect(page.getByRole('status').filter({ hasText: 'only a possible idea' })).toBeVisible();
  await expect(page.getByText('Check question')).toBeVisible();

  // Follow-up: same pattern again → explanation with verified bars and offline text.
  await answerFraction(page, await acrossAnswer(page));
  await expect(page.getByRole('heading', { name: 'Look at it with fraction bars' })).toBeFocused();
  await expect(page.locator('.source.offline')).toBeVisible();
  await page.getByRole('button', { name: 'Next step' }).press('Enter');
  await page.getByRole('button', { name: 'Try a question with new numbers' }).press('Enter');
  await expect(page.getByText('New numbers', { exact: false }).first()).toBeVisible();

  // Teacher view shows this learner's attempts.
  await page.getByRole('button', { name: 'Teacher view' }).press('Enter');
  const you = page.getByRole('row', { name: /You \(this device\)/ });
  await expect(you).toContainText('Likely misconception');
  await expect(you).toContainText('matched pattern');

  // Reload keeps progress.
  await page.reload();
  await page.getByRole('button', { name: 'Teacher view' }).click();
  await expect(page.getByRole('row', { name: /You \(this device\)/ })).toContainText('Likely misconception');

  // Reset clears it.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Reset my progress' }).press('Enter');
  await page.getByRole('button', { name: 'Teacher view' }).click();
  await expect(page.getByRole('row', { name: /You \(this device\)/ })).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});
