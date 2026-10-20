import { selectionFilter } from '../features/projects/categoryFilter';
import { ProjectOverview } from '../features/projects/ProjectOverview';
import { presentation, serverProjectId, type ApiProject } from '../features/projects/apiModel';
import type { ProjectStore } from '../features/projects/apiStore';
import type { OverviewStore } from '../features/overview/apiStore';
import type { Widget } from '../features/dashboard/apiModel';
import { useQuery, type QueryState } from '../shared/http/query';
import { Button } from '../shared/ui/controls';

type Props = {
  projects: ProjectStore;
  overview: OverviewStore;
  widget: Widget;
  onNavigate: (path: string) => void;
};
function Rows({
  overview,
  widget,
  onNavigate,
  state,
  rows,
  retry,
  more,
}: {
  overview: OverviewStore;
  widget: Widget;
  onNavigate: (path: string) => void;
  state: QueryState<unknown>;
  rows: ApiProject[];
  retry: () => void;
  more?: () => void;
}) {
  const query = overview.query(selectionFilter(widget.selection));
  const counters = useQuery(query);
  const archived = !!selectionFilter(widget.selection).projectId && rows[0]?.status === 'archived';
  return (
    <>
      {counters.data?.externalDataUnavailable && (
        <p role="status">
          일부 GitHub 작업은 표시할 수 없습니다. 집계는 접근 가능한 작업 기준입니다.
        </p>
      )}
      <ProjectOverview
        filteredResults={{ total: rows.length }}
        projects={rows.map((p) => ({ ...p, ...presentation(p) }))}
        counts={{
          projects: archived ? counters.data?.projects.archived : counters.data?.projects.total,
          doing: counters.data?.tasks.doing,
          done: counters.data?.tasks.done,
        }}
        archived={archived}
        projectOnly={!!selectionFilter(widget.selection).projectId}
        limit={widget.limit}
        hideEmpty={state.status !== 'ready'}
        onOpen={(id) => onNavigate('/projects/' + id)}
      />
      {(state.status === 'idle' || state.status === 'loading' || counters.status === 'loading') && (
        <p role="status">프로젝트 개요를 불러오는 중…</p>
      )}
      {state.status === 'error' && (
        <p role="alert">
          프로젝트를 불러오지 못했습니다. <Button onClick={retry}>프로젝트 다시 시도</Button>
        </p>
      )}
      {counters.status === 'error' && (
        <p role="alert">
          집계를 불러오지 못했습니다.{' '}
          <Button onClick={() => query.invalidate()}>집계 다시 시도</Button>
        </p>
      )}
      {more && (
        <Button disabled={state.status === 'loading'} onClick={more}>
          프로젝트 더 보기
        </Button>
      )}
    </>
  );
}
function Collection(props: Props) {
  const filter = {
    category: selectionFilter(props.widget.selection).category,
    status: 'active',
    query: '',
  } as const;
  const query = props.projects.list(filter);
  const state = useQuery(query);
  return (
    <Rows
      {...props}
      state={state}
      rows={state.data?.items ?? []}
      retry={() => (state.data?.nextCursor ? void props.projects.more(filter) : query.invalidate())}
      more={
        !props.widget.limit && state.data?.nextCursor
          ? () => void props.projects.more(filter)
          : undefined
      }
    />
  );
}
function Selected(props: Props) {
  const query = props.projects.detail(
    serverProjectId(selectionFilter(props.widget.selection).projectId),
  );
  const state = useQuery(query);
  return (
    <Rows
      {...props}
      state={state}
      rows={state.data ? [state.data] : []}
      retry={() => query.invalidate()}
    />
  );
}
export function ServerProjectOverview(props: Props) {
  return selectionFilter(props.widget.selection).projectId ? (
    <Selected {...props} />
  ) : (
    <Collection {...props} />
  );
}
