import { parseCategoryFilter, type CategoryFilter } from '../projects/categoryFilter';
import { CancelledError, HttpError } from '../../shared/http/client';
import { Query } from '../../shared/http/query';
import type { PrivateTransport } from '../../shared/http/transport';
import { object, uuid } from '../../shared/http/validation';
import {
  parseTask,
  parseTaskPage,
  parseTaskStats,
  type ApiTask,
  type TaskPage,
  type TaskStats,
} from './apiModel';
import type { TaskStatus } from './presentation';
import { sourceReasons, type SourceReason } from './source';

export type TaskFilter = {
  category: CategoryFilter;
  projectId?: string;
  projectStatus: 'all' | 'active' | 'archived';
  query: string;
  sourceReason?: SourceReason;
};
export type TaskListFilter = TaskFilter & { status?: TaskStatus; deleted: boolean; limit: number };
export type TaskList = TaskPage & { cursors: string[] };
export function taskParams(filter: TaskFilter | TaskListFilter) {
  const params = new URLSearchParams({
    category: parseCategoryFilter(filter.category),
    projectStatus: filter.projectStatus,
    query: filter.query,
  });
  if (filter.projectId) params.set('projectId', uuid(filter.projectId));
  if (filter.sourceReason) {
    if (!sourceReasons.includes(filter.sourceReason)) throw new Error('Invalid source reason');
    params.set('sourceReason', filter.sourceReason);
  }
  if ('deleted' in filter) {
    if (!Number.isInteger(filter.limit) || filter.limit < 1 || filter.limit > 100)
      throw new Error('Invalid Task limit');
    params.set('deleted', String(filter.deleted));
    params.set('limit', String(filter.limit));
    if (filter.status) params.set('status', filter.status);
  }
  return params;
}
export class TaskStore {
  readonly entities = new Map<string, ApiTask>();
  private lists = new Map<string, Query<TaskList>>();
  private details = new Map<string, Query<ApiTask>>();
  private statistics = new Map<string, Query<TaskStats>>();
  private epoch = 0;
  private partialEpoch = -1;
  private readSequence = 0;
  private entityOrder = new Map<string, number>();
  private disposed = false;
  private lifetime = new AbortController();
  private pending = new Set<string>();
  onInvalidate = () => {};
  onProtected = () => {};
  private protectedIds = new Set<string>();
  private protectionListeners = new Set<() => void>();
  private protectionRevision = 0;
  subscribeProtection = (listener: () => void) => {
    this.protectionListeners.add(listener);
    return () => {
      this.protectionListeners.delete(listener);
    };
  };
  protectionSnapshot = () => this.protectionRevision;
  isProtected(id: string) {
    return this.protectedIds.has(id);
  }
  hideSources(linkId?: string, exclude?: Query<unknown>) {
    this.epoch++;
    for (const [id, task] of this.entities)
      if (task.source && (!linkId || task.source.linkId === linkId)) {
        this.protectedIds.add(id);
        this.entities.delete(id);
        this.entityOrder.delete(id);
      }
    for (const query of this.lists.values()) {
      if (query === exclude) continue;
      const state = query.getSnapshot();
      if (
        state.status === 'loading' ||
        state.data?.items.some((t) => t.source && (!linkId || t.source.linkId === linkId))
      )
        query.invalidate(true);
    }
    for (const [id, query] of this.details)
      if (this.protectedIds.has(id) || query.getSnapshot().status === 'loading') query.clearData();
    for (const query of this.statistics.values()) if (query !== exclude) query.invalidate(true);
    this.protectionRevision++;
    for (const listener of this.protectionListeners) listener();
    this.onProtected();
  }
  observePartial(exclude?: Query<unknown>) {
    if (this.partialEpoch === this.epoch) return;
    this.hideSources(undefined, exclude);
    this.partialEpoch = this.epoch;
  }
  constructor(readonly transport: PrivateTransport) {
    transport.lifecycle.signal.addEventListener('abort', () => this.dispose(), { once: true });
  }
  private prune() {
    const trim = <T>(map: Map<string, Query<T>>) => {
      const inactive = [...map.entries()].filter(([, query]) => !query.observed);
      for (const [key, query] of inactive.slice(0, Math.max(0, inactive.length - 32))) {
        query.cancel();
        map.delete(key);
      }
    };
    trim(this.lists);
    trim(this.details);
    trim(this.statistics);
    const retained = new Set([...this.details.keys(), ...this.pending]);
    for (const query of this.lists.values())
      for (const task of query.getSnapshot().data?.items ?? []) retained.add(task.id);
    for (const id of this.entities.keys())
      if (!retained.has(id)) {
        this.entities.delete(id);
        this.entityOrder.delete(id);
      }
  }
  private assert(epoch: number, signal: AbortSignal) {
    this.transport.lifecycle.assert(this.transport.generation);
    if (this.disposed || signal.aborted || epoch !== this.epoch) throw new CancelledError();
  }
  /** Equal revisions may contain newer derived Project names/categoryId. */
  adopt(task: ApiTask, order: number) {
    const previous = this.entities.get(task.id);
    if (
      previous &&
      (previous.revision > task.revision ||
        (previous.revision === task.revision && (this.entityOrder.get(task.id) ?? 0) > order))
    )
      return previous;
    this.entities.set(task.id, task);
    this.protectedIds.delete(task.id);
    this.entityOrder.set(task.id, order);
    return task;
  }
  private async page(
    filter: TaskListFilter,
    signal: AbortSignal,
    cursor?: string,
  ): Promise<TaskPage> {
    const epoch = this.epoch,
      order = ++this.readSequence;
    const params = taskParams(filter);
    if (cursor) params.set('cursor', cursor);
    let page: TaskPage;
    try {
      page = await this.transport.request('/api/v2/tasks?' + params, {
        signal,
        generation: this.transport.generation,
        expectedStatus: 200,
        parse: parseTaskPage,
      });
    } catch (error) {
      if (
        error instanceof HttpError &&
        (error.code === 'TASK_ACCESS_SCOPE_CHANGED' || error.status === 403)
      ) {
        this.hideSources();
        queueMicrotask(() => this.invalidate());
      }
      throw error;
    }
    this.assert(epoch, signal);
    // Sibling columns share one protection generation rather than repeatedly
    // cancelling one another's fresh partial responses.
    if (page.externalDataUnavailable)
      this.observePartial(this.lists.get(taskParams(filter).toString()));
    return { ...page, items: page.items.map((task) => this.adopt(task, order)) };
  }
  list(filter: TaskListFilter) {
    this.prune();
    const key = taskParams(filter).toString();
    let query = this.lists.get(key);
    if (!query) {
      const captured = { ...filter };
      query = new Query<TaskList>(async (signal) => ({
        ...(await this.page(captured, signal)),
        cursors: [],
      }));
      this.lists.set(key, query);
    }
    return query;
  }
  more(filter: TaskListFilter) {
    const query = this.list(filter),
      previous = query.getSnapshot().data;
    if (!previous?.nextCursor || query.getSnapshot().status === 'loading') return Promise.resolve();
    const cursor = previous.nextCursor;
    return query.load(async (signal) => {
      const next = await this.page(filter, signal, cursor);
      const cursors = [...previous.cursors, cursor];
      if (next.nextCursor && cursors.includes(next.nextCursor))
        throw new Error('서버가 같은 커서를 반환했습니다. 목록을 새로고침해 주세요.');
      const items = new Map(
        previous.items
          .filter(
            (task) => !task.source || (!next.externalDataUnavailable && !this.isProtected(task.id)),
          )
          .map((task) => [task.id, this.entities.get(task.id) ?? task]),
      );
      for (const task of next.items) items.set(task.id, task);
      return { ...next, items: [...items.values()], cursors };
    });
  }
  detail(id: string) {
    this.prune();
    uuid(id);
    let query = this.details.get(id);
    if (!query) {
      query = new Query<ApiTask>(async (signal) => {
        const epoch = this.epoch,
          order = ++this.readSequence;
        let task: ApiTask;
        try {
          task = await this.transport.request('/api/v2/tasks/' + id, {
            signal,
            generation: this.transport.generation,
            expectedStatus: 200,
            parse: parseTask,
          });
        } catch (error) {
          if (error instanceof HttpError && (error.status === 404 || error.status === 403)) {
            this.protectedIds.add(id);
            this.hideSources(this.entities.get(id)?.source?.linkId);
          }
          throw error;
        }
        this.assert(epoch, signal);
        if (task.id !== id) throw new Error('Task identity mismatch');
        return this.adopt(task, order);
      });
      this.details.set(id, query);
    }
    return query;
  }
  stats(filter: TaskFilter) {
    this.prune();
    // Deliberately serialize only stats-supported parameters, even if passed a list filter.
    const captured = {
      category: parseCategoryFilter(filter.category),
      projectId: filter.projectId,
      projectStatus: filter.projectStatus,
      query: filter.query,
      sourceReason: filter.sourceReason,
    };
    const key = taskParams(captured).toString();
    let query = this.statistics.get(key);
    if (!query) {
      query = new Query<TaskStats>(async (signal) => {
        const epoch = this.epoch;
        const result = await this.transport.request('/api/v2/tasks/stats?' + key, {
          signal,
          generation: this.transport.generation,
          expectedStatus: 200,
          parse: parseTaskStats,
        });
        this.assert(epoch, signal);
        if (result.externalDataUnavailable) this.observePartial(query);
        return result;
      });
      this.statistics.set(key, query);
    }
    return query;
  }
  invalidate() {
    this.epoch++;
    for (const query of this.lists.values()) query.invalidate(true);
    for (const query of this.details.values()) query.invalidate();
    for (const query of this.statistics.values()) query.invalidate();
    this.onInvalidate();
  }
  async convert(id: string, revision: number) {
    await this.transport.request(`/api/v2/tasks/${uuid(id)}/github-issue?revision=${revision}`, {
      method: 'DELETE',
      response: 'empty',
      expectedStatus: 204,
    });
    this.invalidate();
    await this.detail(id).load();
  }
  async mutate(
    operation: 'create' | 'patch' | 'delete' | 'restore',
    options: {
      endpoint?: '/api/v1/tasks' | '/api/v2/tasks';
      id?: string;
      body?: unknown;
      revision?: number;
      key?: string;
    },
  ) {
    const target = options.id ?? 'create';
    if (this.pending.has(target)) throw new Error('Task operation already pending');
    if (operation !== 'create') uuid(options.id);
    if (operation === 'patch' && this.entities.get(target)?.source) {
      const body = object(options.body);
      if (Object.keys(body).some((key) => !['revision', 'priority', 'tag'].includes(key)))
        throw new HttpError(
          409,
          'TASK_SOURCE_MANAGED',
          'GitHub에서 관리하는 필드는 수정할 수 없습니다.',
        );
    }
    this.pending.add(target);
    try {
      if (operation === 'create' && options.endpoint === '/api/v1/tasks') {
        const legacy = await this.transport.request('/api/v1/tasks', {
          method: 'POST',
          json: options.body,
          headers: { 'Idempotency-Key': options.key ?? '' },
          generation: this.transport.generation,
          signal: this.lifetime.signal,
          expectedStatus: 201,
          parse: (value) => ({ id: uuid(object(value).id) }),
        });
        this.transport.lifecycle.assert(this.transport.generation);
        this.invalidate();
        const detail = this.detail(legacy.id);
        await detail.load();
        this.transport.lifecycle.assert(this.transport.generation);
        const state = detail.getSnapshot();
        return { task: state.data, confirmedId: legacy.id, reconciled: state.status === 'ready' };
      }
      let path = '/api/v2/tasks' + (options.id ? '/' + options.id : '');
      if (operation === 'delete') path += '?revision=' + options.revision;
      if (operation === 'restore') path += '/restore';
      const task = await this.transport.request(path, {
        method: operation === 'delete' ? 'DELETE' : operation === 'patch' ? 'PATCH' : 'POST',
        json: operation === 'delete' ? undefined : options.body,
        headers: operation === 'create' ? { 'Idempotency-Key': options.key ?? '' } : undefined,
        generation: this.transport.generation,
        signal: this.lifetime.signal,
        expectedStatus: operation === 'create' ? 201 : 200,
        parse: parseTask,
      });
      this.transport.lifecycle.assert(this.transport.generation);
      if (this.disposed) throw new CancelledError();
      if (options.id && options.id !== task.id)
        throw new HttpError(200, 'PROTOCOL_ERROR', 'Task identity mismatch');
      this.invalidate();
      // POST can be an old snapshot. Reconcile before presenting its entity.
      if (operation === 'create') {
        const detail = this.detail(task.id);
        detail.invalidate();
        await detail.load();
        this.transport.lifecycle.assert(this.transport.generation);
        if (this.disposed) throw new CancelledError();
        return {
          task: detail.getSnapshot().data ?? task,
          reconciled: detail.getSnapshot().status === 'ready',
        };
      }
      const saved = this.adopt(task, ++this.readSequence);
      this.detail(saved.id).seed(saved);
      return { task: saved, reconciled: true };
    } catch (error) {
      if (this.disposed || this.transport.generation !== this.transport.lifecycle.generation)
        throw new CancelledError();
      if (
        error instanceof HttpError &&
        (error.status === 409 ||
          error.status === 0 ||
          error.status >= 500 ||
          error.code === 'PROTOCOL_ERROR')
      )
        this.invalidate();
      throw error;
    } finally {
      this.pending.delete(target);
    }
  }
  dispose() {
    this.lifetime.abort();
    this.disposed = true;
    this.epoch++;
    for (const query of [
      ...this.lists.values(),
      ...this.details.values(),
      ...this.statistics.values(),
    ])
      query.cancel();
    this.entities.clear();
    this.entityOrder.clear();
    this.lists.clear();
    this.details.clear();
    this.statistics.clear();
  }
}
