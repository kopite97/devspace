import { test, expect, setup, project, journal, id } from './fixtures';

for (const empty of [false, true]) {
  test(`Project detail creates with locked project and refreshes recent list (empty ${empty})`, async ({
    page,
  }) => {
    await setup(page);
    // The current project need not occur in the active-options page.
    await page.route('**/api/v2/projects?*', (route) =>
      route.fulfill({ json: { items: [project(2)], total: 1, nextCursor: null } }),
    );
    let rows = empty ? [] : [journal(3), journal(2), journal(1)];
    const reads: URLSearchParams[] = [];
    await page.route('**/api/v2/journals?*', (route) => {
      reads.push(new URL(route.request().url()).searchParams);
      return route.fulfill({
        json: {
          items: rows.slice(0, 3),
          total: rows.length,
          nextCursor: rows.length > 3 ? 'more' : null,
        },
      });
    });
    const created = journal(4, {
      title: 'Project entry',
      body: 'First line\nSecond line',
      entryDate: '2026-09-14',
    });
    await page.route('**/api/v2/journals/' + created.id, (route) =>
      route.fulfill({ json: created }),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests: { body: unknown; key: string; csrf: string }[] = [];
    await page.route('**/api/v2/journals', async (route) => {
      requests.push({
        body: route.request().postDataJSON(),
        key: route.request().headers()['idempotency-key'],
        csrf: route.request().headers()['x-csrf-token'],
      });
      await gate;
      rows = [created, ...rows];
      await route.fulfill({ status: 201, json: created });
    });
    await page.goto('/projects/' + id(1));
    const section = page.getByRole('region', { name: '프로젝트 최근 일지', exact: true });
    await expect(section.getByRole('button', { name: '일지 작성' })).toHaveCount(1);
    await section.getByRole('button', { name: '일지 작성' }).last().click();
    await expect(page.getByLabel('프로젝트', { exact: true })).toHaveValue(id(1));
    await expect(page.getByLabel('프로젝트', { exact: true })).toBeDisabled();
    await page.getByLabel('일지 제목').fill(created.title);
    await page.getByLabel('작성일').fill(created.entryDate);
    await page.getByLabel('일지 설명').fill(created.body);
    await page.getByRole('button', { name: 'Save Journal' }).click();
    await expect.poll(() => requests.length).toBe(1);
    await expect(page.getByRole('button', { name: 'Retry creation' })).toBeDisabled();
    await page
      .locator('dialog form')
      .evaluate((form) =>
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
      );
    release();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(section.locator('.journal-row strong')).toHaveText(
      empty ? ['Project entry'] : ['Project entry', 'Journal 3', 'Journal 2'],
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({
      title: created.title,
      body: created.body,
      projectId: id(1),
      entryDate: '2026-09-14',
    });
    expect(requests[0].key).toBeTruthy();
    expect(requests[0].csrf).toBe('test-token');
    expect(reads.length).toBeGreaterThan(1);
    for (const params of reads) {
      expect(params.get('projectId')).toBe(id(1));
      expect(params.get('sort')).toBe('newest');
      expect(params.get('limit')).toBe('3');
    }
  });
}

for (const status of [503, 403]) {
  test(`failed Project Journal creation preserves draft and exact retry intent (${status})`, async ({
    page,
  }) => {
    await setup(page);
    const attempts: { body: unknown; key: string }[] = [];
    const created = journal(4, { title: 'Keep draft', body: 'Keep body', entryDate: '2026-09-14' });
    await page.route('**/api/v2/journals/' + created.id, (route) =>
      route.fulfill({ json: created }),
    );
    await page.route('**/api/v2/journals', (route) => {
      attempts.push({
        body: route.request().postDataJSON(),
        key: route.request().headers()['idempotency-key'],
      });
      return attempts.length === 1
        ? route.fulfill({
            status,
            json: { code: status === 403 ? 'CSRF_INVALID' : 'UNAVAILABLE', message: 'Try again' },
          })
        : route.fulfill({ status: 201, json: created });
    });
    await page.goto('/projects/' + id(1));
    await page.getByRole('button', { name: '일지 작성', exact: true }).first().click();
    await page.getByLabel('일지 제목').fill(created.title);
    await page.getByLabel('작성일').fill(created.entryDate);
    await page.getByLabel('일지 설명').fill(created.body);
    await page.getByRole('button', { name: 'Save Journal' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('일지 제목')).toHaveValue(created.title);
    await expect(page.getByLabel('일지 설명')).toHaveValue(created.body);
    await expect(page.getByLabel('작성일')).toHaveValue('2026-09-14');
    await expect(page.getByLabel('프로젝트', { exact: true })).toHaveValue(id(1));
    expect(attempts).toHaveLength(1);
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Abandon creation' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Retry creation' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
  });
}

test('archived Project has no Journal creation actions, including its empty state', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/v2/projects/' + id(1), (route) =>
    route.fulfill({ json: project(1, 'archived') }),
  );
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/journals')) writes++;
  });
  await page.goto('/projects/' + id(1));
  const section = page.getByRole('region', { name: '프로젝트 최근 일지', exact: true });
  await expect(section.getByText('이 프로젝트의 개발일지가 없어요')).toBeVisible();
  await expect(section.getByRole('button', { name: '일지 작성' })).toHaveCount(0);
  expect(writes).toBe(0);
});
