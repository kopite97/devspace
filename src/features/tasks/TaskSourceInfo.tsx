import type { TaskSource, SourceReason } from './source';
import { sourceReasonLabels } from './source';
export function TaskSourceInfo({ source }: { source?: TaskSource | null }) {
  if (!source) return null;
  let href: string | undefined;
  try {
    const url = new URL(source.htmlUrl);
    if (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      !url.username &&
      !url.password &&
      !url.port
    )
      href = url.href;
  } catch {
    /* Untrusted source URLs are displayed without navigation. */
  }
  return (
    <div className="task-source">
      <small>
        GitHub에서 관리 · {source.repository} #{source.issueNumber}
      </small>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer">
          GitHub 원문 ↗
        </a>
      )}
      {source.paused && <small>Task 동기화 중지</small>}
      {source.statusReason && (
        <small>
          {sourceReasonLabels[source.statusReason as SourceReason] ?? source.statusReason}
        </small>
      )}
      {!!source.conflictLabelIds.length && (
        <small>충돌 라벨 ID {source.conflictLabelIds.join(', ')}</small>
      )}
      {source.contentError && (
        <small role="status">원문 길이 초과 · 마지막 정상 내용을 표시합니다.</small>
      )}
      {source.lastAppliedAt && (
        <small>마지막 반영 {new Date(source.lastAppliedAt).toLocaleString()}</small>
      )}
    </div>
  );
}
