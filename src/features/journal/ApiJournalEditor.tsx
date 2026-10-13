import { useEffect, useRef, useState } from 'react';
import { Button, Field, Modal } from '../../shared/ui/controls';
import { useQuery } from '../../shared/http/query';
import { CancelledError, HttpError } from '../../shared/http/client';
import { useUnsavedChanges } from '../../shared/hooks/useUnsavedChanges';
import {
  journalDraft,
  patchBody,
  validateJournalDraft,
  type ApiJournal,
  type JournalDraft,
  type JournalProjectOption,
} from './apiModel';
import { createIntent, retryBody } from './apiIntent';
import type { JournalStore } from './apiStore';
import type { JournalMemory, JournalEditorMemory } from './draftMemory';
import type { JournalProjectOptions } from './projectOptions';

function SelectedProject({
  options,
  id,
  onReady,
}: {
  options: JournalProjectOptions;
  id: string;
  onReady: (option: JournalProjectOption) => void;
}) {
  useEffect(() => {
    const query = options.detail(id);
    let alive = true;
    void query.load().then(() => {
      const state = query.getSnapshot();
      if (alive && state.status === 'ready' && state.data) onReady(state.data);
    });
    return () => {
      alive = false;
    };
  }, [id, onReady, options]);
  return null;
}

