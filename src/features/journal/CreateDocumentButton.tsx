import { useEffect, useRef, useState, type Ref } from 'react';
import { CancelledError } from '../../shared/http/client';
import { registerDirtyForm } from '../../shared/lib/navigationGuard';
import { Button } from '../../shared/ui/controls';
import type { JournalDocuments } from './documentCollection';

export function CreateDocumentButton({
  journalId,
  store,
  onCreated,
  disabled,
  buttonRef,
  regionRef,
}: {
  journalId: string;
  store: JournalDocuments;
  onCreated: (id: string) => void;
  disabled: boolean;
  buttonRef: Ref<HTMLButtonElement>;
  regionRef: Ref<HTMLDivElement>;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const isActive = useRef(false);
  const releaseGuard = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    isActive.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (releaseGuard.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      isActive.current = false;
      releaseGuard.current?.();
      releaseGuard.current = undefined;
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);
  const create = async () => {
    if (disabled || releaseGuard.current || error) return;
    releaseGuard.current = registerDirtyForm();
    setIsBusy(true);
    try {
      const id = await store.create(journalId);
      releaseGuard.current?.();
      releaseGuard.current = undefined;
      if (isActive.current) onCreated(id);
    } catch (error) {
      if (isActive.current && !(error instanceof CancelledError)) {
        store.invalidateDocuments();
        setError(
          '생성 결과를 확인하지 못했습니다. 문서 목록에서 초안 생성 여부를 확인한 뒤 이 페이지를 다시 열어 주세요.',
        );
      }
    } finally {
      releaseGuard.current?.();
      releaseGuard.current = undefined;
      if (isActive.current) setIsBusy(false);
    }
  };
  return (
    <div
      className="journal-detail-create"
      ref={regionRef}
      tabIndex={-1}
      role="group"
      aria-label="새 글 작성 영역"
    >
      <Button
        ref={buttonRef}
        variant="primary"
        disabled={disabled || isBusy || Boolean(error)}
        onClick={() => void create()}
      >
        {isBusy ? '초안 만드는 중…' : '새 글 작성'}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
