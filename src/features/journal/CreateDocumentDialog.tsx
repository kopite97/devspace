import { useEffect, useRef, useState } from 'react';
import { registerDirtyForm } from '../../shared/lib/navigationGuard';
import { CancelledError } from '../../shared/http/client';
import { Button, Modal } from '../../shared/ui/controls';
import type { JournalDocuments } from './documentCollection';
import type { ApiJournal } from './apiModel';

export function CreateDocumentDialog({
  journal,
  store,
  onClose,
  onCreated,
}: {
  journal: ApiJournal;
  store: JournalDocuments;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const active = useRef(false);
  const releaseGuard = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    active.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (releaseGuard.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      active.current = false;
      releaseGuard.current?.();
      releaseGuard.current = undefined;
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);
  const create = async () => {
    if (busy || uncertain) return;
    setBusy(true);
    releaseGuard.current = registerDirtyForm();
    setError('');
    try {
      const id = await store.create(journal.id);
      releaseGuard.current?.();
      releaseGuard.current = undefined;
      if (active.current) onCreated(id);
    } catch (error) {
      if (!(error instanceof CancelledError)) {
        setUncertain(true);
        store.invalidateDocuments();
        setError(
          '생성 결과를 확인하지 못했습니다. 중복 생성을 방지하려면 이 창을 닫고 일지 문서 목록을 먼저 확인해 주세요.',
        );
      }
    } finally {
      releaseGuard.current?.();
      releaseGuard.current = undefined;
      setBusy(false);
    }
  };
  return (
    <Modal
      title="이 일지에 새 글을 작성할까요?"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        <strong>{journal.title}</strong>
      </p>
      <p className="muted">
        {journal.projectName} · {journal.entryDate}
      </p>
      <p>빈 초안을 만든 뒤 편집 화면으로 이동합니다.</p>
      {error && <p role="alert">{error}</p>}
      <div className="modal-actions">
        <Button disabled={busy} onClick={onClose}>
          취소
        </Button>
        <Button variant="primary" disabled={busy || uncertain} onClick={() => void create()}>
          {busy ? '초안 만드는 중…' : '초안 만들기'}
        </Button>
      </div>
    </Modal>
  );
}
