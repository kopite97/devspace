import { useQuery } from '../../shared/http/query';
import { Button, EmptyState } from '../../shared/ui/controls';
import type { JournalDocuments } from './documentCollection';
import { CreateDocumentButton } from './CreateDocumentButton';

export function JournalDocumentList({
  id,
  store,
  onOpen,
  onCreated,
}: {
  id: string;
  store: JournalDocuments;
  onOpen: (id: string) => void;
  onCreated: (id: string) => void;
}) {
  const query = store.list(id);
  const state = useQuery(query);
  return (
    <section className="content-panel" aria-label="일지 문서">
      <div className="panel-heading">
        <h2>문서</h2>
        <CreateDocumentButton key={id} journalId={id} store={store} onCreated={onCreated} />
      </div>
      {state.status === 'loading' && <p role="status">문서를 불러오는 중…</p>}
      {state.status === 'error' && (
        <p role="alert">
          문서 목록을 불러오지 못했습니다.{' '}
          <Button onClick={() => void query.load(undefined, { force: true })}>
            목록 다시 불러오기
          </Button>
          {state.data?.nextCursor && (
            <Button onClick={() => void store.more(id)}>다음 페이지 재시도</Button>
          )}
        </p>
      )}
      {state.data?.items.map((item) => (
        <button key={item.id} className="document-row" onClick={() => onOpen(item.id)}>
          <span>
            <strong>{item.title || '제목 없는 문서'}</strong>
            <small>
              {item.status === 'DRAFT' ? '초안' : '게시됨'} ·{' '}
              {new Date(item.updatedAt).toLocaleString('ko-KR')}
            </small>
          </span>
        </button>
      ))}
      {state.status === 'ready' && !state.data?.items.length && (
        <EmptyState title="아직 문서가 없어요">새 글을 작성해 이 일지에 연결하세요.</EmptyState>
      )}
      {state.data?.nextCursor && (
        <Button disabled={state.status === 'loading'} onClick={() => void store.more(id)}>
          문서 더 불러오기
        </Button>
      )}
      {state.data && <p className="muted">최근 조회 기준 {state.data.total}개 · 생성일 최신순</p>}
    </section>
  );
}
