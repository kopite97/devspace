import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { PageScaffold, type PageScaffoldProps } from '../../shared/ui/PageScaffold';
import { Button } from '../../shared/ui/controls';

export function ProjectsLayout({
  scaffold,
  archived,
  onArchivedChange,
  onCreate,
  children,
  editor,
  extraActions,
}: {
  scaffold: Omit<PageScaffoldProps, 'children' | 'actions'>;
  archived: boolean;
  onArchivedChange: (archived: boolean) => void;
  onCreate: () => void;
  children: ReactNode;
  editor?: ReactNode;
  extraActions?: ReactNode;
}) {
  const statusActions = (
    <div className={`feature-actions ${scaffold.compact ? 'project-status-actions' : ''}`}>
      <Button variant={!archived ? 'primary' : 'secondary'} onClick={() => onArchivedChange(false)}>
        현재 프로젝트
      </Button>
      <Button variant={archived ? 'primary' : 'secondary'} onClick={() => onArchivedChange(true)}>
        보관된 프로젝트
      </Button>
    </div>
  );
  return (
    <PageScaffold
      {...scaffold}
      filters={
        <>
          {scaffold.filters}
          {scaffold.compact && statusActions}
        </>
      }
      actions={
        <>
          {extraActions}
          <Button variant="primary" onClick={onCreate}>
            <Plus size={16} />
            프로젝트 추가
          </Button>
        </>
      }
    >
      <div className="content-panel">
        {!scaffold.compact && statusActions}
        {children}
      </div>
      {editor}
    </PageScaffold>
  );
}
