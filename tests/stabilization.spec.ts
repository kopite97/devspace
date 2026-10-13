import { test, expect } from '@playwright/test';

test('sidebar bottom is reachable at short desktop and landscape sizes', async ({ page }) => {
  for (const [width, height] of [
    [1366, 768],
    [1280, 600],
    [844, 390],
    [390, 500],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    if (width <= 680) await page.getByRole('button', { name: '메뉴 열기' }).click();
    await page.locator('.profile').scrollIntoViewIfNeeded();
    const bounds = await page.locator('.profile').boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height + 1);
    await page.locator('.profile').click();
    await expect(page.getByRole('dialog', { name: '개인 작업실 안내' })).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('real task drag persists without moving widgets and accepts empty columns', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '배치 편집', exact: true }).click();
  const titles = await page.locator('.widget-header h2').allTextContents();
  await page
    .locator('.task')
    .filter({ hasText: '인벤토리 UI 구현' })
    .dragTo(page.locator('.column-doing'));
  await expect(page.locator('.column-doing')).toContainText('인벤토리 UI 구현');
  expect(await page.locator('.widget-header h2').allTextContents()).toEqual(titles);
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.reload();
  await expect(page.locator('.column-doing')).toContainText('인벤토리 UI 구현');
  await page.getByRole('button', { name: '작업 보드', exact: true }).click();
  await page.getByRole('button', { name: '서버 · 웹 개발', exact: true }).click();
  await expect(page.locator('.column-done .task')).toHaveCount(0);
  await page
    .locator('.task')
    .filter({ hasText: '인증 API 테스트' })
    .dragTo(page.locator('.column-done'));
  await expect(page.locator('.column-done')).toContainText('인증 API 테스트');
});

test('journal creation validates, persists and appears on the home widget', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '개발 일지', exact: true }).click();
  await page.getByRole('button', { name: '일지 작성', exact: true }).click();
  await page.getByRole('button', { name: '일지 저장' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('일지 제목').fill('오늘의 테스트 기록');
  await page.getByRole('combobox', { name: '프로젝트', exact: true }).selectOption('api');
  await page.getByLabel('일지 설명').fill('서버 없이 로컬 저장을 검증했습니다.');
  await page.getByRole('button', { name: '일지 저장' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.document-row').first()).toContainText('오늘의 테스트 기록');
  await page.getByRole('button', { name: '나의 홈', exact: true }).click();
  await expect(page.locator('.journal-list')).toContainText('오늘의 테스트 기록');
  await page.reload();
  await expect(page.locator('.journal-list')).toContainText('오늘의 테스트 기록');
  await page.locator('.journal-row').filter({ hasText: '오늘의 테스트 기록' }).click();
  await expect(page.getByRole('dialog')).toContainText('서버 없이 로컬 저장을 검증했습니다.');
});

async function failStorage(page: import('@playwright/test').Page, key: string) {
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreStorage: () => void }).restoreStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (k, value) {
      if (k === key) throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, k, value);
    };
  }, key);
}
async function restoreStorage(page: import('@playwright/test').Page) {
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
}

test('failed layout save retains draft and can retry', async ({ page }) => {
  await page.goto('/');
  await failStorage(page, 'devspace.layout.v1');
  await page.getByRole('button', { name: '배치 편집', exact: true }).click();
  await page.getByRole('button', { name: '빠른 링크 제거', exact: true }).click();
  await page.getByRole('button', { name: '배치 저장' }).click();
  await expect(page.getByRole('alert')).toContainText('저장하지 못했습니다');
  await expect(page.getByRole('button', { name: '배치 저장' })).toBeVisible();
  await expect(page.locator('.widget')).toHaveCount(5);
  await expect(page.getByText('배치를 적용했습니다.', { exact: true })).toHaveCount(0);
  await restoreStorage(page);
  await page.getByRole('button', { name: '배치 저장' }).click();
  await page.reload();
  await expect(page.locator('.widget')).toHaveCount(5);
});

test('journal failed save and discard cancellation preserve input', async ({ page }) => {
  await page.goto('/');
  await failStorage(page, 'devspace.journals.v1');
  await page.getByRole('button', { name: '개발 일지', exact: true }).click();
  await page.getByRole('button', { name: '일지 작성', exact: true }).click();
  await page.getByLabel('일지 제목').fill('보호할 초안');
  await page.getByRole('combobox', { name: '프로젝트', exact: true }).selectOption('forest');
  await page.getByLabel('일지 설명').fill('작성 중인 내용');
  await page.getByRole('button', { name: '일지 저장' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('입력 내용은 유지');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('일지 제목')).toHaveValue('보호할 초안');
  await restoreStorage(page);
  await page.getByRole('button', { name: '일지 저장' }).click();
  await expect(page.locator('.document-row')).toHaveCount(4);
});

test('unsaved layout raises beforeunload and failed task save leaves last saved state', async ({
  page,
}) => {
  await page.goto('/');
  await failStorage(page, 'devspace.tasks.v1');
  await page.getByLabel('인벤토리 UI 구현 상태').selectOption('done');
  await expect(page.getByLabel('인벤토리 UI 구현 상태')).toHaveValue('todo');
  await restoreStorage(page);
  await page.getByRole('button', { name: '배치 편집', exact: true }).click();
  await page.getByRole('button', { name: '빠른 링크 제거', exact: true }).click();
  const eventPrevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(eventPrevented).toBe(true);
  await page.getByRole('button', { name: '개발 일지', exact: true }).click();
  await expect(page.getByRole('button', { name: '배치 저장', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('배치 편집을 저장하거나 취소');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.locator('.widget')).toHaveCount(5);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.locator('.widget')).toHaveCount(6);
  expect(
    await page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    }),
  ).toBe(false);
});
