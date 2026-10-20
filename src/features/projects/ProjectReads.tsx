import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { HttpError } from '../../shared/http/client';
import { useQuery } from '../../shared/http/query';
import { Button, EmptyState } from '../../shared/ui/controls';
import { projectPresentation, serverProjectId, type ApiProject } from './apiModel';
import type { ProjectFilter, ProjectStore } from './apiStore';
import { ProjectOverview } from './ProjectOverview';
import { ProjectSummary } from './ProjectSummary';
import { ProjectDetailLayout } from './ProjectDetailLayout';

export function ProjectListView({
  store,
  filter,
  counts,
  onSelect,
  onCreate,
  onReset,
}: {
  store: ProjectStore;
  filter: ProjectFilter;
  counts: { projects?: number; doing?: number; done?: number };
  onSelect: (id: string) => void;
  onCreate: () => void;
  onReset: () => void;
}) {
  const query = store.list(filter),
    state = useQuery(query);
  const filterKey = store.filterKey(filter);
  useLayoutEffect(() => {
    if (state.status !== 'ready' || state.stale) return;
    const position = store.scrollPosition(filter);
    if (position === undefined) return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, position);
      store.clearScrollPosition(filter);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filterKey, state.status, state.stale, store]);
  useEffect(() => {
    const remember = () => store.rememberScroll(filter, window.scrollY);
    const handleScroll = () => {
      if (window.scrollY > 0) remember();
      else store.clearScrollPosition(filter);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (window.scrollY > 0) remember();
      window.removeEventListener('scroll', handleScroll);
    };
  }, [filterKey, store]);
  return (
    <section aria-label="프로젝트 목록">
      <ProjectOverview
        projects={(state.data?.items ?? []).map(projectPresentation)}
        search={filter.query}
        filteredResults={{ total: state.data?.total ?? 0 }}
        counts={counts}
        archived={filter.status === 'archived'}
        hideEmpty={state.status !== 'ready'}
        onOpen={onSelect}
        onReset={onReset}
        emptyAction={
          <Button onClick={onCreate}>
            <Plus size={16} />
            프로젝트 추가
          </Button>
        }
      />
      {state.status === 'loading' && <p role="status">프로젝트를 불러오는 중…</p>}
      {state.status === 'error' && (
        <div className="notice" role="alert">
          <p>프로젝트를 불러오지 못했습니다.</p>
          {state.data?.nextCursor &&
            !(state.error instanceof HttpError && state.error.code === 'INVALID_CURSOR') && (
              <Button onClick={() => void store.more(filter)}>다시 시도</Button>
            )}
          <Button onClick={() => query.invalidate(true)}>목록 다시 불러오기</Button>
        </div>
      )}
      {state.status !== 'error' && state.data?.nextCursor && (
        <Button disabled={state.status === 'loading'} onClick={() => void store.more(filter)}>
          프로젝트 더 보기
        </Button>
      )}
    </section>
  );
}

type DetailProps = {
  store: ProjectStore;
  id: string;
  onBack: () => void;
  actions: (project: ApiProject, verified: boolean) => ReactNode;
  children: (project: ApiProject) => ReactNode;
  category?: (project: ApiProject) => ReactNode;
};
export function ProjectDetailView(props: DetailProps) {
  try {
    serverProjectId(props.id);
  } catch {
    return (
      <ProjectDetailLayout compact title="프로젝트를 찾을 수 없어요" onBack={props.onBack}>
        <p className="notice" role="alert">
          잘못된 프로젝트 주소입니다. 목록에서 프로젝트를 선택해 주세요.
        </p>
      </ProjectDetailLayout>
    );
  }
  return <VerifiedDetail {...props} />;
}
function VerifiedDetail({ store, id, children, actions, onBack, category }: DetailProps) {
  const query = store.detail(serverProjectId(id)),
    state = useQuery(query);
  const missing = state.error instanceof HttpError && state.error.status === 404;
  const project = missing ? undefined : state.data;
  const verified = state.status === 'ready' && !state.stale;
  const hasVerified = useRef(false);
  if (verified) hasVerified.current = true;
  return (
    <ProjectDetailLayout
      compact
      title={
        project?.name ??
        (state.status === 'loading' ? '프로젝트를 불러오는 중…' : '프로젝트를 찾을 수 없어요')
      }
      onBack={onBack}
      actions={project && actions(project, verified)}
      feedback={
        <>
          {state.status === 'loading' && <p role="status">프로젝트를 불러오는 중…</p>}
          {state.status === 'error' && (
            <p className="notice" role="alert">
              {missing
                ? '프로젝트가 없거나 더 이상 접근할 수 없어요.'
                : '프로젝트를 새로 불러오지 못했습니다.'}
              <Button onClick={() => void query.load()}>다시 시도</Button>
            </p>
          )}
        </>
      }
    >
      {project ? (
        <>
          <ProjectSummary project={projectPresentation(project)} category={category?.(project)} />
          {(verified || (hasVerified.current && state.status !== 'error')) && children(project)}
        </>
      ) : (
        state.status !== 'loading' && (
          <EmptyState title="프로젝트가 없거나 더 이상 접근할 수 없어요" />
        )
      )}
    </ProjectDetailLayout>
  );
}
