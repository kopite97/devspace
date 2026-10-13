import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

export async function validateJournalDetail({
  page,
  context,
  origin,
  output,
  post,
  json,
  journal,
}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const create = page.getByRole('button', { name: '새 글 작성', exact: true });
  const section = page.getByRole('region', { name: '일지 문서' });
  await expect(section).toContainText('0개');
  await expect(page.locator('h1')).toBeFocused();
  await expect(create).toHaveCount(1);
  const jump = async () => {
    const before = await page.evaluate(() => ({ url: location.href, history: history.length }));
    let requests = 0;
    const count = (request) => {
      if (request.url().includes('/api/')) requests++;
    };
    page.on('request', count);
    await page.getByRole('button', { name: '연결된 글로 이동', exact: true }).click();
    await expect(section.getByRole('heading')).toBeFocused();
    await page.getByRole('button', { name: '작성 위치로 이동', exact: true }).click();
    await expect(create).toBeFocused();
    assert.deepEqual(
      await page.evaluate(() => ({ url: location.href, history: history.length })),
      before,
    );
    page.off('request', count);
    assert.equal(requests, 0);
  };
  await jump();
  // Cached revisit: retain real data, delay only the next detail response, then fail it.
  for (const status of [404, 500]) {
    let posts = 0;
    const countPosts = (request) => {
      if (request.method() === 'POST') posts++;
    };
    page.on('request', countPosts);
    await page.getByRole('button', { name: '일지 목록', exact: true }).click();
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const routePath = `**/api/v2/journals/${journal.id}`;
    await page.route(routePath, async (route) => {
      await held;
      await route.fulfill({ status, json: { code: 'DETAIL_TEST_FAILURE' } });
    });
    await page.locator('.document-row').filter({ hasText: journal.title }).click();
    await expect(create).toBeDisabled();
    await create.dispatchEvent('click');
    release();
    await expect(page.getByRole('alert')).toContainText('일지가 없거나');
    await expect(create).toBeHidden();
    await expect(section).toHaveCount(0);
    await page.unroute(routePath);
    await page.getByRole('button', { name: '다시 시도', exact: true }).click();
    await expect(create).toBeEnabled();
    await expect(section).toContainText('0개');
    page.off('request', countPosts);
    assert.equal(posts, 0);
  }
  const longProject = await json(
    await post('/api/v2/projects', {
      name: '프로젝트 맥락과 기록 '.repeat(8),
      stack: 'TypeScript',
    }),
    201,
  );
  const body = ('작업 기록과 다음 단계\n  공백 보존\n' + 'longword'.repeat(40) + '\n')
    .repeat(70)
    .slice(0, 20000);
  const longJournal = await json(
    await post('/api/v2/journals', {
      title: '긴 제목으로 확인하는 개발 일지 '.repeat(8).slice(0, 119) + '끝',
      body,
      projectId: longProject.id,
      entryDate: '2026-10-13',
    }),
    201,
  );
  const longPath = origin + `/journals/${longJournal.id}`;
  await page.goto(longPath);
  await expect(page.locator('.detail-body')).toHaveText(body);
  await expect(section).toContainText('0개');
  await page.setViewportSize({ width: 390, height: 844 });
  await jump();
  await json(
    await post(`/api/v2/journals/${longJournal.id}/documents`, { title: '', content: [] }),
    201,
  );
  await page.reload();
  await expect(section.getByRole('button', { name: /제목 없는 문서/ })).toBeVisible();
  await expect(section).toContainText('1개');
  await jump();
  await json(
    await post(`/api/v2/journals/${longJournal.id}/documents`, {
      title: '여러 줄로 이어지는 연결된 글의 제목 '.repeat(6),
      content: [],
    }),
    201,
  );
  await page.reload();
  await expect(section).toContainText('2개');
  await expect(section.locator('.badge')).toHaveText(['초안', '초안']);
  for (const width of [1440, 1280, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `overflow ${width}`,
    );
    const columns = await page
      .locator('.journal-detail-grid')
      .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
    assert.equal(columns, 1);
    assert(await section.evaluate((e) => e.scrollWidth <= e.clientWidth));
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, `journal-detail-long-${width}.png`) });
  }
  // Native browser zoom, not CSS zoom or an emulated small viewport.
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
    const enlarged = await zoom.newPage();
    await enlarged.goto(longPath);
    await expect(enlarged.locator('.detail-body')).toHaveText(body);
    assert.deepEqual(
      await enlarged.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]),
      [720, 450, 2],
    );
    assert(await enlarged.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await enlarged.screenshot({ path: path.join(output, 'journal-detail-zoom200.png') });
    await enlarged.emulateMedia({ reducedMotion: 'reduce' });
    await enlarged.getByRole('button', { name: '연결된 글로 이동', exact: true }).click();
    await expect(enlarged.getByRole('heading', { name: '연결된 글', exact: true })).toBeFocused();
    await expect(
      enlarged.getByRole('heading', { name: '연결된 글', exact: true }),
    ).toBeInViewport();
    await enlarged.getByRole('button', { name: '작성 위치로 이동', exact: true }).click();
    await expect(enlarged.getByRole('button', { name: '새 글 작성', exact: true })).toBeFocused();
    // Chromium surface capture is blank at large native-zoom scroll offsets.
    // Review the complete short page at native zoom from the top in a taller browser viewport.
    await enlarged.setViewportSize({ width: 1440, height: 1800 });
    await enlarged.goto(origin + `/journals/${journal.id}`);
    await expect(enlarged.getByRole('region', { name: '일지 문서' })).toContainText('0개');
    assert.equal(await enlarged.evaluate(() => devicePixelRatio), 2);
    await enlarged.evaluate(() => scrollTo(0, 0));
    await enlarged.screenshot({ path: path.join(output, 'journal-detail-zoom200-complete.png') });
  } finally {
    await zoom.close();
  }
  // Creation failure retains its uncertain-result restriction across viewport changes.
  const collection = `**/api/v2/journals/${longJournal.id}/documents`;
  await page.route(collection, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, json: { code: 'CREATION_TEST_FAILURE' } })
      : route.continue(),
  );
  // Capture the existing store only while its real mutation invalidation runs.
  await page.evaluate(async () => {
    const { JournalDocuments } = await import('/src/features/journal/documentCollection.ts');
    const original = JournalDocuments.prototype.invalidateDocuments;
    JournalDocuments.prototype.invalidateDocuments = function () {
      window.journalDetailTestStore = this;
      JournalDocuments.prototype.invalidateDocuments = original;
      return original.call(this);
    };
  });
  await create.click();
  await expect(page.getByRole('alert')).toContainText('생성 결과를 확인하지 못했습니다');
  await page.getByRole('button', { name: '작성 위치로 이동', exact: true }).click();
  await expect(page.locator('.journal-detail-create')).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(create).toBeDisabled();
  const detailRoute = `**/api/v2/journals/${longJournal.id}`;
  await page.route(detailRoute, (route) =>
    route.fulfill({ status: 500, json: { code: 'DETAIL_TEST_FAILURE' } }),
  );
  await page.evaluate(() => window.journalDetailTestStore.invalidateJournals());
  await expect(create).toBeHidden();
  await expect(section).toHaveCount(0);
  await page.unroute(detailRoute);
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(create).toBeVisible();
  await expect(create).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('생성 결과를 확인하지 못했습니다');
  await expect(page.locator('h1')).not.toBeFocused();
  await page.unroute(collection);
  await page.goto(origin + `/journals/${journal.id}`);
  await expect(create).toBeEnabled();
  await expect(section).toContainText('0개');
  fs.writeFileSync(
    path.join(output, 'journal-detail-result.json'),
    JSON.stringify(
      {
        passed: true,
        realBackendAndOidc: true,
        successfulBusinessResponsesMocked: false,
        longBodyLength: body.length,
        titleLength: longJournal.title.length,
        widths: [1440, 1280, 1024, 390, 320],
        nativeZoomPercent: 200,
        cachedFailures: [404, 500],
        creationErrorSurvivesDetailRetry: true,
        focusJumpsWithoutRequestsOrHistoryChanges: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'Journal detail: real empty/single collection, cached 404/500, long content, focus jumps, five widths and native 200% passed.',
  );
}
