import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useQuery } from '../../shared/http/query';
import { Button, Modal } from '../../shared/ui/controls';
import { DocumentController, documentError, type DocumentMemory } from './controller';
import type { DocumentSnapshot } from './model';
import type { DocumentStore } from './store';
import './styles.css';

const BlockDocument = lazy(() =>
  import('./BlockDocument').then((module) => ({ default: module.BlockDocument })),
);
class DocumentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert">
        문서 구조를 표시할 수 없어 편집을 중단했습니다. 원본 내용은 서버에 유지됩니다.
      </p>
    ) : (
      this.props.children
    );
  }
}
export function DocumentWorkspace({
  id,
  editing,
  store,
  memory,
  onNavigate,
}: {
  id: string;
  editing: boolean;
  store: DocumentStore;
  memory: DocumentMemory;
  onNavigate: (path: string) => boolean;
}) {
  const query = store.detail(id);
  const state = useQuery(query);
  const [initial, setInitial] = useState<DocumentSnapshot>();
  useEffect(() => {
    if (!initial && state.status === 'ready' && state.data) setInitial(state.data);
  }, [initial, state]);
  const back = memory.returns[id] ?? '/journals';
  if (!initial)
    return (
      <section className="document-surface">
        <Button onClick={() => onNavigate(back)}>돌아가기</Button>
        {state.status === 'error' ? (
          <p role="alert">
            {documentError(state.error)}{' '}
            <Button onClick={() => void query.load(undefined, { force: true })}>
              다시 불러오기
            </Button>
          </p>
        ) : (
          <p role="status">문서를 불러오는 중…</p>
        )}
      </section>
    );
  return (
    <DocumentBoundary key={`${id}:${editing}`}>
      <DocumentSession
        snapshot={initial}
        editing={editing}
        store={store}
        memory={memory}
        back={back}
        onNavigate={onNavigate}
      />
    </DocumentBoundary>
  );
}
function DocumentSession({
  snapshot,
  editing,
  store,
  memory,
  back,
  onNavigate,
}: {
  snapshot: DocumentSnapshot;
  editing: boolean;
  store: DocumentStore;
  memory: DocumentMemory;
  back: string;
  onNavigate: (path: string) => boolean;
}) {
  const [controller] = useState(
    () =>
      new DocumentController(
        store,
        snapshot,
        editing ? memory : { returns: memory.returns },
        editing,
      ),
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const paper = useRef<HTMLElement>(null);
  const mounts = useRef(0);
  useEffect(() => {
    mounts.current++;
    controller.activate();
    const heading = paper.current?.querySelector<HTMLElement>('input.document-title, h1');
    if (heading) {
      if (heading.tagName === 'H1') heading.tabIndex = -1;
      heading.focus();
    }
    const unload = (event: BeforeUnloadEvent) => {
      if (controller.getSnapshot().dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('beforeunload', unload);
      mounts.current--;
      queueMicrotask(() => {
        if (!mounts.current) controller.dispose();
      });
    };
  }, [controller]);
  const run = async (work: () => Promise<unknown>) => {
    setNotice('');
    try {
      await work();
    } catch (error) {
      setNotice(documentError(error));
    }
  };
  const temporary = controller.registry.values().filter((item) => item.status === 'TEMP');
  const download = async (id: string, name: string) => {
    const blob = await store.download(id);
    store.transport.lifecycle.assert(store.transport.generation);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  return (
    <section className="document-surface" aria-label={editing ? '문서 편집' : '문서 보기'}>
      <header className="document-toolbar">
        <Button disabled={state.locked} onClick={() => onNavigate(back)}>
          돌아가기
        </Button>
        <span className="document-status" role="status" aria-live="polite">
          {state.snapshot.status === 'DRAFT' ? '초안' : '게시됨'}
          {editing &&
            ` · ${{ saved: '저장됨', pending: '저장 대기', saving: '저장 중…', error: '저장 중단' }[state.status]}`}
        </span>
        <div className="document-actions">
          {editing ? (
            <>
              <Button
                disabled={state.locked || state.uploads.length > 0 || state.status === 'error'}
                onClick={() =>
                  void run(async () => {
                    await controller.flush();
                    onNavigate(`/documents/${snapshot.id}`);
                  })
                }
              >
                미리 보기
              </Button>
              <Button
                variant="primary"
                disabled={state.locked || state.uploads.length > 0 || state.status === 'error'}
                onClick={() =>
                  void run(async () => {
                    await controller.publish();
                    onNavigate(`/documents/${snapshot.id}`);
                  })
                }
              >
                {state.locked
                  ? '처리 중…'
                  : state.snapshot.status === 'PUBLISHED'
                    ? '게시 확인'
                    : '게시'}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => onNavigate(`/documents/${snapshot.id}/edit`)}>
              수정
            </Button>
          )}
          <Button variant="danger" disabled={state.locked} onClick={() => setDeleting(true)}>
            삭제
          </Button>
        </div>
      </header>
      {editing && state.snapshot.status === 'PUBLISHED' && (
        <p className="notice">
          게시된 문서입니다. 저장한 변경 사항은 게시된 내용에 바로 반영됩니다.
        </p>
      )}
      {(state.error || notice) && (
        <div className="notice" role="alert">
          <p>{notice || state.error}</p>
          {state.status === 'error' && (
            <>
              <Button
                disabled={state.locked}
                onClick={() => void run(() => controller.reconcile())}
              >
                서버 상태 확인
              </Button>
              <Button
                disabled={state.locked || state.uncertain}
                onClick={() => void run(() => controller.retry())}
              >
                다시 저장
              </Button>
            </>
          )}
          {notice && (
            <Button
              onClick={() => {
                setNotice('');
                if (!editing) setPreviewKey((key) => key + 1);
                else
                  paper.current?.querySelectorAll('img').forEach((image) => {
                    image.src = image.src;
                  });
              }}
            >
              첨부 다시 표시
            </Button>
          )}
          <Button
            disabled={state.locked}
            onClick={() => void run(() => store.transport.recoverSecurity())}
          >
            인증·보안 확인
          </Button>
        </div>
      )}
      <article className="document-paper" ref={paper}>
        <div className="document-heading">
          {editing ? (
            <input
              className="document-title"
              aria-label="문서 제목"
              placeholder="제목 없는 문서"
              value={state.title}
              disabled={state.locked}
              maxLength={200}
              onChange={(event) => controller.edit(event.target.value, state.content)}
            />
          ) : (
            <h1>{state.title || '제목 없는 문서'}</h1>
          )}
          <p className="muted">
            최종 저장 {new Date(state.snapshot.updatedAt).toLocaleString('ko-KR')}
            {state.snapshot.publishedAt &&
              ` · 최초 게시 ${new Date(state.snapshot.publishedAt).toLocaleString('ko-KR')}`}
          </p>
        </div>
        <Suspense fallback={<p role="status">편집기를 준비하는 중…</p>}>
          <BlockDocument
            key={previewKey}
            content={state.content}
            editable={editing && !state.locked}
            uploadFile={editing ? (file) => controller.upload(file) : undefined}
            onChange={(content) => controller.edit(controller.getSnapshot().title, content)}
            onError={setNotice}
          />
        </Suspense>
      </article>
      {state.snapshot.attachments.length > 0 && (
        <section className="document-attachments" aria-label="첨부 다운로드">
          <h2>첨부 파일</h2>
          {state.snapshot.attachments.map((item) => (
            <Button
              key={item.id}
              onClick={() => void run(() => download(item.id, item.originalFilename))}
            >
              {item.originalFilename} 다운로드
            </Button>
          ))}
        </section>
      )}
      {editing && (
        <section className="document-attachments" aria-label="첨부 관리">
          {state.uploads.map((upload) => (
            <div key={upload.key} role={upload.status === 'failed' ? 'alert' : 'status'}>
              <strong>{upload.file.name}</strong> ·{' '}
              {upload.status === 'uploading' ? '업로드 중…' : upload.error}
              {upload.status === 'failed' && (
                <Button onClick={() => controller.dismissUpload(upload.key)}>
                  목록에서 제거 후 파일 블록에서 다시 선택
                </Button>
              )}
            </div>
          ))}
          {temporary.length > 0 && (
            <details>
              <summary>임시 첨부 {temporary.length}개</summary>
              <p>
                블록을 제거하고 저장하면 임시 첨부가 됩니다. 영구 삭제하면 실행 취소로 복원할 수
                없습니다.
              </p>
              {temporary.map((item) => (
                <div key={item.id}>
                  {item.originalFilename}
                  <Button
                    disabled={state.locked || state.status === 'saving'}
                    onClick={() => {
                      if (window.confirm('임시 첨부를 영구 삭제할까요?'))
                        void run(() => controller.deleteTemporary(item.id));
                    }}
                  >
                    임시 파일 삭제
                  </Button>
                </div>
              ))}
            </details>
          )}
        </section>
      )}
      {deleting && (
        <Modal
          title="문서를 삭제할까요?"
          onClose={() => {
            if (!state.locked) setDeleting(false);
          }}
        >
          <p>문서와 첨부 연결을 삭제합니다. 이 작업은 되돌릴 수 없습니다.</p>
          {notice && <p role="alert">{notice}</p>}
          <div className="modal-actions">
            <Button disabled={state.locked} onClick={() => setDeleting(false)}>
              취소
            </Button>
            <Button
              variant="danger"
              disabled={state.locked}
              onClick={() =>
                void run(async () => {
                  await controller.delete();
                  setDeleting(false);
                  onNavigate(back);
                })
              }
            >
              {state.locked ? '삭제 중…' : '삭제 확인'}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
