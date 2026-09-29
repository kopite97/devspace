import { afterEach, describe, expect, it, vi } from 'vitest';
import { Lifecycle, HttpError } from '../../shared/http/client';
import { DocumentController, type DocumentMemory } from './controller';
import { DocumentStore } from './store';
import { QueryManager } from '../../shared/http/queryManager';
import { AttachmentRegistry } from './attachmentRegistry';
import { parseDocument, validateInput, type Attachment, type DocumentSnapshot } from './model';

const id = '00000000-0000-0000-0000-000000000001';
const fileId = '00000000-0000-0000-0000-000000000002';
const snapshot: DocumentSnapshot = {
  id,
  documentSpaceId: id,
  title: '',
  content: [],
  attachmentIds: [],
  attachments: [],
  status: 'DRAFT',
  authorId: id,
  createdAt: '2026-09-23T00:00:00Z',
  updatedAt: '2026-09-23T00:00:00Z',
  publishedAt: null,
};
const attachment: Attachment = {
  id: fileId,
  documentId: id,
  originalFilename: 'x.png',
  contentType: 'image/png',
  size: 12,
  status: 'TEMP',
  contentUrl: `/api/v2/attachments/${fileId}/content`,
  createdAt: snapshot.createdAt,
};
const block = { type: 'image', props: { url: attachment.contentUrl } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const cleanups: (() => void)[] = [];
function setup() {
  const lifecycle = new Lifecycle();
  const manager = new QueryManager();
  const store = new DocumentStore(
    { lifecycle, generation: 0, request: vi.fn(), recoverSecurity: async () => {} },
    manager,
  );
  const memory: DocumentMemory = { returns: {} };
  const controller = new DocumentController(store, snapshot, memory);
  controller.activate();
  cleanups.push(() => {
    controller.dispose();
    manager.dispose();
  });
  return { store, controller, memory, lifecycle };
}
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  vi.useRealTimers();
});
describe('document save coordination', () => {
  it('requires reconciliation when reopening an editor whose earlier PUT was interrupted', async () => {
    const { store, controller, memory } = setup();
    const pending = deferred<DocumentSnapshot>();
    const save = vi.spyOn(store, 'save').mockReturnValue(pending.promise);
    controller.edit('pending', []);
    const work = controller.flush();
    controller.dispose();
    memory.draft = undefined;
    const reopened = new DocumentController(store, snapshot, memory);
    expect(reopened.getSnapshot()).toMatchObject({ status: 'error', uncertain: true });
    await expect(reopened.retry()).rejects.toThrow('서버 상태');
    expect(save).toHaveBeenCalledOnce();
    const viewer = new DocumentController(store, snapshot, { returns: {} }, false);
    expect(viewer.getSnapshot()).toMatchObject({ status: 'saved', dirty: false });
    vi.spyOn(store, 'read').mockResolvedValue({ ...snapshot, title: 'pending' });
    await reopened.reconcile();
    expect(store.requiresReconciliation(snapshot.id)).toBe(false);
    pending.resolve({ ...snapshot, title: 'pending' });
    await expect(work).rejects.toThrow('cancelled');
    reopened.dispose();
    viewer.dispose();
  });
  it.each([400, 403, 404, 409, 413, 503])(
    'preserves input and attachment metadata on HTTP %s and blocks publication',
    async (status) => {
      const { store, controller, memory } = setup();
      controller.registry.add(attachment);
      controller.edit('keep', [block]);
      vi.spyOn(store, 'save').mockRejectedValue(new HttpError(status, 'ERROR', ''));
      const publish = vi.spyOn(store, 'publish');
      await expect(controller.publish()).rejects.toBeInstanceOf(HttpError);
      expect(publish).not.toHaveBeenCalled();
      expect(controller.getSnapshot()).toMatchObject({
        title: 'keep',
        content: [block],
        status: 'error',
        locked: false,
      });
      expect(memory.draft?.attachments).toEqual([attachment]);
    },
  );
  it('retains the draft after failed deletion and waits for an active save before deleting', async () => {
    const { store, controller, memory } = setup();
    const saved = deferred<DocumentSnapshot>();
    vi.spyOn(store, 'save').mockReturnValue(saved.promise);
    const remove = vi
      .spyOn(store, 'delete')
      .mockRejectedValue(new HttpError(503, 'STORAGE_UNAVAILABLE', ''));
    controller.edit('keep', []);
    const saving = controller.flush();
    const deleting = controller.delete();
    expect(remove).not.toHaveBeenCalled();
    saved.resolve({ ...snapshot, title: 'keep' });
    await saving;
    await expect(deleting).rejects.toBeInstanceOf(HttpError);
    expect(controller.getSnapshot().title).toBe('keep');
    expect(memory.draft?.title).toBe('keep');
  });
  it('serializes PUTs and retains the newest input while A is pending', async () => {
    const { store, controller } = setup();
    const a = deferred<DocumentSnapshot>();
    const save = vi
      .spyOn(store, 'save')
      .mockReturnValueOnce(a.promise)
      .mockImplementation(async (_, input) => ({ ...snapshot, ...input }));
    controller.edit('A', []);
    const work = controller.flush();
    controller.edit('B', []);
    controller.edit('C', []);
    expect(save).toHaveBeenCalledTimes(1);
    a.resolve({ ...snapshot, title: 'A' });
    await work;
    expect(save.mock.calls.map((call) => call[1].title)).toEqual(['A', 'C']);
    expect(controller.getSnapshot()).toMatchObject({ title: 'C', status: 'saved', dirty: false });
  });
  it('debounces title/content and stops automatic work after failure', async () => {
    vi.useFakeTimers();
    const { store, controller } = setup();
    const save = vi
      .spyOn(store, 'save')
      .mockRejectedValue(new HttpError(413, 'PAYLOAD_TOO_LARGE', ''));
    controller.edit('A', []);
    await vi.advanceTimersByTimeAsync(1000);
    controller.edit('B', []);
    await vi.advanceTimersByTimeAsync(1499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    controller.edit('C', []);
    await vi.advanceTimersByTimeAsync(10000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().title).toBe('C');
    save.mockResolvedValue({ ...snapshot, title: 'C' });
    await controller.retry();
    expect(controller.getSnapshot().dirty).toBe(false);
  });
  it('preserves upload B across save A response and keeps detached metadata for Undo', async () => {
    const { store, controller } = setup();
    const a = deferred<DocumentSnapshot>();
    const save = vi
      .spyOn(store, 'save')
      .mockReturnValueOnce(a.promise)
      .mockImplementation(async (_, input) => ({
        ...snapshot,
        ...input,
        attachments: [{ ...attachment, status: 'ATTACHED' }],
      }));
    vi.spyOn(store, 'upload').mockResolvedValue(attachment);
    controller.edit('A', []);
    const work = controller.flush();
    await controller.upload(new File(['image'], 'x.png', { type: 'image/png' }));
    controller.edit('B', [block]);
    a.resolve({ ...snapshot, title: 'A' });
    await work;
    expect(save.mock.calls[1][1].attachmentIds).toEqual([fileId]);
    expect(controller.registry.values()[0].status).toBe('ATTACHED');
    save.mockImplementation(async (_, input) => ({ ...snapshot, ...input, attachments: [] }));
    controller.edit('B', []);
    await controller.flush();
    expect(controller.registry.values()[0].status).toBe('TEMP');
    expect(controller.registry.references([block])).toEqual([fileId]);
  });
  it('never publishes after failed final PUT and reconciles uncertain saves explicitly', async () => {
    const { store, controller } = setup();
    const save = vi.spyOn(store, 'save').mockRejectedValue(new HttpError(0, 'TIMEOUT', ''));
    const publish = vi.spyOn(store, 'publish');
    controller.edit('local', []);
    await expect(controller.publish()).rejects.toBeInstanceOf(HttpError);
    expect(publish).not.toHaveBeenCalled();
    await expect(controller.retry()).rejects.toThrow('서버 상태');
    expect(save).toHaveBeenCalledTimes(1);
    vi.spyOn(store, 'read').mockResolvedValue({ ...snapshot, title: 'server' });
    await controller.reconcile();
    expect(controller.getSnapshot().title).toBe('local');
    save.mockResolvedValue({ ...snapshot, title: 'local' });
    await controller.retry();
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('does not adopt late responses after session retirement', async () => {
    const { store, controller, lifecycle, memory } = setup();
    const a = deferred<DocumentSnapshot>();
    vi.spyOn(store, 'save').mockReturnValue(a.promise);
    controller.edit('local', []);
    const work = controller.flush();
    lifecycle.reset();
    a.resolve({ ...snapshot, title: 'old' });
    await expect(work).rejects.toThrow('cancelled');
    expect(memory.draft?.title).toBe('local');
    expect(controller.getSnapshot().title).toBe('local');
  });
});
describe('attachment and JSON boundary', () => {
  it('validates all 100 metadata rows, UUID order and ownership without truncation', () => {
    const attachments = Array.from({ length: 100 }, (_, index) => {
      const attachmentId = `00000000-0000-0000-0000-${String(index + 2).padStart(12, '0')}`;
      return {
        ...attachment,
        id: attachmentId,
        contentUrl: `/api/v2/attachments/${attachmentId}/content`,
        status: 'ATTACHED' as const,
      };
    });
    const value = { ...snapshot, attachmentIds: attachments.map((item) => item.id), attachments };
    expect(parseDocument(value).attachments).toHaveLength(100);
    expect(() => parseDocument({ ...value, attachments: [...attachments].reverse() })).toThrow();
    expect(() =>
      parseDocument({
        ...value,
        attachments: attachments.map((item) => ({ ...item, documentId: fileId })),
      }),
    ).toThrow();
    expect(() =>
      parseDocument({
        ...value,
        attachmentIds: [...value.attachmentIds, id],
        attachments: [...attachments, { ...attachment, id }],
      }),
    ).toThrow();
  });
  it('rejects inconsistent metadata instead of adopting an empty registry', () => {
    expect(() => parseDocument({ ...snapshot, attachments: undefined })).toThrow();
    expect(() => parseDocument({ ...snapshot, attachmentIds: [fileId] })).toThrow();
    expect(() =>
      parseDocument({ ...snapshot, attachmentIds: [fileId], attachments: [attachment] }),
    ).toThrow();
    expect(
      parseDocument({
        ...snapshot,
        attachmentIds: [fileId],
        attachments: [{ ...attachment, status: 'ATTACHED' }],
      }).attachments,
    ).toHaveLength(1);
  });
  it('traverses nested and duplicate references, rejects missing or deleted service files', () => {
    const registry = new AttachmentRegistry(id, [attachment]);
    expect(registry.references([{ type: 'paragraph', children: [block, block] }])).toEqual([
      fileId,
    ]);
    expect(
      registry.references([{ type: 'image', props: { url: 'https://example.org/image.png' } }]),
    ).toEqual([]);
    expect(
      registry.references([
        {
          type: 'file',
          props: { url: `https://example.org/api/v2/attachments/${fileId}/content` },
        },
      ]),
    ).toEqual([]);
    registry.remove(fileId);
    expect(() => registry.references([block])).toThrow();
    expect(() => registry.add(attachment)).toThrow();
  });
  it('counts UTF-8 content bytes instead of string length', () => {
    expect(() =>
      validateInput({ title: '', content: ['가'.repeat(350000)], attachmentIds: [] }),
    ).toThrow('1MiB');
  });
});
