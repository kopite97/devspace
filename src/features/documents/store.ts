import type { PrivateTransport } from '../../shared/http/transport';
import { QueryManager, type ManagedQuery } from '../../shared/http/queryManager';
import { uuid } from '../../shared/http/validation';
import {
  parseAttachment,
  parseDeleted,
  parseDocument,
  type DocumentInput,
  type DocumentSnapshot,
} from './model';

export const documentQueryPolicy = { freshForMs: 0, gcAfterMs: 60000, revalidateOnFocus: false };
export class DocumentStore {
  private uncertainWrites = new Set<string>();
  requiresReconciliation(id: string) {
    return this.uncertainWrites.has(id);
  }
  markUncertain(id: string) {
    this.uncertainWrites.add(id);
  }
  reconciled(id: string) {
    this.uncertainWrites.delete(id);
  }
  private details = new Map<string, ManagedQuery<DocumentSnapshot>>();
  onChanged = () => {};
  constructor(
    readonly transport: PrivateTransport,
    private manager: QueryManager,
  ) {}
  detail(id: string) {
    uuid(id);
    const query = this.manager.get({
      key: `document:${id}`,
      contract: 'document-detail-v2-attachments',
      policy: documentQueryPolicy,
      fetcher: (signal) => this.read(id, signal),
    });
    this.details.set(id, query);
    return query;
  }
  read(id: string, signal?: AbortSignal) {
    return this.transport.request(`/api/v2/documents/${uuid(id)}`, {
      signal,
      generation: this.transport.generation,
      expectedStatus: 200,
      parse: (value) => {
        const document = parseDocument(value);
        if (document.id !== id) throw new Error('Unexpected document');
        return document;
      },
    });
  }
  async save(id: string, input: DocumentInput, signal: AbortSignal) {
    const result = await this.transport.request(`/api/v2/documents/${uuid(id)}`, {
      method: 'PUT',
      json: input,
      signal,
      generation: this.transport.generation,
      expectedStatus: 200,
      parse: parseDocument,
    });
    if (result.id !== id) throw new Error('Unexpected document');
    this.changed(id);
    return result;
  }
  async publish(id: string, signal: AbortSignal) {
    const result = await this.transport.request(`/api/v2/documents/${uuid(id)}/publish`, {
      method: 'POST',
      signal,
      generation: this.transport.generation,
      expectedStatus: 200,
      parse: parseDocument,
    });
    if (result.id !== id || result.status !== 'PUBLISHED')
      throw new Error('Unexpected publication');
    this.changed(id);
    return result;
  }
  async delete(id: string, signal: AbortSignal) {
    await this.transport.request(`/api/v2/documents/${uuid(id)}`, {
      method: 'DELETE',
      signal,
      generation: this.transport.generation,
      expectedStatus: 200,
      parse: parseDeleted(id),
    });
    this.changed(id);
  }
  async upload(id: string, file: File, signal: AbortSignal) {
    const form = new FormData();
    form.append('documentId', uuid(id));
    form.append('file', file);
    return this.transport.request('/api/v2/attachments', {
      method: 'POST',
      form,
      signal,
      timeoutMs: 60000,
      generation: this.transport.generation,
      expectedStatus: 201,
      parse: (value) => {
        const attachment = parseAttachment(value);
        if (attachment.documentId !== id || attachment.status !== 'TEMP')
          throw new Error('Unexpected upload');
        return attachment;
      },
    });
  }
  async deleteTemporary(id: string, signal: AbortSignal) {
    await this.transport.request(`/api/v2/attachments/${uuid(id)}`, {
      method: 'DELETE',
      signal,
      generation: this.transport.generation,
      expectedStatus: 200,
      parse: parseDeleted(id),
    });
  }
  download(id: string) {
    return this.transport.request<Blob>(`/api/v2/attachments/${uuid(id)}/content`, {
      generation: this.transport.generation,
      response: 'blob',
      expectedStatus: 200,
      timeoutMs: 60000,
    });
  }
  private changed(id: string) {
    this.details.get(id)?.invalidate();
    this.onChanged();
  }
}
