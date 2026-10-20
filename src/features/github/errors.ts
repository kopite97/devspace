import { HttpError } from '../../shared/http/client';
const messages: Record<string, string> = {
  AUTH_REQUIRED: '서비스에 다시 로그인해 주세요.',
  CSRF_INVALID: '보안 토큰 또는 요청 출처를 확인해 주세요. 다시 시도하면 토큰을 재확인합니다.',
  REVISION_CONFLICT: '설정이 변경되었습니다. 최신 설정을 확인한 뒤 다시 적용해 주세요.',
  GITHUB_REFRESH_IN_PROGRESS: 'GitHub 인증을 갱신 중입니다. 잠시 후 다시 확인해 주세요.',
  PROJECT_ARCHIVED: '보관된 프로젝트에서는 Task를 가져오거나 반영할 수 없습니다.',
  GITHUB_ACCOUNT_IN_USE: '프로젝트의 저장소 연결을 먼저 정리해 주세요.',
  GITHUB_RATE_LIMITED: 'GitHub 요청 제한입니다. 표시된 대기 시간 후 다시 시도해 주세요.',
  GITHUB_IMPORT_QUEUE_FULL: '대기 중인 가져오기 작업이 많습니다. 완료 후 다시 시도해 주세요.',
  GITHUB_LINK_LIMIT_EXCEEDED: '프로젝트 연결 상한은 100개입니다. 기존 연결을 정리해 주세요.',
  GITHUB_NOT_CONFIGURED: '서버의 GitHub 연동 설정이 필요합니다.',
  GITHUB_UNAVAILABLE: 'GitHub에 연결할 수 없습니다. 일반 Task는 계속 사용할 수 있습니다.',
  GITHUB_ACCESS_SCOPE_CHANGED: '접근 범위가 변경되어 목록과 선택을 초기화했습니다.',
  TASK_ACCESS_SCOPE_CHANGED: '접근 범위가 변경되었습니다. 첫 페이지부터 다시 확인해 주세요.',
  TASK_IN_TRASH: '휴지통에서 기존 Task를 복원해 주세요.',
  CONTENT_LIMIT_EXCEEDED: 'GitHub 제목 또는 본문 길이를 줄인 뒤 다시 시도해 주세요.',
  ALREADY_IMPORTED: '이미 가져온 Issue입니다.',
  GITHUB_ISSUE_UNAVAILABLE:
    'Issue 원문에 접근할 수 없습니다. 저장소 권한과 Issue 상태를 확인해 주세요.',
  GITHUB_SOURCE_NOT_FRESH: '최신 원문 수집을 확인하지 못했습니다. 동기화 후 다시 미리보세요.',
  GITHUB_SOURCE_CHANGED: '원문이 변경되었습니다. 다시 미리보세요.',
  GITHUB_SYNC_PAUSED: 'Task 동기화가 중지되어 있습니다.',
  GITHUB_LABEL_UNAVAILABLE: '라벨이 변경되었거나 삭제되었습니다. 다시 선택해 주세요.',
  IDEMPOTENCY_KEY_REUSED: '다른 요청에 사용된 키입니다. 현황 확인 후 새 작업을 시작해 주세요.',
};
export function errorText(error: unknown) {
  if (error instanceof HttpError)
    return `${messages[error.code] ?? '요청을 완료하지 못했습니다.'} (${error.code})${error.requestId ? ` · 문의 ID ${error.requestId}` : ''}`;
  return error instanceof Error ? error.message : '요청을 완료하지 못했습니다.';
}
export const itemError = (code: string | null) => (code ? (messages[code] ?? code) : '');
export function retryAt(error: unknown, now = Date.now()) {
  if (!(error instanceof HttpError) || !error.retryAfter) return undefined;
  const value = error.retryAfter.trim();
  if (
    !/^\d+$/.test(value) &&
    !/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)
  )
    return undefined;
  const at = /^\d+$/.test(value) ? now + Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(at) ? Math.max(now, at) : undefined;
}
