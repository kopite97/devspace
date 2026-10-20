import { useEffect } from 'react';
import { useQuery } from '../../shared/http/query';
import { Button } from '../../shared/ui/controls';
import { type GitHubStore } from './store';
import { terminal } from './model';
import { itemError } from './errors';
import { Feedback } from './Feedback';

export function JobProgress({
  store,
  base,
  id,
  onRetry,
}: {
  store: GitHubStore;
  base: string;
  id: string;
  onRetry?: (ids: number[]) => void;
}) {
  const query = store.job(id),
    state = useQuery(query),
    job = state.status === 'ready' ? state.data : undefined;
  useEffect(() => store.watchJob(base, id), [store, base, id]);
  const failures =
    job?.kind === 'import'
      ? job.items.filter((i) => i.state === 'failed').map((i) => i.issueId)
      : [];
  return (
    <section className="github-panel" aria-label="GitHub 작업 결과">
      <h3>작업 결과</h3>
      <small>작업 ID {id}</small>
      <Feedback store={store} query={query} state={state} />
      {job && (
        <>
          <p role="status">
            {
              {
                queued: '대기 중',
                running: '처리 중',
                completed: '완료',
                failed: '실패',
                partial: '부분 완료',
              }[job.state]
            }
            {' · '}성공 {job.completedCount} · 실패 {job.failedCount}
          </p>
          {job.errorCode && <p role="alert">{itemError(job.errorCode)}</p>}
          {job.kind === 'import' &&
            job.items.map((i) => (
              <p key={i.issueId}>
                Issue ID {i.issueId} · {i.state} {itemError(i.errorCode)}
              </p>
            ))}
          {!!failures?.length && onRetry && (
            <Button onClick={() => onRetry(failures!)}>실패 항목만 다시 미리보기</Button>
          )}
          {!terminal(job) && (
            <p>
              화면을 닫아도 서버 작업은 계속됩니다. 최신 원문 대기는 최대 15분이 걸릴 수 있습니다.
            </p>
          )}
        </>
      )}
    </section>
  );
}
