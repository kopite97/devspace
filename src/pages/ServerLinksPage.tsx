import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { PageScaffold } from '../shared/ui/PageScaffold';
import type { OverviewStore } from '../features/overview/apiStore';
import type { LinkStore } from '../features/links/apiStore';
import { ApiLinks } from '../features/links/ApiLinks';
import type { LinkMemory } from '../features/links/draftMemory';
import {
  readCategoryFilter,
  readProjectFilter,
  type CategoryFilter,
  type CategoryOption,
} from '../features/projects/categoryFilter';
import { ProjectFilter } from '../features/projects/ProjectFilter';
import { CategoryFilterControl } from '../features/projects/CategoryFilterControl';
import { confirmNavigation } from '../shared/lib/navigationGuard';
import type { LinkProjectOptions } from '../features/links/ProjectPicker';

export function ServerLinksPage({
  store,
  categories,
  options,
  memory,
  url,
  onFilterNavigate,
}: {
  store: LinkStore;
  options: LinkProjectOptions;
  overview: OverviewStore;
  memory: LinkMemory;
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
    onFilterNavigate('/library' + (params.size ? '?' + params : ''));
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
    <ApiLinks
      categories={categories}
      options={options}
      key={category + query + projectId}
      store={store}
      filter={{ category, projectId, query }}
      memory={memory}
      onReset={() => navigateFilter('all', '', '')}
      renderLayout={(action, content) => (
        <PageScaffold
          compact
          actions={action}
          title="자료실"
          description="프로젝트에 필요한 문서와 개발 도구를 모아 두세요."
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
          {content}
        </PageScaffold>
      )}
    />
  );
}
