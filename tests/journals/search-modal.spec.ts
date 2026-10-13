import type { Page } from '@playwright/test';
import { test, expect, setup, journal, project, id } from './fixtures';

const searchButton = (page: Page) => page.getByRole('button', { name: /^검색 및 정렬/ });
const searchDialog = (page: Page) =>
  page.getByRole('dialog', { name: '검색 및 정렬', exact: true });
async function openSearch(page: Page) {
  await searchButton(page).click();
  const dialog = searchDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await setup(page);
  await page.route('**/api/v2/journals?*', (route) =>
    route.fulfill({ json: { items: [journal(1)], total: 1, nextCursor: null } }),
  );
});

test('all six conditions remain draft until a single apply and reset the cursor', async ({
  page,
}) => {
  const requests: URL[] = [];
  await page.route('**/api/v2/journals?*', (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    return route.fulfill({
      json: {
        items: [journal(url.searchParams.has('cursor') ? 2 : 1)],
        total: 2,
        nextCursor: url.searchParams.has('cursor') ? null : 'next',
      },
    });
  });
  await page.goto('/journals?scope=all');
  await expect(page.locator('.document-row')).toHaveCount(1);
  await page.getByRole('button', { name: '더 불러오기', exact: true }).click();
  await expect(page.locator('.document-row')).toHaveCount(2);
  const before = requests.length;
  const initialUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  const dialog = await openSearch(page);
  await expect(dialog.getByLabel('현재 화면 검색')).toBeFocused();
  await dialog.getByLabel('현재 화면 검색').fill('작업 맥락');
  await dialog.getByLabel('개발 분야 필터').selectOption('uncategorized');
  await dialog.getByLabel('일지 프로젝트 필터').selectOption(id(2));
  await dialog.getByLabel('시작일').fill('2026-09-11');
  await dialog.getByLabel('종료일').fill('2026-09-30');
  await dialog.getByLabel('일지 정렬').selectOption('oldest');
  await page.waitForTimeout(350); // The former search debounce must not navigate while editing.
  expect(requests).toHaveLength(before);
  expect(page.url()).toBe(initialUrl);
  await expect(page.locator('.document-row')).toHaveCount(2);
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(searchButton(page)).toBeFocused();
  await expect(searchButton(page)).toContainText('적용됨');
  await expect.poll(() => requests.length).toBe(before + 1);
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
  const applied = new URL(page.url()).searchParams;
  expect(Object.fromEntries(applied)).toEqual({
    category: 'uncategorized',
    q: '작업 맥락',
    projectId: id(2),
    from: '2026-09-11',
    to: '2026-09-30',
    sort: 'oldest',
  });
  const sent = requests.at(-1)!.searchParams;
  expect(Object.fromEntries(sent)).toEqual({
    category: 'uncategorized',
    projectStatus: 'all',
    query: '작업 맥락',
    sort: 'oldest',
    limit: '20',
    projectId: id(2),
    from: '2026-09-11',
    to: '2026-09-30',
  });
  await expect(page.locator('.document-row')).toHaveCount(1);
});

