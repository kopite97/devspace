import { DashboardStore } from '../../features/dashboard/apiStore';
import { dashboardProjectOptions } from './dashboardProjectOptions';
import type { HomeMemory } from './dashboardHandoff';
import { ServerDashboardHome } from '../../pages/ServerDashboardHome';
import { LinkStore } from '../../features/links/apiStore';
import type { LinkMemory } from '../../features/links/draftMemory';
import { ServerLinksPage } from '../../pages/ServerLinksPage';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ProjectStore } from '../../features/projects/apiStore';
import { CategoryStore } from '../../features/projects/categoryStore';
import type { PrivateTransport } from '../../shared/http/transport';
import { ServerProjectsPage, ProjectTaskHeading } from '../../pages/ServerProjectsPage';
import type { DraftMemory } from '../../features/projects/draftMemory';
import { OverviewStore } from '../../features/overview/apiStore';
import { TaskStore } from '../../features/tasks/apiStore';
import { ServerTasksPage } from '../../pages/ServerTasksPage';
import { AuthenticatedLayout } from './AuthenticatedLayout';
import { taskProjectOptions } from './taskProjectOptions';
import type { TaskMemory } from '../../features/tasks/draftMemory';
import { ApiTaskManager } from '../../features/tasks/ApiTaskManager';
import { JournalStore } from '../../features/journal/apiStore';
import type { JournalMemory } from '../../features/journal/draftMemory';
import { journalProjectOptions } from './journalProjectOptions';
import { ServerJournalsPage } from '../../pages/ServerJournalsPage';
import { ApiProjectJournals } from '../../features/journal/ApiProjectJournals';
import { MilestoneStore } from '../../features/milestones/apiStore';
import { ApiMilestoneList } from '../../features/milestones/ApiMilestoneList';
import type { MilestoneMemory } from '../../features/milestones/draftMemory';
import { milestoneProjectOptions } from './milestoneProjectOptions';
import { readCategoryFilter, readProjectFilter } from '../../features/projects/categoryFilter';
import { useQuery } from '../../shared/http/query';
import { freshTransport } from '../../shared/http/freshTransport';
import { QueryManager } from '../../shared/http/queryManager';
import { DocumentStore } from '../../features/documents/store';
import type { DocumentMemory } from '../../features/documents/controller';
import { DocumentWorkspace } from '../../features/documents/DocumentWorkspace';
import { JournalDocuments } from '../../features/journal/documentCollection';
import { ServerJournalViewerPage } from '../../pages/ServerJournalViewerPage';
import { GitHubStore } from '../../features/github/store';
import { ProjectRepositories } from '../../features/github/ProjectRepositories';
import { GitHubPage } from '../../pages/GitHubPage';
export function PrivateWorkspace({
  transport: sessionTransport,
  url,
  onNavigate,
  memory,
  displayName,
  workspaceName,
  sessionControls,
  sessionError,
  sessionNotice,
  taskMemory,
  journalMemory,
  milestoneMemory,
  linkMemory,
  dashboardMemory,
  documentMemory,
}: {
  transport: PrivateTransport;
  url: URL;
  onNavigate: (path: string, replace?: boolean) => boolean;
  memory: DraftMemory;
  displayName: string;
  workspaceName: string;
  sessionControls: ReactNode;
  sessionError?: string;
  sessionNotice?: ReactNode;
  taskMemory: TaskMemory;
  journalMemory: JournalMemory;
  milestoneMemory: MilestoneMemory;
  linkMemory: LinkMemory;
  dashboardMemory: HomeMemory;
  documentMemory: DocumentMemory;
}) {
  const [transport] = useState(() =>
    freshTransport(sessionTransport, (paths) => {
      if (
        paths.some(
          (path) => path.startsWith('/api/v2/projects') && !path.includes('/category-counts'),
        )
      ) {
        options.invalidate();
        dashboardOptions.invalidate();
        journalOptions.invalidate();
        milestoneOptions.invalidate();
      }
    }),
  );
  const [dashboard] = useState(() => new DashboardStore(transport));
  const [links] = useState(() => new LinkStore(transport));
  const [queryManager] = useState(() => new QueryManager());
  const [github] = useState(() => new GitHubStore(transport, queryManager));
  const [documents] = useState(() => new DocumentStore(transport, queryManager));
  const [journalDocuments] = useState(() => new JournalDocuments(transport, queryManager));
  documents.onChanged = () => journalDocuments.invalidateDocuments();
  const [projects] = useState(() => new ProjectStore(transport, queryManager));
  const [categories] = useState(() => new CategoryStore(transport));
  const [overview] = useState(() => new OverviewStore(transport));
  const [tasks] = useState(() => new TaskStore(transport));
  const [journals] = useState(() => new JournalStore(transport));
  const [milestones] = useState(() => new MilestoneStore(transport));
  const [milestoneOptions] = useState(() => milestoneProjectOptions(projects));
  const [options] = useState(() => taskProjectOptions(projects));
  const [journalOptions] = useState(() => journalProjectOptions(projects));
  const [dashboardOptions] = useState(() => dashboardProjectOptions(projects));
  const categoryState = useQuery(categories.list);
  tasks.onInvalidate = () => {
    overview.invalidate();
    dashboard.invalidate();
  };
  tasks.onProtected = () => {
    overview.invalidate(true);
    dashboard.clearProtectedData();
    for (const memory of [taskMemory, ...Object.values(dashboardMemory.tasks)])
      if (memory.editor?.baseline && tasks.isProtected(memory.editor.baseline.id))
        memory.editor = undefined;
  };
  overview.onPartial = () => tasks.observePartial();
  dashboard.onPartial = () => tasks.observePartial();
  github.onChanged = () => {
    tasks.invalidate();
    overview.invalidate(true);
    dashboard.invalidate();
  };
  github.onProtected = (linkId) => {
    tasks.hideSources(linkId);
    if (
      taskMemory.editor?.baseline?.source &&
      (!linkId || taskMemory.editor.baseline.source.linkId === linkId)
    )
      taskMemory.editor = undefined;
    for (const memory of Object.values(dashboardMemory.tasks))
      if (
        memory.editor?.baseline?.source &&
        (!linkId || memory.editor.baseline.source.linkId === linkId)
      )
        memory.editor = undefined;
  };
  categories.onChanged = (kind) => {
    if (kind !== 'rename') projects.counts.invalidate();
    dashboard.invalidate();
  };
  dashboard.onSaved = () => {
    overview.invalidate();
    tasks.invalidate();
    journals.invalidate();
    milestones.invalidate();
    links.invalidate();
  };
  projects.onInvalidate = () => {
    links.invalidate();
    overview.invalidate();
    dashboard.invalidate();
    dashboardOptions.invalidate();
    options.invalidate();
    tasks.invalidate();
    journalOptions.invalidate();
    journals.invalidate();
    milestoneOptions.invalidate();
    milestones.invalidate();
  };
  journals.onInvalidate = () => {
    dashboard.invalidate();
    journalDocuments.invalidateJournals();
  };
  milestones.onInvalidate = () => dashboard.invalidate();
  links.onInvalidate = () => dashboard.invalidate();
  useEffect(() => {
    const handleFocus = () => queryManager.revalidate();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [queryManager]);
  const mounts = useRef(0);
  useEffect(() => {
    mounts.current++;
    return () => {
      mounts.current--;
      queueMicrotask(() => {
        if (!mounts.current) {
          dashboard.dispose();
          dashboardOptions.dispose();
          links.dispose();
          projects.dispose();
          queryManager.dispose();
          github.dispose();
          categories.dispose();
          overview.dispose();
          tasks.dispose();
          options.dispose();
          journals.dispose();
          journalOptions.dispose();
          milestones.dispose();
          milestoneOptions.dispose();
        }
      });
    };
  }, [
    dashboard,
    dashboardOptions,
    links,
    projects,
    queryManager,
    categories,
    overview,
    tasks,
    options,
    journals,
    journalOptions,
    milestones,
    milestoneOptions,
  ]);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const renderPage = () => {
    if (pathname === '/github' || pathname === '/github/connection-result')
      return (
        <GitHubPage
          store={github}
          result={
            pathname.endsWith('/connection-result') ? url.searchParams.get('github') : undefined
          }
          onProjects={() => onNavigate('/projects')}
        />
      );
    const journalMatch = pathname.match(
      /^\/journals\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
    );
    if (journalMatch)
      return (
        <ServerJournalViewerPage
          key={journalMatch[1]}
          id={journalMatch[1]}
          store={journalDocuments}
          onBack={() => onNavigate(documentMemory.returns[pathname] ?? '/journals')}
          onDocument={(id, editing) => {
            documentMemory.returns[id] = pathname;
            onNavigate(`/documents/${id}${editing ? '/edit' : ''}`);
          }}
        />
      );
    const documentMatch = pathname.match(
      /^\/documents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/edit)?$/,
    );
    if (documentMatch)
      return (
        <DocumentWorkspace
          key={pathname}
          id={documentMatch[1]}
          editing={!!documentMatch[2]}
          store={documents}
          memory={documentMemory}
          onNavigate={onNavigate}
        />
      );
    if (pathname === '/library')
      return (
        <div className="link-surface">
          <ServerLinksPage
            categories={categoryState.data?.items ?? []}
            options={dashboardOptions}
            store={links}
            overview={overview}
            memory={linkMemory}
            url={url}
            onFilterNavigate={(path) => onNavigate(path)}
          />
        </div>
      );
    if (pathname === '/tasks')
      return (
        <ServerTasksPage
          categories={categoryState.data?.items ?? []}
          store={tasks}
          overview={overview}
          options={options}
          memory={taskMemory}
          url={url}
          onFilterNavigate={(path) => onNavigate(path)}
        />
      );
    if (/^\/projects(?:\/[^/]+)?$/.test(pathname))
      return (
        <ServerProjectsPage
          categories={categories}
          key={url.pathname + url.search}
          store={projects}
          overview={overview}
          url={url}
          onNavigate={onNavigate}
          memory={memory}
          renderGitHub={(project) => (
            <ProjectRepositories
              store={github}
              project={project.id}
              archived={project.status === 'archived'}
              onAccount={() => onNavigate('/github')}
            />
          )}
          renderTasks={(id) => (
            <ApiTaskManager
              store={tasks}
              options={options}
              memory={taskMemory}
              filter={{ category: 'all', projectId: id, query: '', projectStatus: 'all' }}
              renderLayout={(action, content) => (
                <section className="task-surface content-panel" aria-label="프로젝트 작업">
                  <div className="project-section-toolbar">
                    <ProjectTaskHeading overview={overview} projectId={id} />
                    {action}
                  </div>
                  {content}
                </section>
              )}
            />
          )}
          renderJournals={(project) => (
            <ApiProjectJournals
              onOpenJournal={(id) => onNavigate(`/journals/${id}`)}
              store={journals}
              options={journalOptions}
              memory={journalMemory}
              project={{
                id: project.id,
                name: project.name,
                categoryId: project.categoryId,
                archived: project.status === 'archived',
              }}
            />
          )}
          renderMilestones={(id) => (
            <section className="content-panel milestone-surface" aria-label="프로젝트 마일스톤">
              <ApiMilestoneList
                renderHeader={(action) => (
                  <div className="project-section-toolbar">
                    <div className="panel-heading">
                      <h2 data-section-index="02 / MILESTONES">마일스톤</h2>
                    </div>
                    {action}
                  </div>
                )}
                store={milestones}
                options={milestoneOptions}
                memory={milestoneMemory}
                projectId={id}
                onNavigate={onNavigate}
              />
            </section>
          )}
        />
      );
    if (pathname === '/journals')
      return (
        <ServerJournalsPage
          documents={journalDocuments}
          onOpenJournal={(id) => onNavigate(`/journals/${id}`)}
          onDocumentCreated={(id, journalId) => {
            documentMemory.returns[id] = `/journals/${journalId}`;
            documentMemory.returns[`/journals/${journalId}`] = pathname + url.search;
            onNavigate(`/documents/${id}/edit`);
          }}
          categories={categoryState.data?.items ?? []}
          store={journals}
          options={journalOptions}
          memory={journalMemory}
          url={url}
          onFilterNavigate={(path) => onNavigate(path)}
        />
      );
    if (pathname === '/')
      return (
        <ServerDashboardHome
          categories={categoryState.data?.items ?? []}
          store={dashboard}
          options={dashboardOptions}
          memory={dashboardMemory}
          taskMemories={dashboardMemory.tasks}
          onFilterNavigate={(path) => onNavigate(path)}
          projects={projects}
          overview={overview}
          tasks={tasks}
          taskOptions={options}
          journals={journals}
          milestones={milestones}
          milestoneOptions={milestoneOptions}
          links={links}
          url={url}
          onNavigate={onNavigate}
        />
      );
    return (
      <div className="empty-state">
        <h3>Page not found</h3>
      </div>
    );
  };
  return (
    <AuthenticatedLayout
      url={url}
      onNavigate={onNavigate}
      projects={projects}
      categories={categories}
      displayName={displayName}
      workspaceName={workspaceName}
      sessionControls={sessionControls}
      sessionError={sessionError}
      sessionNotice={sessionNotice}
    >
      {(() => {
        try {
          readCategoryFilter(url.searchParams);
          if (pathname !== '/') readProjectFilter(url.searchParams);
        } catch (error) {
          return (
            <div className="notice" role="alert">
              <p>{error instanceof Error ? error.message : '개발 분야를 확인해 주세요.'}</p>
              <button
                className="button"
                onClick={() => {
                  const params = new URLSearchParams(url.search);
                  params.delete('scope');
                  params.delete('projectId');
                  params.set('category', 'all');
                  onNavigate(url.pathname + '?' + params);
                }}
              >
                전체 프로젝트 보기
              </button>
            </div>
          );
        }
        return renderPage();
      })()}
    </AuthenticatedLayout>
  );
}
