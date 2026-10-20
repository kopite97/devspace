import { expect, it, vi } from 'vitest';
import { createHttpClient, Lifecycle } from '../../shared/http/client';
import { QueryManager } from '../../shared/http/queryManager';
import { GitHubStore, repositoryBase } from './store';
const id = (n: number) => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
function setup(fetch: typeof globalThis.fetch) {
  const lifecycle = new Lifecycle(),
    manager = new QueryManager();
  const store = new GitHubStore(
    {
      lifecycle,
      generation: 0,
      recoverSecurity: async () => {},
      request: createHttpClient({ lifecycle, fetch, getCsrfToken: async () => 'csrf-test' }),
    },
    manager,
  );
  return { store, lifecycle, manager };
}
it('recovers an uncertain import with the identical body/key and uses CSRF for previews', async () => {
  const writes: { body: string | undefined; key: string | null; csrf: string | null }[] = [];
  let count = 0;
  const { store, manager } = setup(async (_input, init) => {
    const headers = new Headers(init?.headers);
    writes.push({
      body: init?.body as string | undefined,
      key: headers.get('Idempotency-Key'),
      csrf: headers.get('X-CSRF-Token'),
    });
    if (!count++) throw new Error('response lost');
    return Response.json({ jobId: id(9) }, { status: 202 });
  });
  const base = repositoryBase(id(1), id(2)),
    body = { revision: 1, issueIds: [501] };
  await expect(store.submit(base, 'task-imports', body)).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
  });
  await store.submit(base, 'task-imports', undefined, true);
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[0].csrf).toBe('csrf-test');
  expect(store.jobs.get(base)).toBe(id(9));
  expect(store.intents.size).toBe(0);
  manager.dispose();
  store.dispose();
});
it('does not replay old requests after logout or a new source generation', async () => {
  const { store, lifecycle, manager } = setup(async () => {
    throw new Error('lost');
  });
  const base = repositoryBase(id(1), id(2));
  await expect(
    store.submit(base, 'task-imports', { revision: 1, issueIds: [1] }),
  ).rejects.toBeDefined();
  store.protect(id(2));
  await expect(store.submit(base, 'task-imports', undefined, true)).rejects.toThrow('재시도 정보');
  lifecycle.reset();
  expect(store.intents.size).toBe(0);
  expect(store.jobs.size).toBe(0);
  manager.dispose();
});
it('discards late source responses after protection and shares concurrent reads', async () => {
  let resolve!: (value: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  const { store, manager } = setup(fetch);
  const query = store.read('/api/v2/integrations/github/test', (v) => v);
  const pending = query.load();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(store.read('/api/v2/integrations/github/test', (v) => v)).toBe(query);
  store.protect();
  resolve(Response.json({ privateTitle: 'must-not-return' }));
  await pending;
  expect(query.getSnapshot().data).toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(1);
  manager.dispose();
  store.dispose();
});
it('disconnect clears protected data immediately upon acceptance, not job completion', async () => {
  const { store, manager } = setup(async () => Response.json({ jobId: id(8) }, { status: 202 }));
  store.onProtected = vi.fn();
  await store.disconnect(repositoryBase(id(1), id(2)), 4, 'purge');
  expect(store.onProtected).toHaveBeenCalledWith(id(2));
  manager.dispose();
  store.dispose();
});
it('reconnecting one link rejects its late response while another project remains isolated', async () => {
  const responses = new Map<string, (value: Response) => void>();
  const { store, manager } = setup(
    (input) => new Promise((resolve) => responses.set(String(input), resolve)),
  );
  const first = repositoryBase(id(1), id(2)) + '/issues',
    second = repositoryBase(id(3), id(4)) + '/issues';
  const a = store.read(first, (v) => v),
    b = store.read(second, (v) => v);
  const pending = Promise.all([a.load(), b.load()]);
  await vi.waitFor(() => expect(responses.size).toBe(2));
  store.protect(id(2));
  responses.get(first)!(Response.json({ title: 'retired' }));
  responses.get(second)!(Response.json({ title: 'current' }));
  await pending;
  expect(a.getSnapshot().data).toBeUndefined();
  expect(b.getSnapshot()).toMatchObject({ status: 'ready', data: { title: 'current' } });
  manager.dispose();
  store.dispose();
});
it('shares one polling timer for the same job and stops on hidden, terminal, error and last exit', async () => {
  vi.useFakeTimers();
  const visibility = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document', visibility);
  let state = 'running',
    count = 0,
    limited = false;
  const { store, manager } = setup(async () => {
    count++;
    return limited
      ? Response.json({ code: 'GITHUB_RATE_LIMITED' }, { status: 429 })
      : Response.json({
          id: id(9),
          linkId: id(2),
          kind: 'import',
          state,
          errorCode: null,
          completedCount: 0,
          failedCount: 0,
          items: [],
        });
  });
  try {
    const base = repositoryBase(id(1), id(2)),
      query = store.job(id(9));
    const stopA = store.watchJob(base, id(9)),
      stopB = store.watchJob(base, id(9));
    await query.load();
    await vi.advanceTimersByTimeAsync(3000);
    expect(count).toBe(2);
    visibility.visibilityState = 'hidden';
    await vi.advanceTimersByTimeAsync(6000);
    expect(count).toBe(2);
    visibility.visibilityState = 'visible';
    visibility.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(count).toBe(3);
    stopA();
    limited = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(count).toBe(4);
    await vi.advanceTimersByTimeAsync(9000);
    expect(count).toBe(4);
    limited = false;
    state = 'completed';
    store.retryQuery(query);
    await vi.advanceTimersByTimeAsync(0);
    expect(count).toBe(5);
    await vi.advanceTimersByTimeAsync(6000);
    expect(count).toBe(5);
    stopB();
  } finally {
    store.dispose();
    manager.dispose();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
it('cleanup uses flat JSON and never assumes an idempotency replay contract', async () => {
  let body: unknown,
    headers = new Headers();
  const { store, manager } = setup(async (_input, init) => {
    body = JSON.parse(String(init?.body));
    headers = new Headers(init?.headers);
    return Response.json({ jobId: id(9) }, { status: 202 });
  });
  await store.cleanup(repositoryBase(id(1), id(2)), 7);
  expect(body).toEqual({ revision: 7, disposition: 'purge' });
  expect(headers.has('Idempotency-Key')).toBe(false);
  manager.dispose();
  store.dispose();
});
it('blocks new mutation attempts before the server Retry-After deadline', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  let calls = 0;
  const { store, manager } = setup(async () => {
    calls++;
    return calls === 1
      ? Response.json(
          { code: 'GITHUB_RATE_LIMITED' },
          { status: 429, headers: { 'Retry-After': '60' } },
        )
      : Response.json({ jobId: id(9) }, { status: 202 });
  });
  const base = repositoryBase(id(1), id(2));
  try {
    await expect(
      store.submit(base, 'task-imports', { revision: 1, issueIds: [1] }),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      store.submit(base, 'task-imports', { revision: 1, issueIds: [1] }),
    ).rejects.toMatchObject({ status: 429 });
    expect(calls).toBe(1);
    clock.mockReturnValue(61000);
    await expect(store.submit(base, 'task-imports', { revision: 1, issueIds: [1] })).resolves.toBe(
      id(9),
    );
  } finally {
    manager.dispose();
    store.dispose();
    clock.mockRestore();
  }
});
