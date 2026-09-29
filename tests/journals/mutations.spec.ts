import { test, expect, setup, journal, project, id } from './fixtures';

test('create preserves body/date and freezes one Idempotency-Key', async ({ page }) => {
  await setup(page);
  let saved = journal(4, {
    title: 'Created Journal',
    body: ' leading\nbody  ',
    entryDate: '2026-09-04',
  });
  const writes: { key: string | undefined; body: unknown }[] = [];
  await page.route('**/api/v2/journals?*', (route) =>
    route.fulfill({ json: { items: [saved], total: 1, nextCursor: null } }),
  );
  await page.route('**/api/v2/journals', async (route) => {
    writes.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    saved = { ...saved, revision: 2 };
    return route.fulfill({ status: 201, json: saved });
  });
  await page.route('**/api/v2/journals/' + saved.id, (route) => route.fulfill({ json: saved }));
  await page.goto('/journals');
  await page.getByRole('button', { name: '일지 작성', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').first().fill('Created Journal');
  await dialog.locator('select').selectOption(id(1));
  await dialog.locator('input[type="date"]').fill('2026-09-04');
  await dialog.locator('textarea').fill(' leading\nbody  ');
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(writes[0].key).toBeTruthy();
  expect(writes[0].body).toEqual({
    title: 'Created Journal',
    projectId: id(1),
    body: ' leading\nbody  ',
    entryDate: '2026-09-04',
  });
  await page.locator('.document-row').click();
  await expect(page).toHaveURL(new RegExp('/journals/' + saved.id + '$'));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.journal-viewer .detail-body')).toHaveText(' leading\nbody  ');
});

test('revision conflict keeps the draft, permits explicit reapplication, and deletes permanently', async ({
  page,
}) => {
  await setup(page);
  let current = journal(1);
  let patchCount = 0;
  let deleted = false;
  await page.route('**/api/v2/journals?*', (route) =>
    route.fulfill({
      json: { items: deleted ? [] : [current], total: deleted ? 0 : 1, nextCursor: null },
    }),
  );
  await page.route(
    new RegExp('/api/v2/journals/' + current.id + '(?:\\?revision=\\d+)?$'),
    async (route) => {
      if (route.request().method() === 'DELETE') {
        deleted = true;
        return route.fulfill({ json: { deletedId: current.id } });
      }
      if (route.request().method() === 'GET') return route.fulfill({ json: current });
      patchCount++;
      if (patchCount === 1) {
        current = { ...current, revision: 2, body: 'Concurrent server body' };
        return route.fulfill({ status: 409, json: { code: 'REVISION_CONFLICT' } });
      }
      const body = route.request().postDataJSON();
      current = { ...current, ...body, revision: 3 };
      return route.fulfill({ json: current });
    },
  );
  await page.goto('/journals');
  await page.locator('.feature-actions button').first().click();
  const editor = page.getByRole('dialog');
  await expect(editor.locator('textarea')).toHaveValue(current.body);
  await editor.locator('textarea').fill('Draft survives conflict');
  await editor.locator('button[type="submit"]').click();
  await expect(editor.locator('[role="alert"]')).toBeVisible();
  await expect(editor.locator('textarea')).toHaveValue('Draft survives conflict');
  await editor
    .locator('button')
    .filter({ hasText: /다시 적용/ })
    .click();
  await editor.locator('button[type="submit"]').click();
  await expect(editor).toHaveCount(0);
  expect(patchCount).toBe(2);
  await page.locator('.feature-actions button').nth(1).click();
  const confirmation = page.getByRole('dialog');
  await confirmation.locator('.button-danger').click();
  await expect(page.locator('.document-row')).toHaveCount(0);
  expect(deleted).toBe(true);
});

test('archived Project relation is retained while active reassignment options stay active-only', async ({
  page,
}) => {
  await setup(page);
  const archived = project(3, 'archived');
  const current = journal(1, { projectId: archived.id, projectName: archived.name });
  await page.route('**/api/v2/projects?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json:
        params.get('status') === 'active'
          ? { items: [project(1)], total: 1, nextCursor: null }
          : { items: [archived, project(1)], total: 2, nextCursor: null },
    });
  });
  await page.route('**/api/v2/projects/' + archived.id, (route) =>
    route.fulfill({ json: archived }),
  );
  await page.route('**/api/v2/journals?*', (route) =>
    route.fulfill({ json: { items: [current], total: 1, nextCursor: null } }),
  );
  await page.route('**/api/v2/journals/' + current.id, (route) => route.fulfill({ json: current }));
  await page.goto('/journals');
  await page.locator('.feature-actions button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('select').locator('option:checked')).toContainText('Project 3');
  await expect(dialog.locator('select option')).toHaveCount(3);
  await dialog.locator('textarea').fill('Retain archived relation');
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);
});
