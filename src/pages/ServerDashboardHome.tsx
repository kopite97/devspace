import { useState } from 'react';
import { Search } from 'lucide-react';
import { ApiDashboardWorkspace } from '../features/dashboard/ApiDashboardWorkspace';
import { homeWidget } from '../features/dashboard/homeProject';
import { WidgetDataContent } from './home/WidgetDataContent';
import type { DashboardStore } from '../features/dashboard/apiStore';
import type { DashboardMemory } from '../features/dashboard/draftMemory';
import type { DashboardProjectOptions } from '../features/dashboard/projectOptions';
import type { Widget } from '../features/dashboard/apiModel';
import type { ProjectStore } from '../features/projects/apiStore';
import type { OverviewStore } from '../features/overview/apiStore';
import type { TaskStore } from '../features/tasks/apiStore';
import type { TaskMemory } from '../features/tasks/draftMemory';
import type { TaskProjectOptions } from '../features/tasks/projectOptions';
import type { JournalStore } from '../features/journal/apiStore';
import type { MilestoneStore } from '../features/milestones/apiStore';
import type { MilestoneProjectOptions } from '../features/milestones/projectOptions';
import type { LinkStore } from '../features/links/apiStore';
import { selectionFilter, type CategoryOption } from '../features/projects/categoryFilter';
import { confirmNavigation } from '../shared/lib/navigationGuard';

type Props = {
  store: DashboardStore;
  categories: readonly CategoryOption[];
  memory: DashboardMemory;
  taskMemories: Record<string, TaskMemory>;
  options: DashboardProjectOptions;
  projects: ProjectStore;
  overview: OverviewStore;
  tasks: TaskStore;
  taskOptions: TaskProjectOptions;
  journals: JournalStore;
  milestones: MilestoneStore;
  milestoneOptions: MilestoneProjectOptions;
  links: LinkStore;
  url: URL;
  onNavigate: (path: string) => void;
  onFilterNavigate: (path: string) => void;
};
export function ServerDashboardHome(p: Props) {
  // Widget data is evaluated from its saved server configuration. Home-level
  // project/category overrides are intentionally not forwarded to Widget v1.
  const filter = 'all' as const;
  const search = p.url.searchParams.get('q') ?? '';
  const [editing, setEditing] = useState(!!p.memory.editor);
  const clearTasks = () => {
    for (const memory of Object.values(p.taskMemories)) memory.editor = undefined;
  };
  const reset = () => p.onFilterNavigate('/');
  const change = (action: () => void) => {
    if (confirmNavigation()) {
      clearTasks();
      action();
    }
  };
  const render = (configured: Widget) => {
    const w = homeWidget(configured);
    if (w.selectionState === 'missingCategory')
      return <p role="alert">사용할 수 없는 개발 분야입니다. 위젯 설정에서 다시 선택해 주세요.</p>;
    return (
      <WidgetDataContent
        store={p.store}
        tasks={p.tasks}
        projects={p.projects}
        widget={w}
        onNavigate={p.onNavigate}
      />
    );
  };
  return (
    <>
      <ApiDashboardWorkspace
        store={p.store}
        memory={p.memory}
        options={p.options}
        categories={p.categories}
        filter={filter}
        query={search}
        onEditingChange={setEditing}
        onStartEditing={() => {
          clearTasks();
          reset();
        }}
        onReset={() => change(reset)}
        renderWidget={render}
        onNavigate={p.onNavigate}
        widgetHref={(configured) => {
          const widget = homeWidget(configured);
          const selected = selectionFilter(widget.selection);
          if (widget.type === 'deploy' || widget.type === 'milestone') return undefined;
          if (widget.type === 'overview' && selected.projectId)
            return '/projects/' + selected.projectId;
          const path = {
            overview: '/projects',
            board: '/tasks',
            journal: '/journals',
            links: '/library',
          }[widget.type];
          const params = new URLSearchParams();
          if (selected.projectId) params.set('projectId', selected.projectId);
          if (selected.category) params.set('category', selected.category);
          return path + (params.size ? '?' + params : '');
        }}
        displaySelection={(widget) => homeWidget(widget).selection}
        scaffold={{
          compact: true,
          title: '다시 만나 반가워요 👋',
          description: '만들고 있는 것들, 오늘의 할 일. 여기서 이어가세요.',
          filters: (
            <div className="section-toolbar home-toolbar classification-toolbar">
              <label className="search">
                <Search size={15} />
                <input
                  aria-label="현재 화면 검색"
                  placeholder="위젯 검색"
                  disabled={editing}
                  value={search}
                  onChange={(event) =>
                    change(() => {
                      const params = new URLSearchParams(p.url.search);
                      if (event.target.value) params.set('q', event.target.value);
                      else params.delete('q');
                      p.onFilterNavigate('/' + (params.size ? '?' + params : ''));
                    })
                  }
                />
              </label>
            </div>
          ),
        }}
      />
    </>
  );
}
