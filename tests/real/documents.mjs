import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { validateJournalDetail } from './journal-detail.mjs';

export async function validateDocuments({ page, context, origin, output, sql }) {
  page.setDefaultTimeout(15000);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
    'base64',
  );
  const csrf = (await (await context.request.get(origin + '/api/v1/auth/csrf')).json()).csrfToken;
  const headers = { Origin: origin, 'X-CSRF-Token': csrf };
  const json = async (response, status = 200) => {
    assert.equal(response.status(), status, await response.text());
    return response.json();
  };
  const post = (url, data) =>
    context.request.post(origin + url, {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data,
    });
  const get = async (id) => json(await context.request.get(origin + `/api/v2/documents/${id}`));
  const project = await json(
    await post('/api/v2/projects', { name: 'Document acceptance', stack: 'TypeScript' }),
    201,
  );
  const journal = await json(
    await post('/api/v2/journals', {
      title: '문서 연결 일지',
      body: '기존 일지 본문은 유지됩니다.',
      projectId: project.id,
      entryDate: '2026-09-23',
    }),
    201,
  );
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + '/journals?q=' + encodeURIComponent('문서 연결'));
  await page.locator('.document-row').filter({ hasText: journal.title }).click();
  await expect(page).toHaveURL(origin + `/journals/${journal.id}`);
  await expect(page.locator('.journal-viewer')).toContainText(journal.body);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: path.join(output, `journal-detail-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await validateJournalDetail({ page, context, origin, output, post, json, project, journal });
  let releaseCreation;
  const creationHeld = new Promise((resolve) => {
    releaseCreation = resolve;
  });
  let creationRequests = 0;
  const creationPath = `**/api/v2/journals/${journal.id}/documents`;
  await page.route(creationPath, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    creationRequests++;
    const response = await route.fetch();
    await creationHeld;
    await route.fulfill({ response });
  });
  const creation = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith(`/journals/${journal.id}/documents`),
  );
  await page.evaluate(async () => {
    const { JournalDocuments } = await import('/src/features/journal/documentCollection.ts');
    const original = JournalDocuments.prototype.create;
    JournalDocuments.prototype.create = function (...args) {
      window.journalDetailTestStore = this;
      JournalDocuments.prototype.create = original;
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: '새 글 작성', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '초안 만드는 중…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '초안 만드는 중…', exact: true }).dispatchEvent('click');
  await expect.poll(() => creationRequests).toBe(1);
  const refresh = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v2/journals/${journal.id}`),
  );
  await page.evaluate(() => window.journalDetailTestStore.invalidateJournals());
  await refresh;
  await expect(page.getByRole('button', { name: '초안 만드는 중…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '작성 위치로 이동', exact: true }).click();
  await expect(page.locator('.journal-detail-create')).toBeFocused();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '일지 목록', exact: true }).click();
  await expect(page).toHaveURL(origin + `/journals/${journal.id}`);
  assert.equal(creationRequests, 1);
  releaseCreation();
  const created = await json(await creation, 201);
  await page.unroute(creationPath);
  await expect(page).toHaveURL(origin + `/documents/${created.id}/edit`);
  await expect(page.locator('.bn-editor[contenteditable="true"]')).toBeVisible();
  await expect(page.locator('.page-footer')).toHaveCount(0);
  await expect(page.locator('main .session-controls')).toHaveCount(0);
  const profileButton = page.getByRole('button', { name: '프로필 메뉴', exact: true });
  await profileButton.click();
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(profileButton).toBeFocused();
  await expect(page.getByRole('region', { name: '계정 메뉴' })).toHaveCount(0);
  await profileButton.click();
  await page.locator('.document-title').click();
  await expect(page.getByRole('region', { name: '계정 메뉴' })).toHaveCount(0);
  const writingGeometry = () =>
    page.locator('.document-paper').evaluate((paper) => {
      const editor = paper.querySelector('.bn-editor');
      const title = paper.querySelector('.document-title');
      const style = getComputedStyle(paper);
      const editorStyle = getComputedStyle(editor);
      return {
        width: paper.getBoundingClientRect().width,
        x: paper.getBoundingClientRect().x,
        titleX: title.getBoundingClientRect().x,
        textX: editor.getBoundingClientRect().x + parseFloat(editorStyle.paddingLeft),
        border: style.borderTopWidth,
        background: style.backgroundColor,
        overflowY: editorStyle.overflowY,
      };
    });
  const emptyGeometry = await writingGeometry();
  assert.equal(emptyGeometry.border, '0px');
  assert.equal(emptyGeometry.background, 'rgba(0, 0, 0, 0)');
  assert(Math.abs(emptyGeometry.titleX - emptyGeometry.textX) < 1);
  await page.screenshot({ path: path.join(output, 'document-empty.png'), fullPage: true });
  await page.getByLabel('문서 제목', { exact: true }).fill('한글 문서 제목');
  await page.locator('.bn-editor').click();
  const composition = await context.newCDPSession(page);
  await composition.send('Input.imeSetComposition', {
    text: '한글',
    selectionStart: 2,
    selectionEnd: 2,
  });
  await composition.send('Input.insertText', { text: '한글' });
  await page.keyboard.insertText(' 입력과 자동 저장을 확인합니다.');
  await composition.detach();
  await expect.poll(async () => (await get(created.id)).title).toBe('한글 문서 제목');
  await expect
    .poll(async () => JSON.stringify((await get(created.id)).content))
    .toContain('한글 입력과 자동 저장');
  assert.deepEqual(await writingGeometry(), emptyGeometry);
  await page.screenshot({ path: path.join(output, 'document-short.png'), fullPage: true });
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await expect(page.locator('.bn-formatting-toolbar')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  for (let line = 0; line < 35; line++) {
    await page.keyboard.press('Enter');
    await page.keyboard.insertText(
      `긴 문서 ${line + 1}: 페이지 흐름과 일정한 본문 너비를 확인합니다.`,
    );
  }
  assert.deepEqual(await writingGeometry(), emptyGeometry);
  assert(await page.evaluate(() => scrollY > 0));
  const cursorVisible = await page.evaluate(() => {
    const selection = getSelection();
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  });
  assert(cursorVisible, 'long document cursor remains visible');
  await page.screenshot({ path: path.join(output, 'document-long.png'), fullPage: true });
  const lastParagraph = page.locator('.bn-editor [data-content-type="paragraph"]').last();
  await lastParagraph.hover();
  await expect(page.locator('[data-test="dragHandle"]')).toBeVisible();
  await page.getByRole('button', { name: '블록 메뉴 열기' }).click();
  await expect(page.getByRole('menu').first()).toBeVisible();
  await page.keyboard.press('Escape');
  const earlierParagraph = page
    .locator('.bn-editor [data-content-type="paragraph"]')
    .filter({ hasText: '긴 문서 33:' });
  await lastParagraph.hover();
  const targetRect = await earlierParagraph.boundingBox();
  await page.getByRole('button', { name: '블록 메뉴 열기' }).evaluate((handle, rect) => {
    const transfer = new DataTransfer();
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    const target = document.elementFromPoint(rect.x + 10, rect.y + 1);
    for (const type of ['dragover', 'drop']) {
      target.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
          clientX: rect.x + 10,
          clientY: rect.y + 1,
        }),
      );
    }
    handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
  }, targetRect);
  await expect
    .poll(async () => {
      const texts = await page
        .locator('.bn-editor [data-content-type="paragraph"]')
        .allTextContents();
      return (
        texts.findIndex((text) => text.includes('긴 문서 35:')) <
        texts.findIndex((text) => text.includes('긴 문서 34:'))
      );
    })
    .toBe(true);

  // Delay an actual PUT response: the server commits A while the user enters B/C.
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let intercepted = false;
  const saveBodies = [];
  await page.route(`**/api/v2/documents/${created.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    saveBodies.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (!intercepted) {
      intercepted = true;
      await held;
    }
    await route.fulfill({ response });
  });
  await page.getByLabel('문서 제목', { exact: true }).fill('저장 A');
  await expect.poll(() => intercepted).toBe(true);
  await page.getByLabel('문서 제목', { exact: true }).fill('저장 B');
  await page.getByLabel('문서 제목', { exact: true }).fill('최신 저장 C');
  const uploadDuringSave = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/api/v2/attachments'),
  );
  await page.locator('.bn-editor [data-content-type="paragraph"]').last().click();
  await page.locator('.bn-editor').evaluate(
    (element, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], 'during-save.png', { type: 'image/png' }),
      );
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
    },
    [...png],
  );
  const concurrentAttachment = await json(await uploadDuringSave, 201);
  await expect(
    page.locator(`.bn-editor img[src="${concurrentAttachment.contentUrl}"]`),
  ).toBeVisible();
  release();
  await expect.poll(async () => (await get(created.id)).title).toBe('최신 저장 C');
  await expect(page.getByLabel('문서 제목', { exact: true })).toHaveValue('최신 저장 C');
  await expect
    .poll(async () => (await get(created.id)).attachmentIds)
    .toContain(concurrentAttachment.id);
  assert.deepEqual(
    saveBodies.map((body) => body.title),
    ['저장 A', '최신 저장 C'],
  );
  await page.unroute(`**/api/v2/documents/${created.id}`);

  // Drop the response after a real write, never substitute a mock success/error DTO.
  let dropped = false;
  await page.route(`**/api/v2/documents/${created.id}`, async (route) => {
    if (route.request().method() === 'PUT' && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByLabel('문서 제목', { exact: true }).fill('응답 유실 보존');
  await expect(page.getByRole('button', { name: '서버 상태 확인', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '게시', exact: true })).toBeDisabled();
  await expect(page.getByLabel('문서 제목', { exact: true })).toHaveValue('응답 유실 보존');
  await page.getByRole('button', { name: '서버 상태 확인', exact: true }).click();
  await page.getByRole('button', { name: '다시 저장', exact: true }).click();
  await expect(page.locator('.document-status')).toContainText('저장됨');
  await page.unroute(`**/api/v2/documents/${created.id}`);

  const sequence = [];
  const observe = (request) => {
    if (
      request.url().includes(`/api/v2/documents/${created.id}`) &&
      ['PUT', 'POST'].includes(request.method())
    )
      sequence.push(request.method());
  };
  page.on('request', observe);
  await page.getByRole('button', { name: '게시', exact: true }).click();
  await expect(page.locator('.document-status')).toContainText('게시됨');
  await expect(page).toHaveURL(origin + `/documents/${created.id}`);
  assert.deepEqual(sequence, ['PUT', 'POST']);
  page.off('request', observe);
  const published = await get(created.id);
  await page.getByRole('button', { name: '수정', exact: true }).click();
  await page.getByRole('button', { name: '게시 확인', exact: true }).click();
  await expect(page).toHaveURL(origin + `/documents/${created.id}`);
  assert.equal((await get(created.id)).publishedAt, published.publishedAt);
  await page.getByRole('button', { name: '수정', exact: true }).click();
  await expect(page.getByRole('button', { name: '게시 확인', exact: true })).toBeEnabled();

  // Populate every supported block through the real API, then restore/edit/save through BlockNote.
  const uploaded = await json(
    await context.request.post(origin + '/api/v2/attachments', {
      headers,
      multipart: {
        documentId: created.id,
        file: { name: '한글 이미지.png', mimeType: 'image/png', buffer: png },
      },
    }),
    201,
  );
  const txt = await json(
    await context.request.post(origin + '/api/v2/attachments', {
      headers,
      multipart: {
        documentId: created.id,
        file: {
          name: '문서.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('한글 파일 다운로드'),
        },
      },
    }),
    201,
  );
  const inline = [
    {
      type: 'text',
      text: '서식 보존',
      styles: {
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        textColor: 'blue',
        backgroundColor: 'yellow',
      },
    },
    {
      type: 'link',
      href: 'https://example.com',
      content: [{ type: 'text', text: ' 링크', styles: {} }],
    },
  ];
  const blocks = [
    { type: 'paragraph', content: inline },
    { type: 'heading', props: { level: 1 }, content: '제목 블록' },
    {
      type: 'bulletListItem',
      content: '글머리',
      children: [{ type: 'paragraph', content: '중첩 본문' }],
    },
    { type: 'numberedListItem', content: '번호 목록' },
    { type: 'checkListItem', props: { checked: false }, content: '체크 항목' },
    {
      type: 'toggleListItem',
      content: '접기 목록',
      children: [{ type: 'paragraph', content: '접힌 본문' }],
    },
    {
      type: 'heading',
      props: { level: 2, isToggleable: true },
      content: '접기 제목',
      children: [{ type: 'paragraph', content: '제목 하위' }],
    },
    { type: 'quote', content: '인용 문장' },
    { type: 'codeBlock', props: { language: 'text' }, content: 'const answer = 42;' },
    {
      type: 'table',
      content: {
        type: 'tableContent',
        rows: [{ cells: ['열 하나', '열 둘'] }, { cells: ['행 하나', '행 둘'] }],
      },
    },
    {
      type: 'image',
      props: {
        url: uploaded.contentUrl,
        name: uploaded.originalFilename,
        caption: '실제 저장소 이미지',
      },
    },
    { type: 'file', props: { url: txt.contentUrl, name: txt.originalFilename } },
    { type: 'paragraph', content: '마지막 문단' },
  ];
  await json(
    await context.request.put(origin + `/api/v2/documents/${created.id}`, {
      headers,
      data: { title: '블록 문서 검증', content: blocks, attachmentIds: [uploaded.id, txt.id] },
    }),
  );
  await page.reload();
  await expect(page.locator('.bn-editor')).toContainText('중첩 본문');
  await expect(page.locator('.bn-editor img').first()).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.bn-editor img')
        .first()
        .evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await page.getByLabel('문서 제목', { exact: true }).fill('블록 문서 저장 완료');
  await expect.poll(async () => (await get(created.id)).title).toBe('블록 문서 저장 완료');
  const restored = await get(created.id);
  assert.deepEqual(restored.attachmentIds.slice().sort(), [uploaded.id, txt.id].sort());
  assert.equal(restored.attachments.length, 2);
  assert.deepEqual(await (await context.request.get(origin + uploaded.contentUrl)).body(), png);
  assert.equal(
    (await context.request.get(origin + txt.contentUrl))
      .headers()
      ['content-disposition'].startsWith('attachment'),
    true,
  );

  // Browser file chooser invokes the actual multipart adapter.
  await page.locator('.bn-editor [data-content-type="paragraph"]').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/file');
  await expect(page.getByRole('option').filter({ hasText: '파일' }).first()).toBeVisible();
  await page.getByRole('option').filter({ hasText: '파일' }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: /파일 업로드|파일 선택/ })
    .last()
    .click();
  await (
    await chooser
  ).setFiles({
    name: '브라우저.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('브라우저에서 실제 업로드'),
  });
  await expect.poll(async () => (await get(created.id)).attachments.length).toBe(3);
  for (const eventType of ['paste', 'drop']) {
    const paragraph = page.locator('.bn-editor [data-content-type="paragraph"]').last();
    await paragraph.click();
    await paragraph.evaluate(
      (element, { bytes, eventType }) => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(bytes)], `${eventType}.png`, { type: 'image/png' }),
        );
        const rect = element.getBoundingClientRect();
        element.dispatchEvent(
          eventType === 'paste'
            ? new ClipboardEvent('paste', {
                clipboardData: transfer,
                bubbles: true,
                cancelable: true,
              })
            : new DragEvent('drop', {
                dataTransfer: transfer,
                bubbles: true,
                cancelable: true,
                clientX: rect.x + 5,
                clientY: rect.y + 5,
              }),
        );
      },
      { bytes: [...png], eventType },
    );
    await expect
      .poll(async () => (await get(created.id)).attachments.length)
      .toBe(eventType === 'paste' ? 4 : 5);
  }
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(output, `document-editor-${name}.png`),
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: '미리 보기', exact: true }).click();
  await expect(page.locator('.bn-editor[contenteditable="false"]')).toBeVisible();
  await expect(page.locator('.page-footer')).toHaveCount(0);
  assert.equal(await page.locator('.bn-editor[contenteditable="true"]').count(), 0);
  const before = JSON.stringify((await get(created.id)).content);
  await page.locator('.bn-editor').click();
  await page.keyboard.type('readonly attempt');
  assert.equal(JSON.stringify((await get(created.id)).content), before);
  await page.route('**' + txt.contentUrl, (route) => route.abort('failed'));
  await page.getByRole('button', { name: '문서.txt 다운로드', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: '응답을 확인하지 못했습니다' }),
  ).toBeVisible();
  await page.unroute('**' + txt.contentUrl);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '문서.txt 다운로드', exact: true }).click();
  const download = await downloaded;
  assert.equal(download.suggestedFilename(), '문서.txt');
  await download.saveAs(path.join(output, 'document-download.txt'));
  assert.equal(
    fs.readFileSync(path.join(output, 'document-download.txt'), 'utf8'),
    '한글 파일 다운로드',
  );
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['laptop', 1280, 800],
    ['mobile', 390, 844],
    ['small', 320, 740],
    ['landscape', 844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await profileButton.click();
    await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, `account-${name}.png`), fullPage: false });
    await page.keyboard.press('Escape');
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `overflow ${name}`,
    );
    await page.screenshot({ path: path.join(output, `documents-${name}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(output, 'documents-zoom200.png'), fullPage: true });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });
  await page.getByRole('button', { name: '돌아가기', exact: true }).click();
  // Reload intentionally loses the in-memory parent context; deep links use /journals.
  await expect(page).toHaveURL(origin + '/journals');
  await page.getByRole('button', { name: /검색 및 정렬/ }).click();
  await page.getByRole('dialog').getByLabel('현재 화면 검색').fill('문서 연결');
  await page.getByRole('dialog').getByRole('button', { name: '적용', exact: true }).click();
  await expect(page).toHaveURL(/q=/);
  const filteredUrl = page.url();
  await page.locator('.document-row').filter({ hasText: journal.title }).click();
  await expect(page.getByRole('button', { name: /블록 문서 저장 완료/ })).toBeVisible();
  await expect(page.locator('.journal-document-row .badge')).toHaveText(['게시됨']);
  await page.getByRole('button', { name: /블록 문서 저장 완료/ }).click();
  await expect(page.locator('.bn-editor')).toBeVisible();
  await page.getByRole('button', { name: '돌아가기', exact: true }).click();
  await expect(page).toHaveURL(origin + `/journals/${journal.id}`);
  await page.getByRole('button', { name: '일지 목록', exact: true }).click();
  await expect(page).toHaveURL(filteredUrl);
  // Isolated API boundary checks use their own document and never affect the displayed content.
  const boundary = await json(
    await post(`/api/v2/journals/${journal.id}/documents`, { title: '', content: [] }),
    201,
  );
  const putBoundary = (data) =>
    context.request.put(origin + `/api/v2/documents/${boundary.id}`, { headers, data });
  await json(await putBoundary({ title: 'x'.repeat(200), content: [], attachmentIds: [] }));
  assert.equal(
    (await putBoundary({ title: 'x'.repeat(201), content: [], attachmentIds: [] })).status(),
    400,
  );
  // JSON array/string punctuation takes four bytes; test the parsed content boundary exactly.
  await json(await putBoundary({ title: '', content: ['x'.repeat(1048572)], attachmentIds: [] }));
  assert.equal(
    (await putBoundary({ title: '', content: ['x'.repeat(1048573)], attachmentIds: [] })).status(),
    413,
  );
  const overRequest = await context.request.put(origin + `/api/v2/documents/${boundary.id}`, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: JSON.stringify({ title: '', content: [], attachmentIds: [] }) + ' '.repeat(1114112),
  });
  assert.equal(overRequest.status(), 413);
  const uploadBoundary = (buffer, name = 'boundary.txt', mimeType = 'text/plain') =>
    context.request.post(origin + '/api/v2/attachments', {
      headers,
      multipart: { documentId: boundary.id, file: { name, mimeType, buffer } },
    });
  assert.equal((await uploadBoundary(Buffer.alloc(0))).status(), 400);
  assert.equal((await uploadBoundary(Buffer.from([255, 254, 255]))).status(), 400);
  assert.equal(
    (await uploadBoundary(Buffer.from('not a png'), 'invalid.png', 'image/png')).status(),
    400,
  );
  const large = await json(await uploadBoundary(Buffer.alloc(10485760, 120)), 201);
  assert.equal((await uploadBoundary(Buffer.alloc(10485761, 120))).status(), 413);
  let multipartOverflow = '413';
  const attachmentsBeforeOverflow = sql(
    `select count(*) from attachments where document_id='${boundary.id}'`,
  );
  try {
    assert.equal((await uploadBoundary(Buffer.alloc(11534337, 120))).status(), 413);
  } catch (error) {
    if (!/ECONNRESET|socket hang up|apiRequestContext\.post: aborted/.test(String(error)))
      throw error;
    multipartOverflow = 'connection reset before response';
  }
  assert.equal(
    sql(`select count(*) from attachments where document_id='${boundary.id}'`),
    attachmentsBeforeOverflow,
  );
  let nested = [];
  for (let level = 0; level < 98; level++) nested = [nested];
  await json(await putBoundary({ title: '', content: nested, attachmentIds: [] }));
  assert.equal(
    (await putBoundary({ title: '', content: [[nested]], attachmentIds: [] })).status(),
    400,
  );
  await json(await uploadBoundary(Buffer.from('filename boundary'), 'a'.repeat(251) + '.txt'), 201);
  assert.equal(
    (await uploadBoundary(Buffer.from('filename overflow'), 'a'.repeat(252) + '.txt')).status(),
    400,
  );
  assert.equal(
    (
      await context.request.delete(origin + `/api/v2/attachments/${uploaded.id}`, { headers })
    ).status(),
    409,
  );
  assert.equal(
    (await putBoundary({ title: '', content: [], attachmentIds: [uploaded.id] })).status(),
    404,
  );
  await json(await context.request.delete(origin + `/api/v2/attachments/${large.id}`, { headers }));
  assert.equal((await context.request.get(origin + large.contentUrl)).status(), 404);
  // Authenticated ownership is enforced for both detail and binary data.
  const outsider = await page.context().browser().newContext();
  assert.equal(
    (await outsider.request.get(origin + `/api/v2/documents/${created.id}`)).status(),
    401,
  );
  assert.equal((await outsider.request.get(origin + uploaded.contentUrl)).status(), 401);
  const outsiderPage = await outsider.newPage();
  await outsiderPage.goto(origin + `/documents/${created.id}/edit`);
  await outsiderPage.getByRole('button', { name: 'Google로 계속하기' }).click();
  await outsiderPage.getByRole('link', { name: 'bob', exact: true }).click();
  await expect(outsiderPage).toHaveURL(origin + `/documents/${created.id}/edit`);
  await expect(outsiderPage.getByRole('alert')).toContainText(
    '문서나 첨부가 없거나 접근할 수 없습니다.',
  );
  assert.equal(
    (await outsider.request.get(origin + `/api/v2/documents/${created.id}`)).status(),
    404,
  );
  assert.equal((await outsider.request.get(origin + uploaded.contentUrl)).status(), 404);
  await outsider.close();
  await json(
    await context.request.delete(origin + `/api/v2/documents/${boundary.id}`, { headers }),
  );
  assert.equal(
    (await context.request.get(origin + `/api/v2/documents/${boundary.id}`)).status(),
    404,
  );

  // Navigation cancellation is synchronous; confirmed document deletion returns to its Journal.
  await page.locator('.document-row').filter({ hasText: journal.title }).click();
  await page.getByRole('button', { name: /블록 문서 저장 완료/ }).click();
  await page.getByRole('button', { name: '수정', exact: true }).click();
  await page.getByLabel('문서 제목', { exact: true }).fill('이동 보호 입력');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '돌아가기', exact: true }).click();
  await expect(page).toHaveURL(origin + `/documents/${created.id}/edit`);
  await expect(page.getByLabel('문서 제목', { exact: true })).toHaveValue('이동 보호 입력');
  await expect(page.locator('.document-status')).toContainText('저장됨');
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
  assert.equal(
    (await context.request.get(origin + `/api/v2/documents/${created.id}`)).status(),
    200,
  );
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await page.getByRole('button', { name: '삭제 확인', exact: true }).click();
  await expect(page).toHaveURL(origin + `/journals/${journal.id}`);
  assert.equal(
    (await context.request.get(origin + `/api/v2/documents/${created.id}`)).status(),
    404,
  );
  const otherJournal = await json(
    await post('/api/v2/journals', {
      title: '분리된 일지',
      body: '문서 목록 격리',
      projectId: project.id,
      entryDate: '2026-09-23',
    }),
    201,
  );
  const extraDocuments = await Promise.all(
    Array.from({ length: 21 }, (_, index) =>
      post(`/api/v2/journals/${journal.id}/documents`, {
        title: `페이지 문서 ${index}`,
        content: [],
      }).then((response) => json(response, 201)),
    ),
  );
  const collection = `/api/v2/journals/${journal.id}/documents`;
  const first = await json(await context.request.get(origin + collection + '?limit=1'));
  assert.equal(first.items.length, 1);
  assert.equal(first.total, 21);
  assert(first.nextCursor);
  assert.equal(
    (await json(await context.request.get(origin + collection + '?limit=100'))).items.length,
    21,
  );
  assert.equal((await context.request.get(origin + collection + '?limit=0')).status(), 400);
  assert.equal((await context.request.get(origin + collection + '?limit=101')).status(), 400);
  assert.equal((await context.request.get(origin + collection + '?cursor=invalid')).status(), 400);
  assert.equal(
    (
      await json(
        await context.request.get(origin + `/api/v2/journals/${otherJournal.id}/documents`),
      )
    ).total,
    0,
  );
  await page.getByRole('button', { name: '일지 목록', exact: true }).click();
  await page.locator('.document-row').filter({ hasText: journal.title }).click();
  await expect(page.locator('[aria-label="일지 문서"] .document-row')).toHaveCount(20);
  const loadedTitles = await page
    .locator('[aria-label="일지 문서"] .document-row strong')
    .allTextContents();
  const ordered = await json(await context.request.get(origin + collection + '?limit=20'));
  assert.deepEqual(
    loadedTitles,
    ordered.items.map((item) => item.title),
  );
  await page.route(`**${collection}?*`, (route) =>
    new URL(route.request().url()).searchParams.has('cursor')
      ? route.fulfill({ status: 500, json: { code: 'CURSOR_TEST_FAILURE' } })
      : route.continue(),
  );
  await page.getByRole('button', { name: '문서 더 불러오기', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('문서 목록을 불러오지 못했습니다');
  await expect(page.locator('[aria-label="일지 문서"] .document-row')).toHaveCount(20);
  await expect(page.locator('.journal-viewer')).toContainText(journal.body);
  await expect(page.getByRole('button', { name: '새 글 작성', exact: true })).toBeEnabled();
  await page.unroute(`**${collection}?*`);
  await page.getByRole('button', { name: '다음 페이지 재시도', exact: true }).click();
  await expect(page.locator('[aria-label="일지 문서"] .document-row')).toHaveCount(21);
  await expect(page.locator('h1')).not.toBeFocused();
  await expect(page.locator('.journal-document-heading')).toContainText('21개');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: path.join(output, `journal-detail-many-${width}.png`),
      fullPage: true,
    });
  }
  for (const extra of extraDocuments)
    await json(await context.request.delete(origin + `/api/v2/documents/${extra.id}`, { headers }));
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, 'documents-result.json'),
    JSON.stringify(
      {
        documentId: created.id,
        journalId: journal.id,
        attachmentIds: restored.attachmentIds,
        serializedSaves: saveBodies.map((body) => body.title),
        publicationOrder: sequence,
        blockTypes: restored.content.map((block) => block.type),
        browserErrors: errors,
        multipartOverflow,
      },
      null,
      2,
    ),
  );
  console.log(
    'Real documents: creation, serialized save, lost-response recovery, publication, blocks, authenticated attachments, viewer and responsive checks passed.',
  );
}
