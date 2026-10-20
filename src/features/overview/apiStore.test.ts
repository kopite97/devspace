import { expect, it } from 'vitest';
import { createHttpClient, Lifecycle } from '../../shared/http/client';
import { OverviewStore } from './apiStore';
const data = (total: number) => ({
  category: 'all',
  projectId: null,
  projects: {
    total,
    archived: 0,
    byCategory: [{ categoryId: null, total, archived: 0 }],
  },
  tasks: { total: 0, todo: 0, doing: 0, done: 0 },
  asOf: '2026-09-13T00:00:00Z',
});
it('deduplicates identical filters and ignores old read publication across mutation invalidation', async () => {
  const pending: ((value: Response) => void)[] = [];
  const lifecycle = new Lifecycle();
  const store = new OverviewStore({
    lifecycle,
    generation: 0,
    recoverSecurity: async () => {},
    request: createHttpClient({
      lifecycle,
      fetch: () => new Promise((resolve) => pending.push(resolve)),
    }),
  });
  const query = store.query({ category: 'all' });
  expect(store.query({ category: 'all' })).toBe(query);
  const first = query.load();
  await new Promise((r) => setTimeout(r, 0));
  store.invalidate();
  const second = query.load();
  await new Promise((r) => setTimeout(r, 0));
  pending[1](Response.json(data(2)));
  await second;
  pending[0](Response.json(data(1)));
  await first;
  expect(query.getSnapshot().data?.projects.total).toBe(2);
});
it('reports partial external data through the composition boundary without changing server counts', async () => {
  const lifecycle = new Lifecycle();
  const store = new OverviewStore({
    lifecycle,
    generation: 0,
    recoverSecurity: async () => {},
    request: createHttpClient({
      lifecycle,
      fetch: async () => Response.json({ ...data(2), externalDataUnavailable: true }),
    }),
  });
  let protectedCount = 0;
  store.onPartial = () => {
    protectedCount++;
  };
  const query = store.query({ category: 'all' });
  await query.load();
  expect(protectedCount).toBe(1);
  expect(query.getSnapshot().data).toMatchObject({
    projects: { total: 2 },
    externalDataUnavailable: true,
  });
  store.dispose();
});