for (const method of ['취소', '닫기', 'Escape', 'backdrop'] as const) {
  test(`discard temporary conditions via ${method} and restore focus`, async ({ page }) => {
    await page.goto('/journals?q=기존&sort=oldest');
    const original = page.url();
    const dialog = await openSearch(page);
    await dialog.getByLabel('현재 화면 검색').fill('버릴 내용');
    await dialog.getByLabel('일지 정렬').selectOption('newest');
    if (method === 'Escape') await page.keyboard.press('Escape');
    else if (method === 'backdrop') await page.mouse.click(3, 3);
    else await dialog.getByRole('button', { name: method, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(page.url()).toBe(original);
    await expect(searchButton(page)).toBeFocused();
    await openSearch(page);
    await expect(dialog.getByLabel('현재 화면 검색')).toHaveValue('기존');
    await expect(dialog.getByLabel('일지 정렬')).toHaveValue('oldest');
  });
}

test('reset stays local until applied, including a sort-only filter', async ({ page }) => {
  await page.goto('/journals?sort=oldest');
  await expect(searchButton(page)).toContainText('적용됨');
  const original = page.url();
  const dialog = await openSearch(page);
  await dialog.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(dialog.getByLabel('일지 정렬')).toHaveValue('newest');
  expect(page.url()).toBe(original);
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await openSearch(page);
  await expect(dialog.getByLabel('일지 정렬')).toHaveValue('oldest');
  await dialog.getByRole('button', { name: '초기화', exact: true }).click();
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page).toHaveURL('/journals?category=all');
  await expect(searchButton(page)).not.toContainText('적용됨');
});

test('restores links and browser history without navigating for unchanged values', async ({
  page,
}) => {
  const initial =
    '/journals?category=uncategorized&q=기존&projectId=' +
    id(2) +
    '&from=2026-09-11&to=2026-09-30&sort=oldest';
  await page.goto(initial);
  const dialog = await openSearch(page);
  const historyLength = await page.evaluate(() => history.length);
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(searchButton(page)).toBeFocused();
  await openSearch(page);
  await dialog.getByLabel('현재 화면 검색').fill('다음');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await page.reload();
  await openSearch(page);
  await expect(dialog.getByLabel('현재 화면 검색')).toHaveValue('다음');
  await expect(dialog.getByLabel('일지 프로젝트 필터')).toHaveValue(id(2));
  await expect(dialog.getByLabel('시작일')).toHaveValue('2026-09-11');
  await expect(dialog.getByLabel('종료일')).toHaveValue('2026-09-30');
  await expect(dialog.getByLabel('일지 정렬')).toHaveValue('oldest');
  await dialog.getByLabel('현재 화면 검색').fill('이력 이동으로 버릴 내용');
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(searchButton(page)).not.toBeFocused();
  await openSearch(page);
  await expect(dialog.getByLabel('현재 화면 검색')).toHaveValue('기존');
  await page.goForward();
  await expect(dialog).toHaveCount(0);
  await openSearch(page);
  await expect(dialog.getByLabel('현재 화면 검색')).toHaveValue('다음');
});

test('invalid date links can be repaired; equal and one-sided ranges work', async ({ page }) => {
  await page.goto('/journals?from=2026-09-30&to=2026-09-11');
  await expect(page.locator('.journal-page-content [role="alert"]')).toContainText('날짜 범위');
  await expect(page.locator('.document-row')).toHaveCount(0);
  const dialog = await openSearch(page);
  await expect(dialog.getByRole('alert')).toContainText('종료일은 시작일 이후');
  await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
  await dialog.getByLabel('종료일').fill('2026-09-30');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.document-row')).toHaveCount(1);
  await openSearch(page);
  await dialog.getByLabel('시작일').fill('');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  expect(new URL(page.url()).searchParams.has('from')).toBe(false);
  expect(new URL(page.url()).searchParams.get('to')).toBe('2026-09-30');
});

test('keyboard stays in the modal and IME Enter does not apply', async ({ page }) => {
  await page.goto('/journals');
  const dialog = await openSearch(page);
  const input = dialog.getByLabel('현재 화면 검색');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '닫기', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '닫기', exact: true })).toBeFocused();
  await input.focus();
  await input.dispatchEvent('compositionstart');
  await input.fill('한글');
  await input.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL('/journals');
  await input.dispatchEvent('compositionend');
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('q')).toBe('한글');
});

for (const status of [200, 503]) {
  test(`pending edit prevents search overlap, then recovers after ${status}`, async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/v2/journals/' + id(201), async (route) => {
      await gate;
      await route.fulfill(
        status === 200 ? { json: journal(1) } : { status, json: { code: 'TEMPORARY' } },
      );
    });
    await page.goto('/journals');
    await page.getByRole('button', { name: 'Journal 1 수정', exact: true }).click();
    await expect(searchButton(page)).toBeDisabled();
    await searchButton(page).evaluate((button: HTMLButtonElement) => button.click());
    await expect(searchDialog(page)).toHaveCount(0);
    release();
    if (status === 200) {
      const editor = page.getByRole('dialog', { name: '개발일지 수정', exact: true });
      await expect(editor).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await editor.getByRole('button', { name: 'Cancel edit', exact: true }).click();
    } else {
      await expect(page.locator('.journal-page-content [role="status"]')).toContainText(
        '일지를 확인하지 못했습니다',
      );
    }
    await expect(searchButton(page)).toBeEnabled();
    await openSearch(page);
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });
}

