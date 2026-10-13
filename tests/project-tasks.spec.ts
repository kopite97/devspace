import { test, expect, type Page } from '@playwright/test';

async function openProjects(page: Page) {
  await page
    .locator('nav')
    .getByRole('button', { name: /^프로젝트/ })
    .click();
}
async function createProject(page: Page) {
  await openProjects(page);
  await page.getByRole('button', { name: '프로젝트 추가', exact: true }).click();
  await page.getByLabel('프로젝트 이름').fill('새 게임');
  await page.getByLabel('기술 스택').fill('Unity · C#');
  await page.getByLabel('저장소 URL').fill('https://github.com/example/game');
  await page.getByRole('button', { name: '프로젝트 저장' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
test('project creation, rename and archive preserve task and journal relationships', async ({
  page,
}) => {
  await page.goto('/');
  await createProject(page);
  await page.getByRole('button', { name: '작업 보드', exact: true }).click();
  await page.getByRole('button', { name: '태스크 추가', exact: true }).click();
  await page.getByLabel('태스크 제목').fill('점프 기능');
  await page
    .getByRole('combobox', { name: '프로젝트', exact: true })
    .selectOption({ label: '새 게임' });
  await page.getByLabel('상세 내용').fill('점프 높이를 조절합니다.');
  await page.getByRole('button', { name: '태스크 저장' }).click();
  await page.getByRole('button', { name: '개발 일지', exact: true }).click();
  await page.getByRole('button', { name: '일지 작성', exact: true }).click();
  await page.getByLabel('일지 제목').fill('첫 개발 기록');
  await page
    .getByRole('combobox', { name: '프로젝트', exact: true })
    .selectOption({ label: '새 게임' });
  await page.getByLabel('일지 설명').fill('점프 프로토타입을 시작했습니다.');
  await page.getByRole('button', { name: '일지 저장' }).click();
  await openProjects(page);
  await page.locator('.project-row').filter({ hasText: '새 게임' }).click();
  await page.getByRole('button', { name: '프로젝트 편집', exact: true }).click();
  await page.getByLabel('프로젝트 이름').fill('새 게임 v2');
  await page.getByRole('button', { name: '프로젝트 저장' }).click();
  await page.getByRole('button', { name: '작업 보드', exact: true }).click();
  await expect(page.locator('.task').filter({ hasText: '점프 기능' })).toContainText('새 게임 v2');
  await page.getByRole('button', { name: '개발 일지', exact: true }).click();
  await expect(page.locator('.document-row').filter({ hasText: '첫 개발 기록' })).toContainText(
    '새 게임 v2',
  );
  await openProjects(page);
  await page.locator('.project-row').filter({ hasText: '새 게임 v2' }).click();
  await page.getByRole('button', { name: '프로젝트 편집', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '프로젝트 보관', exact: true }).click();
  await expect(page.locator('.project-row').filter({ hasText: '새 게임 v2' })).toHaveCount(0);
  await page.getByRole('button', { name: '프로젝트 목록', exact: true }).click();
  await page.getByRole('button', { name: '보관된 프로젝트', exact: true }).click();
  await page.locator('.project-row').filter({ hasText: '새 게임 v2' }).click();
  await page.getByRole('button', { name: '프로젝트 편집', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '보관 해제', exact: true }).click();
  await page.reload();
  await expect(page.locator('h1')).toHaveText('새 게임 v2');
  await expect(page.locator('.task').filter({ hasText: '점프 기능' })).toContainText('새 게임 v2');
});

test('home task edit, delete, reload and trash restore', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '인벤토리 UI 구현', exact: true }).click();
  await page.getByLabel('태스크 제목').fill('인벤토리 개선');
  await page.getByLabel('우선순위').selectOption('보통');
  await page.getByLabel('태그').fill('UI');
  await page.getByRole('button', { name: '태스크 저장' }).click();
  await page.getByRole('button', { name: '인벤토리 개선', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '태스크 삭제', exact: true }).click();
  await expect(page.locator('.task').filter({ hasText: '인벤토리 개선' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '휴지통 (1)', exact: true }).click();
  await page.getByRole('button', { name: '인벤토리 개선 복구', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.task').filter({ hasText: '인벤토리 개선' })).toContainText('UI');
  await page.reload();
  await expect(page.locator('.task').filter({ hasText: '인벤토리 개선' })).toHaveCount(1);
});

test('failed project and task saves keep forms open for retry', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restore: () => void }).restore = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'devspace.projects.v1' || key === 'devspace.tasks.v1')
        throw new DOMException('full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await openProjects(page);
  await page.getByRole('button', { name: '프로젝트 추가', exact: true }).click();
  await page.getByLabel('프로젝트 이름').fill('저장 재시도');
  await page.getByLabel('기술 스택').fill('Java');
  await page.getByRole('button', { name: '프로젝트 저장' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('저장하지 못했습니다');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByRole('button', { name: '작업 보드', exact: true }).click();
  await page.getByRole('button', { name: '태스크 추가', exact: true }).click();
  await page.getByLabel('태스크 제목').fill('실패 후 저장');
  await page.getByRole('combobox', { name: '프로젝트', exact: true }).selectOption('forest');
  await page.getByRole('button', { name: '태스크 저장' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('저장하지 못했습니다');
  await page.evaluate(() => (window as unknown as { restore: () => void }).restore());
  await page.getByRole('button', { name: '태스크 저장' }).click();
  await expect(page.locator('.task').filter({ hasText: '실패 후 저장' })).toHaveCount(1);
});
