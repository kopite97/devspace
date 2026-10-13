import { test, expect, setup, task, id, identity, project } from './fixtures';
test('Task Category/search deep links survive reload and history restores filters', async ({
  page,
}) => {
  const state = await setup(page);
  state.tasks[0].title = 'Literal %_ title';
  await page.goto('/tasks?category=uncategorized&q=%25_');
  await expect(page.getByLabel('현재 화면 검색')).toHaveValue('%_');
  await expect(page.getByRole('button', { name: 'Literal %_ title', exact: true })).toBeVisible();
  const length = await page.evaluate(() => history.length);
  await page.getByLabel('현재 화면 검색').fill('Literal');
  await expect(page).toHaveURL(/q=Literal/);
  expect(await page.evaluate(() => history.length)).toBe(length + 1);
  await page.reload();
  await expect(page.getByLabel('현재 화면 검색')).toHaveValue('Literal');
  await page.getByLabel('현재 화면 검색').fill('No match');
  await page.getByRole('button', { name: '검색·필터 초기화' }).click();
  await expect(page).toHaveURL('/tasks?category=all');
});

test('same-account checking retains a draft; account change destroys it without a queued write', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Task 50', exact: true }).click();
  await page.getByLabel('태스크 제목').fill('Detached draft');
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.getByLabel('태스크 제목')).toHaveValue('Detached draft');
  state.identity = { ...identity, id: id(111), workspace: { ...identity.workspace, id: id(112) } };
  state.tasks = [{ ...task(60), title: 'Account B Task' }];
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Account B Task', exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
});
for (const status of [200, 401, 403])
  test(`late account-A ${status} cannot alter account B`, async ({ page }) => {
    const state = await setup(page);
    let release!: () => void;
    const wait = new Promise<void>((r) => {
      release = r;
    });
    let old = true;
    await page.route('**/api/v2/tasks?*', async (route) => {
      if (!old) return route.fallback();
      await wait;
      return route.fulfill({
        status,
        json:
          status === 200
            ? { items: [{ ...task(), title: 'Late A' }], total: 1, nextCursor: null }
            : { code: status === 401 ? 'AUTH_REQUIRED' : 'ACCOUNT_DISABLED' },
      });
    });
    await page.goto('/tasks');
    old = false;
    state.identity = {
      ...identity,
      id: id(111),
      workspace: { ...identity.workspace, id: id(112) },
    };
    state.tasks = [{ ...task(60), title: 'Account B' }];
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
    );
    await expect(page.getByRole('button', { name: 'Account B', exact: true })).toBeVisible();
    release();
    await expect(page.getByText('Late A', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Account B', exact: true })).toBeVisible();
  });
test('CSRF recovery never replays a creation automatically and retains its exact key/body', async ({
  page,
}) => {
  await setup(page);
  const writes: { key?: string; body: string | null }[] = [];
  await page.route('**/api/v2/tasks', (route) => {
    writes.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postData(),
    });
    return route.fulfill({ status: 403, json: { code: 'CSRF_INVALID', message: 'refresh' } });
  });
  await page.goto('/tasks');
  await page.getByRole('button', { name: '태스크 추가', exact: true }).first().click();
  await page.getByLabel('태스크 제목').fill('CSRF draft');
  await page.getByLabel('프로젝트', { exact: true }).selectOption(id(1));
  await page.getByRole('button', { name: '태스크 저장' }).click();
  await expect(page.getByLabel('태스크 제목')).toHaveValue('CSRF draft');
  await expect(page.getByRole('button', { name: '태스크 저장' })).toBeEnabled();
  expect(writes).toHaveLength(1);
  await page.getByRole('button', { name: '태스크 저장' }).click();
  await expect(page.getByRole('alert').last()).toContainText('Session security failed again');
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
});
test('Project options paginate and independently retain the archived relation', async ({
  page,
}) => {
  const state = await setup(page);
  state.tasks[0].projectId = id(99);
  await page.route('**/api/v2/projects?*', (route) => {
    const more = new URL(route.request().url()).searchParams.has('cursor');
    return route.fulfill({
      json: {
        items: more ? [project(21)] : Array.from({ length: 20 }, (_, i) => project(i + 1)),
        total: 21,
        nextCursor: more ? null : 'next',
      },
    });
  });
  await page.route('**/api/v2/projects/' + id(99), (route) =>
    route.fulfill({ json: { ...project(99), status: 'archived' } }),
  );
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Task 50', exact: true }).click();
  await expect(page.getByLabel('프로젝트', { exact: true })).toHaveValue(id(99));
  await expect(
    page.getByLabel('프로젝트', { exact: true }).locator('option:checked'),
  ).toContainText('보관됨');
  await page.getByRole('dialog').getByRole('button', { name: '프로젝트 더 불러오기' }).click();
  await expect(
    page.getByLabel('프로젝트', { exact: true }).locator('option[value="' + id(21) + '"]'),
  ).toHaveCount(1);
  await page.getByLabel('태스크 제목').fill('Archived kept');
  await page.getByRole('button', { name: '태스크 저장' }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body).toEqual({ title: 'Archived kept', revision: 1 });
});
test('Home budget remains combined after status movement and stats exceed loaded rows', async ({
  page,
}) => {
  const state = await setup(page);
  state.tasks = Array.from({ length: 35 }, (_, i) => ({
    ...task(i + 50),
    status: ['todo', 'doing', 'done'][i % 3],
  }));
  await page.goto('/');
  await expect(page.locator('.task')).toHaveCount(20);
  expect(
    state.requests
      .filter((u) => u.pathname === '/api/v2/tasks' && u.searchParams.get('deleted') === 'false')
      .every((u) => !u.searchParams.has('status') && u.searchParams.get('limit') === '20'),
  ).toBe(true);
  await expect(page.locator('.column-todo .count')).toHaveText('12');
  await page.getByLabel('Task 50 상태').selectOption('done');
  await expect(page.locator('.task')).toHaveCount(20);
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body).toEqual({ revision: 1, status: 'done' });
  state.tasks = state.tasks.map((row, index) => ({ ...row, status: index < 20 ? 'done' : 'todo' }));
  await page.reload();
  await expect(page.locator('.task')).toHaveCount(20);
  await expect(page.locator('.column-todo .count')).toHaveText('15');
  await expect(page.locator('.column-todo .column-empty')).toHaveText('표시 범위에 작업이 없어요');
});
test('Task cards keep accessible controls and editor focus/discard', async ({ page }) => {
  await setup(page);
  await page.goto('/tasks');
  await expect(page.locator('.task')).toHaveCount(1);
  await page.getByRole('button', { name: 'Task 50', exact: true }).click();
  await page.getByLabel('태스크 제목').fill('Guarded');
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  page.once('dialog', (d) => d.dismiss());
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('태스크 제목')).toHaveValue('Guarded');
  page.once('dialog', (d) => d.accept());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Task 50', exact: true })).toBeFocused();
  for (const [width, height] of [
    [1280, 600],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const box = await page.getByLabel('Task 50 상태').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
