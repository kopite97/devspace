import { count, object, oneOf, string, uuid } from '../../shared/http/validation';

const nullable = <T>(value: unknown, parse: (value: unknown) => T): T | null =>
  value === null ? null : parse(value);
export const bool = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new Error('Expected boolean');
  return value;
};
export const array = <T>(value: unknown, parse: (value: unknown) => T): T[] => {
  if (!Array.isArray(value)) throw new Error('Expected array');
  return value.map(parse);
};
export function positive(value: unknown) {
  const n = count(value);
  if (!n) throw new Error('Expected positive ID');
  return n;
}
export function ids(input: string, max = 20) {
  const values = input.trim()
    ? input.split(',').map((value) => {
        if (!/^\s*[1-9]\d*\s*$/.test(value))
          throw new Error('쉼표로 구분한 numeric ID를 입력하세요.');
        return positive(Number(value));
      })
    : [];
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length > max) throw new Error(`최대 ${max}개를 선택하세요.`);
  return unique;
}
export function githubUrl(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function parseAccount(value: unknown) {
  const r = object(value);
  return {
    status: oneOf(r.status, [
      'not_configured',
      'disconnected',
      'connected',
      'reauthorization_required',
    ]),
    githubUserId: nullable(r.githubUserId, positive),
    login: nullable(r.login, string),
    reauthorizationRequired: bool(r.reauthorizationRequired),
    installationUrl: nullable(r.installationUrl, string),
  };
}
export function parseLink(value: unknown) {
  const r = object(value);
  return {
    id: uuid(r.id),
    projectId: uuid(r.projectId),
    installationId: positive(r.installationId),
    repositoryId: positive(r.repositoryId),
    fullName: nullable(r.fullName, string),
    htmlUrl: nullable(r.htmlUrl, string),
    paused: bool(r.paused),
    revision: positive(r.revision),
    status: oneOf(r.status, ['initializing', 'ready', 'disconnecting', 'disconnected', 'failed']),
    accessStatus: oneOf(r.accessStatus, [
      'verified',
      'check_pending',
      'denied',
      'reauthorization_required',
    ]),
  };
}
export type RepositoryLink = ReturnType<typeof parseLink>;
export function parseInstallation(value: unknown) {
  const r = object(value);
  return {
    id: positive(r.id),
    accountLogin: string(r.accountLogin),
    accountType: string(r.accountType),
    suspended: bool(r.suspended),
    issuesReadable: bool(r.issuesReadable),
  };
}
export function parseRepository(value: unknown) {
  const r = object(value);
  return {
    id: positive(r.id),
    fullName: string(r.fullName),
    htmlUrl: string(r.htmlUrl),
    privateRepository: bool(r.privateRepository),
    issuesEnabled: bool(r.issuesEnabled),
  };
}
export const page =
  <T>(parse: (v: unknown) => T) =>
  (value: unknown) => {
    const r = object(value);
    return {
      items: array(r.items, parse),
      total: count(r.total),
      nextPage: nullable(r.nextPage, positive),
    };
  };
export function parseCoverage(value: unknown) {
  const r = object(value);
  return {
    state: string(r.state),
    lastSuccessfulSyncAt: nullable(r.lastSuccessfulSyncAt, string),
    closedUpdatedWithinDays: count(r.closedUpdatedWithinDays),
  };
}
export function parseIssue(value: unknown) {
  const r = object(value);
  return {
    id: positive(r.id),
    number: positive(r.number),
    title: string(r.title),
    body: r.body === null ? '' : string(r.body),
    state: string(r.state),
    htmlUrl: string(r.htmlUrl),
    labelIds: array(r.labelIds, positive),
    assigneeIds: array(r.assigneeIds, positive),
    contentOverflow: bool(r.contentOverflow),
  };
}
export const cursorPage =
  <T>(parse: (v: unknown) => T) =>
  (value: unknown) => {
    const r = object(value);
    return {
      items: array(r.items, parse),
      total: count(r.total),
      nextCursor: nullable(r.nextCursor, string),
    };
  };
export function parseIssues(value: unknown) {
  return { ...cursorPage(parseIssue)(value), coverage: parseCoverage(object(value).coverage) };
}
export function parseLabel(value: unknown) {
  const r = object(value);
  return { id: positive(r.id), name: string(r.name), color: string(r.color) };
}
export function parseSettings(value: unknown) {
  const r = object(value),
    criteria = object(r.criteria),
    mapping = object(r.mapping);
  return {
    revision: positive(r.revision),
    enabled: bool(r.enabled),
    paused: bool(r.paused),
    generation: count(r.generation),
    baselineReady: bool(r.baselineReady),
    criteria: {
      labelIds: array(criteria.labelIds, positive),
      assigneeIds: array(criteria.assigneeIds, positive),
    },
    mapping: {
      todoLabelId: nullable(mapping.todoLabelId, positive),
      doingLabelId: nullable(mapping.doingLabelId, positive),
      doneLabelId: nullable(mapping.doneLabelId, positive),
    },
  };
}
export type Settings = ReturnType<typeof parseSettings>;
export function parsePreview(value: unknown) {
  const r = object(value);
  return {
    revision: positive(r.revision),
    baselineReady: bool(r.baselineReady),
    total: count(r.total),
    nextAfterIssueId: nullable(r.nextAfterIssueId, count),
    items: array(r.items, (value) => {
      const item = object(value);
      return {
        issueId: positive(item.issueId),
        issueNumber: positive(item.issueNumber),
        taskId: nullable(item.taskId, uuid),
        status: string(item.status),
        statusReason: nullable(item.statusReason, string),
        errorCode: nullable(item.errorCode, string),
        matches: bool(item.matches),
        excluded: bool(item.excluded),
      };
    }),
  };
}
export type Preview = ReturnType<typeof parsePreview>;
export function parseJob(value: unknown) {
  const r = object(value);
  return {
    id: uuid(r.id),
    linkId: uuid(r.linkId),
    kind: oneOf(r.kind, ['collect', 'issue', 'apply', 'baseline', 'mapping', 'import', 'detach']),
    state: oneOf(r.state, ['queued', 'running', 'completed', 'failed', 'partial']),
    completedCount: count(r.completedCount),
    failedCount: count(r.failedCount),
    errorCode: nullable(r.errorCode, string),
    items: array(r.items, (value) => {
      const item = object(value);
      return {
        issueId: positive(item.issueId),
        state: string(item.state),
        taskId: nullable(item.taskId, uuid),
        errorCode: nullable(item.errorCode, string),
      };
    }),
  };
}
export type Job = ReturnType<typeof parseJob>;
export const terminal = (job: Job) => !['queued', 'running'].includes(job.state);
export function parseSync(value: unknown) {
  const r = object(value);
  return {
    coverage: parseCoverage(r.coverage),
    paused: bool(r.paused),
    projectStatus: string(r.projectStatus),
    baselineReady: bool(r.baselineReady),
    lastTaskAppliedAt: nullable(r.lastTaskAppliedAt, string),
    latestJob: nullable(r.latestJob, parseJob),
    latestCollectionJob: nullable(r.latestCollectionJob, parseJob),
    latestTaskJob: nullable(r.latestTaskJob, parseJob),
  };
}
