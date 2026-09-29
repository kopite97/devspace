import { test, expect, setup, journal, project, id } from './fixtures';

test('server list keeps search, inclusive date filters, ordering and cursor pages', async ({
  page,
}) => {
  await setup(page);
  const requests: URL[] = [];
  await page.route('**/api/v2/journals?*', (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    return route.fulfill({
      json: url.searchParams.has('cursor')
        ? {
            items: [journal(3, { categoryId: null, projectName: 'Project 2' })],
            total: 3,
            nextCursor: null,
          }
        : {
            items: [journal(1, { categoryId: null }), journal(2, { categoryId: null })],
            total: 3,
            nextCursor: 'cursor+/=',
          },
    });
  });
  await page.goto('/journals?category=uncategorized&q=Project');
  await expect(page.locator('.document-row')).toHaveCount(2);
  expect(requests[0].searchParams.get('category')).toBe('uncategorized');
  expect(requests[0].searchParams.get('query')).toBe('Project');
  expect(requests[0].searchParams.get('sort')).toBe('newest');
  await page.getByRole('button', { name: '더 불러오기', exact: true }).click();
  await expect(page.locator('.document-row')).toHaveCount(3);
  expect(requests.at(-1)?.searchParams.get('cursor')).toBe('cursor+/=');
  await page.locator('input[type="date"]').nth(0).fill('2026-09-11');
  await page.locator('input[type="date"]').nth(1).fill('2026-09-30');
  await page.locator('.form-grid select').last().selectOption('oldest');
  await expect.poll(() => requests.at(-1)?.searchParams.get('sort')).toBe('oldest');
  expect(requests.at(-1)?.searchParams.get('from')).toBe('2026-09-11');
  expect(requests.at(-1)?.searchParams.get('to')).toBe('2026-09-30');
  expect(requests.every((request) => request.searchParams.get('limit') === '20')).toBeTruthy();
});

test('a later-page failure retains confirmed rows and offers retry', async ({ page }) => {
  await setup(page);
  let cursorCalls = 0;
  await page.route('**/api/v2/journals?*', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('cursor')) {
      cursorCalls++;
      return cursorCalls === 1
        ? route.fulfill({ status: 503, json: { code: 'TEMPORARY' } })
        : route.fulfill({ json: { items: [journal(2)], total: 2, nextCursor: null } });
    }
    return route.fulfill({ json: { items: [journal(1)], total: 2, nextCursor: 'next' } });
  });
  await page.goto('/journals');
  await page.getByRole('button', { name: '더 불러오기', exact: true }).click();
  await expect(page.locator('.document-row')).toHaveCount(1);
  await expect(page.locator('[role="alert"]')).toBeVisible();
  await page.getByRole('button', { name: /다시 시도/ }).click();
  await expect(page.locator('.document-row')).toHaveCount(2);
  expect(cursorCalls).toBe(2);
});

test('project detail Journal widget uses the selected server UUID and direct project filter', async ({
  page,
}) => {
  await setup(page);
  const projectId = id(7);
  await page.route('**/api/v2/projects/' + projectId, (route) =>
    route.fulfill({ json: project(7, 'archived') }),
  );
  const requests: URL[] = [];
  await page.route('**/api/v2/journals?*', (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    return route.fulfill({
      json: {
        items: [journal(1, { projectId, projectName: 'Project 7' })],
        total: 1,
        nextCursor: null,
      },
    });
  });
  await page.goto('/projects/' + projectId);
  await expect(page.locator('.journal-surface .journal-row')).toHaveCount(1);
  expect(
    requests.some((request) => request.searchParams.get('projectId') === projectId),
  ).toBeTruthy();
  await expect(page.locator('.journal-surface')).toContainText('Journal 1');
});

test('Home Journal widget opens the independent Journal viewer without a read modal', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/v2/journals/' + id(500), (route) =>
    route.fulfill({
      json: journal(300, {
        title: 'Widget 전환 기록',
        body: '서버 데이터 확인',
        entryDate: '2026-09-17',
      }),
    }),
  );
  await page.goto('/');
  await expect(page.locator('.journal-row')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/journal-home-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/journal-home-mobile.png', fullPage: true });
  await page.locator('.journal-row').click();
  await expect(page).toHaveURL(new RegExp('/journals/' + id(500) + '$'));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.journal-viewer .detail-body')).toHaveText('서버 데이터 확인');
});
