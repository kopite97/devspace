import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../shared/ui/controls';
import { CancelledError, HttpError } from '../../shared/http/client';
import type { TaskStore, TaskFilter } from './apiStore';
import type { TaskMemory } from './draftMemory';
import type { TaskProjectOptions } from './projectOptions';
import { taskDraft, type ApiTask } from './apiModel';
import { TaskReads, type TaskActions } from './TaskReads';
import { ApiTaskEditor } from './ApiTaskEditor';
import type { TaskStatus } from './presentation';
import { useUnsavedChanges } from '../../shared/hooks/useUnsavedChanges';

export function ApiTaskManager({
  store,
  filter,
  options,
  memory,
  limit,
  onReset,
  renderLayout,
}: {
  store: TaskStore;
  filter: TaskFilter;
  options: TaskProjectOptions;
  memory: TaskMemory;
  limit?: number;
  onReset?: () => void;
  renderLayout?: (action: ReactNode, content: ReactNode) => ReactNode;
}) {
  const [editing, setEditing] = useState(!!memory.editor),
    [notice, setNotice] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  useUnsavedChanges(pending.size > 0);
  const locks = useRef(new Set<string>()),
    alive = useRef(true);
  const createRef = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null),
    returnId = useRef<string | undefined>(undefined),
    returnRequested = useRef(false);
  const current = () =>
    alive.current && store.transport.generation === store.transport.lifecycle.generation;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (editing || !host.current || !returnRequested.current) return;
    const container = host.current;
    const restore = () => {
      const target = returnId.current
        ? container.querySelector<HTMLButtonElement>(
            `[data-task-id="${CSS.escape(returnId.current)}"] .task-title`,
          )
        : createRef.current;
      if (target?.isConnected && !target.disabled) {
        target.focus();
        returnRequested.current = false;
        return true;
      }
      return false;
    };
    if (restore()) return;
    const observer = new MutationObserver(() => {
      if (restore()) observer.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      observer.disconnect();
      const fallback = createRef.current;
      if (fallback?.isConnected && !fallback.disabled) fallback.focus();
      else container.querySelector<HTMLElement>('[data-task-list-heading]')?.focus();
      returnRequested.current = false;
    }, 5000);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [editing]);
  const busy = (id: string, value: boolean) => {
    if (value) locks.current.add(id);
    else locks.current.delete(id);
    if (current()) setPending(new Set(locks.current));
  };
  const edit = async (id: string) => {
    returnId.current = id;
    returnRequested.current = true;
    if (locks.current.has(id)) return;
    busy(id, true);
    const query = store.detail(id);
    query.invalidate();
    await query.load();
    if (current()) {
      const state = query.getSnapshot();
      if (state.status === 'ready' && state.data && !state.data.deletedAt) {
        memory.editor = { target: id, baseline: state.data, draft: taskDraft(state.data) };
        setEditing(true);
      } else
        setNotice(
          state.data?.deletedAt
            ? '이 태스크는 휴지통에 있습니다.'
            : '태스크를 확인하지 못했습니다. 제목을 눌러 다시 시도해 주세요.',
        );
    }
    busy(id, false);
  };
  const mutate = async (task: ApiTask, status?: TaskStatus) => {
    if (status && task.source) {
      setNotice('이 Task의 상태는 GitHub에서 관리합니다.');
      return;
    }
    if (locks.current.has(task.id) || (status && status === task.status)) return;
    busy(task.id, true);
    setNotice('');
    try {
      await store.mutate(status ? 'patch' : 'restore', {
        id: task.id,
        body: { revision: task.revision, ...(status ? { status } : {}) },
      });
    } catch (error) {
      if (!current() || error instanceof CancelledError) return;
      if (error instanceof HttpError && error.code === 'CSRF_INVALID') {
        try {
          await store.transport.recoverSecurity();
        } catch (failure) {
          if (current()) setNotice(String(failure));
        }
        return;
      }
      if (current())
        setNotice(
          error instanceof HttpError
            ? `${error.code}: 변경하지 못했습니다. 최신 상태를 확인한 후 다시 시도해 주세요.`
            : '변경하지 못했습니다. 최신 상태를 확인해 주세요.',
        );
      const query = store.detail(task.id);
      query.invalidate();
      await query.load();
    } finally {
      busy(task.id, false);
    }
  };
  const actions: TaskActions = {
    reset: onReset,
    notice,
    create: () => {
      returnId.current = undefined;
      returnRequested.current = true;
      const draft = taskDraft();
      draft.projectId = filter.projectId ?? '';
      memory.editor = { target: 'create', draft };
      setEditing(true);
    },
    edit: (id) => void edit(id),
    pending,
    status: (id, status) => {
      const task = store.entities.get(id);
      if (task) void mutate(task, status);
    },
    restore: (task) => void mutate(task),
  };
  const createAction = (
    <Button ref={createRef} variant="primary" onClick={actions.create}>
      <Plus size={14} />
      태스크 추가
    </Button>
  );
  const content = (
    <div ref={host}>
      <h2 className="sr-only" tabIndex={-1} data-task-list-heading>
        태스크 목록
      </h2>
      {notice && (
        <p className="notice" role="alert">
          {notice}
          <Button onClick={() => store.invalidate()}>새로고침</Button>
        </p>
      )}
      <TaskReads
        store={store}
        filter={filter}
        actions={actions}
        limit={limit}
        createAction={renderLayout ? null : createAction}
      />
      {editing && memory.editor && (
        <ApiTaskEditor
          store={store}
          options={options}
          memory={memory}
          onClose={() => setEditing(false)}
          onSaved={(message) => {
            setEditing(false);
            setNotice(message ?? '');
          }}
        />
      )}
    </div>
  );
  return renderLayout ? renderLayout(createAction, content) : content;
}
