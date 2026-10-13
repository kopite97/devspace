import { useQuery } from '../../shared/http/query';
import type { Ref } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button, Badge } from '../../shared/ui/controls';
import type { JournalDocuments } from './documentCollection';

export function JournalDocumentList({
  id,
  store,
  onOpen,
  headingRef,
  onGoToCreate,
}: {
  id: string;
  store: JournalDocuments;
  onOpen: (id: string) => void;
  headingRef: Ref<HTMLHeadingElement>;
  onGoToCreate: () => void;
}) {
  const query = store.list(id);
  const state = useQuery(query);
  return (
    <section className="journal-document-section" aria-label="일지 문서">
      <div className="journal-document-heading">
        <h2 ref={headingRef} tabIndex={-1}>
          연결된 글
        </h2>
        {state.data && state.status !== 'error' && <span>{state.data.total}개</span>}
      </div>
      <p className="journal-document-order">최근 조회 기준 · 생성일 최신순</p>
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
        <button
          key={item.id}
          className="document-row journal-document-row"
          onClick={() => onOpen(item.id)}
        >
          <span>
            <strong>{item.title || '제목 없는 문서'}</strong>
            <small>
              <Badge tone={item.status === 'DRAFT' ? 'neutral' : 'green'}>
                {item.status === 'DRAFT' ? '초안' : '게시됨'}
              </Badge>
              <time dateTime={item.updatedAt}>
                {new Date(item.updatedAt).toLocaleString('ko-KR')}
              </time>
            </small>
          </span>
        </button>
      ))}
      {state.status === 'ready' && !state.data?.items.length && (
        <div className="journal-document-empty">
          <p>아직 연결된 글이 없어요.</p>
          <p>새 글을 작성해 이 일지의 기록을 이어가세요.</p>
        </div>
      )}
      {state.data?.nextCursor && (
        <Button disabled={state.status === 'loading'} onClick={() => void store.more(id)}>
          문서 더 불러오기
        </Button>
      )}
      <div className="journal-document-footer">
        <Button variant="ghost" onClick={onGoToCreate}>
          <ArrowUp size={15} />
          작성 위치로 이동
        </Button>
      </div>
    </section>
  );
}
