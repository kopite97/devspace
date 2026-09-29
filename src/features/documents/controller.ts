import { CancelledError, HttpError } from '../../shared/http/client';
import { registerDirtyForm } from '../../shared/lib/navigationGuard';
import { AttachmentRegistry } from './attachmentRegistry';
import { validateInput, type Attachment, type DocumentInput, type DocumentSnapshot } from './model';
import type { DocumentStore } from './store';

export type DocumentDraft = {
  id: string;
  title: string;
  content: unknown[];
  attachments: Attachment[];
};
export type DocumentMemory = { draft?: DocumentDraft; returns: Record<string, string> };
type UploadState = { key: number; file: File; status: 'uploading' | 'failed'; error?: string };
type EditorState = {
  title: string;
  content: unknown[];
  status: 'saved' | 'pending' | 'saving' | 'error';
  error?: string;
  uncertain: boolean;
  locked: boolean;
  uploads: UploadState[];
  snapshot: DocumentSnapshot;
  dirty: boolean;
};
export function documentError(error: unknown) {
  if (error instanceof HttpError) {
    const messages: Record<number, string> = {
      0: '응답을 확인하지 못했습니다. 서버 상태를 확인한 뒤 다시 시도해 주세요.',
      400: '입력 내용을 확인해 주세요.',
      401: '다시 로그인한 뒤 내용을 확인해 주세요.',
      403: '권한 또는 보안 정보를 확인해 주세요.',
      404: '문서나 첨부가 없거나 접근할 수 없습니다.',
      409: '첨부가 사용 중이거나 삭제 중입니다. 최신 상태를 확인해 주세요.',
      413: '허용 용량을 초과했습니다. 본문 또는 파일 크기를 줄여 주세요.',
      503: '파일 저장소를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    };
    return (
      (messages[error.status] ?? '요청을 완료하지 못했습니다.') +
      (Object.values(error.fieldErrors).length
        ? ' ' + Object.values(error.fieldErrors).join(' ')
        : '') +
      (error.requestId ? ` (요청 ID: ${error.requestId})` : '')
    );
  }
  return error instanceof Error ? error.message : '요청을 완료하지 못했습니다.';
}
export class DocumentController {
  readonly registry: AttachmentRegistry;
  private state: EditorState;
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private work?: Promise<void>;
  private uploadWork = new Set<Promise<string>>();
  private lifetime = new AbortController();
  private unregister?: () => void;
  private revision = 0;
  private savedRevision = 0;
  private uploadKey = 0;
  private disposed = false;
  private activated = false;
  private retire = () => this.dispose();
  constructor(
    readonly store: DocumentStore,
    snapshot: DocumentSnapshot,
    private memory: DocumentMemory,
    restoreDraft = true,
  ) {
    const draft = restoreDraft && memory.draft?.id === snapshot.id ? memory.draft : undefined;
    const recovering = restoreDraft && (!!draft || store.requiresReconciliation(snapshot.id));
    this.registry = new AttachmentRegistry(snapshot.id, snapshot.attachments);
    for (const item of draft?.attachments ?? []) this.registry.add(item);
    this.state = {
      title: draft?.title ?? snapshot.title,
      content: draft?.content ?? snapshot.content,
      snapshot,
      status: recovering ? 'error' : 'saved',
      uncertain: recovering,
      locked: false,
      uploads: [],
      dirty: recovering,
      error: recovering
        ? '이전 요청의 결과를 확인해야 합니다. 현재 입력을 검토하고 서버 상태 확인 후 다시 저장해 주세요.'
        : undefined,
    };
    if (draft) this.revision++;
  }
  getSnapshot = () => this.state;
  activate() {
    if (!this.activated) {
      this.activated = true;
      this.store.transport.lifecycle.signal.addEventListener('abort', this.retire, { once: true });
    }
    if (this.state.dirty) this.unregister ??= registerDirtyForm();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(patch: Partial<EditorState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    const dirty =
      this.revision !== this.savedRevision || this.state.uploads.length > 0 || this.state.uncertain;
    this.state = { ...this.state, dirty };
    if (dirty) {
      this.unregister ??= registerDirtyForm();
      this.memory.draft = {
        id: this.state.snapshot.id,
        title: this.state.title,
        content: this.state.content,
        attachments: this.registry.values(),
      };
    } else {
      this.unregister?.();
      this.unregister = undefined;
      this.memory.draft = undefined;
    }
    this.listeners.forEach((listener) => listener());
  }
  edit(title: string, content: unknown[]) {
    if (this.disposed || this.state.locked) return;
    this.revision++;
    this.emit({ title, content, status: this.state.status === 'error' ? 'error' : 'pending' });
    clearTimeout(this.timer);
    if (this.state.status !== 'error')
      this.timer = setTimeout(() => void this.drain().catch(() => {}), 1500);
  }
  private input(): DocumentInput {
    const input = {
      title: this.state.title,
      content: structuredClone(this.state.content),
      attachmentIds: this.registry.references(this.state.content),
    };
    validateInput(input);
    return input;
  }
  private fail(error: unknown) {
    if (error instanceof CancelledError || this.disposed) return;
    this.emit({
      status: 'error',
      error: documentError(error),
      uncertain:
        error instanceof HttpError &&
        (error.status === 0 || error.status >= 500 || error.code === 'PROTOCOL_ERROR'),
    });
  }
  private drain(): Promise<void> {
    if (this.work) return this.work;
    if (this.disposed || this.state.status === 'error')
      return Promise.reject(new Error(this.state.error ?? '저장이 중단되었습니다.'));
    const work = (async () => {
      while (this.savedRevision !== this.revision && !this.disposed) {
        const revision = this.revision;
        const input = this.input();
        this.emit({ status: 'saving', error: undefined });
        const snapshot = await this.store.save(this.state.snapshot.id, input, this.lifetime.signal);
        if (this.disposed) throw new CancelledError();
        this.registry.merge(snapshot.attachments, input.attachmentIds);
        this.savedRevision = revision;
        this.emit({
          snapshot,
          status: revision === this.revision ? 'saved' : 'pending',
          uncertain: false,
        });
      }
    })();
    this.work = work
      .catch((error: unknown) => {
        this.fail(error);
        throw error;
      })
      .finally(() => {
        this.work = undefined;
      });
    return this.work;
  }
  async retry() {
    if (this.state.locked || this.work || this.disposed) return;
    if (this.state.uncertain) throw new Error('먼저 서버 상태를 확인해 주세요.');
    this.revision++;
    this.emit({ status: 'pending', error: undefined });
    await this.drain();
  }
  async reconcile() {
    if (this.state.locked || this.work || this.disposed) return;
    this.emit({ locked: true });
    try {
      const snapshot = await this.store.read(this.state.snapshot.id, this.lifetime.signal);
      this.store.reconciled(snapshot.id);
      this.registry.merge(snapshot.attachments, snapshot.attachmentIds);
      this.emit({
        snapshot,
        uncertain: false,
        error: '서버 상태를 확인했습니다. 현재 입력은 유지됩니다. 다시 저장을 눌러 적용하세요.',
      });
    } catch (error) {
      this.fail(error);
    } finally {
      this.emit({ locked: false });
    }
  }
  async flush() {
    clearTimeout(this.timer);
    await this.drain();
    if (
      this.state.status === 'error' ||
      this.state.uploads.some((item) => item.status === 'failed')
    )
      throw new Error('실패한 저장 또는 업로드를 먼저 해결해 주세요.');
  }
  async publish() {
    if (this.state.locked) return;
    if (this.state.uploads.length) throw new Error('첨부 업로드를 마친 후 게시해 주세요.');
    this.emit({ locked: true });
    try {
      await Promise.all(this.uploadWork);
      await this.flush();
      // Even an unchanged document must have a confirmed final PUT before publication.
      const input = this.input();
      const saved = await this.store.save(this.state.snapshot.id, input, this.lifetime.signal);
      this.registry.merge(saved.attachments, input.attachmentIds);
      const snapshot = await this.store.publish(saved.id, this.lifetime.signal);
      this.emit({ snapshot, status: 'saved', error: undefined });
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.emit({ locked: false });
    }
  }
  async delete() {
    if (this.state.locked) throw new Error('진행 중인 작업이 있습니다.');
    this.emit({ locked: true });
    clearTimeout(this.timer);
    try {
      await Promise.allSettled([...this.uploadWork, ...(this.work ? [this.work] : [])]);
      await this.store.delete(this.state.snapshot.id, this.lifetime.signal);
      this.savedRevision = this.revision;
      this.emit({ uploads: [], uncertain: false, status: 'saved' });
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.emit({ locked: false });
    }
  }
  upload(file: File): Promise<string> {
    if (this.state.locked || this.disposed)
      return Promise.reject(new Error('현재 첨부할 수 없습니다.'));
    if (
      !file.size ||
      file.size > 10485760 ||
      !['image/png', 'image/jpeg', 'application/pdf', 'text/plain'].includes(file.type)
    )
      return Promise.reject(
        new Error('PNG·JPEG·PDF·UTF-8 TXT, 0바이트 초과 10MiB 이하 파일을 선택해 주세요.'),
      );
    const key = ++this.uploadKey;
    this.emit({ uploads: [...this.state.uploads, { key, file, status: 'uploading' }] });
    const work = this.store
      .upload(this.state.snapshot.id, file, this.lifetime.signal)
      .then((item) => {
        if (this.disposed) throw new CancelledError();
        this.registry.add(item);
        this.emit({ uploads: this.state.uploads.filter((upload) => upload.key !== key) });
        return item.contentUrl;
      })
      .catch((error: unknown) => {
        this.emit({
          uploads: this.state.uploads.map((upload) =>
            upload.key === key
              ? {
                  ...upload,
                  status: 'failed',
                  error:
                    documentError(error) +
                    (error instanceof HttpError && (error.status === 0 || error.status >= 500)
                      ? ' 서버에 임시 파일이 생성되었을 수 있으며 다시 업로드하면 중복될 수 있습니다.'
                      : ''),
                }
              : upload,
          ),
        });
        throw error;
      })
      .finally(() => this.uploadWork.delete(work));
    this.uploadWork.add(work);
    return work;
  }
  dismissUpload(key: number) {
    this.emit({
      uploads: this.state.uploads.filter((item) => item.key !== key || item.status === 'uploading'),
    });
  }
  async deleteTemporary(id: string) {
    if (this.state.locked || this.work || this.registry.references(this.state.content).includes(id))
      throw new Error('사용 중인 첨부는 삭제할 수 없습니다.');
    const item = this.registry.values().find((entry) => entry.id === id);
    if (!item || item.status !== 'TEMP') throw new Error('임시 첨부만 삭제할 수 있습니다.');
    this.emit({ locked: true });
    try {
      await this.store.deleteTemporary(id, this.lifetime.signal);
      this.registry.remove(id);
      this.emit({});
    } finally {
      this.emit({ locked: false });
    }
  }
  dispose() {
    if (this.work || this.state.locked) this.store.markUncertain(this.state.snapshot.id);
    this.store.transport.lifecycle.signal.removeEventListener('abort', this.retire);
    this.disposed = true;
    clearTimeout(this.timer);
    this.lifetime.abort();
    this.unregister?.();
    this.unregister = undefined;
  }
}
