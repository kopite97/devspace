import { ChevronRight, Flag, Server } from 'lucide-react';
import { useState } from 'react';
import { useQuery, type Query } from '../../shared/http/query';
import { Button, EmptyState, Progress } from '../../shared/ui/controls';
import { TaskBoard } from '../../features/tasks/TaskBoard';
import { parseTask, taskPresentation } from '../../features/tasks/apiModel';
import type { TaskStore } from '../../features/tasks/apiStore';
import { useTaskStatusActions } from '../../features/tasks/useTaskStatusActions';
import type { TaskPresentation } from '../../features/tasks/presentation';
import { LinkRows } from '../../features/links/LinkRows';
import type { QuickLink } from '../../features/links/model';
import type { DashboardStore } from '../../features/dashboard/apiStore';
import type { Widget, WidgetDataEnvelope } from '../../features/dashboard/apiModel';
import {
  projectPresentation,
  serverProjectId,
  type ApiProject,
} from '../../features/projects/apiModel';
import type { ProjectList, ProjectStore } from '../../features/projects/apiStore';
import { selectionFilter } from '../../features/projects/categoryFilter';

type Props = {
  store: DashboardStore;
  tasks: TaskStore;
  projects: ProjectStore;
  widget: Widget;
  onNavigate: (path: string) => void;
};
type RecordData = Record<string, unknown>;

