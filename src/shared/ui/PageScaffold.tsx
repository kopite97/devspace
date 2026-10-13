import type { ReactNode, Ref } from 'react';
import { useBlueprintPointer } from '../hooks/useBlueprintPointer';
import '../styles/page-heading.css';

export type PageScaffoldProps = {
  compact?: boolean;
  titleRef?: Ref<HTMLHeadingElement>;
  title: string;
  description: string;
  overview?: ReactNode;
  feedback?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function PageScaffold({
  compact = false,
  titleRef,
  title,
  description,
  overview,
  feedback,
  filters,
  actions,
  children,
}: PageScaffoldProps) {
  const blueprintRef = useBlueprintPointer();
  return (
    <>
      <div
        className={`page-heading ${compact ? 'page-heading-compact' : 'blueprint-surface'}`}
        ref={compact ? undefined : blueprintRef}
      >
        <div>
          {!compact && <div className="eyebrow">YOUR PERSONAL DEV SPACE</div>}
          <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined}>
            {title}
          </h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="page-heading-actions">{actions}</div>}
      </div>
      {overview}
      {feedback}
      {filters}
      {children}
    </>
  );
}