export function ApiJournalEditor({
  store,
  options,
  memory,
  onClose,
  onSaved,
  lockedProject,
}: {
  store: JournalStore;
  options: JournalProjectOptions;
  memory: JournalMemory;
  onClose: () => void;
  onSaved: (message?: string) => void;
  lockedProject?: JournalProjectOption;
}) {
  const [editor, setEditor] = useState<JournalEditorMemory>(() => memory.editor!);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(editor.notice ?? '');
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<ApiJournal>();
  const [selected, setSelected] = useState<JournalProjectOption>();
  const pending = useRef(false);
  const alive = useRef(true);
  const current = () =>
    alive.current && store.transport.generation === store.transport.lifecycle.generation;
  const projects = useQuery(options.activeList);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!editor.baseline) return;
    const id = editor.baseline.projectId;
    const query = options.detail(id);
    let active = true;
    void query.load().then(() => {
      const state = query.getSnapshot();
      if (active && state.status === 'ready' && state.data) setSelected(state.data);
    });
    return () => {
      active = false;
    };
  }, [editor.baseline, options]);

  const initial = journalDraft(editor.baseline);
  if (lockedProject && !editor.baseline) initial.projectId = lockedProject.id;
  const canDiscard = useUnsavedChanges(
    busy || !!editor.intent || JSON.stringify(editor.draft) !== JSON.stringify(initial),
  );
  const close = () => {
    if (canDiscard()) {
      memory.editor = undefined;
      onClose();
    }
  };
  const update = (next: JournalEditorMemory) => {
    memory.editor = next;
    setEditor(next);
  };
  const values = new Map((projects.data?.items ?? []).map((project) => [project.id, project]));
  if (selected) values.set(selected.id, selected);
  if (lockedProject) values.set(lockedProject.id, lockedProject);

  const reload = async () => {
    if (!editor.baseline) return;
    const query = store.detail(editor.baseline.id);
    query.invalidate();
    await query.load();
    if (!current()) return;
    const state = query.getSnapshot();
    setLatest(state.status === 'ready' ? state.data : undefined);
    if (state.status !== 'ready')
      setNotice('최신 일지를 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 확인해 주세요.');
  };

  const run = async () => {
    if (pending.current || conflict) return;
    if (lockedProject && (lockedProject.archived || editor.draft.projectId !== lockedProject.id))
      return;
    const errors = validateJournalDraft(editor.draft);
    if (Object.keys(errors).length) {
      setNotice(Object.values(errors).join(' '));
      return;
    }
    pending.current = true;
    setBusy(true);
    setNotice('');
    try {
      let result: { journal?: ApiJournal; reconciled?: boolean };
      if (editor.baseline) {
        const body = patchBody(editor.baseline, editor.draft);
        if (Object.keys(body).length === 1) {
          memory.editor = undefined;
          onClose();
          return;
        }
        result = await store.mutate('patch', { id: editor.baseline.id, body });
      } else {
        const intent = editor.intent ?? createIntent(editor.draft);
        update({ ...editor, intent });
        result = await store.mutate('create', {
          body: retryBody(intent),
          key: intent.key,
          endpoint: intent.endpoint ?? '/api/v1/journals',
        });
      }
      if (!current()) return;
      memory.editor = undefined;
      onSaved(
        result.reconciled === false
          ? '저장은 확인되었습니다. 최신 일지 조회에 실패했습니다. 목록을 새로고침해 주세요.'
          : undefined,
      );
    } catch (error) {
      if (!current() || error instanceof CancelledError) return;
      const code = error instanceof HttpError ? error.code : '';
      if (error instanceof HttpError && code === 'CSRF_INVALID') {
        setNotice('Session security was refreshed. Review the draft and explicitly retry.');
        update({
          ...memory.editor!,
          notice: '세션을 확인했습니다. 입력 내용을 검토하고 명시적으로 다시 시도해 주세요.',
        });
        try {
          await store.transport.recoverSecurity();
        } catch (failure) {
          if (current())
            setNotice(failure instanceof Error ? failure.message : '보안 설정을 확인해 주세요.');
        }
      } else {
        setNotice(
          code === 'PROJECT_ARCHIVED'
            ? lockedProject
              ? '보관된 프로젝트에는 일지를 작성할 수 없습니다. 입력 내용은 유지됩니다.'
              : '대상 프로젝트가 보관되었습니다. 기존 관계를 유지하거나 활성 프로젝트를 선택해 주세요.'
            : code === 'RESOURCE_NOT_FOUND'
              ? '일지를 찾지 못했습니다. 최신 상태를 확인해 주세요.'
              : code === 'REVISION_CONFLICT'
                ? '다른 곳에서 변경되었습니다. 최신 상태를 확인하고 입력 내용을 다시 적용해 주세요.'
                : error instanceof Error
                  ? error.message
                  : '요청에 실패했습니다. 입력 내용은 유지됩니다.',
        );
        if (
          editor.baseline &&
          (code === 'REVISION_CONFLICT' ||
            code === 'RESOURCE_NOT_FOUND' ||
            (error instanceof HttpError &&
              (error.status === 0 || error.status >= 500 || code === 'PROTOCOL_ERROR')))
        ) {
          setConflict(true);
          await reload();
        }
        if (code === 'PROJECT_ARCHIVED') options.invalidate();
      }
    } finally {
      pending.current = false;
      if (current()) setBusy(false);
    }
  };

  return (
    <Modal title={editor.baseline ? '개발일지 수정' : '개발일지 작성'} onClose={close} wide>
      <p className="modal-intro">오늘의 변경과 다음 작업을 기록하세요. 서버 작업실에 저장됩니다.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <fieldset disabled={busy || !!editor.intent || conflict} className="journal-fieldset">
          <div className="journal-form">
            <Field label="일지 제목">
              <input
                required
                maxLength={120}
                value={editor.draft.title}
                onChange={(event) =>
                  update({ ...editor, draft: { ...editor.draft, title: event.target.value } })
                }
                autoFocus
              />
            </Field>
            <Field label="프로젝트">
              <select
                aria-label="프로젝트"
                required
                value={editor.draft.projectId}
                disabled={!!lockedProject}
                onChange={(event) =>
                  update({ ...editor, draft: { ...editor.draft, projectId: event.target.value } })
                }
              >
                <option value="">프로젝트 선택</option>
                {[...values.values()].map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {project.archived ? ' (보관됨)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="작성일">
              <input
                type="date"
                required
                value={editor.draft.entryDate}
                onChange={(event) =>
                  update({ ...editor, draft: { ...editor.draft, entryDate: event.target.value } })
                }
              />
            </Field>
            <Field label="일지 설명">
              <textarea
                className="journal-description-input"
                required
                maxLength={20000}
                rows={3}
                value={editor.draft.body}
                onChange={(event) =>
                  update({ ...editor, draft: { ...editor.draft, body: event.target.value } })
                }
                placeholder="이 일지에서 다루는 작업이나 주제를 간단히 소개해 주세요."
              />
            </Field>
          </div>
        </fieldset>
        {!lockedProject && (
          <JournalProjectState
            state={projects}
            query={options.activeList}
            more={options.moreActive}
          />
        )}
        {lockedProject?.archived && (
          <p role="alert">보관된 프로젝트에는 일지를 작성할 수 없습니다.</p>
        )}
        {editor.baseline && (
          <SelectedProject options={options} id={editor.baseline.projectId} onReady={setSelected} />
        )}
        {notice && (
          <p className="notice" role="alert">
            {notice}
          </p>
        )}
        {editor.intent && (
          <p role="status">
            생성 재시도는 같은 요청과 키를 사용합니다. 응답이 없어도 서버에 저장되었을 수 있습니다.
          </p>
        )}
        {conflict && (
          <div className="notice">
            <Button type="button" disabled={busy} onClick={() => void reload()}>
              최신 상태 다시 확인
            </Button>
            {latest && (
              <>
                <p>
                  최신 제목: {latest.title} · revision {latest.revision}
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    const changes = patchBody(editor.baseline!, editor.draft);
                    const draft = journalDraft(latest);
                    for (const key of ['title', 'projectId', 'body', 'entryDate'] as const)
                      if (key in changes) draft[key] = editor.draft[key];
                    update({ ...editor, baseline: latest, draft });
                    setConflict(false);
                    setLatest(undefined);
                    setNotice('입력 내용을 다시 적용했습니다. 검토 후 저장해 주세요.');
                  }}
                >
                  내 변경 다시 적용
                </Button>
              </>
            )}
          </div>
        )}
        <div className="modal-actions">
          <Button
            type="button"
            onClick={close}
            aria-label={editor.intent ? 'Abandon creation' : 'Cancel edit'}
          >
            취소
          </Button>
          <Button
            variant="primary"
            type="submit"
            aria-label={editor.intent ? 'Retry creation' : 'Save Journal'}
            disabled={busy || conflict || lockedProject?.archived}
          >
            {busy ? '저장 중…' : '일지 저장'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function JournalProjectState({
  state,
  query,
  more,
}: {
  state: ReturnType<JournalProjectOptions['activeList']['getSnapshot']>;
  query: JournalProjectOptions['activeList'];
  more: () => Promise<void>;
}) {
  return (
    <>
      {state.status === 'loading' && !state.data && (
        <p role="status">활성 프로젝트를 불러오는 중…</p>
      )}
      {state.status === 'error' && (
        <p className="notice" role="alert">
          프로젝트를 불러오지 못했습니다.{' '}
          <Button type="button" onClick={() => query.invalidate(true)}>
            다시 시도
          </Button>
        </p>
      )}
      {state.data?.nextCursor && (
        <Button type="button" disabled={state.status === 'loading'} onClick={() => void more()}>
          활성 프로젝트 더 불러오기
        </Button>
      )}
    </>
  );
}
