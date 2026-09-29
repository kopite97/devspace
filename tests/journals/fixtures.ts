import { setup as setupDashboard } from '../dashboard/fixtures';
import { test as base, expect, type Page } from '@playwright/test';

export const id = (n: number) => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
export const project = (n: number, status: 'active' | 'archived' = 'active') => ({
  id: id(n),
  revision: 1,
  createdAt: '2026-09-13T00:00:00Z',
  updatedAt: '2026-09-13T00:00:00Z',
  name: 'Project ' + n,
  subtitle: '',

  stack: n % 2 ? 'C#' : 'Java',
  progress: 0,
  currentMilestone: '',
  repositoryUrl: '',
  status,
  categoryId: null,
});
export const journal = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: id(200 + n),
  revision: 1,
  createdAt: '2026-09-13T10:00:00Z',
  updatedAt: '2026-09-13T10:00:00Z',
  title: 'Journal ' + n,
  projectId: id(1),
  projectName: 'Project 1',
  categoryId: null,
  body: 'Body ' + n,
  entryDate: '2026-09-' + String(10 + n).padStart(2, '0'),
  ...overrides,
});
export const identity = {
  id: id(101),
  displayName: 'Alice',
  workspace: { id: id(102), name: 'Workspace', revision: 1 },
};

export async function setup(page: Page) {
  await setupDashboard(page);
  // This suite covers existing Journal CRUD; document success is verified against the real API.
  await page.route('**/api/v2/journals/*/documents?*', (route) => route.abort('failed'));
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: identity }));
  await page.route('**/api/v1/project-categories', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  );
  await page.route('**/api/v1/auth/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-token' } }),
  );
  await page.route('**/api/v2/overview?*', (route) =>
    route.fulfill({
      json: {
        category: 'all',
        projectId: null,
        projects: {
          total: 2,
          archived: 1,
          byCategory: [{ categoryId: null, total: 2, archived: 1 }],
        },
        tasks: { todo: 0, doing: 0, done: 0, total: 0 },
        asOf: '2026-09-13T00:00:00Z',
      },
    }),
  );
  await page.route('**/api/v2/projects?*', (route) =>
    route.fulfill({ json: { items: [project(1), project(2)], total: 2, nextCursor: null } }),
  );
  await page.route('**/api/v2/projects/*', (route) => route.fulfill({ json: project(1) }));
  await page.route('**/api/v2/projects/category-counts', (route) =>
    route.fulfill({
      json: {
        items: [{ categoryId: null, active: 2, archived: 0 }],
        totals: { active: 2, archived: 0 },
      },
    }),
  );
  await page.route('**/api/v2/tasks?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
  );
  await page.route('**/api/v2/tasks/stats?*', (route) =>
    route.fulfill({
      json: { counts: { todo: 0, doing: 0, done: 0 }, total: 0, asOf: '2026-09-13T00:00:00Z' },
    }),
  );
  await page.route('**/api/v2/links?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, nextCursor: null, collectionRevision: 0 } }),
  );
  await page.route('**/api/v2/milestones?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
  );
  await page.route('**/api/v2/journals?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
  );
}

export const test = base.extend<{ isolation: void }>({
  isolation: [
    async ({ context, page }, use) => {
      const excluded: string[] = [];
      const errors: string[] = [];
      const sentinels = [
        'projects',
        'tasks',
        'journals',
        'milestones',
        'links',
        'layout',
        'unrelated',
      ].map((name) => ['devspace.' + name + '.v1', '{preserve-' + name] as const);
      const observe = (target: Page) =>
        target.on('pageerror', (error) => errors.push(error.message));
      observe(page);
      context.on('page', observe);
      context.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (
          pathname.startsWith('/api/') &&
          !/^\/api\/(?:v1\/(?:me$|auth\/|project-categories(?:\/|$)|widget-types$|widgets(?:\/|$))|v2\/(?:projects(?:\/|$)|tasks(?:\/|$)|journals(?:\/|$)|milestones(?:\/|$)|links(?:\/|$)|overview$)|v3\/dashboards\/home(?:\/|$))/.test(
            pathname,
          )
        )
          excluded.push(pathname);
      });
      await context.addInitScript((values) => {
        if (location.origin !== 'http://127.0.0.1:4180') return;
        for (const [key, value] of values)
          if (!Object.hasOwn(localStorage, key)) localStorage.setItem(key, value);
        for (const key of ['getItem', 'setItem', 'removeItem', 'clear'] as const)
          Storage.prototype[key] = () => {
            throw new Error('Business storage access');
          };
      }, sentinels);
      await context.route('**/api/v2/projects/category-counts', (route) =>
        route.fulfill({
          json: {
            items: [{ categoryId: null, active: 0, archived: 0 }],
            totals: { active: 0, archived: 0 },
          },
        }),
      );
      await use();
      expect(excluded).toEqual([]);
      expect(errors).toEqual([]);
      for (const target of context.pages())
        if (target.url().startsWith('http://127.0.0.1:4180'))
          expect(await target.evaluate(() => Object.entries(localStorage).sort())).toEqual(
            sentinels.map(([key, value]) => [key, value]).sort(),
          );
    },
    { auto: true },
  ],
});
export { expect };
