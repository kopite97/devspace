import { ArrowUpRight, BookOpen, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button, EmptyState, Modal } from '../../shared/ui/controls';
import { PageScaffold } from '../../shared/ui/PageScaffold';
import { HttpError, CancelledError } from '../../shared/http/client';
import { useQuery } from '../../shared/http/query';
import type { CategoryFilter, CategoryOption } from '../projects/categoryFilter';
import { journalDraft, presentation, type ApiJournal, type JournalProjectOption } from './apiModel';
import type { JournalMemory } from './draftMemory';
import type { JournalFilter, JournalStore } from './apiStore';
import { ApiJournalEditor } from './ApiJournalEditor';
import type { JournalProjectOptions } from './projectOptions';
import type { JournalDocuments } from './documentCollection';
import { CreateDocumentDialog } from './CreateDocumentDialog';
import { JournalSearchDialog } from './JournalSearchDialog';

export function ApiJournalWorkspace({
  store,
  options,
  memory,
  category,
  categories,
  queryText,
  projectId,
  from,
  to,
  sort,
  onFilterNavigate,
  documents,
  onOpenJournal,
  onDocumentCreated,
  searchButtonRef,
}: {
  store: JournalStore;
  options: JournalProjectOptions;
  memory: JournalMemory;
  category: CategoryFilter;
  categories: readonly CategoryOption[];
  queryText: string;
  projectId: string;
  from: string;
  to: string;
  sort: 'newest' | 'oldest';
  documents: JournalDocuments;
  onOpenJournal: (id: string) => void;
  onDocumentCreated: (id: string, journalId: string) => void;
  searchButtonRef: RefObject<HTMLButtonElement | null>;
  onFilterNavigate: (
    category: CategoryFilter,
    query: string,
    fields?: Partial<Record<'projectId' | 'from' | 'to' | 'sort', string>>,
    restoreSearchFocus?: boolean,
  ) => boolean;
}) {
  const [searching, setSearching] = useState(false);
  const isSearchOpen = useRef(false);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const editRequest = useRef<object | null>(null);
  const [editing, setEditing] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [creatingDocument, setCreatingDocument] = useState<ApiJournal>();
  const [deleting, setDeleting] = useState<ApiJournal>();
  const [notice, setNotice] = useState('');
  const [deleteNotice, setDeleteNotice] = useState('');
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const projectState = useQuery(options.list);
  const validRange = !from || !to || from <= to;
  const filter: JournalFilter = {
    category,
    projectId: projectId || undefined,
    projectStatus: 'all',
    query: queryText,
    from: validRange && from ? from : undefined,
    to: validRange && to ? to : undefined,
    sort,
    limit: 20,
  };
  const list = store.list(filter);
  const state = useQuery(list);
  const hasFilters = !!(
    queryText ||
    category !== 'all' ||
    projectId ||
    from ||
    to ||
    sort !== 'newest'
  );
  const projects = useMemo(
    () => new Map((projectState.data?.items ?? []).map((project) => [project.id, project])),
    [projectState.data],
  );
  const [selectedProject, setSelectedProject] = useState<JournalProjectOption>();

  useEffect(
    () => () => {
      editRequest.current = null;
    },
    [],
  );
  useEffect(() => {
    if (!projectId || projects.has(projectId)) return;
    const query = options.detail(projectId);
    let active = true;
    void query.load().then(() => {
      const next = query.getSnapshot();
      if (active && next.status === 'ready' && next.data) setSelectedProject(next.data);
    });
    return () => {
      active = false;
    };
  }, [options, projectId, projects]);
  if (selectedProject) projects.set(selectedProject.id, selectedProject);

  const openSearch = () => {
    if (editRequest.current || editing || selecting || creatingDocument || deleting) return;
    isSearchOpen.current = true;
    setSearching(true);
  };
  const closeSearch = () => {
    isSearchOpen.current = false;
    setSearching(false);
  };
  const current = () => store.transport.generation === store.transport.lifecycle.generation;
  const startCreate = () => {
    setNotice('');
    memory.editor = { target: 'create', draft: journalDraft() };
    setEditing(true);
  };
  const startEdit = async (journal: ApiJournal) => {
    if (pending.has(journal.id) || editRequest.current || isSearchOpen.current) return;
    const request = {};
    editRequest.current = request;
    setIsLoadingEdit(true);
    setPending(new Set([...pending, journal.id]));
    setNotice('');
    try {
      const query = store.detail(journal.id);
      query.invalidate();
      await query.load();
      if (editRequest.current !== request || !current()) return;
      const next = query.getSnapshot();
      if (next.status === 'ready' && next.data) {
        memory.editor = { target: journal.id, baseline: next.data, draft: journalDraft(next.data) };
        setEditing(true);
      } else setNotice('일지를 확인하지 못했습니다. 제목을 눌러 다시 시도해 주세요.');
    } catch {
      if (editRequest.current === request && current())
        setNotice('일지를 확인하지 못했습니다. 제목을 눌러 다시 시도해 주세요.');
    } finally {
      if (editRequest.current === request) {
        editRequest.current = null;
        setIsLoadingEdit(false);
        setPending((previous) => {
          const next = new Set(previous);
          next.delete(journal.id);
          return next;
        });
      }
    }
  };
  const saveComplete = (message?: string) => {
    memory.editor = undefined;
    setEditing(false);
    setNotice(message ?? '');
    onFilterNavigate('all', '', { projectId: '', from: '', to: '', sort: '' });
  };
  const deleteJournal = async () => {
    if (!deleting || pending.has(deleting.id)) return;
    const target = deleting;
    setPending(new Set([...pending, target.id]));
    setDeleteNotice('');
    try {
      await store.mutate('delete', { id: target.id, revision: target.revision });
      if (!current()) return;
      setDeleting(undefined);
      setNotice('개발일지를 삭제했습니다.');
    } catch (error) {
      if (!current() || error instanceof CancelledError) return;
      const code = error instanceof HttpError ? error.code : '';
      setDeleteNotice(
        code === 'REVISION_CONFLICT'
          ? '다른 곳에서 변경되었습니다. 최신 상태를 확인한 후 다시 삭제해 주세요.'
          : error instanceof Error
            ? error.message
            : '삭제하지 못했습니다. 입력 내용은 유지됩니다.',
      );
      if (code === 'REVISION_CONFLICT' || (error instanceof HttpError && error.status >= 500)) {
        const query = store.detail(target.id);
        query.invalidate();
        await query.load();
        const next = query.getSnapshot();
        if (current() && next.status === 'ready' && next.data) setDeleting(next.data);
      }
    } finally {
      setPending((previous) => {
        const next = new Set(previous);
        next.delete(target.id);
        return next;
      });
    }
  };

  return (
    <>
      <PageScaffold
        compact
        title="개발 일지"
        description="작업의 맥락과 다음 단계를 기록하세요."
        actions={
          <>
            <Button
              ref={searchButtonRef}
              aria-haspopup="dialog"
              disabled={isLoadingEdit}
              onClick={openSearch}
            >
              <Search size={16} />
              검색 및 정렬
              {hasFilters && <span className="journal-search-applied">적용됨</span>}
            </Button>
            <Button onClick={() => setSelecting(true)}>새 글 작성</Button>
            <Button variant="primary" onClick={startCreate}>
              <Plus size={16} />
              일지 작성
            </Button>
          </>
        }
      >
        <div className="content-panel journal-page-content">
          {!validRange && (
            <p role="alert">
              날짜 범위를 확인해 주세요. 검색 및 정렬에서 조건을 수정할 수 있습니다.
            </p>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {!validRange ? null : (
            <JournalResults
              store={store}
              filter={filter}
              state={state}
              list={list}
              onEdit={startEdit}
              onDetail={(journal) => onOpenJournal(journal.id)}
              onDelete={setDeleting}
              pending={pending}
            />
          )}
        </div>
      </PageScaffold>
      {searching && (
        <JournalSearchDialog
          values={{ category, query: queryText, projectId, from, to, sort }}
          categories={categories}
          projects={[...projects.values()]}
          onClose={closeSearch}
          onApply={(values) =>
            onFilterNavigate(
              values.category,
              values.query,
              {
                projectId: values.projectId,
                from: values.from,
                to: values.to,
                sort: values.sort === 'newest' ? '' : values.sort,
              },
              true,
            )
          }
        />
      )}
      {editing && memory.editor && (
        <ApiJournalEditor
          store={store}
          options={options}
          memory={memory}
          onClose={() => setEditing(false)}
          onSaved={saveComplete}
        />
      )}
      {selecting && (
        <Modal title="새 글을 연결할 일지 선택" onClose={() => setSelecting(false)}>
          <p className="modal-intro">
            현재 목록에서 일지를 직접 선택해 주세요. 원하는 일지가 없으면 이 창을 닫고 검색 및
            정렬에서 조건을 변경하거나 일지를 먼저 작성하세요.
          </p>
          {state.data?.items.map((journal) => (
            <Button
              key={journal.id}
              className="journal-picker-choice"
              onClick={() => {
                setSelecting(false);
                setCreatingDocument(journal);
              }}
            >
              {journal.title} · {journal.projectName} · {journal.entryDate}
            </Button>
          ))}
          {state.data?.nextCursor && (
            <Button disabled={state.status === 'loading'} onClick={() => void store.more(filter)}>
              일지 더 불러오기
            </Button>
          )}
          {!state.data?.items.length && <p>선택할 일지가 없습니다.</p>}
          <Button
            className="journal-picker-create"
            onClick={() => {
              setSelecting(false);
              startCreate();
            }}
          >
            일지 작성
          </Button>
        </Modal>
      )}
      {creatingDocument && (
        <CreateDocumentDialog
          journal={creatingDocument}
          store={documents}
          onClose={() => setCreatingDocument(undefined)}
          onCreated={(id) => onDocumentCreated(id, creatingDocument.id)}
        />
      )}
      {deleting && (
        <Modal title="개발일지를 삭제할까요?" onClose={() => setDeleting(undefined)}>
          <p>{deleting.title} — 삭제하면 복구할 수 없습니다.</p>
          {deleteNotice && <p role="alert">{deleteNotice}</p>}
          <div className="modal-actions">
            <Button onClick={() => setDeleting(undefined)}>취소</Button>
            <Button
              variant="danger"
              disabled={pending.has(deleting.id)}
              onClick={() => void deleteJournal()}
            >
              {pending.has(deleting.id) ? '삭제 중…' : '삭제 확인'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function JournalResults({
  store,
  filter,
  state,
  list,
  onEdit,
  onDetail,
  onDelete,
  pending,
}: {
  store: JournalStore;
  filter: JournalFilter;
  state: ReturnType<ReturnType<JournalStore['list']>['getSnapshot']>;
  list: ReturnType<JournalStore['list']>;
  onEdit: (journal: ApiJournal) => void;
  onDetail: (journal: ApiJournal) => void;
  onDelete: (journal: ApiJournal) => void;
  pending: ReadonlySet<string>;
}) {
  if (state.status === 'loading' && !state.data) return <p role="status">불러오는 중…</p>;
  if (state.status === 'loading' && state.data)
    return (
      <>
        <p role="status">최신 정보를 확인하고 있습니다…</p>
        <JournalItems
          items={state.data.items}
          onEdit={onEdit}
          onDetail={onDetail}
          onDelete={onDelete}
          pending={pending}
        />
      </>
    );
  if (state.status === 'error' && !state.data)
    return (
      <p className="notice" role="alert">
        불러오지 못했습니다. <Button onClick={() => void list.load()}>다시 시도</Button>
        <Button onClick={() => list.invalidate(true)}>새로고침</Button>
      </p>
    );
  if (state.status === 'error' && state.data)
    return (
      <>
        <p className="notice" role="alert">
          다음 페이지를 불러오지 못했습니다.{' '}
          <Button onClick={() => void store.more(filter)}>다시 시도</Button>
          <Button onClick={() => list.invalidate(true)}>목록 다시 시작</Button>
        </p>
        <JournalItems
          items={state.data.items}
          onEdit={onEdit}
          onDetail={onDetail}
          onDelete={onDelete}
          pending={pending}
        />
      </>
    );
  if (state.status === 'ready' && state.data && !state.data.items.length)
    return (
      <EmptyState
        title={
          filter.query || filter.projectId || filter.from || filter.to
            ? '검색 조건에 맞는 개발일지가 없어요'
            : '개발일지가 없어요'
        }
      />
    );
  if (!state.data) return null;
  return (
    <>
      {filter.query && <p role="status">검색 결과 {state.data.total}개</p>}
      <JournalItems
        items={state.data.items}
        onEdit={onEdit}
        onDetail={onDetail}
        onDelete={onDelete}
        pending={pending}
      />
      {state.data.nextCursor && (
        <Button disabled={state.status === 'loading'} onClick={() => void store.more(filter)}>
          더 불러오기
        </Button>
      )}
      <p className="journal-total">
        {state.data.total}개 · {state.data.items.length}개 불러옴
      </p>
    </>
  );
}

function JournalItems({
  items,
  onEdit,
  onDetail,
  onDelete,
  pending,
}: {
  items: ApiJournal[];
  onEdit: (journal: ApiJournal) => void;
  onDetail: (journal: ApiJournal) => void;
  onDelete: (journal: ApiJournal) => void;
  pending: ReadonlySet<string>;
}) {
  return (
    <>
      {items.map((raw) => {
        const journal = presentation(raw);
        return (
          <div key={journal.id} className="journal-list-item">
            <button className="document-row" onClick={() => onDetail(raw)}>
              <BookOpen size={20} />
              <span>
                <strong>{journal.title}</strong>
                <small>
                  {journal.project} · {journal.entryDate}
                </small>
              </span>
              <ArrowUpRight size={17} />
            </button>
            <div className="feature-actions">
              <Button
                aria-label={`${journal.title} 수정`}
                disabled={pending.has(journal.id)}
                onClick={() => onEdit(raw)}
              >
                수정
              </Button>
              <Button
                aria-label={`${journal.title} 삭제`}
                disabled={pending.has(journal.id)}
                onClick={() => onDelete(raw)}
              >
                <Trash2 size={14} />
                삭제
              </Button>
            </div>
          </div>
        );
      })}
    </>
  );
}