function record(value: unknown): RecordData | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordData)
    : undefined;
}
function records(value: unknown): RecordData[] {
  return Array.isArray(value) ? value.filter((item): item is RecordData => !!record(item)) : [];
}
function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}
function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function ProjectRows({
  items,
  limit,
  onNavigate,
}: {
  items: ReturnType<typeof projectPresentation>[];
  limit: number;
  onNavigate: (path: string) => void;
}) {
  const visible = items.slice(0, limit);
  if (!visible.length) return <EmptyState title="표시할 진행 중인 프로젝트가 없어요" />;
  return (
    <div className="project-list">
      {visible.map((project) => (
        <button
          className="project-row"
          key={project.id}
          onClick={() => onNavigate('/projects/' + encodeURIComponent(project.id))}
        >
          <span className={`project-icon ${project.color}`}>
            <Server size={22} />
          </span>
          <span className="project-info">
            <strong>{project.name}</strong>
            <small>
              {project.archived ? '보관됨 · ' : ''}
              {project.stack}
            </small>
          </span>
          <div className="project-progress">
            <span>{project.progress}%</span>
            <Progress value={project.progress} label={`${project.name} 진행률`} />
          </div>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}

function OverviewData({
  data,
  projects: projectStore,
  widget,
  onNavigate,
}: {
  data: RecordData;
  projects: ProjectStore;
  widget: Widget;
  onNavigate: (path: string) => void;
}) {
  const projects = records(data.projects);
  const active = projects.reduce((total, row) => total + number(row.active), 0);
  const archived = projects.reduce((total, row) => total + number(row.archived), 0);
  const tasks = record(data.tasks);
  const selected = selectionFilter(widget.selection);
  const query = selected.projectId
    ? projectStore.detail(serverProjectId(selected.projectId))
    : projectStore.list({ category: selected.category, status: 'active', query: '' });
  const projectState = useQuery<ProjectList | ApiProject>(query as Query<ProjectList | ApiProject>);
  const projectItems =
    projectState.data && 'items' in projectState.data
      ? projectState.data.items
      : projectState.data
        ? [projectState.data]
        : [];
  const limit = widget.limit ?? 3;
  return (
    <>
      <div className="stats">
        <div>
          <span>현재 프로젝트</span>
          <strong>
            {active}
            <small>개</small>
          </strong>
        </div>
        <div>
          <span>진행 중인 작업</span>
          <strong>
            {number(tasks?.doing)}
            <small>개</small>
          </strong>
        </div>
        <div>
          <span>완료한 작업</span>
          <strong>
            {number(tasks?.done)}
            <small>개</small>
          </strong>
        </div>
      </div>
      <p className="muted">보관된 프로젝트 {archived}개 · 전체 프로젝트 집계</p>
      {projectState.status === 'error' && !projectState.data && (
        <p className="notice" role="alert">
          프로젝트 목록을 불러오지 못했습니다.{' '}
          <Button onClick={() => query.invalidate()}>다시 시도</Button>
        </p>
      )}
      {(projectState.status === 'idle' || projectState.status === 'loading') &&
        !projectState.data && <p role="status">프로젝트 목록을 불러오는 중…</p>}
      {projectState.status === 'error' && projectState.data && (
        <p className="notice" role="alert">
          최신 프로젝트 목록을 확인하지 못했습니다.{' '}
          <Button onClick={() => query.invalidate()}>다시 시도</Button>
        </p>
      )}
      {projectState.data && (
        <ProjectRows
          items={projectItems.map(projectPresentation)}
          limit={limit}
          onNavigate={onNavigate}
        />
      )}
    </>
  );
}

function BoardData({
  data,
  onNavigate,
  tasks: taskStore,
  statusActions,
}: {
  data: RecordData;
  onNavigate: (path: string) => void;
  tasks: TaskStore;
  statusActions: ReturnType<typeof useTaskStatusActions>;
}) {
  const columns = records(data.columns);
  const tasks: TaskPresentation[] = columns.flatMap((column) =>
    records(column.items).flatMap((task) => {
      try {
        return [taskPresentation(parseTask(task))];
      } catch {
        return [];
      }
    }),
  );
  const stats = record(data.statistics);
  return (
    <>
      {statusActions.notice && (
        <p className="notice" role="alert">
          {statusActions.notice} <Button onClick={() => taskStore.invalidate()}>새로고침</Button>
        </p>
      )}
      <TaskBoard
        tasks={tasks}
        columns={Object.fromEntries(
          (['todo', 'doing', 'done'] as const).map((status) => [
            status,
            { total: number(stats?.[status]) },
          ]),
        )}
        onTaskChange={statusActions.status}
        pending={statusActions.pending}
        onEdit={(task) =>
          onNavigate('/tasks?projectId=' + encodeURIComponent(task.projectId ?? ''))
        }
      />
      {stats && <p className="muted">전체 {number(stats.total)}개 · 서버가 저장한 작업 보드</p>}
    </>
  );
}

function JournalData({
  data,
  onNavigate,
}: {
  data: RecordData;
  onNavigate: (path: string) => void;
}) {
  const items = records(data.items);
  if (!items.length) return <EmptyState title="개발일지가 없어요" />;
  return (
    <>
      <div className="journal-list">
        {items.map((item) => (
          <button
            key={text(item.id)}
            className="journal-row"
            onClick={() => onNavigate('/journals/' + encodeURIComponent(text(item.id)))}
          >
            <span className="journal-date">{text(item.entryDate)}</span>
            <span>
              <strong>{text(item.title)}</strong>
              <small>{text(item.projectName)}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
    </>
  );
}

function MilestoneData({
  data,
  onNavigate,
}: {
  data: RecordData;
  onNavigate: (path: string) => void;
}) {
  const items = records(data.items);
  if (!items.length) return <EmptyState title="표시할 마일스톤이 없어요" />;
  return (
    <div className="milestones milestone-surface">
      {items.map((item) => (
        <div className="milestone" key={text(item.id)}>
          <span className="milestone-icon">
            <Flag size={16} />
          </span>
          <div className="milestone-content">
            <button
              className="milestone-title"
              onClick={() => onNavigate('/projects/' + encodeURIComponent(text(item.projectId)))}
            >
              <small>{text(item.projectName)}</small>
              <strong>{text(item.title)}</strong>
            </button>
            <span className="muted">
              {item.completed ? '완료' : '진행 중'} · {text(item.dueDate) || '기한 없음'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function LinksData({ data }: { data: RecordData }) {
  const links: (QuickLink & { classification?: string })[] = records(data.items).map((item) => ({
    id: text(item.id),
    label: text(item.label),
    desc: text(item.description),
    url: text(item.url),
    scope: 'all',
  }));
  if (!links.length) return <EmptyState title="등록된 링크가 없어요" />;
  return <LinkRows links={links} filtered={false} />;
}

function Payload({
  envelope,
  projects,
  tasks,
  widget,
  onNavigate,
  statusActions,
}: {
  envelope: WidgetDataEnvelope;
  projects: ProjectStore;
  tasks: TaskStore;
  widget: Widget;
  onNavigate: (path: string) => void;
  statusActions: ReturnType<typeof useTaskStatusActions>;
}) {
  const data = record(envelope.data);
  if (!data) return <EmptyState title="표시할 데이터가 없어요" />;
  if (data.kind !== envelope.type)
    return (
      <p className="notice" role="alert">
        위젯 데이터 종류가 일치하지 않습니다.
      </p>
    );
  switch (envelope.type) {
    case 'overview':
      return (
        <OverviewData data={data} projects={projects} widget={widget} onNavigate={onNavigate} />
      );
    case 'board':
      return (
        <BoardData
          data={data}
          tasks={tasks}
          statusActions={statusActions}
          onNavigate={onNavigate}
        />
      );
    case 'journal':
      return <JournalData data={data} onNavigate={onNavigate} />;
    case 'milestone':
      return <MilestoneData data={data} onNavigate={onNavigate} />;
    case 'links':
      return <LinksData data={data} />;
    case 'deploy':
      return <EmptyState title="운영 데이터가 아직 연결되지 않았어요" />;
  }
}

export function WidgetDataContent({ store, tasks, projects, widget, onNavigate }: Props) {
  const query = store.widgetData(widget.id);
  const state = useQuery(query);
  const statusActions = useTaskStatusActions(tasks);
  if (state.status === 'error' && !state.data)
    return (
      <p className="notice" role="alert">
        위젯 데이터를 불러오지 못했습니다.{' '}
        <Button onClick={() => query.invalidate()}>다시 시도</Button>
      </p>
    );
  if ((state.status === 'idle' || state.status === 'loading') && !state.data)
    return <p role="status">위젯 데이터를 불러오는 중…</p>;
  if (!state.data) return null;
  if (
    state.data.widgetId !== widget.id ||
    state.data.type !== widget.type ||
    (widget.revision !== undefined && state.data.configRevision !== widget.revision) ||
    (widget.configVersion !== undefined && state.data.configVersion !== widget.configVersion)
  )
    return (
      <p className="notice" role="alert">
        위젯 데이터가 최신 설정과 맞지 않습니다.
      </p>
    );
  if (state.data.availability === 'unavailable' && state.data.problem?.code === 'NOT_CONFIGURED')
    return (
      <div className="muted">
        <p>아직 연동이 설정되지 않았어요.</p>
        <details>
          <summary>상태 정보</summary>
          <p>NOT_CONFIGURED</p>
        </details>
      </div>
    );
  if (state.data.availability === 'unavailable')
    return (
      <p className="notice" role="alert">
        이 위젯은 현재 사용할 수 없습니다.
        {state.data.problem ? ` (${state.data.problem.code})` : ''}
      </p>
    );
  if (state.data.availability === 'empty') return <EmptyState title="표시할 데이터가 없어요" />;
  return (
    <Payload
      envelope={state.data}
      projects={projects}
      tasks={tasks}
      widget={widget}
      statusActions={statusActions}
      onNavigate={onNavigate}
    />
  );
}
