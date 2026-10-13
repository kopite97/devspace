import type { CategoryFilter } from '../projects/categoryFilter';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Flag } from 'lucide-react';
import { Button, EmptyState, Field } from '../../shared/ui/controls';
import { useQuery } from '../../shared/http/query';
import { CancelledError, HttpError } from '../../shared/http/client';
import { milestoneDraft, todayDate, type ApiMilestone } from './apiModel';
import type { MilestoneStore, MilestoneFilter } from './apiStore';
import type { MilestoneProjectOptions } from './projectOptions';
import type { MilestoneMemory } from './draftMemory';
import { ApiMilestoneEditor } from './ApiMilestoneEditor';
import './styles.css';

export function ApiMilestoneList({
  store,
  options,
  memory,
  projectId,
  category = 'all',
  limit,
  readOnly = false,
  onNavigate,
  renderHeader,
}: {
  store: MilestoneStore;
  options: MilestoneProjectOptions;
  memory: MilestoneMemory;
  projectId?: string;
  category?: CategoryFilter;
  limit?: number;
  readOnly?: boolean;
  onNavigate: (path: string) => void;
  renderHeader?: (action: ReactNode) => ReactNode;
}) {
  const [status, setStatus] = useState<'open' | 'done' | 'all'>('open');
  const [editing, setEditing] = useState(!!memory.editor && !readOnly);
  const [pending, setPending] = useState<string>();
  const [notice, setNotice] = useState('');
  const guard = useRef(false);
  const alive = useRef(true);
  const statusRef = useRef<HTMLSelectElement>(null);
  const restoreFilterFocus = useRef(false);
  useEffect(() => {
    if (!pending && restoreFilterFocus.current) {
      restoreFilterFocus.current = false;
      statusRef.current?.focus();
    }
  }, [pending]);
  const filter: MilestoneFilter = {
    category,
    projectId,
    projectStatus: 'all',
    status,
    limit: limit ?? 20,
  };
  const query = store.list(filter);
  const state = useQuery(query);
  const current = () =>
    alive.current &&
    !store.transport.lifecycle.signal.aborted &&
    store.transport.generation === store.transport.lifecycle.generation;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const open = async (row: ApiMilestone, complete = false) => {
    if (guard.current) return;
    guard.current = true;
    setPending(row.id);
    setNotice('');
    try {
      const detail = store.detail(row.id);
      detail.invalidate(true);
      await detail.load();
      if (!current()) return;
      const snapshot = detail.getSnapshot();
      if (snapshot.status !== 'ready' || !snapshot.data)
        throw snapshot.error ?? new Error('마일스톤을 확인하지 못했습니다.');
      const baseline = snapshot.data;
      if (complete) {
        // Compare against the clicked row so an unseen concurrent change is reviewed.
        const draft = { ...milestoneDraft(row), completed: !row.completed };
        if (baseline.revision !== row.revision) {
          memory.editor = {
            target: row.id,
            baseline: row,
            draft,
            review: true,
            notice: '다른 곳에서 변경되었습니다. 최신 상태를 확인해 주세요.',
          };
          setEditing(true);
          return;
        }
        try {
          await store.mutate('patch', {
            id: row.id,
            body: { revision: baseline.revision, completed: draft.completed },
          });
        } catch (error) {
          if (current()) {
            memory.editor = {
              target: row.id,
              baseline,
              draft,
              review: true,
              notice: error instanceof Error ? error.message : '변경을 확인하지 못했습니다.',
            };
            setEditing(true);
            if (error instanceof HttpError && error.code === 'CSRF_INVALID') {
              try {
                await store.transport.recoverSecurity();
              } catch {
                /* Draft remains in explicit review. */
              }
            }
          }
          return;
        }
        if (current() && status !== 'all') restoreFilterFocus.current = true;
      } else {
        memory.editor = { target: baseline.id, baseline, draft: milestoneDraft(baseline) };
        setEditing(true);
      }
    } catch (error) {
      if (current() && !(error instanceof CancelledError))
        setNotice(error instanceof Error ? error.message : '마일스톤을 확인하지 못했습니다.');
    } finally {
      guard.current = false;
      if (current()) setPending(undefined);
    }
  };
  const closed = () => {
    setEditing(false);
    statusRef.current?.focus();
  };
  const createAction = !readOnly && (
    <div className="feature-actions">
      <Button
        disabled={!!pending}
        onClick={() => {
          const draft = { ...milestoneDraft(), projectId: projectId ?? '' };
          memory.editor = {
            target: 'create',
            draft,
            initialDraft: { ...draft },
          };
          setEditing(true);
        }}
      >
        마일스톤 추가
      </Button>
    </div>
  );
  return (
    <div className="milestones milestone-surface">
      {renderHeader ? renderHeader(createAction) : createAction}
      <Field label="마일스톤 상태 필터">
        <select
          ref={statusRef}
          disabled={!!pending}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="open">진행 중</option>
          <option value="done">완료</option>
          <option value="all">전체</option>
        </select>
      </Field>
      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
      {(state.status === 'idle' || state.status === 'loading') && (
        <p role="status">
          {state.data ? '마일스톤을 새로 확인하는 중…' : '마일스톤을 불러오는 중…'}
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="notice">
          마일스톤을 불러오지 못했습니다. {state.data ? '표시된 내용은 이전 조회 결과입니다.' : ''}
          <Button onClick={() => query.invalidate()}>목록 다시 확인</Button>
          {state.data?.nextCursor && !readOnly && (
            <Button onClick={() => void store.more(filter)}>다음 페이지 다시 시도</Button>
          )}
        </p>
      )}
      {state.status === 'ready' && !state.data?.items.length && (
        <EmptyState title="표시할 마일스톤이 없어요" />
      )}
      {state.data?.items.slice(0, limit).map((m) => (
        <div className="milestone" key={m.id}>
          <span className="milestone-icon">
            <Flag size={16} />
          </span>
          <div className="milestone-content">
            <button
              className="milestone-title"
              disabled={!!pending}
              aria-label={`${m.title} ${readOnly ? '프로젝트 열기' : '수정'}`}
              onClick={() => (readOnly ? onNavigate('/projects/' + m.projectId) : void open(m))}
            >
              <small>{m.projectName}</small>
              <strong>{m.title}</strong>
            </button>
            <span className="muted">
              {m.completed ? '완료' : '진행 중'} · {m.dueDate || '기한 없음'}
              {!m.completed && m.dueDate && m.dueDate < todayDate() ? ' · 기한 지남' : ''}
            </span>
            {!readOnly && (
              <Button
                disabled={!!pending}
                aria-label={`${m.title} ${m.completed ? '재개' : '완료'}`}
                onClick={() => void open(m, true)}
              >
                {pending === m.id ? '확인 중…' : m.completed ? '재개' : '완료'}
              </Button>
            )}
          </div>
        </div>
      ))}
      {limit && state.data && state.data.total > limit && (
        <p className="muted">
          {state.data.total}개 중 {Math.min(limit, state.data.items.length)}개 표시
        </p>
      )}
      {!readOnly && state.data?.nextCursor && state.status !== 'error' && (
        <Button disabled={state.status === 'loading'} onClick={() => void store.more(filter)}>
          더 보기
        </Button>
      )}
      {!readOnly && editing && memory.editor && (
        <ApiMilestoneEditor
          store={store}
          options={options}
          memory={memory}
          onClose={closed}
          onSaved={closed}
          returnFocusRef={statusRef}
        />
      )}
    </div>
  );
}
