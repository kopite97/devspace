import { useEffect, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { ProjectDetailView, ProjectListView } from '../features/projects/ProjectReads';
import { ProjectsLayout } from '../features/projects/ProjectsLayout';
import type { ProjectStore, ProjectFilter } from '../features/projects/apiStore';
import type { DraftMemory } from '../features/projects/draftMemory';
import { ApiProjectEditor } from '../features/projects/ApiProjectEditor';
import { ProjectActions } from '../features/projects/ProjectActions';
import type { ApiProject } from '../features/projects/apiModel';
import type { OverviewStore } from '../features/overview/apiStore';
import { readCategoryFilter } from '../features/projects/categoryFilter';
import { CategoryFilterControl } from '../features/projects/CategoryFilterControl';
import { useQuery } from '../shared/http/query';
import { Button } from '../shared/ui/controls';
import type { CategoryStore } from '../features/projects/categoryStore';
import { CategoryManager, CategoryManagerButton } from '../features/projects/CategoryManager';
import { CategoryDisplay } from '../features/projects/CategoryDisplay';

type Props = {
  store: ProjectStore;
  categories: CategoryStore;
  overview: OverviewStore;
  url: URL;
  onNavigate: (path: string) => void;
  memory: DraftMemory;
  renderTasks?: (id: string) => ReactNode;
  renderJournals?: (project: ApiProject) => ReactNode;
  renderMilestones?: (id: string) => ReactNode;
};
export function ProjectTaskHeading({
  overview,
  projectId,
}: {
  overview: OverviewStore;
  projectId: string;
}) {
  const query = overview.query({ category: 'all', projectId });
  const state = useQuery(query);
  return (
    <div className="panel-heading">
      <h2 data-section-index="03 / TASKS">연결된 작업</h2>
      <p>
        전체 {state.data?.tasks.total ?? '—'}개 · 진행 중 {state.data?.tasks.doing ?? '—'}개 · 완료{' '}
        {state.data?.tasks.done ?? '—'}개
      </p>
      {state.status === 'error' && (
        <p role="alert">
          작업 집계를 불러오지 못했습니다.{' '}
          <Button onClick={() => query.invalidate()}>다시 시도</Button>
        </p>
      )}
    </div>
  );
}
export function ServerProjectsPage(props: Props) {
  const id = props.url.pathname.match(/^\/projects\/([^/]+)\/?$/)?.[1];
  return id ? (
    <ProjectDetailView
      category={(project) => <CategoryDisplay store={props.categories} id={project.categoryId} />}
      key={id}
      store={props.store}
      id={id}
      onBack={() => props.onNavigate('/projects' + props.url.search)}
      actions={(project, verified) => (
        <ProjectActions
          categories={props.categories}
          store={props.store}
          project={project}
          verified={verified}
          memory={props.memory}
          onSaved={() => {}}
        />
      )}
    >
      {(project) => (
        <>
          {props.renderMilestones?.(project.id)}
          {props.renderTasks?.(project.id)}
          {props.renderJournals?.(project)}
        </>
      )}
    </ProjectDetailView>
  ) : (
    <ServerProjectList {...props} />
  );
}
function ServerProjectList({ store, categories, overview, url, onNavigate, memory }: Props) {
  const [creating, setCreating] = useState(memory.editor?.target === 'create');
  const [managing, setManaging] = useState(!!memory.category && !memory.editor);
  const params = url.searchParams;
  const filter: ProjectFilter = {
    category: readCategoryFilter(params),
    status: params.get('archived') === 'true' ? 'archived' : 'active',
    query: params.get('q') ?? '',
  };
  const [search, setSearch] = useState(filter.query);
  const categoryState = useQuery(categories.list);
  const countersQuery = overview.query({ category: filter.category });
  const counters = useQuery(countersQuery);
  const handleFilter = (next: ProjectFilter) => {
    const query = new URLSearchParams();
    query.set('category', next.category);
    if (next.query) query.set('q', next.query);
    if (next.status === 'archived') query.set('archived', 'true');
    onNavigate('/projects' + (query.size ? '?' + query : ''));
  };
  useEffect(() => {
    if (search === filter.query) return;
    const timer = setTimeout(() => handleFilter({ ...filter, query: search }), 250);
    return () => clearTimeout(timer);
  }, [search, filter.category, filter.status, filter.query, onNavigate]);
  return (
    <ProjectsLayout
      archived={filter.status === 'archived'}
      onArchivedChange={(archived) =>
        handleFilter({ ...filter, status: archived ? 'archived' : 'active' })
      }
      onCreate={() => setCreating(true)}
      scaffold={{
        compact: true,
        title: '프로젝트',
        description: '프로젝트별 진행 상황과 연결된 작업을 확인하세요.',
        filters: (
          <div className="section-toolbar project-list-toolbar workbench-filter-toolbar">
            <div className="project-classification-actions">
              <CategoryFilterControl
                value={filter.category}
                options={categoryState.data?.items ?? []}
                onChange={(category) => handleFilter({ ...filter, category })}
              />
              <CategoryManagerButton onClick={() => setManaging(true)} />
            </div>
            <label className="search">
              <Search size={15} />
              <input
                aria-label="현재 화면 검색"
                placeholder="항목 검색"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>
        ),
        feedback: counters.status === 'error' && (
          <p className="notice" role="alert">
            집계를 불러오지 못했습니다.{' '}
            <Button onClick={() => countersQuery.invalidate()}>집계 다시 시도</Button>
          </p>
        ),
      }}
      editor={
        managing ? (
          <CategoryManager store={categories} memory={memory} onClose={() => setManaging(false)} />
        ) : (
          creating && (
            <ApiProjectEditor
              categories={categories}
              store={store}
              memory={memory}
              onClose={() => setCreating(false)}
              onSaved={(saved) => {
                memory.editor = undefined;
                setCreating(false);
                onNavigate('/projects/' + saved.id + url.search);
              }}
            />
          )
        )
      }
    >
      <ProjectListView
        store={store}
        filter={filter}
        counts={{
          projects:
            filter.status === 'archived'
              ? counters.data?.projects.archived
              : counters.data?.projects.total,
          doing: counters.data?.tasks.doing,
          done: counters.data?.tasks.done,
        }}
        onSelect={(selected) => onNavigate('/projects/' + selected + url.search)}
        onCreate={() => setCreating(true)}
        onReset={() => handleFilter({ ...filter, category: 'all', query: '' })}
      />
    </ProjectsLayout>
  );
}
