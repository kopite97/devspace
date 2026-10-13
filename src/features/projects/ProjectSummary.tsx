import { Badge, Progress } from '../../shared/ui/controls';
import { scopes } from './scope';
import type { ProjectPresentation } from './presentation';
import type { ReactNode } from 'react';
function repositoryHref(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function ProjectSummary({
  project,
  category,
}: {
  project: ProjectPresentation;
  category?: ReactNode;
}) {
  const href = repositoryHref(project.repositoryUrl);
  return (
    <section className="content-panel project-summary" aria-label="프로젝트 기본 정보">
      <div className="feature-actions">
        <Badge tone={project.archived ? 'neutral' : 'green'}>
          {project.archived ? '보관됨' : '진행 중'}
        </Badge>
        {project.scope && <Badge>{scopes[project.scope]}</Badge>}
      </div>
      <h2 data-section-index="01 / OVERVIEW">프로젝트 소개</h2>
      <p className="project-description">{project.subtitle || '설명 미등록'}</p>
      <dl className="project-facts">
        {category !== undefined && (
          <div className="project-category-fact">
            <dt>개발 분야</dt>
            <dd>{category}</dd>
          </div>
        )}
        <div className="project-stack-fact">
          <dt>기술 스택</dt>
          <dd>{project.stack}</dd>
        </div>
        <div className="project-goal-fact">
          <dt>프로젝트 목표 메모</dt>
          <dd>{project.milestone || '목표 미등록'}</dd>
        </div>
        <div className="project-progress-fact">
          <dt>진행률 (직접 설정)</dt>
          <dd>
            <span>{project.progress}%</span>
            <Progress value={project.progress} label={`${project.name} 진행률`} />
          </dd>
        </div>
        <div className="project-repository-fact">
          <dt>저장소</dt>
          <dd>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {project.repositoryUrl}
              </a>
            ) : (
              '저장소 미등록'
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
