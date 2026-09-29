import { ChevronRight, Home, Menu } from 'lucide-react';
import { Button } from '../../shared/ui/controls';
import type { ReactNode, Ref } from 'react';
export function TopbarView({
  page,
  projectId,
  avatar = 'N',
  onMenu,
  menuOpen,
  menuRef,
  accountMenu,
}: {
  page: string;
  projectId?: string;
  avatar?: string;
  onMenu: () => void;
  menuOpen: boolean;
  menuRef: Ref<HTMLButtonElement>;
  accountMenu?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <Button
          ref={menuRef}
          variant="ghost"
          className="mobile-menu"
          aria-label="메뉴 열기"
          aria-expanded={menuOpen}
          aria-controls="workspace-navigation"
          onClick={onMenu}
        >
          <Menu size={19} />
        </Button>
        <Home size={15} />
        <ChevronRight size={13} />
        <span>
          {page}
          {projectId ? ' / 상세' : ''}
        </span>
      </div>
      <div className="topbar-right">
        <span className="private-label">
          <span className="live-dot" />
          Personal workspace
        </span>
        <span className="topbar-divider" />
        {accountMenu ?? <span className="avatar avatar-small">{avatar}</span>}
      </div>
    </header>
  );
}
