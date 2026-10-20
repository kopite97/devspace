import { useQuery } from '../../shared/http/query';
import type { OverviewStore } from './apiStore';
import type { OverviewFilter } from './apiModel';
import { HttpError } from '../../shared/http/client';
export function OverviewSummary({
  store,
  filter,
}: {
  store: OverviewStore;
  filter: OverviewFilter;
}) {
  const query = store.query(filter),
    state = useQuery(query);
  return (
    <section aria-label="Overview counters">
      <h3>
        {filter.projectId
          ? 'Project counters'
          : filter.category === 'all'
            ? 'Workspace counters'
            : 'Category counters'}
      </h3>
      {state.status === 'loading' && (
        <p role="status">{state.data ? 'Refreshing counters…' : 'Loading counters…'}</p>
      )}
      {state.status === 'error' && (
        <p role="alert">
          Counters unavailable.{state.data ? ' Previously loaded counts are stale.' : ''}
          {state.error instanceof HttpError && state.error.requestId
            ? ' Request ID: ' + state.error.requestId
            : ''}
        </p>
      )}
      {state.data && (
        <>
          {state.data.externalDataUnavailable && (
            <p role="status">
              일부 GitHub 작업은 표시할 수 없습니다. 집계는 접근 가능한 작업 기준입니다.
            </p>
          )}
          <dl className="overview-counts">
            {Object.entries({
              'Active Projects': state.data.projects.total,
              'Archived Projects': state.data.projects.archived,
              'Tasks total': state.data.tasks.total,
              'To do': state.data.tasks.todo,
              Doing: state.data.tasks.doing,
              Done: state.data.tasks.done,
            }).map(([label, count]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>

          <p>
            Task counts include non-deleted tasks in archived Projects. Independent of Project
            search and loaded pages.
          </p>
          <p className="project-audit">
            Observed: {state.data.asOf}
            {state.stale ? ' · Stale; awaiting refresh' : ''}
          </p>
        </>
      )}
      <button disabled={state.status === 'loading'} onClick={() => query.invalidate()}>
        Refresh counters
      </button>
    </section>
  );
}
