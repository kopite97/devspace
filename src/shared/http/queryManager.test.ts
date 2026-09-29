import { expect, it, vi } from 'vitest';
import { QueryManager } from './queryManager';

const policy = { freshForMs: 1_000, gcAfterMs: 5_000, revalidateOnFocus: true } as const;
it('stops scheduling sweeps after eviction and can load the retained query adapter again', async () => {
  vi.useFakeTimers();
  const manager = new QueryManager();
  const fetcher = vi.fn(async () => ({ value: 1 }));
  const query = manager.get({
    key: 'document:gc',
    contract: 'document-detail',
    policy: { freshForMs: 0, gcAfterMs: 60000, revalidateOnFocus: false },
    fetcher,
  });
  await query.load();
  await vi.advanceTimersByTimeAsync(60001);
  expect(query.getSnapshot().data).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
  await query.load();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(query.getSnapshot().data).toEqual({ value: 1 });
  manager.dispose();
  vi.useRealTimers();
});

it('shares a successful query during its freshness window and revalidates after expiry', async () => {
  vi.useFakeTimers();
  const manager = new QueryManager();
  let calls = 0;
  const query = manager.get({
    key: 'projects:list:active',
    contract: 'project-list-v2',
    policy,
    fetcher: async () => ({ value: ++calls }),
  });

  await query.load();
  await query.load();
  expect(calls).toBe(1);
  vi.advanceTimersByTime(1_001);
  await query.load();
  expect(calls).toBe(2);
  manager.dispose();
  vi.useRealTimers();
});

it('does not extend the first-page freshness window for an additional page', async () => {
  vi.useFakeTimers();
  const manager = new QueryManager();
  let calls = 0;
  const query = manager.get({
    key: 'projects:list:all',
    contract: 'project-list-v2',
    policy,
    fetcher: async () => ({ page: ++calls }),
  });

  await query.load();
  vi.advanceTimersByTime(900);
  await query.load(async () => ({ page: ++calls }), { force: true, reason: 'page' });
  vi.advanceTimersByTime(101);
  await query.load();
  expect(calls).toBe(3);
  manager.dispose();
  vi.useRealTimers();
});

it('keeps data while a consumer is gone and evicts it after the idle policy', async () => {
  vi.useFakeTimers();
  const manager = new QueryManager();
  const query = manager.get({
    key: 'projects:detail:1',
    contract: 'project-detail-v2',
    policy,
    fetcher: async () => ({ id: 1 }),
  });
  await query.load();
  const unsubscribe = query.subscribe(() => {});
  unsubscribe();
  expect(query.getSnapshot().data).toEqual({ id: 1 });
  manager.sweep(Date.now() + policy.gcAfterMs + 1);
  expect(query.getSnapshot().data).toBeUndefined();
  manager.dispose();
  vi.useRealTimers();
});

it('rejects a conflicting definition for an existing key', () => {
  const manager = new QueryManager();
  manager.get({ key: 'same', contract: 'one', policy, fetcher: async () => 1 });
  expect(() =>
    manager.get({ key: 'same', contract: 'two', policy, fetcher: async () => 2 }),
  ).toThrow(/Conflicting query definition/);
  manager.dispose();
});

it('revalidates observed stale data on focus and forces explicit invalidation', async () => {
  vi.useFakeTimers();
  const manager = new QueryManager();
  let calls = 0;
  const query = manager.get({
    key: 'projects:list:focus',
    contract: 'project-list-v2',
    policy,
    fetcher: async () => ({ value: ++calls }),
  });
  const unsubscribe = query.subscribe(() => {});
  await query.load();
  vi.advanceTimersByTime(1_001);
  manager.revalidate();
  await query.load();
  expect(calls).toBe(2);
  query.invalidate();
  await query.load();
  expect(calls).toBe(3);
  unsubscribe();
  manager.dispose();
  vi.useRealTimers();
});

it('cancels an unobserved request without treating unmount as an explicit refresh', async () => {
  const manager = new QueryManager();
  let refreshes = 0;
  let aborted = false;
  const query = manager.get({
    key: 'projects:detail:unobserved',
    contract: 'project-detail-v2',
    policy,
    onRefresh: () => {
      refreshes++;
    },
    fetcher: (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      }),
  });
  const unsubscribe = query.subscribe(() => {});
  const work = query.load();
  await Promise.resolve();
  await Promise.resolve();
  unsubscribe();
  await work;
  expect(aborted).toBe(true);
  expect(refreshes).toBe(1);
  expect(query.getSnapshot()).toMatchObject({ status: 'idle', stale: true });
  manager.dispose();
});

it('keeps a shared query alive when one of multiple consumers leaves', async () => {
  const manager = new QueryManager();
  let calls = 0;
  const query = manager.get({
    key: 'projects:list:shared-consumers',
    contract: 'project-list-v2',
    policy,
    fetcher: async () => ({ value: ++calls }),
  });
  const first = query.subscribe(() => {});
  const second = query.subscribe(() => {});
  await query.load();
  first();
  await query.load();
  expect(query.consumerCount).toBe(1);
  expect(calls).toBe(1);
  second();
  manager.dispose();
});
