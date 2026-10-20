import { expect, it } from 'vitest';
import { parseTask, patchBody, taskDraft, taskPresentation } from './apiModel';
import { TaskStore, taskParams } from './apiStore';
import { createHttpClient, Lifecycle } from '../../shared/http/client';
const id = '00000000-0000-0000-0000-000000000001';
const source = {
  type: 'github',
  linkId: id,
  issueId: 501,
  issueNumber: 2,
  repository: 'team/demo',
  htmlUrl: 'https://github.com/team/demo/issues/2',
  statusReason: 'mapping_conflict',
  contentError: null,
  paused: false,
  lastAppliedAt: '2026-10-20T00:00:00Z',
  sourceUpdatedAt: '2026-10-20T00:00:00Z',
  conflictLabelIds: [1, 2],
  editableFields: ['priority', 'tag'],
  issueState: 'open',
  issueStateReason: null,
};
const dto = {
  id,
  projectId: id,
  revision: 1,
  title: 'Protected',
  description: 'body',
  projectName: 'Project',
  categoryId: null,
  status: 'todo',
  priority: 'normal',
  tag: '',
  deletedAt: null,
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T00:00:00Z',
  source,
};
it('preserves source through presentation and only patches changed local fields', () => {
  const task = parseTask(dto);
  expect(taskPresentation(task).source).toEqual(source);
  expect(
    patchBody(task, {
      ...taskDraft(task),
      title: 'forbidden',
      status: 'done',
      priority: '높음',
      tag: 'triage',
    }),
  ).toEqual({ revision: 1, priority: 'high', tag: 'triage' });
});
it('retains sourceReason in stats but no list-only parameters', () => {
  const params = taskParams({
    category: 'all',
    projectStatus: 'all',
    query: '',
    sourceReason: 'not_planned',
  });
  expect(params.get('sourceReason')).toBe('not_planned');
  expect(params.has('deleted')).toBe(false);
});
it('blocks a managed status mutation before network and accepts equal-revision source updates', async () => {
  const lifecycle = new Lifecycle();
  let calls = 0;
  const store = new TaskStore({
    lifecycle,
    generation: 0,
    recoverSecurity: async () => {},
    request: createHttpClient({
      lifecycle,
      fetch: async () => {
        calls++;
        return Response.json(dto);
      },
    }),
  });
  store.adopt(parseTask(dto), 1);
  await expect(
    store.mutate('patch', { id, body: { revision: 1, status: 'todo' } }),
  ).rejects.toMatchObject({ code: 'TASK_SOURCE_MANAGED' });
  expect(calls).toBe(0);
  const changed = parseTask({
    ...dto,
    source: { ...source, lastAppliedAt: '2026-10-20T01:00:00Z' },
  });
  expect(store.adopt(changed, 2).source?.lastAppliedAt).toBe('2026-10-20T01:00:00Z');
  store.hideSources();
  expect(store.entities.has(id)).toBe(false);
  expect(store.isProtected(id)).toBe(true);
  store.dispose();
});
it('partial responses retire old source data without sibling columns cancelling fresh normal Tasks', async () => {
  const lifecycle = new Lifecycle();
  const normalId = '00000000-0000-0000-0000-000000000002';
  const store = new TaskStore({
    lifecycle,
    generation: 0,
    recoverSecurity: async () => {},
    request: createHttpClient({
      lifecycle,
      fetch: async (input) => {
        const status = new URL(String(input), 'http://localhost').searchParams.get('status');
        return Response.json({
          items:
            status === 'todo' ? [{ ...dto, id: normalId, source: null, title: 'Ordinary' }] : [],
          total: status === 'todo' ? 1 : 0,
          nextCursor: null,
          externalDataUnavailable: true,
        });
      },
    }),
  });
  const filter = {
    category: 'all' as const,
    projectStatus: 'all' as const,
    query: '',
    deleted: false,
    limit: 20,
  };
  const todo = store.list({ ...filter, status: 'todo' }),
    doing = store.list({ ...filter, status: 'doing' }),
    done = store.list({ ...filter, status: 'done' });
  const protectedTask = parseTask(dto);
  store.adopt(protectedTask, 1);
  todo.seed({ items: [protectedTask], total: 1, nextCursor: null, cursors: [] });
  await todo.load();
  await Promise.all([doing.load(), done.load()]);
  expect(todo.getSnapshot()).toMatchObject({
    status: 'ready',
    data: { items: [{ id: normalId, title: 'Ordinary' }], externalDataUnavailable: true },
  });
  expect(doing.getSnapshot().status).toBe('ready');
  expect(done.getSnapshot().status).toBe('ready');
  expect(store.entities.has(id)).toBe(false);
  expect(store.isProtected(id)).toBe(true);
  store.dispose();
});
