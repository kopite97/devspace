import { Flag } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '../../shared/ui/controls';
import { type Scope } from '../projects/scope';
import { type TaskPresentation as Task } from './presentation';
import { TaskSourceInfo } from './TaskSourceInfo';
export function TaskBoard({
  scope,
  tasks,
  onTaskChange,
  onEdit,
  columns,
  pending,
  readOnly,
}: {
  scope?: Scope;
  tasks: Task[];
  onTaskChange: (id: string, status: Task['status'], revision?: number) => void;
  onEdit?: (task: Task) => void;
  columns?: Partial<
    Record<
      Task['status'],
      { total?: number; footer?: ReactNode; hideEmpty?: boolean; emptyText?: string }
    >
  >;
  pending?: ReadonlySet<string>;
  readOnly?: boolean;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [target, setTarget] = useState<Task['status'] | null>(null);
  const filtered = scope && scope !== 'all' ? tasks.filter((t) => t.scope === scope) : tasks;
  return (
    <div className="task-board-container">
      <div className="kanban" role="region" aria-label="작업 보드 상태 열">
        {(['todo', 'doing', 'done'] as const).map((status, i) => (
          <div
            className={`kanban-column column-${status} ${target === status ? 'drop-target' : ''}`}
            key={status}
            onDragOver={(event) => {
              if (
                readOnly ||
                !dragged ||
                !event.dataTransfer.types.includes('application/x-devspace-task')
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = 'move';
              setTarget(status);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setTarget(null);
            }}
            onDrop={(event) => {
              if (readOnly || !dragged) return;
              event.preventDefault();
              event.stopPropagation();
              const task = filtered.find((t) => t.id === dragged);
              if (task && !task.source && task.status !== status && !pending?.has(task.id))
                onTaskChange(task.id, status, task.revision);
              setDragged(null);
              setTarget(null);
            }}
          >
            <div className="column-heading">
              <span className="status-dot" />
              {['할 일', '진행 중', '완료'][i]}
              <span className="count">
                {columns
                  ? (columns[status]?.total ?? '—')
                  : filtered.filter((t) => t.status === status).length}
              </span>
            </div>
            {filtered
              .filter((t) => t.status === status)
              .map((t) => (
                <article
                  className={`task ${dragged === t.id ? 'task-dragging' : ''}`}
                  key={t.id}
                  data-task-id={t.id}
                  draggable={!readOnly && !t.source && !pending?.has(t.id)}
                  aria-busy={pending?.has(t.id) || undefined}
                  onDragStart={(event) => {
                    if (readOnly || t.source) {
                      event.preventDefault();
                      return;
                    }
                    event.stopPropagation();
                    event.dataTransfer.setData('application/x-devspace-task', t.id);
                    event.dataTransfer.effectAllowed = 'move';
                    setDragged(t.id);
                  }}
                  onDragEnd={(event) => {
                    event.stopPropagation();
                    setDragged(null);
                    setTarget(null);
                  }}
                >
                  <small>{t.project}</small>
                  <TaskSourceInfo source={t.source} />
                  <h4>
                    {onEdit ? (
                      <button
                        className="task-title"
                        disabled={pending?.has(t.id)}
                        onClick={() => onEdit(t)}
                      >
                        {t.title}
                      </button>
                    ) : (
                      t.title
                    )}
                  </h4>
                  {(t.tag.trim() || t.priority === '높음') && (
                    <div className="task-meta">
                      {t.tag.trim() && (
                        <Badge
                          tone={t.tag === '버그' ? 'amber' : t.tag === '개선' ? 'blue' : 'neutral'}
                        >
                          {t.tag}
                        </Badge>
                      )}
                      {t.priority === '높음' && (
                        <span className="priority">
                          <Flag size={11} />
                          높음
                        </span>
                      )}
                    </div>
                  )}
                  <label className="task-status">
                    <span className="sr-only">{t.title} 상태</span>
                    <select
                      disabled={readOnly || !!t.source || pending?.has(t.id)}
                      value={t.status}
                      onChange={(e) => {
                        const next = e.target.value as Task['status'];
                        if (next !== t.status) onTaskChange(t.id, next, t.revision);
                      }}
                    >
                      <option value="todo">○ 할 일</option>
                      <option value="doing">◔ 진행 중</option>
                      <option value="done">✓ 완료</option>
                    </select>
                  </label>
                </article>
              ))}
            {!filtered.some((t) => t.status === status) && !columns?.[status]?.hideEmpty && (
              <p className="column-empty">{columns?.[status]?.emptyText ?? '아직 작업이 없어요'}</p>
            )}
            {columns?.[status]?.footer}
          </div>
        ))}
      </div>
    </div>
  );
}
