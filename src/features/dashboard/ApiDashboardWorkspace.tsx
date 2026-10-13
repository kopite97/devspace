import { Check, GripVertical, Pencil, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PageScaffold, type PageScaffoldProps } from '../../shared/ui/PageScaffold';
import { Button, EmptyState } from '../../shared/ui/controls';
import { useQuery } from '../../shared/http/query';
import { CancelledError, HttpError } from '../../shared/http/client';
import { useUnsavedChanges } from '../../shared/hooks/useUnsavedChanges';
import { confirmNavigation } from '../../shared/lib/navigationGuard';
import {
  selectionLabel,
  type CategoryFilter,
  type CategoryOption,
} from '../projects/categoryFilter';
import { WidgetFrame } from './WidgetFrame';
import { ApiWidgetEditor } from './ApiWidgetEditor';
import { moveWidget } from './model';
import type { Widget } from './apiModel';
import { sameWidgets, saveBody, type ApiDashboard } from './apiModel';
import type { DashboardStore } from './apiStore';
import type { DashboardEditorMemory, DashboardMemory } from './draftMemory';
import type { DashboardProjectOptions } from './projectOptions';

export function ApiDashboardWorkspace({
  store,
  memory,
  options,
  categories,
  scaffold,
  filter,
  query,
  onStartEditing,
  onReset,
  renderWidget,
  onEditingChange,
  displaySelection,
  widgetHref,
  onNavigate,
}: {
  store: DashboardStore;
  memory: DashboardMemory;
  options: DashboardProjectOptions;
  categories: readonly CategoryOption[];
  scaffold: Omit<PageScaffoldProps, 'children' | 'actions'>;
  filter: CategoryFilter;
  query: string;
  onStartEditing: () => void;
  onReset: () => void;
  onEditingChange: (editing: boolean) => void;
  renderWidget: (widget: Widget) => ReactNode;
  displaySelection?: (widget: Widget) => Widget['selection'];
  widgetHref?: (widget: Widget) => string | undefined;
  onNavigate?: (path: string) => void;
}) {
  const state = useQuery(store.home);
  // The server catalog is the source of supported Widget versions and sizes.
  // The current editor still renders the established catalog labels/icons.
  useQuery(store.catalog);
  const [available, setAvailable] = useState<readonly Widget[]>([]);
  const [oldDraft, setOldDraft] = useState(() =>
    memory.editor && memory.editor.baseline.schemaVersion !== 3 ? memory.editor : undefined,
  );
  const [editor, setEditor] = useState(oldDraft ? undefined : memory.editor);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(memory.editor?.notice ?? '');
  const [latest, setLatest] = useState<ApiDashboard>();
  const [dragId, setDragId] = useState<string | null>(null);
  const alive = useRef(true);
  const pending = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const editing = !!editor;
  const items = editor?.draft ?? state.data?.widgets ?? [];
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    onEditingChange(editing);
  }, [editing, onEditingChange]);
  const current = () =>
    alive.current &&
    !store.transport.lifecycle.signal.aborted &&
    store.transport.generation === store.transport.lifecycle.generation;
  const update = (next: DashboardEditorMemory | undefined) => {
    if (current()) {
      memory.editor = next;
      setEditor(next);
    }
  };
  const dirty =
    !!editor &&
    (!!editor.widget ||
      !!editor.submitted ||
      !!editor.review ||
      !sameWidgets(editor.draft, editor.baseline.widgets));
  const canDiscard = useUnsavedChanges(busy || dirty || !!oldDraft);
  const start = () => {
    if (!state.data || state.status !== 'ready' || state.stale || !confirmNavigation())
      return false;
    onStartEditing();
    update({ baseline: state.data, draft: state.data.widgets.map((w) => ({ ...w })) });
    setNotice('');
    return true;
  };
  const editWidget = (widget?: Widget) => {
    if (busy || editor?.review) return;
    void store.available.load().then(() => {
      const snapshot = store.available.getSnapshot();
      if (current() && snapshot.status === 'ready') setAvailable(snapshot.data?.items ?? []);
    });
    if (!editor && !start()) return;
    const form =
      widget ??
      ({
        id: crypto.randomUUID(),
        type: 'overview',
        title: '프로젝트 한눈에 보기',
        selection: { kind: 'all' },
        size: 'medium',
      } satisfies Widget);
    update({
      ...memory.editor!,
      widget: { existing: !!widget, form: { ...form, limitText: widget?.limit?.toString() ?? '' } },
    });
  };
  const cancel = () => {
    if (!busy && canDiscard()) {
      update(undefined);
      setLatest(undefined);
      setNotice('');
    }
  };
  const change = (draft: Widget[]) => {
    if (!busy && !editor?.review) update({ ...memory.editor!, draft });
  };
  const reload = async () => {
    setLatest(undefined);
    store.home.invalidate();
    await store.home.load();
    if (!current()) return;
    const s = store.home.getSnapshot();
    if (s.status === 'ready') setLatest(s.data);
    else
      setNotice(
        s.error instanceof HttpError && s.error.status === 404
          ? '참조된 프로젝트를 확인할 수 없습니다. 초안을 유지합니다. 프로젝트 설정을 확인하고 다시 시도해 주세요.'
          : '최신 배치를 확인하지 못했습니다. 초안을 유지합니다. 다시 확인해 주세요.',
      );
  };
  const save = async () => {
    if (!editor || editor.review || pending.current) return;
    let submitted;
    try {
      const layout = saveBody(editor.baseline.layoutRevision, editor.draft);
      submitted = { layoutRevision: layout.layoutRevision, widgets: editor.draft };
    } catch (error) {
      setNotice((error as Error).message);
      return;
    }
    pending.current = true;
    setBusy(true);
    setNotice('');
    update({ ...editor, submitted, review: true });
    try {
      await store.save(submitted);
      if (current()) {
        update(undefined);
        setLatest(undefined);
        setNotice('배치를 적용했습니다.');
      }
    } catch (error) {
      if (!current() || error instanceof CancelledError) return;
      const code = error instanceof HttpError ? error.code : '';
      if (error instanceof HttpError && code === 'SESSION_UNVERIFIED') {
        setNotice(error.message);
        update({ ...memory.editor!, review: false, submitted: undefined });
        return;
      }
      setNotice(
        code === 'REVISION_CONFLICT'
          ? '다른 곳에서 배치가 변경되었습니다. 최신 배치와 내 초안을 검토해 주세요.'
          : code === 'RESOURCE_NOT_FOUND'
            ? '선택된 프로젝트를 확인할 수 없습니다. 초안의 프로젝트 설정을 수정해 주세요.'
            : '저장 결과를 확인하지 못했습니다. 초안을 유지하며 자동으로 다시 저장하지 않습니다.',
      );
      if (error instanceof HttpError && (error.status === 400 || error.status === 404)) {
        update({ ...memory.editor!, review: false, submitted: undefined });
      } else {
        if (code === 'CSRF_INVALID') {
          try {
            await store.transport.recoverSecurity();
          } catch {
            /* Explicit retry only. */
          }
        }
        if (current()) await reload();
      }
    } finally {
      pending.current = false;
      if (current()) setBusy(false);
    }
  };
  const reconcile = (keep: boolean) => {
    if (!latest || busy) return;
    if (
      !window.confirm(
        keep
          ? '최신 배치의 추가·삭제·순서를 내 초안 전체로 교체하도록 준비할까요? 검토 후 배치 저장을 눌러야 적용됩니다.'
          : '내 초안을 버리고 최신 서버 배치를 사용할까요?',
      )
    )
      return;
    if (keep) update({ baseline: latest, draft: editor!.draft.map((w) => ({ ...w })) });
    else update(undefined);
    setLatest(undefined);
    setNotice(
      keep
        ? '최신 기준으로 준비했습니다. 변경 사항을 검토한 뒤 배치 저장을 눌러 주세요.'
        : '최신 배치를 사용합니다.',
    );
  };
  const initialize = async (empty: boolean) => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      if (empty) await store.initializeEmpty();
      else await store.initialize();
      if (current()) setNotice(empty ? '빈 홈을 준비했습니다.' : '기본 위젯을 준비했습니다.');
    } catch (error) {
      if (current())
        setNotice(
          error instanceof HttpError && error.code === 'REVISION_CONFLICT'
            ? '이미 초기화된 홈입니다. 최신 배치를 다시 확인해 주세요.'
            : '홈을 준비하지 못했습니다. 다시 시도해 주세요.',
        );
    } finally {
      if (current()) setBusy(false);
    }
  };
  const move = (widget: Widget, targetId: string) => {
    change(moveWidget(items, widget.id, targetId));
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLElement>(`[data-widget-id="${CSS.escape(widget.id)}"] .drag-handle`)
        ?.focus(),
    );
  };
  const shown = items.filter((w) => editing || w.title.toLowerCase().includes(query.toLowerCase()));
  if (oldDraft)
    return (
      <PageScaffold {...scaffold}>
        <div className="notice" role="alert">
          <p>
            이전 버전의 배치 초안은 자동 변환하거나 저장할 수 없습니다. 아래 제목을 확인한 후 최신
            배치에서 다시 편집해 주세요.
          </p>
          <ul>
            {oldDraft.draft.map((widget, index) => (
              <li key={index}>{widget.title}</li>
            ))}
          </ul>
          {oldDraft.widget && <p>{oldDraft.widget.form.title}</p>}
          <Button
            onClick={() => {
              if (!canDiscard()) return;
              memory.editor = undefined;
              setOldDraft(undefined);
              store.home.invalidate();
            }}
          >
            이전 초안을 폐기하고 최신 배치 확인
          </Button>
        </div>
      </PageScaffold>
    );
  return (
    <div ref={root} className="dashboard-surface">
      <PageScaffold
        {...scaffold}
        actions={
          <div className="heading-actions">
            {editing ? (
              <>
                <Button disabled={busy} onClick={cancel}>
                  취소
                </Button>
                <Button
                  variant="primary"
                  disabled={busy || editor.review}
                  onClick={() => void save()}
                >
                  <Check size={16} />
                  {busy ? '저장 중…' : '배치 저장'}
                </Button>
              </>
            ) : (
              <>
                {state.data?.initialized === false ? (
                  <>
                    <Button
                      variant="primary"
                      disabled={busy || state.status !== 'ready' || state.stale}
                      onClick={() => void initialize(false)}
                    >
                      <Plus size={17} />
                      기본 위젯으로 시작
                    </Button>
                    <Button
                      disabled={busy || state.status !== 'ready' || state.stale}
                      onClick={() => void initialize(true)}
                    >
                      빈 홈으로 시작
                    </Button>
                  </>
                ) : (
                  <Button disabled={state.status !== 'ready' || state.stale} onClick={start}>
                    <Pencil size={15} />
                    배치 편집
                  </Button>
                )}
                <Button
                  variant="primary"
                  disabled={
                    state.data?.initialized === false || state.status !== 'ready' || state.stale
                  }
                  onClick={() => editWidget()}
                >
                  <Plus size={17} />
                  위젯 추가
                </Button>
              </>
            )}
          </div>
        }
      >
        {(state.status === 'idle' || state.status === 'loading') && (
          <p role="status">배치를 불러오는 중…</p>
        )}
        {state.status === 'error' && (
          <p className="notice" role="alert">
            배치를 불러오지 못했습니다.{' '}
            {state.data ? '이전에 확인한 배치입니다.' : '기본 배치로 대체하지 않습니다.'}{' '}
            <Button disabled={busy} onClick={() => store.home.invalidate()}>
              배치 다시 불러오기
            </Button>
          </p>
        )}
        {state.status === 'ready' && state.data?.initialized === false && (
          <EmptyState title="홈을 시작해 보세요">
            <p>
              서버가 제공하는 기본 위젯 6개를 준비하거나, 빈 홈에서 필요한 위젯을 직접 추가할 수
              있어요.
            </p>
          </EmptyState>
        )}
        {notice && (
          <p className="notice" role={editor?.review ? 'alert' : 'status'}>
            {notice}
          </p>
        )}
        {editor?.review && (
          <div className="notice" role="region" aria-label="배치 충돌 검토">
            <Button disabled={busy} onClick={() => void reload()}>
              최신 배치 다시 확인
            </Button>
            <p>내 초안의 위젯 순서와 설정</p>
            <ol>
              {editor.draft.map((w) => (
                <li key={w.id}>
                  {w.title} · {w.type} · {w.selection.kind} · {w.size} ·{' '}
                  {selectionLabel(w.selection, categories)} · {w.limit ?? '기본 개수'}
                </li>
              ))}
            </ol>
            {latest && (
              <>
                <p>최신 서버 배치</p>
                <ol>
                  {latest.widgets.map((w) => (
                    <li key={w.id}>
                      {w.title} · {w.type} · {w.selection.kind} · {w.size} ·{' '}
                      {selectionLabel(w.selection, categories)} · {w.limit ?? '기본 개수'}
                    </li>
                  ))}
                </ol>
                {editor.submitted && sameWidgets(latest.widgets, editor.submitted.widgets) && (
                  <p>
                    현재 서버 배치가 제출한 내용과 같습니다. 새 저장 없이 서버 배치를 선택할 수
                    있습니다.
                  </p>
                )}
                <Button disabled={busy} onClick={() => reconcile(false)}>
                  서버 배치 사용
                </Button>
                <Button disabled={busy} onClick={() => reconcile(true)}>
                  내 초안 전체 다시 적용
                </Button>
              </>
            )}
          </div>
        )}
        {editing && (
          <div className="edit-banner">
            <GripVertical size={18} />
            <span>
              드래그하거나 화살표로 위치를 바꾸세요. 설정에서 크기와 종류를 변경할 수 있어요.
            </span>
            <Button disabled={busy || editor.review} onClick={() => editWidget()}>
              <Plus size={15} />
              위젯 추가
            </Button>
          </div>
        )}
        <div
          className={`dashboard-grid ${editing ? 'is-editing' : ''}`}
          inert={busy || !!editor?.review}
        >
          {shown.map((w) => {
            const index = items.findIndex((x) => x.id === w.id);
            const href = widgetHref?.(w);
            return (
              <WidgetFrame
                key={w.id}
                widget={w}
                titleLink={href && onNavigate ? { href, onNavigate } : undefined}
                classification={selectionLabel(
                  !editing && displaySelection ? displaySelection(w) : w.selection,
                  categories,
                )}
                editing={editing}
                index={index}
                total={items.length}
                dragging={dragId === w.id}
                onDrag={setDragId}
                onDrop={() => {
                  if (dragId) {
                    const source = items.find((x) => x.id === dragId);
                    if (source) move(source, w.id);
                  }
                  setDragId(null);
                }}
                onMove={(offset) => {
                  const target = items[index + offset];
                  if (target) move(w, target.id);
                }}
                onEdit={() => editWidget(w)}
                onRemove={() => change(items.filter((x) => x.id !== w.id))}
              >
                <div inert={editing} className="dashboard-widget-content">
                  {renderWidget(w)}
                </div>
              </WidgetFrame>
            );
          })}
        </div>
        {(state.status === 'ready' || editing) &&
          state.data?.initialized !== false &&
          !shown.length && (
            <EmptyState
              title="표시할 위젯이 없어요"
              onReset={!editing && (query || filter !== 'all') ? onReset : undefined}
            >
              <p>검색 조건을 바꾸거나 홈에 필요한 위젯을 추가해 주세요.</p>
            </EmptyState>
          )}
        {((state.data?.initialized !== false && state.data) || editing) && items.length === 0 && (
          <button
            className="add-widget-area"
            disabled={busy || editor?.review || (!editing && state.status !== 'ready')}
            onClick={() => editWidget()}
          >
            <Plus size={18} />
            <span>나에게 필요한 위젯으로 홈을 채워 보세요</span>
            <strong>위젯 추가</strong>
          </button>
        )}
        {editor?.widget && (
          <ApiWidgetEditor
            key={editor.widget.form.id}
            memory={memory}
            options={options}
            categories={categories}
            available={available}
            onDelete={async (widget) => {
              await store.deleteWidget(widget);
              setAvailable((items) => items.filter((item) => item.id !== widget.id));
            }}
            onClose={() => update({ ...memory.editor!, widget: undefined })}
            onSave={(w) => {
              const draft = items.some((x) => x.id === w.id)
                ? items.map((x) => (x.id === w.id ? w : x))
                : [...items, w];
              update({ ...memory.editor!, draft, widget: undefined });
            }}
          />
        )}
      </PageScaffold>
    </div>
  );
}
