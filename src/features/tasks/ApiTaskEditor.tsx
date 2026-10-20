import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Modal } from '../../shared/ui/controls';
import { useQuery } from '../../shared/http/query';
import { CancelledError, HttpError } from '../../shared/http/client';
import { useUnsavedChanges } from '../../shared/hooks/useUnsavedChanges';
import { TaskFields } from './TaskFields';
import { TaskReadState } from './TaskReads';
import { taskDraft, patchBody, validateDraft, type ApiTask } from './apiModel';
import { createIntent, retryBody } from './createIntent';
import type { TaskStore } from './apiStore';
import type { TaskMemory, TaskEditorMemory } from './draftMemory';
import type { TaskProjectOptions } from './projectOptions';
import type { TaskProjectOption } from './presentation';
import { TaskSourceInfo } from './TaskSourceInfo';
import { SafeMarkdown } from '../../shared/ui/SafeMarkdown';

function SelectedProject({
  options,
  id,
  onReady,
}: {
  options: TaskProjectOptions;
  id: string;
  onReady: (option: TaskProjectOption) => void;
}) {
  const state = useQuery(options.detail(id));
  useEffect(() => {
    if (state.status === 'ready' && state.data) onReady(state.data);
  }, [state, onReady]);
  return <TaskReadState state={state} query={options.detail(id)} />;
}
export function ApiTaskEditor({
  store,
  options,
  memory,
  onClose,
  onSaved,
}: {
  store: TaskStore;
  options: TaskProjectOptions;
  memory: TaskMemory;
  onClose: () => void;
  onSaved: (message?: string) => void;
}) {
  const [editor, setEditor] = useState<TaskEditorMemory>(() => memory.editor!);
  useSyncExternalStore(store.subscribeProtection, store.protectionSnapshot);
  const hidden = !!editor.baseline && store.isProtected(editor.baseline.id);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(editor.notice ?? '');
  const [conflict, setConflict] = useState(false),
    [latest, setLatest] = useState<ApiTask>();
  const [selected, setSelected] = useState<TaskProjectOption>();
  const pending = useRef(false),
    alive = useRef(true);
  const current = () =>
    alive.current && store.transport.generation === store.transport.lifecycle.generation;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const initial = taskDraft(editor.baseline);
  const canDiscard = useUnsavedChanges(
    busy || !!editor.intent || JSON.stringify(editor.draft) !== JSON.stringify(initial),
  );
  const close = () => {
    if (canDiscard()) {
      memory.editor = undefined;
      onClose();
    }
  };
  const update = (next: TaskEditorMemory) => {
    memory.editor = next;
    setEditor(next);
  };
  const projects = useQuery(options.list);
  const values = new Map((projects.data?.items ?? []).map((p) => [p.id, p]));
  if (selected && selected.id === editor.baseline?.projectId) values.set(selected.id, selected);
  const reload = async () => {
    if (!editor.baseline) return;
    const query = store.detail(editor.baseline.id);
    query.invalidate();
    await query.load();
    if (!current()) return;
    const state = query.getSnapshot();
    setLatest(state.status === 'ready' ? state.data : undefined);
    if (state.status !== 'ready')
      setNotice('최신 태스크를 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 확인해 주세요.');
  };
  const run = async (deleting = false) => {
    if (pending.current || conflict || hidden) return;
    const errors = validateDraft(editor.draft);
    if (!deleting && Object.keys(errors).length) {
      setNotice(Object.values(errors).join(' '));
      return;
    }
    pending.current = true;
    setBusy(true);
    setNotice('');
    try {
      let result;
      if (deleting && editor.baseline)
        result = await store.mutate('delete', {
          id: editor.baseline.id,
          revision: editor.baseline.revision,
        });
      else if (editor.baseline) {
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
          endpoint: intent.endpoint ?? '/api/v1/tasks',
        });
      }
      if (!current()) return;
      memory.editor = undefined;
      onSaved(
        !result.reconciled
          ? '저장은 확인되었습니다. 최신 태스크 조회에 실패했습니다. 목록을 새로고침해 주세요.'
          : result.task?.deletedAt && !deleting
            ? '생성 요청은 확인되었지만 이 태스크는 현재 휴지통에 있습니다.'
            : undefined,
      );
    } catch (error) {
      if (!current() || error instanceof CancelledError) return;
      if (error instanceof HttpError && error.code === 'CSRF_INVALID') {
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
        return;
      }
      const code = error instanceof HttpError ? error.code : '';
      setNotice(
        code === 'PROJECT_ARCHIVED'
          ? '대상 프로젝트가 보관되었습니다. 활성 프로젝트를 선택해 주세요.'
          : code === 'RESOURCE_DELETED'
            ? '이 태스크는 휴지통으로 이동했습니다. 최신 상태를 확인해 주세요.'
            : code === 'INVALID_RESOURCE_STATE'
              ? '태스크 상태가 이미 변경되었습니다. 최신 상태를 확인해 주세요.'
              : code === 'REVISION_CONFLICT'
                ? '다른 곳에서 변경되었습니다. 최신 상태를 확인하고 입력 내용을 다시 적용해 주세요.'
                : error instanceof Error
                  ? error.message
                  : '요청에 실패했습니다. 입력 내용은 유지됩니다.',
      );
      if (
        editor.baseline &&
        (code === 'REVISION_CONFLICT' ||
          code === 'RESOURCE_DELETED' ||
          code === 'INVALID_RESOURCE_STATE' ||
          (error instanceof HttpError &&
            (error.status === 0 || error.status >= 500 || code === 'PROTOCOL_ERROR')))
      ) {
        setConflict(true);
        await reload();
      }
      if (code === 'PROJECT_ARCHIVED') options.list.invalidate(true);
    } finally {
      pending.current = false;
      if (current()) setBusy(false);
    }
  };
  if (hidden)
    return (
      <Modal
        title="접근 상태 확인 필요"
        onClose={() => {
          memory.editor = undefined;
          onClose();
        }}
      >
        <p>
          GitHub 원문에 대한 접근을 확인하지 못해 편집 내용을 숨겼습니다. 목록을 새로고침해 주세요.
        </p>
      </Modal>
    );
  return (
    <Modal title={editor.baseline ? '태스크 편집' : '태스크 추가'} onClose={close} wide>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <fieldset disabled={busy || !!editor.intent} className="task-fieldset">
          <TaskSourceInfo source={editor.baseline?.source} />
          {editor.baseline?.source && (
            <details>
              <summary>GitHub 본문 읽기</summary>
              <SafeMarkdown text={editor.baseline.description} />
            </details>
          )}
          <TaskFields
            sourceManaged={!!editor.baseline?.source}
            form={editor.draft}
            projects={[...values.values()]}
            change={(key, value) => update({ ...editor, draft: { ...editor.draft, [key]: value } })}
          />
        </fieldset>
        <TaskReadState state={projects} query={options.list} />
        {projects.data?.nextCursor && (
          <Button
            type="button"
            disabled={projects.status === 'loading'}
            onClick={() => void options.more()}
          >
            프로젝트 더 불러오기
          </Button>
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
            생성 재시도는 같은 요청과 키를 사용합니다. 응답이 없더라도 서버에 저장되었을 수
            있습니다.
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
                  {latest.deletedAt ? ' · 휴지통' : ''}
                </p>
                {!latest.deletedAt && (
                  <Button
                    type="button"
                    onClick={() => {
                      const changes = patchBody(editor.baseline!, editor.draft);
                      const draft = taskDraft(latest);
                      for (const key of [
                        'title',
                        'projectId',
                        'description',
                        'status',
                        'priority',
                        'tag',
                      ] as const)
                        if (key in changes) Object.assign(draft, { [key]: editor.draft[key] });
                      update({ ...editor, baseline: latest, draft });
                      setConflict(false);
                      setLatest(undefined);
                      setNotice('입력 내용을 다시 적용했습니다. 검토 후 저장해 주세요.');
                    }}
                  >
                    내 변경 다시 적용
                  </Button>
                )}
              </>
            )}
          </div>
        )}
        <div className="modal-actions">
          {editor.baseline?.source && (
            <Button
              type="button"
              disabled={busy || conflict}
              onClick={() => {
                if (
                  !window.confirm(
                    '마지막 정상 내용을 일반 Task로 보존할까요? 이후 자동 재가져오기에서 제외됩니다.',
                  )
                )
                  return;
                setBusy(true);
                void store
                  .convert(editor.baseline!.id, editor.baseline!.revision)
                  .then(() => {
                    memory.editor = undefined;
                    onSaved('일반 Task로 전환했습니다.');
                  })
                  .catch((error) =>
                    setNotice(error instanceof Error ? error.message : '전환하지 못했습니다.'),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              일반 Task로 전환
            </Button>
          )}
          {editor.baseline && (
            <Button
              type="button"
              variant="danger"
              disabled={busy || conflict}
              onClick={() => {
                if (window.confirm('태스크를 삭제할까요? 휴지통에서 복구할 수 있습니다.'))
                  void run(true);
              }}
            >
              태스크 삭제
            </Button>
          )}
          <Button type="button" onClick={close}>
            취소
          </Button>
          <Button variant="primary" type="submit" disabled={busy || conflict}>
            {busy ? '저장 중…' : '태스크 저장'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
