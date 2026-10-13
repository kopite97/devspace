import { useState } from 'react';
import { Button, Field, Modal } from '../../shared/ui/controls';
import { useProjects } from '../projects/ProjectsProvider';
import { ProjectSelect } from '../projects/ProjectSelect';
import { useUnsavedChanges } from '../../shared/hooks/useUnsavedChanges';
import { localDate, type JournalEntry } from './model';

export function JournalEditor({
  existing,
  onSave,
  onClose,
}: {
  existing?: JournalEntry;
  onSave: (entry: JournalEntry) => boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const { projects } = useProjects();
  const [projectId, setProjectId] = useState(existing?.projectId ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [initialDate] = useState(() => localDate(existing?.createdAt ?? new Date().toISOString()));
  const [date, setDate] = useState(initialDate);
  const [error, setError] = useState('');
  const canDiscard = useUnsavedChanges(
    title !== (existing?.title ?? '') ||
      projectId !== (existing?.projectId ?? '') ||
      body !== (existing?.body ?? '') ||
      date !== initialDate,
  );
  const close = () => {
    if (canDiscard()) onClose();
  };
  return (
    <Modal title={existing ? '개발일지 수정' : '개발일지 작성'} onClose={close} wide>
      <p className="modal-intro">오늘의 변경과 다음 작업을 기록하세요. 이 브라우저에 저장됩니다.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const project = projects.find((p) => p.id === projectId);
          if (!title.trim() || !body.trim() || !project) {
            setError('제목, 프로젝트, 일지 설명을 입력해 주세요.');
            return;
          }
          if (
            onSave({
              id: existing?.id ?? crypto.randomUUID(),
              title: title.trim(),
              body: body.trim(),
              projectId,
              project: project.name,
              scope: project.scope,
              createdAt:
                date === initialDate
                  ? (existing?.createdAt ?? new Date().toISOString())
                  : new Date(`${date}T12:00:00`).toISOString(),
            })
          )
            onClose();
          else
            setError(
              '저장하지 못했습니다. 입력 내용은 유지됩니다. 저장 공간을 확인하고 다시 저장해 주세요.',
            );
        }}
      >
        <div className="journal-form">
          <Field label="일지 제목">
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </Field>
          <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />
          <Field label="작성일">
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="일지 설명">
            <textarea
              className="journal-description-input"
              required
              maxLength={20000}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="이 일지에서 다루는 작업이나 주제를 간단히 소개해 주세요."
            />
          </Field>
        </div>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button type="button" onClick={close}>
            취소
          </Button>
          <Button variant="primary" type="submit">
            일지 저장
          </Button>
        </div>
      </form>
    </Modal>
  );
}
