import { test, expect, setup, id } from './fixtures';
import type { Page } from '@playwright/test';
const link = (n: number, extra: Record<string, unknown> = {}) => ({
  id: id(n),
  revision: 1,
  position: n - 1,
  createdAt: '2026-09-14T00:00:00Z',
  updatedAt: '2026-09-14T00:00:00Z',
  label:
    ['GitHub', 'Unity Documentation', 'Spring Documentation', 'React Documentation'][n - 1] ??
    'Link ' + n,
  description:
    ['코드와 저장소', '게임 개발 레퍼런스', '서버 개발 레퍼런스', '프론트엔드 레퍼런스'][n - 1] ??
    '',
  url:
    [
      'https://github.com',
      'https://docs.unity3d.com',
      'https://docs.spring.io',
      'https://react.dev',
    ][n - 1] ?? 'https://example.com/' + n,
  projectId: n === 3 || n === 4 ? id(2) : null,
  projectName: n === 3 || n === 4 ? 'Project 2' : null,
  categoryId: n === 3 || n === 4 ? id(900) : null,
  ...extra,
});
async function backend(page: Page) {
  await setup(page);
  const state = {
    rows: [link(1), link(2), link(3), link(4)],
    revision: 4,
    fail: '',
    calls: [] as { method: string; body: Record<string, unknown>; key: string | undefined }[],
    conflict: false,
  };
  const replay = new Map<string, unknown>();
  await page.route('**/api/v2/links**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const body = req.postDataJSON() ?? {};
    const key = req.headers()['idempotency-key'];
    if (method !== 'GET') state.calls.push({ method, body, key });
    if (state.fail === method) {
      await route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR', message: '일시 오류' } });
      return;
    }
    if (state.conflict && method !== 'GET') {
      state.conflict = false;
      state.revision++;
      state.rows[0] = { ...state.rows[0], label: 'External', revision: 2 };
      await route.fulfill({ status: 409, json: { code: 'REVISION_CONFLICT', message: '충돌' } });
      return;
    }
    const wrap = (items = state.rows) => ({
      items,
      total: items.length,
      nextCursor: null,
      collectionRevision: state.revision,
    });
    if (method === 'GET') {
      if (url.pathname === '/api/v2/links') {
        const category = url.searchParams.get('category');
        const query = url.searchParams.get('query')?.toLowerCase() ?? '';
        await route.fulfill({
          json: wrap(
            state.rows.filter(
              (l) =>
                (!category ||
                  category === 'all' ||
                  (category === 'uncategorized'
                    ? l.categoryId === null
                    : l.categoryId === category)) &&
                (!url.searchParams.has('projectId') ||
                  l.projectId === url.searchParams.get('projectId')) &&
                [l.label, l.description, l.url].some((x) => x.toLowerCase().includes(query)),
            ),
          ),
        });
      } else {
        const row = state.rows.find((l) => l.id === url.pathname.split('/').pop());
        await route.fulfill({
          status: row ? 200 : 404,
          json: row ?? { code: 'RESOURCE_NOT_FOUND' },
        });
      }
      return;
    }
    if (method === 'POST') {
      if (replay.has(key!)) {
        await route.fulfill({ status: 201, json: replay.get(key!) });
        return;
      }
      const item = link(20 + state.calls.length, {
        ...body,
        revision: 1,
        position: Math.max(-1, ...state.rows.map((l) => l.position)) + 1,
      });
      state.rows.push(item);
      state.revision++;
      const result = { item, collectionRevision: state.revision };
      replay.set(key!, result);
      await route.fulfill({ status: 201, json: result });
      return;
    }
    if (method === 'PUT') {
      expect(url.search).toBe('');
      expect(body.collectionRevision).toBe(state.revision);
      expect([...body.ids].sort()).toEqual(state.rows.map((l) => l.id).sort());
      state.rows = body.ids.map((key: string, i: number) => {
        const l = state.rows.find((l) => l.id === key)!;
        return { ...l, position: i, revision: l.revision + (l.position === i ? 0 : 1) };
      });
      state.revision++;
      await route.fulfill({ json: wrap() });
      return;
    }
    const index = state.rows.findIndex((l) => l.id === url.pathname.split('/').pop());
    const target = state.rows[index];
    if (!target) {
      await route.fulfill({ status: 404, json: { code: 'RESOURCE_NOT_FOUND' } });
      return;
    }
    if (method === 'PATCH') {
      expect(body.revision).toBe(target.revision);
      state.rows[index] = { ...target, ...body, revision: target.revision + 1 };
      state.revision++;
      await route.fulfill({
        json: { item: state.rows[index], collectionRevision: state.revision },
      });
    }
    if (method === 'DELETE') {
      expect(url.searchParams.get('revision')).toBe(String(target.revision));
      expect(req.postData()).toBeNull();
      state.rows.splice(index, 1);
      state.revision++;
      await route.fulfill({ json: { deletedId: target.id, collectionRevision: state.revision } });
    }
  });
  return state;
}
test('preserved library creates edits reorders filters and permanently deletes', async ({
  page,
}) => {
  const server = await backend(page);
  await page.goto('/library');
  await page.getByRole('button', { name: '링크 추가', exact: true }).click();
  await page.getByLabel('링크 이름').fill('테스트 링크');
  await page.getByLabel('URL', { exact: true }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: '링크 저장' }).click();
  await expect(page.getByRole('alert')).toContainText('http');
  await page.getByLabel('URL', { exact: true }).fill('https://example.com');
  await page.getByLabel('설명', { exact: true }).fill('  preserve  ');
  await page.getByRole('button', { name: '링크 저장' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(server.rows.at(-1)?.description).toBe('  preserve  ');
  await page.getByRole('button', { name: '테스트 링크 위로', exact: true }).click();
  await expect(page.locator('.quick-links strong').nth(3)).toHaveText('테스트 링크');
  await page.getByRole('button', { name: '테스트 링크 편집', exact: true }).click();
  await page.getByLabel('링크 이름').fill('수정 링크');
  await page.getByRole('button', { name: '링크 저장' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(server.calls.find((c) => c.method === 'PATCH')?.body).toEqual({
    revision: 2,
    label: '수정 링크',
  });
  await page.getByLabel('개발 분야 필터', { exact: true }).selectOption('uncategorized');
  await expect(page.getByRole('button', { name: 'GitHub 아래로' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Spring Documentation' })).toHaveCount(0);
  await page.getByLabel('현재 화면 검색').fill('https://example.com');
  await expect(page.locator('.quick-links strong')).toHaveText(['수정 링크']);
  await page.getByLabel('현재 화면 검색').fill('');
  await page.getByLabel('개발 분야 필터', { exact: true }).selectOption('all');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '수정 링크 삭제', exact: true }).click();
  await expect(page.getByRole('link', { name: '수정 링크' })).toHaveCount(0);
});
test('resource conflict preserves draft for explicit reconciliation', async ({ page }) => {
  const server = await backend(page);
  await page.goto('/library');
  await page.getByRole('button', { name: 'GitHub 편집' }).click();
  await page.getByLabel('링크 이름').fill('내 이름');
  server.conflict = true;
  await page.getByRole('button', { name: '링크 저장' }).click();
  await expect(page.getByLabel('링크 이름')).toHaveValue('내 이름');
  await expect(page.getByText('최신 내용: External', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '내 변경 다시 적용' }).click();
  await page.getByRole('button', { name: '링크 저장' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(server.rows[0].label).toBe('내 이름');
});
test('failed creation keeps exact key/body and cancellation keeps draft', async ({ page }) => {
  const server = await backend(page);
  await page.goto('/library');
  await page.getByRole('button', { name: '링크 추가', exact: true }).click();
  await page.getByLabel('링크 이름').fill('Keep');
  await page.getByLabel('URL', { exact: true }).fill('https://example.com');
  server.fail = 'POST';
  await page.getByRole('button', { name: '링크 저장' }).click();
  await expect(page.getByRole('button', { name: '동일 요청 다시 시도' })).toBeVisible();
  page.once('dialog', (d) => d.dismiss());
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('링크 이름')).toHaveValue('Keep');
  server.fail = '';
  await page.getByRole('button', { name: '동일 요청 다시 시도' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(server.calls[0]).toEqual(server.calls[1]);
});
test('collection conflict and network failure restore server order without replay', async ({
  page,
}) => {
  const server = await backend(page);
  await page.goto('/library');
  server.conflict = true;
  await page.getByRole('button', { name: 'GitHub 아래로' }).click();
  await expect(page.locator('.quick-links strong').first()).toHaveText('External');
  await expect(page.getByRole('alert')).toContainText('최신 전체 순서');
  expect(server.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  server.fail = 'PUT';
  await page.getByRole('button', { name: 'External 아래로' }).click();
  await expect(page.locator('.quick-links strong').first()).toHaveText('External');
  expect(server.calls.filter((c) => c.method === 'PUT')).toHaveLength(2);
  server.fail = '';
  await page.getByRole('button', { name: 'External 아래로' }).click();
  await expect(page.locator('.quick-links strong').nth(1)).toHaveText('External');
});
test('failed refresh retains rows and initial failure is not empty', async ({ page }) => {
  const server = await backend(page);
  server.fail = 'GET';
  await page.goto('/library');
  await expect(page.getByRole('alert')).toContainText('불러오지');
  await expect(page.getByText('등록된 링크가 없어요')).toHaveCount(0);
  server.fail = '';
  await page.getByRole('button', { name: '링크 새로고침' }).click();
  await expect(page.locator('.quick-links strong')).toHaveCount(4);
  server.fail = 'GET';
  await page.getByRole('button', { name: '링크 새로고침' }).click();
  await expect(page.getByRole('alert')).toContainText('이전에 확인한');
  await expect(page.locator('.quick-links strong')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'GitHub 아래로' })).toBeDisabled();
});
test('delete conflicts require direct detail review and explicit fresh confirmation', async ({
  page,
}) => {
  const server = await backend(page);
  await page.goto('/library');
  server.conflict = true;
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'GitHub 삭제', exact: true }).click();
  await expect(page.getByText('삭제 전 최신 내용:', { exact: false })).toContainText('External');
  expect(server.calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '검토 후 삭제', exact: true }).click();
  await expect(page.getByRole('link', { name: 'External' })).toHaveCount(0);
  expect(server.calls.filter((c) => c.method === 'DELETE')).toHaveLength(2);
});
test('Home stays read-only all-scope and has no artificial limit', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  await expect(page.locator('.link-surface .quick-links strong')).toHaveCount(4);
  await expect(page.locator('.link-surface .link-actions')).toHaveCount(0);
  await expect(page.locator('.link-surface [draggable]')).toHaveCount(0);
  await page.getByRole('button', { name: '자료실', exact: true }).click();
  await expect(page.getByRole('heading', { name: '자료실', exact: true })).toBeVisible();
});
test('desktop mobile landscape visual and keyboard parity', async ({ page }) => {
  await backend(page);
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
    ['landscape', 844, 390],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/library');
    await expect(page.locator('.quick-links strong')).toHaveCount(4);
    const header = page.locator('.page-heading');
    const add = page.getByRole('button', { name: '링크 추가', exact: true });
    await expect(add).toHaveCount(1);
    await expect(header.getByRole('button', { name: '링크 추가' })).toBeVisible();
    await expect(add).toHaveClass(/button-primary/);
    await expect(
      page.locator('.library-toolbar').getByRole('button', { name: '링크 새로고침' }),
    ).toHaveClass(/button-secondary/);
    const headingBox = (await header.locator('h1').boundingBox())!;
    const actionBox = (await add.boundingBox())!;
    const toolbarBox = (await page.locator('.library-toolbar').boundingBox())!;
    const listBox = (await page.locator('.quick-links').boundingBox())!;
    expect(headingBox.x).toBeCloseTo(toolbarBox.x, 0);
    expect(headingBox.x).toBeCloseTo(listBox.x, 0);
    if (width <= 950) expect(actionBox.y).toBeGreaterThan(headingBox.y + headingBox.height);
    else expect(actionBox.x).toBeGreaterThan(headingBox.x + headingBox.width);
    await page.screenshot({
      path: '.auth-validation/link-api-library-' + name + '.png',
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'GitHub 편집' }).click();
    await expect(page.getByLabel('링크 이름')).toBeFocused();
    await page.screenshot({
      path: '.auth-validation/link-api-editor-' + name + '.png',
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('empty Library keeps one header create action and toolbar reset', async ({ page }) => {
  const server = await backend(page);
  server.rows = [];
  await page.goto('/library');
  await expect(page.getByText('등록된 링크가 없어요')).toBeVisible();
  await expect(page.getByRole('button', { name: '링크 추가', exact: true })).toHaveCount(1);
  await expect(page.locator('.empty-state button')).toHaveCount(0);
  await page.getByLabel('현재 화면 검색').fill('missing');
  await expect(page.getByText('검색 조건에 맞는 링크가 없어요')).toBeVisible();
  await page.locator('.library-toolbar').getByRole('button', { name: '검색·필터 초기화' }).click();
  await expect(page.getByLabel('현재 화면 검색')).toHaveValue('');
  await expect(page.getByText('등록된 링크가 없어요')).toBeVisible();
  await page.locator('.page-heading').getByRole('button', { name: '링크 추가' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('링크 이름')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(
    page.locator('.page-heading').getByRole('button', { name: '링크 추가' }),
  ).toBeFocused();
});
