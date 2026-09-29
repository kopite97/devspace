import { useEffect, useRef, type ReactNode } from 'react';
import { useQuery } from '../../shared/http/query';
import { Button } from '../../shared/ui/controls';
import { PageScaffold } from '../../shared/ui/PageScaffold';
import type { JournalDocuments } from './documentCollection';
import type { ApiJournal } from './apiModel';

export function JournalViewer({
  id,
  store,
  onBack,
  renderDocuments,
}: {
  id: string;
  store: JournalDocuments;
  onBack: () => void;
  renderDocuments: (journal: ApiJournal) => ReactNode;
}) {
  const query = store.detail(id);
  const state = useQuery(query);
  const surface = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (state.status !== 'ready' || focused.current) return;
    const heading = surface.current?.querySelector('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
      focused.current = true;
    }
  }, [state.status]);
  return (
    <div ref={surface}>
      <PageScaffold
        title={state.data?.title ?? '개발 일지'}
        description="일지의 맥락과 연결된 문서를 함께 확인하세요."
        actions={<Button onClick={onBack}>일지 목록</Button>}
      >
        {state.status === 'error' ? (
          <div role="alert">
            일지가 없거나 불러올 수 없습니다.{' '}
            <Button onClick={() => void query.load(undefined, { force: true })}>다시 시도</Button>
          </div>
        ) : !state.data ? (
          <p role="status">일지를 불러오는 중…</p>
        ) : (
          <>
            <article className="content-panel journal-viewer">
              <p className="muted">
                {state.data.projectName} · {state.data.entryDate}
              </p>
              <p className="detail-body">{state.data.body}</p>
            </article>
            {renderDocuments(state.data)}
          </>
        )}
      </PageScaffold>
    </div>
  );
}
