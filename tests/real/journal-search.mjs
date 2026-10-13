import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// The caller owns a new empty PostgreSQL database and a real OIDC-authenticated session.
export async function validateJournalSearch({ page, context, origin, output }) {
  page.setDefaultTimeout(15000);
  const csrf = (await (await context.request.get(origin + '/api/v1/auth/csrf')).json()).csrfToken;
  const post = async (url, data) => {
    const response = await context.request.post(origin + url, {
      headers: { Origin: origin, 'X-CSRF-Token': csrf, 'Idempotency-Key': crypto.randomUUID() },
      data,
    });
    assert.equal(response.status(), 201, await response.text());
    return response.json();
  };
  const category = await post('/api/v1/project-categories', { name: '검색 검증 분야' });
  const project = await post('/api/v2/projects', {
    name: '검색 검증 프로젝트',
    stack: 'TypeScript',
    categoryId: category.id,
  });
  const journals = [];
  for (const day of ['12', '13']) {
    journals.push(
      await post('/api/v2/journals', {
        title: `모달 검증 ${day}`,
        body: '격리된 실제 서버의 검색 검증 데이터',
        projectId: project.id,
        entryDate: `2026-10-${day}`,
      }),
    );
  }
  const errors = [];
  const listRequests = [];
  const onError = (error) => errors.push(error.message);
  const onRequest = (request) => {
    if (new URL(request.url()).pathname === '/api/v2/journals') listRequests.push(request.url());
  };
  page.on('pageerror', onError);
  page.on('request', onRequest);
  const trigger = page.getByRole('button', { name: /^검색 및 정렬/ });
  const dialog = page.getByRole('dialog', { name: '검색 및 정렬', exact: true });
  const rows = page.locator('.document-row strong');
  await page.goto(origin + '/journals');
  await expect(page.locator('.document-row')).toHaveCount(2);
  await expect(trigger).toHaveCount(1);
  await expect(page.getByLabel('현재 화면 검색')).toHaveCount(0);
  const before = listRequests.length;
  await trigger.click();
  await dialog.getByLabel('현재 화면 검색').fill('모달 검증');
  await dialog.getByLabel('개발 분야 필터').selectOption(category.id);
  await dialog.getByLabel('일지 프로젝트 필터').selectOption(project.id);
  await dialog.getByLabel('시작일').fill('2026-10-12');
  await dialog.getByLabel('종료일').fill('2026-10-13');
  await dialog.getByLabel('일지 정렬').selectOption('oldest');
  await page.waitForTimeout(350);
  assert.equal(listRequests.length, before);
  assert.equal(new URL(page.url()).search, '');
  const response = page.waitForResponse((item) => {
    const url = new URL(item.url());
    return url.pathname === '/api/v2/journals' && url.searchParams.get('sort') === 'oldest';
  });
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  const appliedResponse = await response;
  assert.equal(appliedResponse.status(), 200);
  assert.deepEqual(
    (await appliedResponse.json()).items.map((item) => item.id),
    journals.map((item) => item.id),
  );
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(rows).toHaveText(journals.map((item) => item.title));
  assert.equal(listRequests.length, before + 1);
  const appliedUrl = page.url();
  assert.deepEqual(Object.fromEntries(new URL(appliedUrl).searchParams), {
    category: category.id,
    q: '모달 검증',
    projectId: project.id,
    from: '2026-10-12',
    to: '2026-10-13',
    sort: 'oldest',
  });
  await trigger.click();
  await dialog.getByRole('button', { name: '초기화', exact: true }).click();
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  assert.equal(page.url(), appliedUrl);
  await page.reload();
  await trigger.click();
  await expect(dialog.getByLabel('현재 화면 검색')).toHaveValue('모달 검증');
  await expect(dialog.getByLabel('개발 분야 필터')).toHaveValue(category.id);
  await expect(dialog.getByLabel('일지 프로젝트 필터')).toHaveValue(project.id);
  await expect(dialog.getByLabel('일지 정렬')).toHaveValue('oldest');
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    await dialog.getByRole('button', { name: '적용', exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog).toBeInViewport({ ratio: 1 });
    assert(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth));
    await page.screenshot({ path: path.join(output, `journal-search-${viewport.width}.png`) });
  }
  await dialog.getByRole('button', { name: '초기화', exact: true }).click();
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(trigger).not.toContainText('적용됨');
  await expect(rows).toHaveText([...journals].reverse().map((item) => item.title));
  await page.goBack();
  await expect(page).toHaveURL(appliedUrl);
  await expect(rows).toHaveText(journals.map((item) => item.title));
  await page.goForward();
  await expect(rows).toHaveText([...journals].reverse().map((item) => item.title));

  const zoom = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  try {
    await zoom.addCookies(await context.cookies(origin));
    const settings = await zoom.newPage();
    await settings.goto('chrome://settings/appearance');
    await settings.evaluate(
      () => new Promise((resolve) => chrome.settingsPrivate.setDefaultZoom(2, resolve)),
    );
    const zoomPage = await zoom.newPage();
    zoomPage.on('pageerror', onError);
    await zoomPage.goto(origin + '/journals');
    await expect(zoomPage.locator('.document-row')).toHaveCount(2);
    assert.deepEqual(
      await zoomPage.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]),
      [720, 450, 2],
    );
    await zoomPage.getByRole('button', { name: /^검색 및 정렬/ }).click();
    const zoomDialog = zoomPage.getByRole('dialog', { name: '검색 및 정렬', exact: true });
    await expect(zoomDialog).toBeInViewport({ ratio: 1 });
    await zoomPage.screenshot({ path: path.join(output, 'journal-search-200-top.png') });
    await zoomDialog.getByRole('button', { name: '적용', exact: true }).scrollIntoViewIfNeeded();
    await expect(zoomDialog.getByRole('button', { name: '적용', exact: true })).toBeInViewport();
    assert(await zoomDialog.evaluate((element) => element.scrollWidth <= element.clientWidth));
    await zoomPage.screenshot({ path: path.join(output, 'journal-search-200-bottom.png') });
  } finally {
    await zoom.close();
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('.document-row')).toHaveCount(2);
  await page.screenshot({ path: path.join(output, 'journal-search-closed.png') });
  assert.deepEqual(errors, []);
  page.off('pageerror', onError);
  page.off('request', onRequest);
  fs.writeFileSync(
    path.join(output, 'journal-search-result.json'),
    JSON.stringify(
      {
        passed: true,
        realSession: true,
        mockedBusinessResponses: false,
        combinedConditions: 6,
        applyRequests: 1,
        cancelResetReloadHistory: true,
        widths: [1440, 390, 320],
        nativeZoomPercent: 200,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log('Real authenticated Journal search/sort modal passed, including native 200% zoom.');
}
