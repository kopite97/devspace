import { count, object, oneOf, string, timestamp, uuid } from '../../shared/http/validation';
import type { TaskDraft, TaskPresentation, TaskStatus } from './presentation';
import { parseSource, type TaskSource } from './source';

export type ServerTaskId = string & { readonly serverTaskId: unique symbol };
export type ApiTask = {
  id: ServerTaskId;
  revision: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  projectId: string;
  projectName: string;
  categoryId: string | null;
  description: string;
  status: TaskStatus;
  priority: 'normal' | 'high';
  tag: string;
  deletedAt: string | null;
  source?: TaskSource | null;
};
export function parseTask(value: unknown): ApiTask {
  const row = object(value);
  const revision = count(row.revision);
  if (!revision) throw new Error('Invalid Task revision');
  return {
    id: uuid(row.id) as ServerTaskId,
    revision,
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
    title: string(row.title),
    projectId: uuid(row.projectId),
    projectName: string(row.projectName),
    categoryId: row.categoryId === null ? null : uuid(row.categoryId),
    description: string(row.description),
    status: oneOf(row.status, ['todo', 'doing', 'done']),
    priority: oneOf(row.priority, ['normal', 'high']),
    tag: string(row.tag),
    deletedAt: row.deletedAt === null ? null : timestamp(row.deletedAt),
    source: parseSource(row.source),
  };
}
export function taskDraft(task?: ApiTask): TaskDraft {
  return {
    title: task?.title ?? '',
    projectId: task?.projectId ?? '',
    description: task?.description ?? '',
    status: task?.status ?? 'todo',
    priority: task?.priority === 'high' ? '높음' : '보통',
    tag: task?.tag ?? '',
  };
}
export function taskPresentation(task: ApiTask): TaskPresentation {
  return {
    ...taskDraft(task),
    id: task.id,
    revision: task.revision,
    project: task.projectName,
    categoryId: task.categoryId,
    deletedAt: task.deletedAt,
    source: task.source,
  };
}
export function validateDraft(draft: TaskDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.title.trim() || draft.title.trim().length > 160)
    errors.title = '제목은 1–160자로 입력해 주세요.';
  if (draft.tag.trim().length > 40) errors.tag = '태그는 40자까지 입력할 수 있습니다.';
  if (draft.description.length > 10000)
    errors.description = '상세 내용은 10000자까지 입력할 수 있습니다.';
  try {
    uuid(draft.projectId);
  } catch {
    errors.projectId = '프로젝트를 선택해 주세요.';
  }
  if (!['todo', 'doing', 'done'].includes(draft.status)) errors.status = '상태를 선택해 주세요.';
  if (!['보통', '높음'].includes(draft.priority)) errors.priority = '우선순위를 선택해 주세요.';
  return errors;
}
export function createBody(draft: TaskDraft) {
  if (Object.keys(validateDraft(draft)).length) throw new Error('Invalid Task draft');
  return {
    title: draft.title.trim(),
    projectId: draft.projectId,
    description: draft.description,
    status: draft.status,
    priority: draft.priority === '높음' ? ('high' as const) : ('normal' as const),
    tag: draft.tag.trim(),
  };
}
export function patchBody(baseline: ApiTask, draft: TaskDraft) {
  if (baseline.source) {
    const changes: Record<string, string | number> = { revision: baseline.revision };
    if (draft.tag.trim().length > 40) throw new Error('태그는 40자까지 입력해 주세요.');
    if (draft.tag.trim() !== baseline.tag) changes.tag = draft.tag.trim();
    const priority = draft.priority === '높음' ? 'high' : 'normal';
    if (priority !== baseline.priority) changes.priority = priority;
    return changes;
  }
  const before = createBody(taskDraft(baseline));
  const after = createBody(draft);
  const changes: Record<string, string | number> = { revision: baseline.revision };
  for (const key of Object.keys(after) as (keyof typeof after)[])
    if (after[key] !== before[key]) changes[key] = after[key];
  return changes;
}
export type TaskPage = {
  items: ApiTask[];
  total: number;
  nextCursor: string | null;
  externalDataUnavailable?: boolean;
};
export function parseTaskPage(value: unknown): TaskPage {
  const row = object(value);
  if (!Array.isArray(row.items)) throw new Error('Invalid Task page');
  const nextCursor = row.nextCursor === null ? null : string(row.nextCursor);
  if (nextCursor === '') throw new Error('Empty Task cursor');
  return {
    items: row.items.map(parseTask),
    total: count(row.total),
    nextCursor,
    externalDataUnavailable: row.externalDataUnavailable === true,
  };
}
export type TaskStats = {
  counts: Record<TaskStatus, number>;
  total: number;
  asOf: string;
  externalDataUnavailable?: boolean;
};
export function parseTaskStats(value: unknown): TaskStats {
  const row = object(value);
  const buckets = object(row.counts);
  const counts = {
    todo: count(buckets.todo),
    doing: count(buckets.doing),
    done: count(buckets.done),
  };
  const total = count(row.total);
  if (counts.todo + counts.doing + counts.done !== total) throw new Error('Invalid Task total');
  return {
    counts,
    total,
    asOf: timestamp(row.asOf),
    externalDataUnavailable: row.externalDataUnavailable === true,
  };
}
