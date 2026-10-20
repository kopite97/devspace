import { count, object, oneOf, string, uuid } from '../../shared/http/validation';
export const sourceReasons = [
  'mapping_conflict',
  'not_planned',
  'unknown_closure',
  'mapping_error',
  'content_limit_exceeded',
] as const;
export type SourceReason = (typeof sourceReasons)[number];
export type TaskSource = {
  type: 'github';
  linkId: string;
  issueId: number;
  issueNumber: number;
  repository: string;
  htmlUrl: string;
  statusReason: string | null;
  contentError: string | null;
  paused: boolean;
  lastAppliedAt: string | null;
  sourceUpdatedAt: string | null;
  conflictLabelIds: number[];
  editableFields: string[];
  issueState: string;
  issueStateReason: string | null;
};
export function parseSource(value: unknown): TaskSource | null {
  if (value === null || value === undefined) return null;
  const r = object(value);
  if (typeof r.paused !== 'boolean') throw new Error('Invalid source pause');
  if (!Array.isArray(r.conflictLabelIds) || !Array.isArray(r.editableFields))
    throw new Error('Invalid source metadata');
  return {
    type: oneOf(r.type, ['github']),
    linkId: uuid(r.linkId),
    issueId: count(r.issueId),
    issueNumber: count(r.issueNumber),
    repository: string(r.repository),
    htmlUrl: string(r.htmlUrl),
    statusReason: r.statusReason === null ? null : string(r.statusReason),
    contentError: r.contentError === null ? null : string(r.contentError),
    paused: r.paused,
    lastAppliedAt: r.lastAppliedAt === null ? null : string(r.lastAppliedAt),
    sourceUpdatedAt: r.sourceUpdatedAt === null ? null : string(r.sourceUpdatedAt),
    conflictLabelIds: r.conflictLabelIds.map(count),
    editableFields: r.editableFields.map(string),
    issueState: string(r.issueState),
    issueStateReason: r.issueStateReason === null ? null : string(r.issueStateReason),
  };
}
export const sourceReasonLabels: Record<SourceReason, string> = {
  mapping_conflict: '상태 라벨 충돌',
  not_planned: '진행하지 않음',
  unknown_closure: '종료 사유 확인 필요',
  mapping_error: '상태 매핑 오류',
  content_limit_exceeded: '본문·제목 길이 초과',
};
