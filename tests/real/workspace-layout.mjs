import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Reuse run.mjs's disposable database, real API and authenticated OIDC session.
export async function validateWorkspaceLayout({ page, context, origin, output }) {
  const destination = path.join(output, 'layout-' + (process.env.LAYOUT_STAGE ?? 'after'));
  fs.mkdirSync(destination, { recursive: true });
  const csrf = (await (await context.request.get(origin + '/api/v1/auth/csrf')).json()).csrfToken;
  page.on('dialog', (dialog) => dialog.accept());
  const seed = [];
  const post = async (url, data) => {
    const response = await context.request.post(origin + url, {
      headers: { Origin: origin, 'X-CSRF-Token': csrf, 'Idempotency-Key': crypto.randomUUID() },
      data,
    });
    assert.equal(response.status(), 201, await response.text());
    const result = await response.json();
    seed.push({ url, data, result });
    return result;
  };
  const category = await post('/api/v1/project-categories', { name: '웹서비스' });
  const project = await post('/api/v2/projects', {
    name: '개인 개발 작업실',
    stack: 'React · TypeScript',
    categoryId: category.id,
  });
  await post('/api/v2/projects', {
    name: '서비스 운영 도구와 배포 자동화 프로젝트',
    stack: 'Java',
    categoryId: category.id,
  });
  for (const title of [
    '화면 배치 점검',
    '검색 조건과 정렬 상태 유지 확인',
    '긴 제목을 가진 작업의 모바일 줄바꿈과 상태 변경 확인',
  ])
    await post('/api/v2/tasks', { projectId: project.id, title });
  const journal = await post('/api/v2/journals', {
    projectId: project.id,
    title: '개발일지 화면 구조 개선 기록',
    body: '화면 배치와 정보 순서를 점검합니다.',
    entryDate: '2026-10-13',
  });
  await post('/api/v2/milestones', { projectId: project.id, title: '첫 번째 UI 정리' });
  await post('/api/v2/links', {
    projectId: project.id,
    label: '공식 개발 문서',
    url: 'https://example.com/reference',
    description: '개발 중 자주 확인하는 문서',
  });
  await page.goto(origin);
  await page.getByRole('button', { name: '기본 위젯으로 시작' }).click();
  await expect(page.locator('.dashboard-grid > .widget')).toHaveCount(6);
  const observations = [];
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, route] of Object.entries({
      home: '/',
      projects: '/projects',
      'project-detail': '/projects/' + project.id,
      tasks: '/tasks',
      journals: '/journals',
      'journal-detail': '/journals/' + journal.id,
      library: '/library',
    })) {
      await page.goto(origin + route);
      await expect(page.locator('main h1')).toBeVisible();
      await page.waitForLoadState('networkidle');
      const measurement = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        headings: [...document.querySelectorAll('main h1, main h2')].map((e) => ({
          text: e.textContent,
          y: e.getBoundingClientRect().top + scrollY,
        })),
        firstItemY:
          document.querySelector('.task, .quick-link-row')?.getBoundingClientRect().top ?? null,
      }));
      assert(measurement.scrollWidth <= measurement.width, `${name} overflows at ${width}`);
      observations.push({ name, width, route, ...measurement });
      await page.screenshot({
        path: path.join(destination, `${name}-${width}.png`),
        fullPage: true,
      });
    }
  }
  fs.writeFileSync(path.join(destination, 'fixture.json'), JSON.stringify(seed, null, 2));
  fs.writeFileSync(
    path.join(destination, 'observations.json'),
    JSON.stringify(observations, null, 2),
  );
  await page.setViewportSize({ width: 390, height: 600 });
  for (const [route, button, name] of [
    ['/projects', '프로젝트 추가', 'project'],
    ['/library', '링크 추가', 'link'],
    ['/tasks', '태스크 추가', 'task'],
  ]) {
    await page.goto(origin + route);
    const trigger = page.getByRole('button', { name: button, exact: true }).first();
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const cancel = dialog.getByRole('button', { name: '취소', exact: true });
    await cancel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(destination, `${name}-modal-390.png`) });
    await cancel.click();
    await expect(dialog).toHaveCount(0);
    if (process.env.LAYOUT_STAGE !== 'before') await expect(trigger).toBeFocused();
  }
  fs.writeFileSync(path.join(destination, 'fixture.json'), JSON.stringify(seed, null, 2));
  fs.writeFileSync(
    path.join(destination, 'observations.json'),
    JSON.stringify(observations, null, 2),
  );
  if (process.env.LAYOUT_STAGE !== 'before') {
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
      for (const route of ['/', '/projects', '/tasks', '/library']) {
        await zoomPage.goto(origin + route);
        await zoomPage.waitForLoadState('networkidle');
        assert(
          await zoomPage.evaluate(
            () =>
              devicePixelRatio >= 2 &&
              innerWidth <= 720 &&
              document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await zoomPage.screenshot({
          path: path.join(destination, `zoom-200-${route.slice(1) || 'home'}.png`),
        });
      }
    } finally {
      await zoom.close();
    }
  }
  console.log('Workspace layout real API capture passed: ' + destination);
}
