import { useEffect, useRef, useState } from 'react';
import { CancelledError, HttpError } from '../../shared/http/client';
import { useUnsavedChanges } from '../../shared/hooks/useUnsavedChanges';
import type { TaskStore } from './apiStore';
import type { TaskStatus } from './presentation';

export function useTaskStatusActions(store: TaskStore) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const locks = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useUnsavedChanges(pending.size > 0);

  const current = () =>
    alive.current && store.transport.generation === store.transport.lifecycle.generation;
  const busy = (id: string, value: boolean) => {
    if (value) locks.current.add(id);
    else locks.current.delete(id);
    if (current()) setPending(new Set(locks.current));
  };

  const status = async (id: string, next: TaskStatus, revision?: number) => {
    const task = store.entities.get(id);
    if (task?.source) {
      setNotice('이 Task의 상태는 GitHub에서 관리합니다.');
      return;
    }
    const expectedRevision = Math.max(task?.revision ?? 0, revision ?? 0);
    if (locks.current.has(id)) return;
    if (!expectedRevision) {
      setNotice('최신 작업 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      const query = store.detail(id);
      query.invalidate();
      await query.load();
      return;
    }
    busy(id, true);
    setNotice('');
    try {
      await store.mutate('patch', { id, body: { revision: expectedRevision, status: next } });
    } catch (error) {
      if (!current() || error instanceof CancelledError) return;
      if (error instanceof HttpError && error.code === 'CSRF_INVALID') {
        try {
          await store.transport.recoverSecurity();
        } catch (failure) {
          if (current()) setNotice(String(failure));
        }
      } else if (current()) {
        setNotice(
          error instanceof HttpError
            ? `${error.code}: 상태를 변경하지 못했습니다. 최신 상태를 확인한 후 다시 시도해 주세요.`
            : '상태를 변경하지 못했습니다. 최신 상태를 확인해 주세요.',
        );
      }
      const query = store.detail(id);
      query.invalidate();
      await query.load();
    } finally {
      busy(id, false);
    }
  };

  return {
    pending,
    notice,
    status: (id: string, next: TaskStatus, revision?: number) => void status(id, next, revision),
  };
}
