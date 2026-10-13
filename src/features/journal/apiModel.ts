import { count, object, string, timestamp, uuid } from '../../shared/http/validation';

export type ServerJournalId = string & { readonly serverJournalId: unique symbol };
export type JournalScope = 'unity' | 'server';
export type JournalSort = 'newest' | 'oldest';
export type JournalProjectStatus = 'all' | 'active' | 'archived';
export type JournalDate = string & { readonly journalDate: unique symbol };

export type ApiJournal = {
  id: ServerJournalId;
  revision: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  projectId: string;
  projectName: string;
  categoryId: string | null;
  body: string;
  entryDate: JournalDate;
};

export type JournalDraft = {
  title: string;
  projectId: string;
  body: string;
  entryDate: string;
};

export type JournalProjectOption = {
  id: string;
  name: string;
  categoryId: string | null;
  archived: boolean;
};

export type JournalPresentation = {
  id: string;
  title: string;
  projectId: string;
  project: string;
  categoryId: string | null;
  body: string;
  entryDate: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= days;
}

export function journalDate(value: unknown): JournalDate {
  const result = string(value);
  if (!isCalendarDate(result)) throw new Error('Invalid Journal entry date');
  return result as JournalDate;
}

export function serverJournalId(value: unknown) {
  return uuid(value) as ServerJournalId;
}

export function parseJournal(value: unknown): ApiJournal {
  const row = object(value);
  const revision = count(row.revision);
  if (!revision) throw new Error('Invalid Journal revision');
  const title = string(row.title);
  const body = string(row.body);
  if (!title || title.length > 120 || !body || body.length > 20000)
    throw new Error('Invalid Journal text');
  return {
    id: serverJournalId(row.id),
    revision,
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
    title,
    projectId: uuid(row.projectId),
    projectName: string(row.projectName),
    categoryId: row.categoryId === null ? null : uuid(row.categoryId),
    body,
    entryDate: journalDate(row.entryDate),
  };
}

export function journalDraft(journal?: ApiJournal): JournalDraft {
  return {
    title: journal?.title ?? '',
    projectId: journal?.projectId ?? '',
    body: journal?.body ?? '',
    entryDate: journal?.entryDate ?? todayDate(),
  };
}

export function todayDate(now = new Date()) {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function validateJournalDraft(draft: JournalDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.title.trim() || draft.title.length > 120)
    errors.title = '제목은 1–120자로 입력해 주세요.';
  if (!draft.body.trim() || draft.body.length > 20000)
    errors.body = '일지 설명은 1–20000자로 입력해 주세요.';
  try {
    uuid(draft.projectId);
  } catch {
    errors.projectId = '활성 프로젝트를 선택해 주세요.';
  }
  try {
    journalDate(draft.entryDate);
  } catch {
    errors.entryDate = '작성일을 YYYY-MM-DD 형식으로 선택해 주세요.';
  }
  return errors;
}

export function createBody(draft: JournalDraft) {
  if (Object.keys(validateJournalDraft(draft)).length) throw new Error('Invalid Journal draft');
  return {
    title: draft.title,
    projectId: draft.projectId,
    body: draft.body,
    entryDate: draft.entryDate,
  };
}

export function patchBody(baseline: ApiJournal, draft: JournalDraft) {
  const before = createBody(journalDraft(baseline));
  const after = createBody(draft);
  const changes: Record<string, string | number> = { revision: baseline.revision };
  for (const key of Object.keys(after) as (keyof typeof after)[])
    if (after[key] !== before[key]) changes[key] = after[key];
  return changes;
}

export type JournalPage = {
  items: ApiJournal[];
  total: number;
  nextCursor: string | null;
};

export function parseJournalPage(value: unknown): JournalPage {
  const row = object(value);
  if (!Array.isArray(row.items)) throw new Error('Invalid Journal page');
  const nextCursor = row.nextCursor === null ? null : string(row.nextCursor);
  if (nextCursor === '') throw new Error('Empty Journal cursor');
  return { items: row.items.map(parseJournal), total: count(row.total), nextCursor };
}

export type DeletedJournal = { deletedId: ServerJournalId };
export function parseDeletedJournal(value: unknown): DeletedJournal {
  const row = object(value);
  return { deletedId: serverJournalId(row.deletedId) };
}

export function presentation(journal: ApiJournal): JournalPresentation {
  return {
    id: journal.id,
    title: journal.title,
    projectId: journal.projectId,
    project: journal.projectName,
    categoryId: journal.categoryId,
    body: journal.body,
    entryDate: journal.entryDate,
    createdAt: journal.createdAt,
    updatedAt: journal.updatedAt,
    revision: journal.revision,
  };
}
