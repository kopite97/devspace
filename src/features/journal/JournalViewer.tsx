import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, ArrowDown } from 'lucide-react';
import { useQuery } from '../../shared/http/query';
import { Button } from '../../shared/ui/controls';
import type { JournalDocuments } from './documentCollection';

function focusAndScroll(element: HTMLElement | null) {
  if (!element) return;
  element.focus({ preventScroll: true });
  element.scrollIntoView({
    block: 'start',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
}

export function JournalViewer({
  id,
  store,
  onBack,
  renderAction,
  renderDocuments,
}: {
  id: string;
  store: JournalDocuments;
  onBack: () => void;
  renderAction: (options: {
    disabled: boolean;
    buttonRef: RefObject<HTMLButtonElement | null>;
    regionRef: RefObject<HTMLDivElement | null>;
  }) => ReactNode;
  renderDocuments: (options: {
    headingRef: RefObject<HTMLHeadingElement | null>;
    onGoToCreate: () => void;
  }) => ReactNode;
}) {
  const query = store.detail(id);
  const state = useQuery(query);
  const heading = useRef<HTMLHeadingElement>(null);
  const documentsHeading = useRef<HTMLHeadingElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const createRegion = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const journal = state.data?.id === id ? state.data : undefined;
  const visible = Boolean(journal) && state.status !== 'error';
  useEffect(() => {
    if (state.status !== 'ready' || !journal || focused.current) return;
    heading.current?.focus();
    focused.current = true;
  }, [state.status, journal]);
  return (
    <div className="journal-detail">
      <header className="journal-detail-header">
        <div className="journal-detail-toolbar">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={16} />
            일지 목록
          </Button>
          {/* Keep creation state and navigation protection alive during same-journal refetches. */}
          <div className="journal-detail-action" hidden={!visible}>
            {journal &&
              renderAction({
                disabled: state.status !== 'ready',
                buttonRef: createButton,
                regionRef: createRegion,
              })}
          </div>
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {visible ? journal?.title : '개발 일지'}
        </h1>
        {visible && journal && (
          <div className="journal-detail-meta">
            <p>
              <span>{journal.projectName}</span>
              <time dateTime={journal.entryDate}>{journal.entryDate}</time>
            </p>
            <Button variant="ghost" onClick={() => focusAndScroll(documentsHeading.current)}>
              연결된 글로 이동
              <ArrowDown size={15} />
            </Button>
          </div>
        )}
      </header>
      {state.status === 'error' ? (
        <div className="journal-detail-message" role="alert">
          <p>일지가 없거나 불러올 수 없습니다.</p>
          <Button onClick={() => void query.load(undefined, { force: true })}>다시 시도</Button>
        </div>
      ) : !journal ? (
        <p role="status">일지를 불러오는 중…</p>
      ) : (
        <div className="journal-detail-grid">
          <article className="journal-viewer">
            <p className="detail-body">{journal.body}</p>
          </article>
          {renderDocuments({
            headingRef: documentsHeading,
            onGoToCreate: () =>
              focusAndScroll(
                createButton.current && !createButton.current.disabled
                  ? createButton.current
                  : createRegion.current,
              ),
          })}
        </div>
      )}
    </div>
  );
}
