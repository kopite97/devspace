import { Field } from '../../shared/ui/controls';
import { ProjectSelect } from '../projects/ProjectSelect';
import type { TaskDraft, TaskProjectOption } from './presentation';

export function TaskFields({
  form,
  change,
  projects,
  sourceManaged = false,
}: {
  form: TaskDraft;
  change: <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => void;
  projects: TaskProjectOption[];
  sourceManaged?: boolean;
}) {
  return (
    <div className="form-grid">
      <Field label="태스크 제목">
        <input
          required
          disabled={sourceManaged}
          maxLength={160}
          value={form.title}
          onChange={(e) => change('title', e.target.value)}
          autoFocus
        />
      </Field>
      <fieldset disabled={sourceManaged} className="task-fieldset">
        <ProjectSelect
          projects={projects}
          value={form.projectId}
          onChange={(id) => change('projectId', id)}
        />
      </fieldset>
      <Field label="상태">
        <select
          value={form.status}
          disabled={sourceManaged}
          onChange={(e) => change('status', e.target.value as TaskDraft['status'])}
        >
          <option value="todo">할 일</option>
          <option value="doing">진행 중</option>
          <option value="done">완료</option>
        </select>
      </Field>
      <Field label="우선순위">
        <select
          value={form.priority}
          onChange={(e) => change('priority', e.target.value as TaskDraft['priority'])}
        >
          <option value="보통">보통</option>
          <option value="높음">높음</option>
        </select>
      </Field>
      <Field label="태그">
        <input maxLength={40} value={form.tag} onChange={(e) => change('tag', e.target.value)} />
      </Field>
      <Field label="상세 내용">
        <textarea
          rows={5}
          disabled={sourceManaged}
          maxLength={10000}
          value={form.description}
          onChange={(e) => change('description', e.target.value)}
        />
      </Field>
    </div>
  );
}