test('an edit response after leaving the page cannot restore a detached draft', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v2/journals/' + id(201), async (route) => {
    await gate;
    await route.fulfill({ json: journal(1) });
  });
  await page.goto('/journals');
  await page.getByRole('button', { name: 'Journal 1 수정', exact: true }).click();
  await expect(searchButton(page)).toBeDisabled();
  const navigation = page.locator('.sidebar nav');
  await navigation.getByRole('button', { name: '나의 홈', exact: true }).click();
  await expect(page).toHaveURL('/');
  const response = page.waitForResponse('**/api/v2/journals/' + id(201));
  release();
  await (await response).finished();
  const confirmations: string[] = [];
  page.on('dialog', async (dialog) => {
    confirmations.push(dialog.message());
    await dialog.dismiss();
  });
  await navigation.getByRole('button', { name: '개발 일지', exact: true }).click();
  await expect(page).toHaveURL('/journals');
  const dialog = await openSearch(page);
  await dialog.getByLabel('현재 화면 검색').fill('이동 후 검색');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(confirmations).toEqual([]);
});

test('a real recovered draft can reject filter navigation without losing modal inputs', async ({
  page,
}) => {
  await page.goto('/journals');
  await page.getByRole('button', { name: '일지 작성', exact: true }).click();
  await page.getByLabel('일지 제목').fill('보존할 초안');
  await page.getByLabel('일지 설명').fill('세션 복구 후에도 남길 내용');
  // Retiring and restoring the same session retains JournalMemory but remounts the page.
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  const dialog = await openSearch(page);
  await dialog.getByLabel('현재 화면 검색').fill('취소해도 남을 검색');
  await dialog.getByLabel('일지 정렬').selectOption('oldest');
  const original = page.url();
  let confirmations = 0;
  const reject = async (confirmation: import('@playwright/test').Dialog) => {
    confirmations++;
    await confirmation.dismiss();
  };
  page.on('dialog', reject);
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  expect(confirmations).toBe(1);
  expect(page.url()).toBe(original);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('현재 화면 검색')).toHaveValue('취소해도 남을 검색');
  await expect(dialog.getByLabel('일지 정렬')).toHaveValue('oldest');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  // A second rejection confirms the first apply did not clear the detached editor memory.
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  expect(confirmations).toBe(2);
  page.off('dialog', reject);
  page.once('dialog', (confirmation) => confirmation.accept());
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(searchButton(page)).toBeFocused();
  expect(new URL(page.url()).searchParams.get('q')).toBe('취소해도 남을 검색');
});

for (const viewport of [
  { width: 1440, height: 900, label: 'desktop' },
  { width: 390, height: 844, label: 'mobile' },
  { width: 320, height: 740, label: 'narrow-mobile' },
  // Browser zoom at 200% halves the CSS viewport of a 1440 x 900 desktop.
  { width: 720, height: 450, label: '200-percent-reflow' },
]) {
  test(`search modal fits ${viewport.label} with long option names`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route('**/api/v1/project-categories', (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: id(90),
              name: '아주 긴 개발 분야 이름 '.repeat(6),
              revision: 1,
              createdAt: '2026-09-14T00:00:00Z',
              updatedAt: '2026-09-14T00:00:00Z',
            },
          ],
          total: 1,
        },
      }),
    );
    await page.route('**/api/v2/projects?*', (route) =>
      route.fulfill({
        json: {
          items: [{ ...project(1), name: '아주 긴 프로젝트 이름과 작업 맥락 '.repeat(8) }],
          total: 1,
          nextCursor: null,
        },
      }),
    );
    await page.goto('/journals');
    const dialog = await openSearch(page);
    await dialog.getByLabel('개발 분야 필터').selectOption(id(90));
    await dialog.getByLabel('일지 프로젝트 필터').selectOption(id(1));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    for (const label of [
      '현재 화면 검색',
      '개발 분야 필터',
      '일지 프로젝트 필터',
      '시작일',
      '종료일',
      '일지 정렬',
    ]) {
      const field = dialog.getByLabel(label);
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeInViewport();
    }
    await dialog.getByRole('button', { name: '적용', exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeInViewport();
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: testInfo.outputPath(`journal-search-${viewport.label}.png`),
    });
    if (viewport.label === '200-percent-reflow') {
      await dialog.getByRole('button', { name: '닫기', exact: true }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole('button', { name: '닫기', exact: true })).toBeInViewport();
      await expect(dialog).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: testInfo.outputPath('journal-search-200-percent-reflow-top.png'),
      });
    }
  });
}
