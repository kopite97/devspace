import { test, expect, setup, journal, id } from './fixtures';

test.beforeEach(async ({ page }) => {
  await setup(page);
  await page.route('**/api/v2/journals?*', (route) =>
    route.fulfill({ json: { items: [journal(1)], total: 1, nextCursor: null } }),
  );
});

for (const suffix of ['', '/']) {
  test(`authenticated integrated routes render server data (suffix ${JSON.stringify(suffix)})`, async ({
    page,
  }) => {
    await page.goto('/projects' + suffix);
    await expect(page.getByRole('button', { name: /^Project 1\s/ })).toBeVisible();
    await expect(page.getByLabel('현재 화면 검색')).toBeVisible();
    await expect(page.locator('.auth-pending')).toHaveCount(0);

    await page.goto('/projects/' + id(1) + suffix);
    await expect(page.getByRole('heading', { name: 'Project 1', exact: true })).toBeVisible();
    await expect(page.locator('.journal-surface')).toContainText('Journal 1');
    await expect(page.locator('.auth-pending')).toHaveCount(0);

    await page.goto('/journals' + suffix);
    await expect(page.locator('.document-row')).toContainText('Journal 1');
    await expect(page.getByRole('button', { name: /^검색 및 정렬/ })).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('현재 화면 검색')).toHaveCount(0);
    await expect(page.getByLabel('일지 정렬')).toHaveCount(0);
    await expect(page.locator('.journal-query-toolbar, .classification-toolbar')).toHaveCount(0);
    await expect(page.locator('.auth-pending')).toHaveCount(0);
  });
}

test('restored sidebar reaches integrated Project and Journal pages', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar nav button').nth(1).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.getByRole('button', { name: /^Project 1\s/ }).click();
  await expect(page).toHaveURL('/projects/' + id(1));
  await expect(page.getByRole('heading', { name: 'Project 1', exact: true })).toBeVisible();

  const navigation = page.locator('.sidebar nav');
  await navigation.getByRole('button', { name: '개발 일지' }).click();
  await expect(page.locator('.document-row')).toContainText('Journal 1');
  await navigation.getByRole('button', { name: /프로젝트/ }).click();
  await expect(page.getByLabel('현재 화면 검색')).toBeVisible();
  await navigation.getByRole('button', { name: '나의 홈', exact: true }).click();
  await page.locator('.sidebar nav button').nth(3).click();
  await expect(page).toHaveURL(/\/journals$/);
  await expect(page.locator('.document-row')).toContainText('Journal 1');
  await expect(page.locator('.auth-pending')).toHaveCount(0);
  await expect(page.locator('.app-shell .main-shell main .page-heading')).toBeVisible();
  await expect(page.locator('.auth-card, .auth-header, .auth-identity')).toHaveCount(0);
});
