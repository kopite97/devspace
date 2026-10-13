import { test, expect, type Page } from '@playwright/test';

async function storageFailure(page: Page, key: string, fail: boolean) {
  await page.evaluate(
    ({ key, fail }) => {
      const state = window as unknown as { originalSet?: typeof Storage.prototype.setItem };
      state.originalSet ??= Storage.prototype.setItem;
      Storage.prototype.setItem = fail
        ? function (k, value) {
            if (k === key) throw new DOMException('Full', 'QuotaExceededError');
            state.originalSet!.call(this, k, value);
          }
        : state.originalSet;
    },
    { key, fail },
  );
}

test('journal edits retain drafts on failure, filter by date/project, and delete persistently', async ({
  page,
}) => {
  await page.goto('/journals');
  await page.getByRole('button', { name: '일지 작성', exact: true }).click();
  await page.getByLabel('일지 제목').fill('후속 관리 테스트');
  await page.getByRole('combobox', { name: '프로젝트', exact: true }).selectOption('forest');
  await page.getByLabel('작성일', { exact: true }).fill('2026-09-01');
  await page.getByLabel('일지 설명').fill('기존 본문');
  await page.getByRole('button', { name: '일지 저장' }).click();
  await page.getByRole('button', { name: '후속 관리 테스트 수정', exact: true }).click();
  await page.getByLabel('일지 제목').fill('수정된 일지');
  await storageFailure(page, 'devspace.journals.v1', true);
  await page.getByRole('button', { name: '일지 저장' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('일지 제목')).toHaveValue('수정된 일지');
  await storageFailure(page, 'devspace.journals.v1', false);
  await page.getByRole('button', { name: '일지 저장' }).click();
  await page.reload();
  await page.getByLabel('시작일', { exact: true }).fill('2026-09-01');
  await page.getByLabel('종료일', { exact: true }).fill('2026-09-01');
  await page.getByLabel('일지 프로젝트 필터').selectOption('forest');
  await expect(page.locator('.document-row')).toHaveCount(1);
  await expect(page.locator('.document-row')).toContainText('수정된 일지');
  await page.getByLabel('일지 프로젝트 필터').selectOption('api');
  await expect(page.locator('.document-row')).toHaveCount(0);
  await page.getByRole('button', { name: '일지 필터 초기화' }).click();
  await page.getByLabel('일지 정렬').selectOption('oldest');
  await expect(page.locator('.document-row').first()).toContainText('수정된 일지');
  await page.getByRole('button', { name: '수정된 일지 삭제', exact: true }).click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '수정된 일지 삭제', exact: true }).click();
  await storageFailure(page, 'devspace.journals.v1', true);
  await page.getByRole('button', { name: '삭제 확인' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.locator('.document-row').filter({ hasText: '수정된 일지' })).toHaveCount(1);
  await storageFailure(page, 'devspace.journals.v1', false);
  await page.getByRole('button', { name: '삭제 확인' }).click();
  await page.reload();
  await expect(page.locator('.document-row').filter({ hasText: '수정된 일지' })).toHaveCount(0);
});

test('project widget count and selection survive failed save and reload, then open detail', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '배치 편집', exact: true }).click();
  await page.getByRole('button', { name: '작업 보드 설정', exact: true }).click();
  await page.getByLabel('특정 프로젝트').selectOption('forest');
  await page.getByLabel('표시 개수').fill('1');
  await page.getByRole('button', { name: '설정 적용' }).click();
  await storageFailure(page, 'devspace.layout.v1', true);
  await page.getByRole('button', { name: '배치 저장' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const board = page
    .locator('.widget')
    .filter({ has: page.getByRole('heading', { name: '작업 보드', exact: true }) });
  await expect(board.locator('.task')).toHaveCount(1);
  await storageFailure(page, 'devspace.layout.v1', false);
  await page.getByRole('button', { name: '배치 저장' }).click();
  await page.reload();
  await expect(board.locator('.task')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 600 });
  await board.getByRole('button', { name: /상세 보기/ }).click();
  await expect(page).toHaveURL(/\/projects\/forest$/);
});

test('all project widgets respect limits, archived projects, and missing selections', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '배치 편집', exact: true }).click();
  for (const title of ['프로젝트 한눈에 보기', '최근 개발 일지', '다가오는 마일스톤']) {
    await page.getByRole('button', { name: `${title} 설정`, exact: true }).click();
    await page.getByLabel('표시 개수').fill('1');
    await page.getByRole('button', { name: '설정 적용' }).click();
  }
  await page.getByRole('button', { name: '배치 저장' }).click();
  await page.reload();
  await expect(page.locator('.project-row')).toHaveCount(1);
  await expect(page.locator('.journal-row')).toHaveCount(1);
  await expect(page.locator('.milestone')).toHaveCount(1);
  await page.getByRole('button', { name: '배치 편집', exact: true }).click();
  await page.getByRole('button', { name: '최근 개발 일지 설정', exact: true }).click();
  await page.getByLabel('특정 프로젝트').selectOption('api');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('특정 프로젝트')).toHaveValue('api');
  await page.getByRole('button', { name: '설정 적용' }).click();
  await page.getByRole('button', { name: '배치 저장' }).click();
  await expect(page.locator('.journal-list')).toContainText('JWT 인증 흐름 정리');
  await page.goto('/projects/api');
  await page.getByRole('button', { name: '프로젝트 편집', exact: true }).click();
  await page.getByLabel('프로젝트 이름').fill('보관 API');
  await page.getByRole('button', { name: '프로젝트 저장', exact: true }).click();
  await page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('devspace.projects.v1')!);
    projects.find((p: { id: string }) => p.id === 'api').archived = true;
    localStorage.setItem('devspace.projects.v1', JSON.stringify(projects));
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '보관 API 상세 보기' })).toBeVisible();
  await expect(page.locator('.journal-list')).toContainText('보관 API');
  await page.evaluate(() => {
    const layout = JSON.parse(localStorage.getItem('devspace.layout.v1')!);
    layout.find((w: { type: string }) => w.type === 'journal').projectId = 'missing';
    localStorage.setItem('devspace.layout.v1', JSON.stringify(layout));
  });
  await page.reload();
  await expect(page.getByText('선택한 프로젝트가 없어요')).toBeVisible();
});

test('long journal content fits mobile and editing/deleting synchronizes home', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/journals');
  await page.getByRole('button', { name: '일지 작성', exact: true }).click();
  const title = '긴제목'.repeat(40);
  await page.getByLabel('일지 제목').fill(title);
  await page.getByRole('combobox', { name: '프로젝트', exact: true }).selectOption('forest');
  await page.getByLabel('일지 설명').fill('긴본문'.repeat(1000));
  await page.getByRole('button', { name: '일지 저장' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: `${title} 수정`, exact: true }).click();
  await page.getByLabel('일지 제목').fill('홈 동기화');
  await page.getByRole('button', { name: '일지 저장' }).click();
  await page.goto('/');
  await expect(page.locator('.journal-list')).toContainText('홈 동기화');
  await page.goto('/journals');
  await page.getByRole('button', { name: '홈 동기화 삭제', exact: true }).click();
  await page.getByRole('button', { name: '삭제 확인' }).click();
  await page.goto('/');
  await expect(page.locator('.journal-list')).not.toContainText('홈 동기화');
});
