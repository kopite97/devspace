import { useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useQuery, type Query, type QueryState } from '../../shared/http/query';
import { Button, EmptyState, Modal } from '../../shared/ui/controls';
import { TaskBoard } from './TaskBoard';
import { taskPresentation, type ApiTask } from './apiModel';
import { type TaskStore, type TaskFilter, type TaskList, type TaskListFilter } from './apiStore';
import type { TaskStatus } from './presentation';

export function TaskReadState<T>({
  state,
  query,
  more,
}: {
  state: QueryState<T>;
  query: Query<T>;
  more?: () => void;
}) {
  return (
    <>
      {(state.status === 'loading' || state.status === 'idle') && <p role="status">불러오는 중…</p>}
      {state.status === 'error' && (
        <p className="notice" role="alert">
          불러오지 못했습니다.{' '}
          <Button onClick={more ?? (() => void query.load())}>다시 시도</Button>
          <Button onClick={() => query.invalidate(true)}>새로고침</Button>
        </p>
      )}
      {state.stale && state.data && <small role="status">최신 정보를 확인하고 있습니다.</small>}
    </>
  );
}
export type TaskActions = {
  reset?: () => void;
  notice?: string;
  create: () => void;
  edit: (id: string) => void;
  status: (id: string, status: TaskStatus, revision?: number) => void;
  restore: (task: ApiTask) => void;
  pending: ReadonlySet<string>;
};
function PageControls({
  store,
  filter,
  state,
}: {
  store: TaskStore;
  filter: TaskListFilter;
  state: QueryState<TaskList>;
}) {
  return (
    <>
      <TaskReadState
        state={state}
        query={store.list(filter)}
        more={state.data?.nextCursor ? () => void store.more(filter) : undefined}
      />
      {state.data?.nextCursor && (
        <Button disabled={state.status === 'loading'} onClick={() => void store.more(filter)}>
          더 불러오기
        </Button>
      )}
    </>
  );
}
export function TaskColumns({
  store,
  filter,
  actions,
}: {
  store: TaskStore;
  filter: TaskFilter;
  actions?: TaskActions;
}) {
  const filters = (['todo', 'doing', 'done'] as const).map((status) => ({
    ...filter,
    status,
    deleted: false,
    limit: 20,
  }));
  const todo = useQuery(store.list(filters[0]));
  const doing = useQuery(store.list(filters[1]));
  const done = useQuery(store.list(filters[2]));
  const states = [todo, doing, done];
  const stats = useQuery(store.stats(filter));
  const columns = Object.fromEntries(
    filters.map((f, i) => [
      f.status,
      {
        total: stats.data?.counts[f.status],
        hideEmpty: states[i].status !== 'ready',
        footer: <PageControls store={store} filter={f} state={states[i]} />,
      },
    ]),
  );
  return (
    <>
      <TaskReadState state={stats} query={store.stats(filter)} />
      {stats.status === 'ready' &&
        stats.data?.total === 0 &&
        states.every((state) => state.status === 'ready') && (
          <EmptyState
            onReset={filter.query || filter.category !== 'all' ? actions?.reset : undefined}
            title={
              filter.query || filter.category !== 'all'
                ? '검색 조건에 맞는 태스크가 없어요'
                : '태스크가 없어요'
            }
          />
        )}
      {filter.query && stats.data && <p role="status">검색 결과 {stats.data.total}개</p>}
      <TaskBoard
        tasks={states.flatMap((state) => state.data?.items ?? []).map(taskPresentation)}
        columns={columns}
        pending={actions?.pending}
        onTaskChange={actions?.status ?? (() => {})}
        onEdit={actions ? (task) => actions.edit(task.id) : undefined}
      />
    </>
  );
}
function TaskTrash({
  store,
  filter,
  onClose,
  actions,
}: {
  store: TaskStore;
  filter: TaskFilter;
  onClose: () => void;
  actions?: TaskActions;
}) {
  const listFilter = { ...filter, query: '', deleted: true, limit: 20 };
  const state = useQuery(store.list(listFilter));
  return (
    <Modal title="태스크 휴지통" onClose={onClose}>
      {actions?.notice && (
        <p className="notice" role="alert">
          {actions.notice}
        </p>
      )}
      {state.data?.items.map((task) => (
        <div className="restore-row" key={task.id}>
          <span>
            <strong>{task.title}</strong>
            <small>{task.projectName}</small>
          </span>
          <Button
            aria-label={`${task.title} 복구`}
            disabled={!actions || actions.pending.has(task.id)}
            onClick={() => actions?.restore(task)}
          >
            복구
          </Button>
        </div>
      ))}
      {state.status === 'ready' && state.data?.total === 0 && (
        <EmptyState title="휴지통이 비어 있어요" />
      )}
      <PageControls store={store} filter={listFilter} state={state} />
    </Modal>
  );
}
export function TaskReads({
  createAction,
  store,
  filter,
  actions,
  limit,
}: {
  store: TaskStore;
  filter: TaskFilter;
  actions?: TaskActions;
  limit?: number;
  createAction?: ReactNode;
}) {
  const [trash, setTrash] = useState(false);
  const badgeFilter = { ...filter, query: '', deleted: true, limit: 1 };
  const badge = useQuery(store.list(badgeFilter));
  return (
    <>
      <div className="feature-actions">
        {createAction === undefined ? (
          <Button disabled={!actions} onClick={actions?.create}>
            <Plus size={14} />
            태스크 추가
          </Button>
        ) : (
          createAction
        )}
        <Button variant="ghost" onClick={() => setTrash(true)}>
          <Trash2 size={14} />
          휴지통 ({badge.data?.total ?? '—'})
        </Button>
      </div>
      <TaskReadState state={badge} query={store.list(badgeFilter)} />
      {limit === undefined ? (
        <TaskColumns store={store} filter={filter} actions={actions} />
      ) : (
        <TaskBudget store={store} filter={filter} actions={actions} limit={limit} />
      )}
      {trash && (
        <TaskTrash
          store={store}
          filter={filter}
          actions={actions}
          onClose={() => setTrash(false)}
        />
      )}
    </>
  );
}
function TaskBudget({
  store,
  filter,
  actions,
  limit,
}: {
  store: TaskStore;
  filter: TaskFilter;
  actions?: TaskActions;
  limit: number;
}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new Error('Home Task limit must be 1–20');
  const list = store.list({ ...filter, deleted: false, limit });
  const state = useQuery(list),
    stats = useQuery(store.stats(filter));
  return (
    <>
      <TaskReadState state={state} query={list} />
      <TaskReadState state={stats} query={store.stats(filter)} />
      <TaskBoard
        tasks={(state.data?.items ?? []).map(taskPresentation)}
        columns={Object.fromEntries(
          (['todo', 'doing', 'done'] as const).map((status) => [
            status,
            {
              total: stats.data?.counts[status],
              hideEmpty: state.status !== 'ready',
              emptyText: stats.data?.counts[status] ? '표시 범위에 작업이 없어요' : undefined,
            },
          ]),
        )}
        pending={actions?.pending}
        onTaskChange={actions?.status ?? (() => {})}
        onEdit={actions ? (task) => actions.edit(task.id) : undefined}
      />
    </>
  );
}
