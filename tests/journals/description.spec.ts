import { test, expect, setup, journal } from './fixtures';

test('long journal descriptions expand with the keyboard without losing original text', async ({
  page,
}) => {
  await setup(page);
  const body = '  작업의 배경과 범위\n' + '설명 내용 '.repeat(100);
  const row = journal(1, { body });
  await page.route('**/api/v2/journals/' + row.id, (route) => route.fulfill({ json: row }));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/journals/' + row.id);
    const description = page.getByRole('region', { name: '일지 설명', exact: true });
    const disclosure = description.locator('details');
    await expect(disclosure).not.toHaveAttribute('open');
    await expect(description.locator('.detail-body')).not.toBeVisible();
    const summary = description.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(description.locator('.detail-body')).toBeVisible();
    expect(await description.locator('.detail-body').textContent()).toBe(body);
    await page.keyboard.press('Enter');
    await expect(disclosure).not.toHaveAttribute('open');
    await expect(summary).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('short descriptions stay visible and creation uses the description label', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/v2/journals/' + journal(1).id, (route) =>
    route.fulfill({ json: journal(1) }),
  );
  await page.goto('/journals/' + journal(1).id);
  const description = page.getByRole('region', { name: '일지 설명', exact: true });
  await expect(description.locator('.detail-body')).toBeVisible();
  await expect(description.locator('details')).toHaveCount(0);
  await page.goto('/journals');
  await page.getByRole('button', { name: '일지 작성', exact: true }).click();
  await expect(page.getByLabel('일지 설명', { exact: true })).toBeVisible();
  await expect(page.getByLabel('본문', { exact: true })).toHaveCount(0);
});
