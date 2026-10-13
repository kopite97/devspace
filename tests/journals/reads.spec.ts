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
  await page.getByRole('button', { name: /검색 및 정렬/ }).click();
  const search = page.getByRole('dialog', { name: '검색 및 정렬' });
  await search.getByLabel('시작일').fill('2026-09-11');
  await search.getByLabel('종료일').fill('2026-09-30');
  await search.getByLabel('일지 정렬').selectOption('oldest');
  await search.getByRole('button', { name: '적용', exact: true }).click();
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

for (const status of [404, 500]) {
  test(`detail initial loading and ${status} retain back navigation without creation`, async ({
    page,
  }) => {
    await setup(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/v2/journals/' + id(201), async (route) => {
      await held;
      await route.fulfill({ status, json: { code: 'DETAIL_FAILURE' } });
    });
    await page.goto('/journals/' + id(201));
    await expect(page.getByRole('status')).toContainText('일지를 불러오는 중');
    await expect(page.getByRole('button', { name: '새 글 작성', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '일지 목록', exact: true })).toBeEnabled();
    release();
    await expect(page.getByRole('alert')).toContainText('일지가 없거나');
    await expect(page.getByRole('region', { name: '일지 문서' })).toHaveCount(0);
    await page.unroute('**/api/v2/journals/' + id(201));
    await page.route('**/api/v2/journals/' + id(201), (route) =>
      route.fulfill({ json: journal(1) }),
    );
    await page.getByRole('button', { name: '다시 시도', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByRole('button', { name: '새 글 작성', exact: true })).toBeEnabled();
    await expect(page.getByRole('region', { name: '일지 문서' })).toContainText(
      '문서 목록을 불러오지 못했습니다',
    );
    await expect(page.locator('.journal-document-heading')).not.toContainText('0개');
    await expect(page.locator('.journal-viewer .detail-body')).toHaveText('Body 1');
    await page.getByRole('button', { name: '연결된 글로 이동', exact: true }).click();
    await expect(page.getByRole('heading', { name: '연결된 글', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '작성 위치로 이동', exact: true }).click();
    await expect(page.getByRole('button', { name: '새 글 작성', exact: true })).toBeFocused();
  });
}
