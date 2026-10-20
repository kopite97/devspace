import { test, expect, type Page } from '@playwright/test';
import { setup as setupTasks, id, task, project } from '../tasks/fixtures';
const link = {
  id: id(200),
  projectId: id(1),
  installationId: 101,
  repositoryId: 202,
  fullName: 'team/demo',
  htmlUrl: 'https://github.com/team/demo',
  paused: false,
  revision: 1,
  status: 'ready',
  accessStatus: 'verified',
};
const source = {
  type: 'github',
  linkId: id(200),
  issueId: 501,
  issueNumber: 42,
  repository: 'team/demo',
  htmlUrl: 'https://github.com/team/demo/issues/42',
  statusReason: null,
  contentError: null,
  paused: false,
  lastAppliedAt: '2026-10-20T00:00:00Z',
  sourceUpdatedAt: '2026-10-20T00:00:00Z',
  conflictLabelIds: [],
  editableFields: ['priority', 'tag'],
  issueState: 'open',
  issueStateReason: null,
};
async function setup(page: Page) {
  const tasks = await setupTasks(page);
  const state = {
    access: 'verified',
    account: 'connected',
    failImport: false,
    rateLimit: false,
    settings: {
      revision: 1,
      generation: 1,
      enabled: false,
      paused: false,
      baselineReady: true,
      criteria: { labelIds: [] as number[], assigneeIds: [] as number[] },
      mapping: { todoLabelId: 1, doingLabelId: 2, doneLabelId: null as number | null },
    },
    writes: [] as { path: string; body: Record<string, unknown>; key?: string; csrf?: string }[],
    requests: [] as URL[],
    jobState: 'completed',
    connections: [{ ...link }],
    taskReads: tasks.requests,
  };
  const job = () => ({
    id: id(300),
    linkId: link.id,
    kind: 'import',
    state: state.jobState,
    errorCode: null,
    completedCount: 1,
    failedCount: state.jobState === 'partial' ? 1 : 0,
    items: [
      { issueId: 501, state: 'completed', taskId: id(50), errorCode: null },
      ...(state.jobState === 'partial'
        ? [{ issueId: 502, state: 'failed', taskId: null, errorCode: 'CONTENT_LIMIT_EXCEEDED' }]
        : []),
    ],
  });
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (!path.includes('/github')) return route.fallback();
    state.requests.push(url);
    const body = req.postData() ? req.postDataJSON() : {};
    if (req.method() !== 'GET')
      state.writes.push({
        path,
        body,
        key: req.headers()['idempotency-key'],
        csrf: req.headers()['x-csrf-token'],
      });
    if (path.endsWith('/account'))
      return route.fulfill({
        json: {
          status: state.account,
          githubUserId: 1,
          login: 'demo',
          reauthorizationRequired: false,
          installationUrl: 'https://github.com/apps/test/installations/new',
        },
      });
    if (path.endsWith('/installations'))
      return route.fulfill({
        json: {
          items: [
            {
              id: 101,
              accountLogin: 'team',
              accountType: 'Organization',
              suspended: false,
              issuesReadable: true,
            },
          ],
          total: 1,
          nextPage: null,
        },
      });
    if (path.includes('/installations/') && path.endsWith('/repositories'))
      return route.fulfill({
        json: {
          items: [
            {
              id: 202,
              fullName: 'team/demo',
              htmlUrl: link.htmlUrl,
              privateRepository: true,
              issuesEnabled: true,
            },
          ],
          total: 1,
          nextPage: null,
        },
      });
    if (path.endsWith('/repositories')) {
      if (req.method() === 'POST') return route.fulfill({ status: 201, json: link });
      return route.fulfill({
        json: state.connections.map((l) => ({
          ...l,
          accessStatus: state.access,
          fullName: state.access === 'verified' ? l.fullName : null,
        })),
      });
    }
    if (
      path.endsWith('/import-settings') ||
      path.endsWith('/status-mapping') ||
      path.endsWith('/sync-settings')
    ) {
      if (req.method() !== 'GET') {
        if (body.revision !== state.settings.revision)
          return route.fulfill({ status: 409, json: { code: 'REVISION_CONFLICT' } });
        state.settings = {
          ...state.settings,
          revision: state.settings.revision + 1,
          ...(path.endsWith('/sync-settings')
            ? { paused: body.paused }
            : path.endsWith('/import-settings')
              ? {
                  enabled: body.enabled,
                  criteria: { labelIds: body.labelIds, assigneeIds: body.assigneeIds },
                }
              : {
                  mapping: {
                    todoLabelId: body.todoLabelId,
                    doingLabelId: body.doingLabelId,
                    doneLabelId: body.doneLabelId,
                  },
                }),
        };
      }
      return route.fulfill({ json: state.settings });
    }
    if (path.endsWith('/sync-status'))
      return route.fulfill({
        json: {
          coverage: {
            state: 'initial_scope_collected',
            lastSuccessfulSyncAt: '2026-10-20T00:00:00Z',
            closedUpdatedWithinDays: 90,
          },
          paused: state.settings.paused,
          projectStatus: 'active',
          baselineReady: true,
          lastTaskAppliedAt: null,
          latestJob: null,
          latestCollectionJob: null,
          latestTaskJob: null,
        },
      });
    if (path.endsWith('/labels'))
      return route.fulfill({
        json: {
          items: [
            { id: 1, name: 'Backlog', color: 'ffffff' },
            { id: 2, name: 'Doing', color: '000000' },
          ],
          total: 2,
          nextCursor: null,
        },
      });
    if (path.endsWith('/issues')) {
      if (state.rateLimit)
        return route.fulfill({
          status: 429,
          headers: { 'Retry-After': '60' },
          json: { code: 'GITHUB_RATE_LIMITED' },
        });
      return route.fulfill({
        json: {
          items: [
            {
              id: 501,
              number: 42,
              title: 'Remote issue',
              body: '**Safe** <img src=x onerror=alert(1)>',
              state: 'open',
              htmlUrl: source.htmlUrl,
              labelIds: [1],
              assigneeIds: [12],
              contentOverflow: false,
            },
          ],
          total: 1,
          nextCursor: null,
          coverage: {
            state: 'initial_scope_collected',
            lastSuccessfulSyncAt: null,
            closedUpdatedWithinDays: 90,
          },
        },
      });
    }
    if (path.endsWith('-previews'))
      return route.fulfill({
        json: {
          revision: state.settings.revision,
          baselineReady: true,
          total: 1,
          nextAfterIssueId: null,
          items: (body.issueIds ?? [501]).map((issueId: number) => ({
            issueId,
            issueNumber: 42,
            taskId: null,
            status: 'todo',
            statusReason: null,
            errorCode: null,
            matches: false,
            excluded: true,
          })),
        },
      });
    if (
      path.endsWith('/task-imports') ||
      path.endsWith('/sync-requests') ||
      path.endsWith('/issue-fetches')
    ) {
      if (state.failImport) {
        state.failImport = false;
        return route.abort();
      }
      Object.assign(tasks.tasks[0], { source, title: 'Imported task' });
      return route.fulfill({ status: 202, json: { jobId: id(300) } });
    }
    if (path.includes('/jobs/')) return route.fulfill({ json: job() });
    if (req.method() === 'DELETE') return route.fulfill({ status: 202, json: { jobId: id(300) } });
    return route.fulfill({ status: 404, json: { code: 'RESOURCE_NOT_FOUND' } });
  });
  return { state, tasks };
}
async function manage(page: Page) {
  await page.goto('/projects/' + id(1));
  await page.getByRole('button', { name: '저장소 관리', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Issue 가져오기', exact: true })).toBeVisible();
}
test('result deep link verifies account and does not trust success query', async ({ page }) => {
  const { state } = await setup(page);
  state.account = 'disconnected';
  await page.goto('/github/connection-result?github=connected');
  await expect(page.getByText('연결되지 않음', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'GitHub 계정 연결', exact: true })).toBeEnabled();
});
test('explicit import permits criteria mismatch/exclusion, sends CSRF/key and refreshes Task', async ({
  page,
}) => {
  const { state } = await setup(page);
  await manage(page);
  await page.getByLabel('Issue #42 선택').check();
  await page.getByRole('button', { name: '선택 미리보기', exact: true }).click();
  await expect(page.getByText(/자동 조건 불일치/)).toBeVisible();
  await page.getByRole('button', { name: '선택 Issue 가져오기', exact: true }).click();
  await expect(page.getByText('작업 ID ' + id(300), { exact: true })).toBeVisible();
  await expect(page.getByText('Imported task', { exact: true })).toBeVisible();
  const write = state.writes.find((w) => w.path.endsWith('/task-imports'))!;
  expect(write.body).toEqual({ revision: 1, issueIds: [501] });
  expect(write.key).toBeTruthy();
  expect(write.csrf).toBe('test');
});
test('uncertain request reuses its body/key', async ({ page }) => {
  const { state } = await setup(page);
  state.failImport = true;
  await manage(page);
  await page.getByLabel('Issue #42 선택').check();
  await page.getByRole('button', { name: '선택 미리보기', exact: true }).click();
  await page.getByRole('button', { name: '선택 Issue 가져오기', exact: true }).click();
  await page.getByRole('button', { name: '동일 요청으로 결과 확인' }).click();
  const writes = state.writes.filter((w) => w.path.endsWith('/task-imports'));
  expect(writes).toHaveLength(2);
  expect(writes[1].body).toEqual(writes[0].body);
  expect(writes[1].key).toBe(writes[0].key);
});
test('automatic settings are flat and no-op save is disabled', async ({ page }) => {
  const { state } = await setup(page);
  await manage(page);
  await page.getByRole('button', { name: '동기화·설정', exact: true }).click();
  await expect(page.getByRole('button', { name: '자동 가져오기 설정 저장' })).toBeDisabled();
  await page.getByLabel('자동 가져오기 활성화').check();
  await expect(page.getByText('빈 조건은 모든 Issue와 일치합니다.')).toBeVisible();
  await page.getByRole('button', { name: '자동 가져오기 설정 저장' }).click();
  await expect(
    page.getByText('설정을 저장했습니다. 비동기 처리 상태와 Task 반영 결과를 확인해 주세요.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '자동 가져오기 설정 저장' })).toBeDisabled();
  expect(state.writes.find((w) => w.path.endsWith('/import-settings'))!.body).toEqual({
    revision: 1,
    enabled: true,
    labelIds: [],
    assigneeIds: [],
  });
});
test('manual status refresh preserves unsaved settings', async ({ page }) => {
  await setup(page);
  await manage(page);
  await page.getByRole('button', { name: '동기화·설정', exact: true }).click();
  await page.getByLabel('자동 가져오기 라벨 ID', { exact: true }).fill('7');
  await page.getByRole('button', { name: '상태 새로고침', exact: true }).click();
  await expect(page.getByLabel('자동 가져오기 라벨 ID', { exact: true })).toHaveValue('7');
  await expect(page.getByRole('button', { name: '자동 가져오기 설정 저장' })).toBeEnabled();
});
test('source-managed editor blocks source fields and only patches priority/tag', async ({
  page,
}) => {
  const { tasks } = await setup(page);
  Object.assign(tasks.tasks[0], { source });
  await page.goto('/tasks');
  const card = page.locator('[data-task-id="' + id(50) + '"]');
  await expect(card).toHaveAttribute('draggable', 'false');
  await expect(card.getByRole('combobox')).toBeDisabled();
  await card.getByRole('button', { name: 'Task 50', exact: true }).click();
  await expect(page.getByLabel('태스크 제목')).toBeDisabled();
  await page.getByLabel('태그', { exact: true }).fill('triage');
  await page.getByRole('button', { name: '태스크 저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(tasks.writes.at(-1)!.body).toEqual({ revision: 1, tag: 'triage' });
});
test('rate limit suspends automatic retries and HTML is never executed', async ({ page }) => {
  const { state } = await setup(page);
  await manage(page);
  await page.getByText('본문 보기', { exact: true }).click();
  await expect(page.locator('.safe-markdown img')).toHaveCount(0);
  await expect(page.locator('.safe-markdown strong')).toHaveText('Safe');
  state.rateLimit = true;
  await page.getByRole('button', { name: '목록 새로고침', exact: true }).click();
  await expect(page.getByText(/GITHUB_RATE_LIMITED/)).toBeVisible();
  const before = state.requests.filter((r) => r.pathname.endsWith('/issues')).length;
  await page.waitForTimeout(3300);
  expect(state.requests.filter((r) => r.pathname.endsWith('/issues')).length).toBe(before);
});
test('access loss removes original content and keeps cleanup available', async ({ page }) => {
  const { state } = await setup(page);
  await manage(page);
  await expect(page.getByText('#42 Remote issue', { exact: true })).toBeVisible();
  state.access = 'denied';
  await page.getByRole('button', { name: '연결 새로고침', exact: true }).click();
  await expect(page.getByText('#42 Remote issue', { exact: true })).toHaveCount(0);
  await page.getByText('저장소 연결 해제·정리', { exact: true }).click();
  await expect(page.getByRole('button', { name: '남은 보호 Task 영구 삭제·해제' })).toBeEnabled();
});
test('partial import retries only failed IDs through a new preview', async ({ page }) => {
  const { state } = await setup(page);
  state.jobState = 'partial';
  await manage(page);
  await page.getByLabel('Issue #42 선택').check();
  await page.getByRole('button', { name: '선택 미리보기', exact: true }).click();
  await page.getByRole('button', { name: '선택 Issue 가져오기', exact: true }).click();
  await page.getByRole('button', { name: '실패 항목만 다시 미리보기' }).click();
  await expect
    .poll(
      () =>
        state.writes.filter((w) => w.path.endsWith('/task-import-previews')).at(-1)?.body.issueIds,
    )
    .toEqual([502]);
});
test('mapping requires impact preview, distinct IDs and nullable Done', async ({ page }) => {
  const { state } = await setup(page);
  await manage(page);
  await page.getByRole('button', { name: '동기화·설정', exact: true }).click();
  await page.getByLabel('할 일 라벨 ID', { exact: true }).fill('2');
  await page.getByRole('button', { name: '매핑 영향 미리보기' }).click();
  await expect(page.getByText('상태 라벨은 중복 지정할 수 없습니다.')).toBeVisible();
  await page.getByLabel('할 일 라벨 ID', { exact: true }).fill('3');
  await expect(page.getByRole('button', { name: '매핑 저장', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '매핑 영향 미리보기' }).click();
  await page.getByRole('button', { name: '매핑 저장', exact: true }).click();
  await expect
    .poll(() => state.writes.find((w) => w.path.endsWith('/status-mapping'))?.body)
    .toEqual({ revision: 1, todoLabelId: 3, doingLabelId: 2, doneLabelId: null });
});
test('focus refresh does not overwrite unsaved criteria and blocks stale revision writes', async ({
  page,
}) => {
  const { state } = await setup(page);
  await manage(page);
  await page.getByRole('button', { name: '동기화·설정', exact: true }).click();
  await page.getByLabel('자동 가져오기 라벨 ID', { exact: true }).fill('7');
  state.settings.revision = 2;
  state.settings.criteria.labelIds = [8];
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText(/서버 설정이 변경되었습니다/)).toBeVisible();
  await expect(page.getByLabel('자동 가져오기 라벨 ID', { exact: true })).toHaveValue('7');
  await expect(page.getByRole('button', { name: '자동 가져오기 설정 저장' })).toBeDisabled();
  await page.getByRole('button', { name: '최신 설정 불러오기' }).click();
  await expect(page.getByLabel('자동 가져오기 라벨 ID', { exact: true })).toHaveValue('8');
});
test('pause stops import but permits source collection', async ({ page }) => {
  const { state } = await setup(page);
  await manage(page);
  await page.getByRole('button', { name: 'Task 동기화 중지', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Task 동기화 재개', exact: true })).toBeVisible();
  await expect(page.getByLabel('Issue #42 선택')).toBeDisabled();
  await expect(page.getByRole('button', { name: '수동 재동기화', exact: true })).toBeEnabled();
  expect(state.settings.paused).toBe(true);
});
test('repository selection only connects server-provided installation/repository IDs', async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto('/projects/' + id(1));
  await page.getByRole('button', { name: '저장소 연결', exact: true }).click();
  await page.getByRole('button', { name: '저장소 선택', exact: true }).click();
  await page.getByRole('button', { name: '연결', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.writes.find((w) => w.path.endsWith('/repositories'))).toMatchObject({
    body: { installationId: 101, repositoryId: 202 },
    csrf: 'test',
  });
});
test('current session expiration hides private source data', async ({ page }) => {
  await setup(page);
  await manage(page);
  await page.route('**/api/v2/projects/*/github/repositories', (route) =>
    route.fulfill({ status: 401, json: { code: 'AUTH_REQUIRED' } }),
  );
  await page.getByRole('button', { name: '연결 새로고침', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '로그인하여 계속하세요', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('#42 Remote issue', { exact: true })).toHaveCount(0);
});
test('mobile repository management stays within viewport and is keyboard accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await manage(page);
  await expect(page.getByLabel('Issue #42 선택')).toBeVisible();
  await page.getByLabel('Issue #42 선택').focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Issue #42 선택')).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('partial source access keeps normal Task columns and accurate server totals usable', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/v2/tasks?**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const items =
      params.get('deleted') === 'false' && params.get('status') === 'todo' ? [task()] : [];
    await route.fulfill({
      json: { items, total: items.length, nextCursor: null, externalDataUnavailable: true },
    });
  });
  await page.goto('/tasks');
  await expect(page.getByRole('button', { name: 'Task 50', exact: true })).toBeVisible();
  await expect(page.getByText(/일부 GitHub 데이터는 접근 권한/)).toBeVisible();
  await expect(page.getByText('불러오지 못했습니다.', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Task 50', exact: true }).click();
  await expect(page.getByLabel('태스크 제목')).toBeEnabled();
});
test('source reason is shared by list and stats without stats-only forbidden filters', async ({
  page,
}) => {
  const { tasks } = await setup(page);
  await page.goto('/tasks');
  await page.getByLabel('GitHub 상태 필터', { exact: true }).selectOption('not_planned');
  await expect
    .poll(
      () =>
        tasks.requests.filter(
          (u) =>
            u.pathname === '/api/v2/tasks/stats' &&
            u.searchParams.get('sourceReason') === 'not_planned',
        ).length,
    )
    .toBeGreaterThan(0);
  const stats = tasks.requests.filter(
    (u) => u.pathname.endsWith('/stats') && u.searchParams.get('sourceReason') === 'not_planned',
  );
  expect(stats.every((u) => !u.searchParams.has('status') && !u.searchParams.has('deleted'))).toBe(
    true,
  );
  expect(
    tasks.requests.some(
      (u) => u.pathname === '/api/v2/tasks' && u.searchParams.get('sourceReason') === 'not_planned',
    ),
  ).toBe(true);
});
test('cleanup accepts flat JSON and immediately hides protected Issues', async ({ page }) => {
  const { state } = await setup(page);
  await page.route('**/github/repositories/*/cleanup-requests', async (route) => {
    state.connections = [];
    const request = route.request();
    state.writes.push({
      path: new URL(request.url()).pathname,
      body: request.postDataJSON(),
      key: request.headers()['idempotency-key'],
    });
    await route.fulfill({ status: 202, json: { jobId: id(300) } });
  });
  page.on('dialog', (dialog) => dialog.accept());
  await manage(page);
  await page.getByText('저장소 연결 해제·정리', { exact: true }).click();
  await page
    .getByRole('button', { name: '접근 불가·부분 해제의 남은 Task 정리', exact: true })
    .click();
  await expect(page.getByText('#42 Remote issue', { exact: true })).toHaveCount(0);
  await expect(page.getByText('작업 ID ' + id(300), { exact: true })).toBeVisible();
  expect(state.writes.find((w) => w.path.endsWith('/cleanup-requests'))).toMatchObject({
    body: { revision: 1, disposition: 'purge' },
    key: undefined,
  });
});
test('Issue cursor, numeric filter groups and preview seek remain independent', async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.route('**/github/repositories/*/issues?**', (route) => {
    const url = new URL(route.request().url());
    state.requests.push(url);
    return route.fulfill({
      json: {
        items: [
          {
            id: 501,
            number: 42,
            title: 'Remote issue',
            body: '',
            state: 'open',
            htmlUrl: source.htmlUrl,
            labelIds: [],
            assigneeIds: [],
            contentOverflow: false,
          },
        ],
        total: 2,
        nextCursor: url.searchParams.has('cursor') ? null : 'issue-cursor',
        coverage: {
          state: 'initial_scope_collected',
          lastSuccessfulSyncAt: null,
          closedUpdatedWithinDays: 90,
        },
      },
    });
  });
  await manage(page);
  await page.getByRole('button', { name: '다음 Issue', exact: true }).click();
  await expect
    .poll(() => state.requests.some((u) => u.searchParams.get('cursor') === 'issue-cursor'))
    .toBe(true);
  await page.getByLabel('Issue #42 선택').check();
  await page.getByLabel('라벨 ID (모두 일치)', { exact: true }).fill('7,8');
  await page.getByLabel('담당자 numeric ID (하나 이상 일치)', { exact: true }).fill('12,13');
  await page.getByLabel('페이지 크기', { exact: true }).fill('100');
  await page.getByRole('button', { name: '필터 적용', exact: true }).click();
  await expect(page.getByLabel('Issue #42 선택')).not.toBeChecked();
  await expect
    .poll(() =>
      state.requests
        .filter((u) => u.pathname.endsWith('/issues'))
        .at(-1)
        ?.searchParams.get('limit'),
    )
    .toBe('100');
  const request = state.requests.filter((u) => u.pathname.endsWith('/issues')).at(-1)!;
  expect(request.searchParams.has('cursor')).toBe(false);
  expect(request.searchParams.get('labelIds')).toBe('7,8');
  expect(request.searchParams.get('assigneeIds')).toBe('12,13');
});
test('Task detail access loss hides an active managed editor without affecting normal Task edits', async ({
  page,
}) => {
  const { tasks } = await setup(page);
  Object.assign(tasks.tasks[0], { source });
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Task 50', exact: true }).click();
  await page.getByLabel('태그', { exact: true }).fill('unsaved-private');
  await page.route('**/api/v2/tasks/' + id(50), (route) =>
    route.fulfill({ status: 404, json: { code: 'RESOURCE_NOT_FOUND' } }),
  );
  // A current detail read is the same protected boundary used by conflict reloads.
  await page.route('**/api/v2/tasks/' + id(50), (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 409, json: { code: 'REVISION_CONFLICT' } })
      : route.fallback(),
  );
  await page.getByRole('button', { name: '태스크 저장', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '접근 상태 확인 필요', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('태그', { exact: true })).toHaveCount(0);
});
test('UTF-16 boundary content is preserved and content errors clear on an equal-revision refresh', async ({
  page,
}) => {
  const { tasks } = await setup(page);
  const title = '😀'.repeat(80),
    description = '😀'.repeat(5000);
  Object.assign(tasks.tasks[0], {
    source: { ...source, contentError: 'content_limit_exceeded' },
    title,
    description,
  });
  await page.goto('/tasks');
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByLabel('태스크 제목')).toHaveValue(title);
  await expect(page.getByRole('textbox', { name: '상세 내용', exact: true })).toHaveValue(
    description,
  );
  await expect(
    page.getByRole('dialog').getByText('원문 길이 초과 · 마지막 정상 내용을 표시합니다.'),
  ).toBeVisible();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  Object.assign(tasks.tasks[0], { source: { ...source, contentError: null } });
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('원문 길이 초과 · 마지막 정상 내용을 표시합니다.'),
  ).toHaveCount(0);
});
test('selection caps at 100 across Issue pages and preview seek uses afterIssueId only', async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.route('**/github/repositories/*/issues?**', (route) => {
    const after = new URL(route.request().url()).searchParams.has('cursor');
    return route.fulfill({
      json: {
        items: Array.from({ length: after ? 1 : 100 }, (_, i) => ({
          id: after ? 999 : 500 + i,
          number: after ? 999 : 1 + i,
          title: 'Candidate',
          body: '',
          state: 'open',
          htmlUrl: source.htmlUrl,
          labelIds: [],
          assigneeIds: [],
          contentOverflow: false,
        })),
        total: 101,
        nextCursor: after ? null : 'next',
        coverage: {
          state: 'initial_scope_collected',
          lastSuccessfulSyncAt: null,
          closedUpdatedWithinDays: 90,
        },
      },
    });
  });
  await page.route('**/github/repositories/*/task-import-previews', async (route) => {
    const body = route.request().postDataJSON();
    state.writes.push({ path: new URL(route.request().url()).pathname, body });
    await route.fulfill({
      json: {
        revision: 1,
        baselineReady: true,
        total: 101,
        nextAfterIssueId: body.afterIssueId ? null : 599,
        items: [],
      },
    });
  });
  await manage(page);
  for (let number = 1; number <= 100; number++)
    await page.getByLabel(`Issue #${number} 선택`, { exact: true }).check();
  await page.getByRole('button', { name: '다음 Issue', exact: true }).click();
  await expect(page.getByLabel('Issue #999 선택', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '선택 미리보기', exact: true }).click();
  await page.getByRole('button', { name: '미리보기 다음', exact: true }).click();
  await expect.poll(() => state.writes.at(-1)?.body.afterIssueId).toBe(599);
  expect(state.writes.at(-1)?.body.issueIds).toHaveLength(100);
  expect(state.writes.at(-1)?.body).not.toHaveProperty('cursor');
});
test('Retry-After countdown expires once and requires an explicit retry', async ({ page }) => {
  await page.clock.install();
  await setup(page);
  await manage(page);
  let limited = true,
    calls = 0;
  await page.route('**/github/repositories/*/issues?**', async (route) => {
    calls++;
    if (limited)
      return route.fulfill({
        status: 429,
        headers: { 'Retry-After': '3' },
        json: { code: 'GITHUB_RATE_LIMITED' },
      });
    return route.fallback();
  });
  await page.getByRole('button', { name: '목록 새로고침', exact: true }).click();
  const retry = page.getByRole('button', { name: '다시 확인', exact: true });
  await expect(retry).toBeDisabled();
  await page.clock.fastForward(3100);
  await expect(retry).toBeEnabled();
  expect(calls).toBe(1);
  limited = false;
  await retry.click();
  await expect(page.getByText('#42 Remote issue', { exact: true })).toBeVisible();
  expect(calls).toBe(2);
});
for (const status of ['not_configured', 'reauthorization_required', 'disconnected']) {
  test(`account state ${status} is authoritative for result and reload`, async ({ page }) => {
    const { state } = await setup(page);
    state.account = status;
    await page.goto('/github/connection-result?github=connected');
    const text = {
      not_configured: '서버 설정 필요',
      reauthorization_required: '재인증 필요',
      disconnected: '연결되지 않음',
    }[status]!;
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  });
}
test('a service user switch clears Issue selection and old source responses', async ({ page }) => {
  const { tasks } = await setup(page);
  await manage(page);
  await page.getByLabel('Issue #42 선택').check();
  tasks.identity = {
    ...tasks.identity,
    id: id(999),
    displayName: 'Bob',
    workspace: { ...tasks.identity.workspace, id: id(998) },
  };
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.getByRole('region', { name: 'Bob · Workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '저장소 관리', exact: true }).click();
  await expect(page.getByLabel('Issue #42 선택')).not.toBeChecked();
});
test('converting a managed Task uses revision query and restores normal editing', async ({
  page,
}) => {
  const { tasks } = await setup(page);
  Object.assign(tasks.tasks[0], { source });
  let revision: string | null = null;
  await page.route('**/api/v2/tasks/*/github-issue?**', async (route) => {
    revision = new URL(route.request().url()).searchParams.get('revision');
    Object.assign(tasks.tasks[0], { source: null, revision: 2 });
    await route.fulfill({ status: 204 });
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Task 50', exact: true }).click();
  await page.getByRole('button', { name: '일반 Task로 전환', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Task 50', exact: true }).click();
  await expect(page.getByLabel('태스크 제목')).toBeEnabled();
  expect(revision).toBe('1');
});
test('restoring a source Task does not remove its source or claim current remote content', async ({
  page,
}) => {
  const { tasks } = await setup(page);
  Object.assign(tasks.tasks[0], {
    source: { ...source, paused: true },
    deletedAt: '2026-10-20T00:00:00Z',
  });
  await page.goto('/tasks');
  await page.getByRole('button', { name: '휴지통 (1)', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('Task 동기화 중지', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Task 50 복구', exact: true }).click();
  await expect.poll(() => tasks.tasks[0].deletedAt).toBeNull();
  expect(tasks.writes.at(-1)?.body).toEqual({ revision: 1 });
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.locator('[data-task-id="' + id(50) + '"]')).toHaveAttribute(
    'draggable',
    'false',
  );
});
for (const [reason, label] of Object.entries({
  mapping_conflict: '상태 라벨 충돌',
  not_planned: '진행하지 않음',
  unknown_closure: '종료 사유 확인 필요',
  mapping_error: '상태 매핑 오류',
})) {
  test(`source reason ${reason} preserves the server Task status`, async ({ page }) => {
    const { tasks } = await setup(page);
    Object.assign(tasks.tasks[0], {
      source: {
        ...source,
        statusReason: reason,
        conflictLabelIds: reason === 'mapping_conflict' ? [1, 2] : [],
        issueState: 'closed',
      },
      status: 'todo',
    });
    await page.goto('/tasks');
    const card = page.locator('[data-task-id="' + id(50) + '"]');
    await expect(card.getByText(label, { exact: true })).toBeVisible();
    await expect(card.getByRole('combobox')).toHaveValue('todo');
    await expect(card.getByRole('combobox')).toBeDisabled();
  });
}
test('archiving a paused project keeps pause separate and blocks import without blocking collection', async ({
  page,
}) => {
  const { state } = await setup(page);
  state.settings.paused = true;
  await page.route('**/api/v2/projects/' + id(1), async (route) =>
    route.fulfill({ json: { ...project(1), status: 'archived' } }),
  );
  await manage(page);
  await expect(page.getByText(/프로젝트 보관됨/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Task 동기화 재개', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Issue #42 선택')).toBeDisabled();
  await expect(page.getByRole('button', { name: '수동 재동기화', exact: true })).toBeEnabled();
  expect(state.settings.paused).toBe(true);
});

test('installation and repository pages use nextPage independently and empty installs explain approval', async ({
  page,
}) => {
  const { state } = await setup(page);
  let empty = true;
  await page.route('**/integrations/github/installations?**', (route) => {
    const p = Number(new URL(route.request().url()).searchParams.get('page'));
    return route.fulfill({
      json: {
        items: empty
          ? []
          : [
              {
                id: p === 1 ? 101 : 102,
                accountLogin: 'team-' + p,
                accountType: p === 1 ? 'User' : 'Organization',
                suspended: false,
                issuesReadable: true,
              },
            ],
        total: empty ? 0 : 2,
        nextPage: empty || p === 2 ? null : 2,
      },
    });
  });
  await page.route('**/installations/102/repositories?**', (route) => {
    const p = Number(new URL(route.request().url()).searchParams.get('page'));
    return route.fulfill({
      json: {
        items: [
          {
            id: p === 1 ? 202 : 203,
            fullName: 'team/repo-' + p,
            htmlUrl: 'https://github.com/team/repo-' + p,
            privateRepository: false,
            issuesEnabled: true,
          },
        ],
        total: 2,
        nextPage: p === 1 ? 2 : null,
      },
    });
  });
  await page.goto('/projects/' + id(1));
  await page.getByRole('button', { name: '저장소 연결', exact: true }).click();
  await expect(page.getByText(/설치가 없습니다/)).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  empty = false;
  await page.getByRole('button', { name: '저장소 연결', exact: true }).click();
  await page.getByRole('button', { name: '다음 설치', exact: true }).click();
  await expect(page.getByText('team-2 · Organization', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '저장소 선택', exact: true }).click();
  await page.getByRole('button', { name: '다음 저장소', exact: true }).click();
  await expect(page.getByText('team/repo-2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '연결', exact: true }).click();
  await expect
    .poll(() => state.writes.find((w) => w.path.endsWith('/repositories'))?.body)
    .toEqual({ installationId: 102, repositoryId: 203 });
});

test('baseline completion does not invent Tasks; a later server apply refreshes the board', async ({
  page,
}) => {
  await page.clock.install();
  const { state, tasks } = await setup(page);
  state.settings.baselineReady = false;
  let stage = 'baseline',
    complete = false;
  const job = () => ({
    id: id(stage === 'baseline' ? 301 : 302),
    linkId: link.id,
    kind: stage,
    state: complete ? 'completed' : 'running',
    completedCount: 0,
    failedCount: 0,
    errorCode: null,
    items: [],
  });
  await page.route('**/github/repositories/*/sync-status', (route) =>
    route.fulfill({
      json: {
        coverage: {
          state: 'initial_scope_collected',
          lastSuccessfulSyncAt: null,
          closedUpdatedWithinDays: 90,
        },
        paused: state.settings.paused,
        projectStatus: 'active',
        baselineReady: state.settings.baselineReady,
        lastTaskAppliedAt: null,
        latestJob: state.settings.enabled ? job() : null,
        latestCollectionJob: null,
        latestTaskJob: state.settings.enabled ? job() : null,
      },
    }),
  );
  await manage(page);
  await expect(page.getByText(/자동 가져오기 기준 상태 준비 중/)).toHaveCount(0);
  await page.getByRole('button', { name: '동기화·설정', exact: true }).click();
  await page.getByLabel('자동 가져오기 활성화').check();
  await page.getByRole('button', { name: '자동 가져오기 설정 저장', exact: true }).click();
  await expect(page.getByText(/자동 가져오기 기준 상태 준비 중/)).toBeVisible();
  complete = true;
  state.settings.baselineReady = true;
  await page.clock.fastForward(3100);
  await expect(page.getByText(/자동 가져오기 기준 상태 준비 중/)).toHaveCount(0);
  // Finish the baseline's refresh chain before simulating a later remote event.
  await page.waitForLoadState('networkidle');
  expect(tasks.tasks).toHaveLength(1);
  stage = 'apply';
  tasks.tasks.push(Object.assign(task(51), { title: 'Automatic transition', source }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('button', { name: 'Automatic transition', exact: true }),
  ).toBeVisible();
});

test('authorization rejects unsafe destinations and result notices remain separate from account state', async ({
  page,
}) => {
  const { state } = await setup(page);
  state.account = 'disconnected';
  await page.route('**/integrations/github/authorization-requests', (route) =>
    route.fulfill({ status: 201, json: { authorizationUrl: 'javascript:alert(1)' } }),
  );
  await page.goto('/github');
  await page.getByRole('button', { name: 'GitHub 계정 연결', exact: true }).click();
  await expect(
    page.getByText('안전한 GitHub 동의 주소를 확인하지 못했습니다.', { exact: true }),
  ).toBeVisible();
  for (const [result, text] of [
    ['denied', 'GitHub 연결을 취소했습니다.'],
    ['account_conflict', '다른 GitHub 계정과 충돌했습니다. 기존 연결을 먼저 정리해 주세요.'],
    ['failed', '연결하지 못했습니다. 현재 서비스 세션에서 다시 시작해 주세요.'],
  ]) {
    await page.goto('/github/connection-result?github=' + result);
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(page.getByText('연결되지 않음', { exact: true })).toBeVisible();
  }
});
