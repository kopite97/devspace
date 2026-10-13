import { test, expect, setup, task, id } from './fixtures';

test('creation has one header trigger and restores focus after cancel and save', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/tasks');
  const create = page.getByRole('button', { name: '태스크 추가', exact: true });
  await expect(create).toHaveCount(1);
  await expect(
    page.locator('.page-heading').getByRole('button', { name: '태스크 추가' }),
  ).toBeVisible();
  await create.click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(create).toBeFocused();
  await create.click();
  await page.getByLabel('태스크 제목').fill('상단에서 생성');
  await page.getByLabel('프로젝트', { exact: true }).selectOption(id(1));
  await page.getByRole('button', { name: '태스크 저장' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(create).toBeFocused();
});

test('board responds to its container and omits empty metadata without hiding priority', async ({
  page,
}) => {
  const state = await setup(page);
  state.tasks = [
    { ...task(50), tag: '', priority: 'normal' },
    { ...task(51), status: 'doing', tag: '', priority: 'high' },
  ];
  await page.goto('/tasks');
  await expect(page.locator('.task')).toHaveCount(2);
  await expect(page.locator('.task .badge')).toHaveCount(0);
  await expect(page.locator('.task-meta')).toHaveCount(1);
  // A narrow embedded board must stack even in a wide desktop viewport.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.task-board-container').evaluate((el) => {
    (el as HTMLElement).style.width = '340px';
  });
  const columns = await page.locator('.kanban-column').all();
  const first = (await columns[0].boundingBox())!;
  const next = (await columns[1].boundingBox())!;
  expect(next.x).toBeCloseTo(first.x, 0);
  expect(next.y).toBeGreaterThan(first.y + first.height);
  await page.getByLabel('Task 50 상태').selectOption('done');
  await expect(page.locator('.column-done')).toContainText('Task 50');
});
