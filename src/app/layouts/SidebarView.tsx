import { Code2, Settings2 } from 'lucide-react';
import { navigationItems as navItems, type PageId } from '../navigation';
import { Badge } from '../../shared/ui/controls';
import type { Ref, ReactNode } from 'react';
export function SidebarView({
  mobileNav,
  onNavigate,
  menuRef,
  page,
  navigate,
  editing = false,
  setFilter,
  counts,
  onProfile,
  avatar = 'N',
  displayName = 'My workspace',
  workspaceName = '나의 작업실',
  onScopeNavigate,
  development,
}: {
  mobileNav: boolean;
  onNavigate: () => void;
  menuRef: Ref<HTMLElement>;
  page: PageId;
  navigate: (page: PageId) => void;
  editing?: boolean;
  setFilter?: (scope: 'unity' | 'server') => void;
  counts: { all: number | string; unity?: number | string; server?: number | string };
  development?: ReactNode;
  onProfile: () => void;
  avatar?: string;
  displayName?: string;
  workspaceName?: string;
  onScopeNavigate?: (scope: 'unity' | 'server') => void;
}) {
  return (
    <aside
      ref={menuRef}
      id="workspace-navigation"
      role={mobileNav ? 'dialog' : undefined}
      aria-modal={mobileNav || undefined}
      aria-label="작업실 메뉴"
      className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}
    >
      {mobileNav && (
        <button className="button sidebar-close" onClick={onNavigate}>
          메뉴 닫기
        </button>
      )}
      <a
        className="brand"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          navigate('나의 홈');
        }}
      >
        <span className="brand-mark">
          <Code2 size={22} />
        </span>
        devspace<span className="brand-dot">.</span>
      </a>
      <div className="workspace-switch">
        <span className="avatar">{avatar}</span>
        <span>
          <strong title={workspaceName}>{workspaceName}</strong>
          <small>Personal workspace</small>
        </span>
        <Badge>개인</Badge>
      </div>
      <div className="nav-label">WORKSPACE</div>
      <nav>
        {navItems.map((item) => (
          <button
            className={`nav-item ${page === item.label ? 'active' : ''}`}
            key={item.label}
            aria-current={page === item.label ? 'page' : undefined}
            onClick={() => navigate(item.label)}
          >
            <item.icon size={18} />
            {item.label}
            {item.label === '프로젝트' && <span className="nav-count">{counts.all}</span>}
          </button>
        ))}
      </nav>
      <div className="nav-label area-label">DEVELOPMENT</div>
      {development ?? (
        <>
          <button
            className="nav-item"
            onClick={() => {
              if (onScopeNavigate) return onScopeNavigate('unity');
              navigate('프로젝트');
              if (!editing) setFilter?.('unity');
            }}
          >
            <span className="area-dot unity-dot" />
            Unity 개발
            <span className="nav-count">{counts.unity}</span>
          </button>
          <button
            className="nav-item"
            onClick={() => {
              if (onScopeNavigate) return onScopeNavigate('server');
              navigate('프로젝트');
              if (!editing) setFilter?.('server');
            }}
          >
            <span className="area-dot server-dot" />
            서버 · 웹 개발
            <span className="nav-count">{counts.server}</span>
          </button>
        </>
      )}
      <div className="sidebar-bottom">
        <button className="profile" onClick={onProfile}>
          <span className="avatar">{avatar}</span>
          <span>
            <strong title={displayName}>{displayName}</strong>
            <small>개인 개발 공간</small>
          </span>
          <Settings2 size={16} />
        </button>
      </div>
    </aside>
  );
}
