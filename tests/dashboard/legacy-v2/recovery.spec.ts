import { test, expect, setup, identity, id, dashboard, defaults, project } from './fixtures';
test('Home logout remains reachable after long-page scroll at landscape size', async ({ page }) => {
  await setup(page);
  let loggedOut = false;
  await page.route('**/api/v1/me', (r) =>
    loggedOut
      ? r.fulfill({ status: 401, json: { code: 'AUTH_REQUIRED' } })
      : r.fulfill({ json: identity }),
  );
  await page.route('**/api/v1/auth/logout', (r) => {
    loggedOut = true;
    return r.fulfill({ status: 204 });
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await expect(page.locator('.widget')).toHaveCount(6);
  await page.getByRole('button', { name: '??? ??', exact: true }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click({ timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
});
test('layout and intermediate widget fields survive same identity recovery but never another account', async ({
  page,
}) => {
  await setup(page);
  let account = identity,
    failed = false;
  await page.route('**/api/v1/me', (r) =>
    failed ? r.fulfill({ status: 503, json: {} }) : r.fulfill({ json: account }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '배치 편집', exact: true }).click();
  await page.getByRole('button', { name: '프로젝트 개요 설정', exact: true }).click();
  await page.getByLabel('위젯 제목', { exact: true }).fill('보존된 제목');
  await page.getByLabel('표시 개수').fill('13');
  failed = true;
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.getByRole('heading', { name: 'Connection problem' })).toBeVisible();
  failed = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByLabel('위젯 제목', { exact: true })).toHaveValue('보존된 제목');
  await expect(page.getByLabel('표시 개수')).toHaveValue('13');
  account = {
    ...identity,
    id: id(201),
    displayName: 'Bob',
    workspace: { ...identity.workspace, id: id(202) },
  };
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.getByRole('region', { name: 'Bob · Workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '배치 편집', exact: true })).toBeVisible();
});
for (const status of [200, 401, 403])
  test('late PUT ' + status + ' cannot publish or expire next account', async ({ page }) => {
    await setup(page);
    let account = identity,
      started = false;
    let release!: () => void;
    const pending = new Promise<void>((r) => {
      release = r;
    });
    await page.route('**/api/v1/me', (r) => r.fulfill({ json: account }));
    await page.route('**/api/v2/dashboards/home', async (r) => {
      if (r.request().method() === 'PUT') {
        started = true;
        await pending;
        return r.fulfill({
          status,
          json:
            status === 200
              ? dashboard(1, [])
              : { code: status === 401 ? 'AUTH_REQUIRED' : 'ACCOUNT_DISABLED' },
        });
      }
      return r.fulfill({ json: dashboard() });
    });
    await page.goto('/');
    await page.getByRole('button', { name: '배치 편집', exact: true }).click();
    await page.getByRole('button', { name: '배치 저장' }).click();
    await expect.poll(() => started).toBe(true);
    account = {
      ...identity,
      id: id(201),
      displayName: 'Bob',
      workspace: { ...identity.workspace, id: id(202) },
    };
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
    );
    await expect(page.getByRole('region', { name: 'Bob · Workspace', exact: true })).toBeVisible();
    release();
    await expect(page.locator('.widget')).toHaveCount(6);
    await expect(page.getByRole('button', { name: '배치 편집', exact: true })).toBeVisible();
    await expect(page.getByText('배치를 적용했습니다.')).toHaveCount(0);
  });
test('Overview omitted limit keeps pages and confirmed rows on failure; explicit limit only bounds rows', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/v2/dashboards/home', (r) =>
    r.fulfill({
      json: dashboard(1, [
        defaults[0],
        { ...defaults[0], id: 'limited', limit: 1 } as (typeof defaults)[0],
      ]),
    }),
  );
  let failed = true;
  await page.route('**/api/v2/projects?*', (r) => {
    const next = new URL(r.request().url()).searchParams.has('cursor');
    return r.fulfill(
      next && failed
        ? { status: 503, json: {} }
        : {
            json: {
              items: next ? [project(21)] : [project(1), project(2)],
              total: 21,
              nextCursor: next ? null : 'next',
            },
          },
    );
  });
  await page.goto('/');
  const full = page.locator('[data-widget-id="home-overview"]'),
    limited = page.locator('[data-widget-id="limited"]');
  await expect(full.locator('.project-row')).toHaveCount(2);
  await expect(limited.locator('.project-row')).toHaveCount(1);
  await expect(limited.getByRole('button', { name: '프로젝트 더 보기' })).toHaveCount(0);
  await full.getByRole('button', { name: '프로젝트 더 보기' }).click();
  await expect(full.getByRole('alert')).toBeVisible();
  await expect(full.locator('.project-row')).toHaveCount(2);
  failed = false;
  await full.getByRole('button', { name: '프로젝트 다시 시도' }).click();
  await expect(full.locator('.project-row')).toHaveCount(3);
  await expect(limited.locator('.project-row')).toHaveCount(1);
  await expect(full.locator('.stats strong').first()).toHaveText('2개');
});
test('repeated boards have separate drafts and layout changes require unsaved navigation review', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/v2/dashboards/home', (r) =>
    r.fulfill({
      json: dashboard(1, [
        { ...defaults[1], id: 'a' },
        { ...defaults[1], id: 'b' },
      ]),
    }),
  );
  await page.goto('/');
  await page
    .locator('[data-widget-id="a"]')
    .getByRole('button', { name: '태스크 추가', exact: true })
    .click();
  await page.getByLabel('태스크 제목', { exact: true }).fill('첫 번째 보드 초안');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByLabel('태스크 제목', { exact: true })).toHaveValue('첫 번째 보드 초안');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page
    .locator('[data-widget-id="b"]')
    .getByRole('button', { name: '태스크 추가', exact: true })
    .click();
  await expect(page.getByLabel('태스크 제목', { exact: true })).toHaveValue('');
});
