import type { Attachment } from './model';

function isServiceReference(value: string) {
  if (value.startsWith('/api/v2/attachments/')) return true;
  if (typeof location === 'undefined') return false;
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin && url.pathname.startsWith('/api/v2/attachments/');
  } catch {
    return false;
  }
}

export class AttachmentRegistry {
  private readonly entries = new Map<string, Attachment>();
  private readonly unavailable = new Set<string>();
  constructor(
    readonly documentId: string,
    attachments: Attachment[],
  ) {
    for (const attachment of attachments) this.add(attachment);
  }
  add(attachment: Attachment) {
    if (attachment.documentId !== this.documentId)
      throw new Error('첨부 문서가 일치하지 않습니다.');
    if (this.unavailable.has(attachment.id))
      throw new Error('삭제된 첨부는 다시 연결할 수 없습니다.');
    this.entries.set(attachment.id, attachment);
  }
  merge(attached: Attachment[], submitted: string[]) {
    // A save response must not drop TEMP files uploaded while that save was in flight.
    for (const [id, item] of this.entries) {
      if (!submitted.includes(id) && item.status === 'ATTACHED')
        this.entries.set(id, { ...item, status: 'TEMP' });
    }
    for (const item of attached) this.add(item);
  }
  remove(id: string) {
    this.unavailable.add(id);
    this.entries.delete(id);
  }
  values() {
    return [...this.entries.values()];
  }
  references(content: unknown[]): string[] {
    const ids = new Set<string>();
    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const row = value as Record<string, unknown>;
      if (row.type === 'image' || row.type === 'file') {
        const props = row.props as Record<string, unknown> | undefined;
        const url = props?.url;
        if (typeof url === 'string' && url) {
          const known = this.values().find((item) => item.contentUrl === url);
          if (known) ids.add(known.id);
          else if (/^(?:blob:|data:)/i.test(url) || isServiceReference(url))
            throw new Error(
              '첨부 정보를 확인할 수 없습니다. 저장을 중단했습니다. 문서를 다시 확인해 주세요.',
            );
        }
      }
      Object.values(row).forEach(visit);
    };
    visit(content);
    return [...ids].sort();
  }
}
