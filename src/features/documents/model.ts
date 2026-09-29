import { count, object, oneOf, string, timestamp, uuid } from '../../shared/http/validation';

export type Attachment = {
  id: string;
  documentId: string;
  originalFilename: string;
  contentType: string;
  size: number;
  status: 'TEMP' | 'ATTACHED';
  contentUrl: string;
  createdAt: string;
};
export type DocumentSnapshot = {
  id: string;
  documentSpaceId: string;
  title: string;
  content: unknown[];
  attachmentIds: string[];
  attachments: Attachment[];
  status: 'DRAFT' | 'PUBLISHED';
  authorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};
export type DocumentInput = { title: string; content: unknown[]; attachmentIds: string[] };
export function parseAttachment(value: unknown): Attachment {
  const row = object(value);
  const id = uuid(row.id);
  const contentUrl = string(row.contentUrl);
  const size = count(row.size);
  if (contentUrl !== `/api/v2/attachments/${id}/content` || !size)
    throw new Error('Invalid attachment');
  return {
    id,
    documentId: uuid(row.documentId),
    originalFilename: string(row.originalFilename),
    contentType: oneOf(row.contentType, [
      'image/png',
      'image/jpeg',
      'application/pdf',
      'text/plain',
    ]),
    size,
    status: oneOf(row.status, ['TEMP', 'ATTACHED']),
    contentUrl,
    createdAt: timestamp(row.createdAt),
  };
}
export function parseDocument(value: unknown): DocumentSnapshot {
  const row = object(value);
  const id = uuid(row.id);
  const title = string(row.title);
  if (
    title.length > 200 ||
    !Array.isArray(row.content) ||
    !Array.isArray(row.attachmentIds) ||
    !Array.isArray(row.attachments)
  )
    throw new Error('Invalid document');
  const attachmentIds = row.attachmentIds.map(uuid);
  const attachments = row.attachments.map(parseAttachment);
  if (
    attachmentIds.length > 100 ||
    new Set(attachmentIds).size !== attachmentIds.length ||
    attachments.length !== attachmentIds.length ||
    attachments.some(
      (item, index) =>
        item.id !== attachmentIds[index] || item.documentId !== id || item.status !== 'ATTACHED',
    )
  )
    throw new Error('Inconsistent attachment snapshot');
  const status = oneOf(row.status, ['DRAFT', 'PUBLISHED']);
  const publishedAt = row.publishedAt === null ? null : timestamp(row.publishedAt);
  if ((status === 'DRAFT') !== (publishedAt === null)) throw new Error('Invalid publication');
  return {
    id,
    documentSpaceId: uuid(row.documentSpaceId),
    title,
    content: row.content,
    attachmentIds,
    attachments,
    status,
    publishedAt,
    authorId: uuid(row.authorId),
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}
export function parseDeleted(expectedId: string) {
  return (value: unknown) => {
    const deletedId = uuid(object(value).deletedId);
    if (deletedId !== expectedId) throw new Error('Unexpected deleted resource');
    return { deletedId };
  };
}
export function validateInput(input: DocumentInput) {
  if (input.title.length > 200) throw new Error('제목은 200자 이내로 입력해 주세요.');
  if (new TextEncoder().encode(JSON.stringify(input.content)).length > 1048576)
    throw new Error('본문은 1MiB 이내로 입력해 주세요.');
  if (input.attachmentIds.length > 100)
    throw new Error('첨부는 최대 100개까지 저장할 수 있습니다.');
}
