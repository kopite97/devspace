import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus, RefreshCw, RotateCcw } from 'lucide-react';
import { Button, EmptyState } from '../../shared/ui/controls';
import { useQuery } from '../../shared/http/query';
import { CancelledError, HttpError } from '../../shared/http/client';
import { LinkRows } from './LinkRows';
import { linkDraft, linkIcon, type ApiLink } from './apiModel';
import { useUnsavedChanges } from '../../shared/hooks/useUnsavedChanges';
import { fullLinks, type LinkFilter, type LinkStore } from './apiStore';
import type { LinkMemory } from './draftMemory';
import type { LinkProjectOptions } from './ProjectPicker';
import type { CategoryOption } from '../projects/categoryFilter';
import { ApiLinkEditor } from './ApiLinkEditor';

export function ApiLinks({
  store,
  options,
  categories = [],
  filter,
  memory,
  onReset,
  renderLayout,
}: {
  store: LinkStore;
  options?: LinkProjectOptions;
  categories?: readonly CategoryOption[];
  filter: LinkFilter;
  memory?: LinkMemory;
  onReset?: () => void;
  renderLayout?: (action: ReactNode, content: ReactNode) => ReactNode;
}) {
  const list = store.list(filter);
  const activeList = useRef(list);
  activeList.current = list;
  const state = useQuery(list);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!!memory?.editor);
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(false);
  const [deleteReview, setDeleteReview] = useState<{ id: string; latest?: ApiLink }>();
  useUnsavedChanges(busy);
  useEffect(() => {
    if (saved && !editing) {
      setSaved(false);
      onReset?.();
    }
  }, [saved, editing, onReset]);
  const pending = useRef(false);
  const alive = useRef(true);
  const add = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, [list]);
  const current = () =>
    alive.current &&
    activeList.current === list &&
    !store.transport.lifecycle.signal.aborted &&
    store.transport.generation === store.transport.lifecycle.generation;
  const filtered =
    filter.category !== 'all' ||
    !!filter.query ||
    !!filter.projectId ||
    (!!filter.projectStatus && filter.projectStatus !== 'all');
  const reviewDelete = async (id: string) => {
    setDeleteReview({ id });
    const detail = store.detail(id);
    detail.invalidate(true);
    await detail.load();
    if (!current()) return;
    const s = detail.getSnapshot();
    if (s.status === 'ready') setDeleteReview({ id, latest: s.data });
    else
      setNotice(
        s.error instanceof HttpError && s.error.status === 404
          ? '링크를 찾을 수 없습니다. 이전 삭제 요청의 성공으로 처리하지 않습니다.'
          : '최신 링크를 확인하지 못했습니다. 다시 확인해 주세요.',
      );
  };
  const run = async (
    operation: 'edit' | 'delete' | 'move',
    id: string,
    direction?: -1 | 1,
    reviewed?: ApiLink,
  ) => {
    if (
      pending.current ||
      !state.data ||
      (operation === 'move' && (filtered || state.stale || state.status !== 'ready'))
    )
      return;
    if (operation === 'delete' && deleteReview?.id === id && !reviewed) {
      await reviewDelete(id);
      return;
    }
    const target = reviewed ?? state.data.items.find((l) => l.id === id);
    if (!target) return;
    if (operation === 'delete' && !window.confirm(`“${target.label}” 링크를 삭제할까요?`)) return;
    const focus =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    pending.current = true;
    setBusy(true);
    setNotice('');
    try {
      if (operation === 'edit') {
        const detail = store.detail(id);
        detail.invalidate();
        await detail.load();
        if (!current()) return;
        const s = detail.getSnapshot();
        if (s.status !== 'ready')
          throw new Error('링크를 확인하지 못했습니다. 편집을 눌러 다시 확인해 주세요.');
        memory!.editor = { baseline: s.data!, draft: linkDraft(s.data!) };
        setEditing(true);
      } else if (operation === 'delete') {
        await store.mutate('delete', { id, revision: target.revision });
        if (current()) {
          setDeleteReview(undefined);
          add.current?.focus();
        }
      } else {
        const ids = state.data.items.map((l) => l.id);
        const index = ids.indexOf(id);
        const next = index + direction!;
        if (next < 0 || next >= ids.length) return;
        [ids[index], ids[next]] = [ids[next], ids[index]];
        await store.mutate('order', { ids, collection: state.data });
      }
    } catch (error) {
      if (!current() || error instanceof CancelledError) return;
      setNotice(
        error instanceof HttpError && error.code === 'REVISION_CONFLICT'
          ? operation === 'move'
            ? '링크 목록이 다른 곳에서 변경되었습니다. 최신 전체 순서를 확인한 뒤 다시 변경해 주세요.'
            : '링크가 다른 곳에서 변경되었습니다. 편집에서 최신 내용을 검토한 뒤 다시 삭제해 주세요.'
          : '요청 결과를 확인하지 못했습니다. 확정된 내용을 유지합니다. 최신 상태를 확인한 후 다시 시도해 주세요.',
      );
      if (error instanceof HttpError && error.code === 'CSRF_INVALID') {
        try {
          await store.transport.recoverSecurity();
        } catch {
          /* Explicit action remains required. */
        }
      }
      if (operation !== 'edit') {
        store.invalidate();
        await store.list(operation === 'move' ? fullLinks : filter).load();
        if (operation === 'delete' && current()) await reviewDelete(id);
      }
    } finally {
      pending.current = false;
      if (current()) {
        setBusy(false);
        if (operation === 'move')
          requestAnimationFrame(() => {
            if (current()) {
              if (focus?.isConnected && !focus.matches(':disabled')) focus.focus();
              else
                document
                  .querySelector<HTMLElement>(`[aria-label="${CSS.escape(target.label)} 편집"]`)
                  ?.focus();
            }
          });
      }
    }
  };
  const createAction = memory && (
    <Button
      ref={add}
      variant="primary"
      disabled={busy}
      onClick={() => {
        memory.editor = { draft: linkDraft() };
        setEditing(true);
      }}
    >
      <Plus size={16} />
      링크 추가
    </Button>
  );
  const content = (
    <>
      <div className={memory ? 'content-panel library-page-content' : undefined}>
        {memory && !renderLayout && (
          <div className="panel-heading library-header">
            <div>
              <h2>개발 레퍼런스</h2>
              <p>공식 문서와 개발 도구를 모아 두었어요.</p>
            </div>
            {createAction}
          </div>
        )}
        <div className={memory ? 'library-toolbar' : undefined}>
          <div>
            {filter.query && state.status === 'ready' && (
              <p role="status">검색 결과 {state.data?.total}개</p>
            )}
            {memory && (
              <div className="muted">
                {filtered && <p>순서를 바꾸려면 검색·필터를 초기화하세요.</p>}
                <details>
                  <summary>링크 분류와 순서 안내</summary>
                  <p>
                    연결 없는 링크는 미분류에 표시됩니다. 순서 변경은 검색·필터를 초기화한 전체
                    목록에서 할 수 있어요.
                  </p>
                </details>
              </div>
            )}
          </div>
          {(memory || state.status === 'error') && (
            <div className="library-toolbar-actions">
              <Button
                variant="secondary"
                disabled={busy || state.status === 'loading'}
                onClick={() => {
                  setNotice('');
                  list.invalidate();
                }}
              >
                <RefreshCw size={14} />
                링크 새로고침
              </Button>
              {memory &&
                onReset &&
                (filtered || (state.status === 'ready' && !state.data!.items.length)) && (
                  <Button onClick={onReset}>
                    <RotateCcw size={14} />
                    검색·필터 초기화
                  </Button>
                )}
            </div>
          )}
        </div>
        {(state.status === 'idle' || state.status === 'loading') && (
          <p role="status">링크를 불러오는 중…</p>
        )}
        {busy && <p role="status">링크 변경을 처리 중…</p>}
        {notice && (
          <p className="notice" role="alert">
            {notice}
          </p>
        )}
        {deleteReview && (
          <div className="notice">
            <Button disabled={busy} onClick={() => void reviewDelete(deleteReview.id)}>
              최신 링크 다시 확인
            </Button>
            {deleteReview.latest && (
              <>
                <p>
                  삭제 전 최신 내용: {deleteReview.latest.label} · {deleteReview.latest.url} ·{' '}
                  {deleteReview.latest.description} ·{' '}
                  {deleteReview.latest.projectName ?? '연결 없음'}
                </p>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    void run('delete', deleteReview.id, undefined, deleteReview.latest)
                  }
                >
                  검토 후 삭제
                </Button>
              </>
            )}
            <Button disabled={busy} onClick={() => setDeleteReview(undefined)}>
              삭제 취소
            </Button>
          </div>
        )}
        {state.status === 'error' && (
          <p className="notice" role="alert">
            링크를 불러오지 못했습니다. {state.data && '이전에 확인한 목록입니다.'}
          </p>
        )}
        {state.status === 'ready' && !state.data!.items.length && (
          <EmptyState
            title={filtered ? '검색 조건에 맞는 링크가 없어요' : '등록된 링크가 없어요'}
            onReset={memory ? undefined : onReset}
          />
        )}
        <LinkRows
          links={(state.data?.items ?? []).map((l) => ({
            ...l,
            desc: l.description,
            classification:
              l.projectId === null
                ? '연결 없음'
                : l.categoryId === null
                  ? `${l.projectName} · 미분류`
                  : `${l.projectName} · ${categories.find((c) => c.id === l.categoryId)?.name ?? '개발 분야 확인 중'}`,
          }))}
          filtered={filtered || state.stale || state.status !== 'ready'}
          disabled={busy}
          iconKey={(l) => linkIcon(l.url)}
          onEdit={memory ? (l) => void run('edit', l.id) : undefined}
          onMove={(id, direction) => void run('move', id, direction)}
          onRemove={(l) => void run('delete', l.id)}
        />
      </div>
      {editing && memory?.editor && options && (
        <ApiLinkEditor
          store={store}
          options={options}
          memory={memory}
          onClose={() => {
            setEditing(false);
            add.current?.focus();
          }}
          onSaved={() => {
            setEditing(false);
            setSaved(true);
            add.current?.focus();
          }}
        />
      )}
    </>
  );
  return renderLayout ? renderLayout(createAction, content) : content;
}
