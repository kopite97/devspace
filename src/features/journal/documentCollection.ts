import { QueryManager, type ManagedQuery } from '../../shared/http/queryManager';
import type { PrivateTransport } from '../../shared/http/transport';
import { count, object, oneOf, string, timestamp, uuid } from '../../shared/http/validation';
import { parseJournal, type ApiJournal } from './apiModel';

type DocumentSummary = {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED';
  authorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};
type DocumentPage = {
  items: DocumentSummary[];
  total: number;
  nextCursor: string | null;
  cursors: string[];
};
const policy = { freshForMs: 0, gcAfterMs: 60000, revalidateOnFocus: false };
function parsePage(value: unknown): DocumentPage {
  const row = object(value);
  if (!Array.isArray(row.items)) throw new Error('Invalid document collection');
  const items = row.items.map((value): DocumentSummary => {
    const item = object(value);
    return {
      id: uuid(item.id),
      title: string(item.title),
      status: oneOf(item.status, ['DRAFT', 'PUBLISHED']),
      authorId: uuid(item.authorId),
      createdAt: timestamp(item.createdAt),
      updatedAt: timestamp(item.updatedAt),
      publishedAt: item.publishedAt === null ? null : timestamp(item.publishedAt),
    };
  });
  const nextCursor = row.nextCursor === null ? null : string(row.nextCursor);
  if (nextCursor === '') throw new Error('Empty cursor');
  return { items, total: count(row.total), nextCursor, cursors: [] };
}
export class JournalDocuments {
  private lists = new Map<string, ManagedQuery<DocumentPage>>();
  private details = new Map<string, ManagedQuery<ApiJournal>>();
  private creating = new Set<string>();
  constructor(
    readonly transport: PrivateTransport,
    private manager: QueryManager,
  ) {}
  detail(id: string) {
    const query = this.manager.get({
      key: `journal-view:${uuid(id)}`,
      contract: 'journal-view-v2',
      policy,
      fetcher: (signal) =>
        this.transport.request(`/api/v2/journals/${id}`, {
          signal,
          generation: this.transport.generation,
          expectedStatus: 200,
          parse: (value) => {
            const journal = parseJournal(value);
            if (journal.id !== id) throw new Error('Unexpected journal');
            return journal;
          },
        }),
    });
    this.details.set(id, query);
    return query;
  }
  list(id: string, limit = 20) {
    uuid(id);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid limit');
    const key = `${id}:${limit}`;
    const query = this.manager.get({
      key: `journal-documents:${key}`,
      contract: 'journal-documents-v2',
      policy,
      fetcher: (signal) => this.page(id, limit, signal),
    });
    this.lists.set(key, query);
    return query;
  }
  private page(id: string, limit: number, signal: AbortSignal, cursor?: string) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.transport.request(`/api/v2/journals/${id}/documents?${params}`, {
      signal,
      generation: this.transport.generation,
      expectedStatus: 200,
      parse: parsePage,
    });
  }
  async more(id: string, limit = 20) {
    const query = this.list(id, limit);
    const state = query.getSnapshot();
    const previous = state.data;
    if (!previous?.nextCursor || state.status === 'loading') return;
    const cursor = previous.nextCursor;
    await query.load(
      async (signal) => {
        if (previous.cursors.includes(cursor)) throw new Error('Repeated document cursor');
        const next = await this.page(id, limit, signal, cursor);
        const items = new Map(previous.items.map((item) => [item.id, item]));
        next.items.forEach((item) => items.set(item.id, item));
        return { ...next, items: [...items.values()], cursors: [...previous.cursors, cursor] };
      },
      { force: true, reason: 'page' },
    );
  }
  async create(id: string) {
    uuid(id);
    if (this.creating.has(id)) throw new Error('문서를 만들고 있습니다.');
    this.creating.add(id);
    try {
      const result = await this.transport.request(`/api/v2/journals/${id}/documents`, {
        method: 'POST',
        json: { title: '', content: [] },
        generation: this.transport.generation,
        expectedStatus: 201,
        parse: (value) => {
          const row = object(value);
          if (row.status !== 'DRAFT') throw new Error('Expected draft');
          return { id: uuid(row.id) };
        },
      });
      this.invalidateDocuments();
      return result.id;
    } finally {
      this.creating.delete(id);
    }
  }
  invalidateDocuments() {
    for (const query of this.lists.values()) query.invalidate();
  }
  invalidateJournals() {
    for (const query of this.details.values()) query.invalidate();
    this.invalidateDocuments();
  }
}
