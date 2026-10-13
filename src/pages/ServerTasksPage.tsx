import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { PageScaffold } from '../shared/ui/PageScaffold';
import type { OverviewStore } from '../features/overview/apiStore';
import type { TaskStore } from '../features/tasks/apiStore';
import { ApiTaskManager } from '../features/tasks/ApiTaskManager';
import type { TaskProjectOptions } from '../features/tasks/projectOptions';
import type { TaskMemory } from '../features/tasks/draftMemory';
import {
  readCategoryFilter,
  readProjectFilter,
  type CategoryFilter,
  type CategoryOption,
} from '../features/projects/categoryFilter';
import { ProjectFilter } from '../features/projects/ProjectFilter';
import { CategoryFilterControl } from '../features/projects/CategoryFilterControl';
import { confirmNavigation } from '../shared/lib/navigationGuard';

export function ServerTasksPage({
  store,
  categories,
  options,
  memory,
  url,
  onFilterNavigate,
}: {
  store: TaskStore;
  overview: OverviewStore;
  options: TaskProjectOptions;
  memory: TaskMemory;
  categories: readonly CategoryOption[];
  url: URL;
  onFilterNavigate: (path: string) => void;
}) {
  const category = readCategoryFilter(url.searchParams);
  const projectId = readProjectFilter(url.searchParams);
  const query = url.searchParams.get('q') ?? '';
  const [search, setSearch] = useState(query);
  const navigateFilter = (
    nextCategory: CategoryFilter,
    nextQuery: string,
    nextProject = projectId,
  ) => {
    const params = new URLSearchParams(url.search);
    params.delete('scope');
    if (nextProject) params.set('projectId', nextProject);
    else params.delete('projectId');
    params.delete('q');
    params.set('category', nextCategory);
    if (nextQuery) params.set('q', nextQuery);
    onFilterNavigate('/tasks' + (params.size ? '?' + params : ''));
  };
  useEffect(() => setSearch(query), [query]);
  const changeFilter = (action: () => void) => {
    if (confirmNavigation()) {
      memory.editor = undefined;
      action();
    }
  };
  useEffect(() => {
    if (search === query) return;
    const timer = setTimeout(() => navigateFilter(category, search), 250);
    return () => clearTimeout(timer);
  }, [search, query, category, onFilterNavigate]);
  return (
    <ApiTaskManager
      store={store}
      options={options}
      memory={memory}
      onReset={() =>
        changeFilter(() => {
          setSearch('');
          navigateFilter('all', '', '');
        })
      }
      filter={{ category, projectId, query, projectStatus: 'all' }}
      renderLayout={(action, content) => (
        <PageScaffold
          compact
          actions={action}
          title="작업 보드"
          description="상태별로 작업을 확인하고 다음 할 일을 정하세요."
          filters={
            <div className="section-toolbar classification-toolbar workbench-filter-toolbar">
              <CategoryFilterControl
                value={category}
                options={categories}
                onChange={(value) => changeFilter(() => navigateFilter(value, search))}
              />
              <ProjectFilter
                options={options}
                value={projectId ?? ''}
                onChange={(value) => changeFilter(() => navigateFilter(category, search, value))}
              />
              <label className="search">
                <Search size={15} />
                <input
                  aria-label="현재 화면 검색"
                  placeholder="항목 검색"
                  value={search}
                  onChange={(event) => changeFilter(() => setSearch(event.target.value))}
                />
              </label>
            </div>
          }
        >
          <div className="content-panel task-page-content">{content}</div>
        </PageScaffold>
      )}
    />
  );
}
