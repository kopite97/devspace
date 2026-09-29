import { useState, type ReactNode } from 'react';
import { AppLayout } from '../layouts/AppLayout';
import { SidebarView } from '../layouts/SidebarView';
import { TopbarView } from '../layouts/TopbarView';
import { AccountMenu } from '../layouts/AccountMenu';
import { pagePaths, readLocation } from '../routes';
import type { ProjectStore } from '../../features/projects/apiStore';
import type { CategoryStore } from '../../features/projects/categoryStore';
import { useQuery } from '../../shared/http/query';

export function AuthenticatedLayout({
  url,
  onNavigate,
  projects,
  categories,
  children,
  displayName,
  workspaceName,
  sessionControls,
  sessionNotice,
  sessionError,
}: {
  url: URL;
  onNavigate: (path: string) => boolean;
  projects: ProjectStore;
  categories: CategoryStore;
  children: ReactNode;
  displayName: string;
  workspaceName: string;
  sessionControls: ReactNode;
  sessionNotice?: ReactNode;
  sessionError?: string;
}) {
  const [profile, setProfile] = useState(false);
  const state = useQuery(projects.counts);
  const categoryState = useQuery(categories.list);
  const location = readLocation(url);
  const avatar = Array.from(displayName)[0] ?? '';
  return (
    <AppLayout
      entryKey={url.pathname + url.search}
      detail={profile ? { title: displayName, body: workspaceName } : null}
      closeDetail={() => setProfile(false)}
      hasFooter={location.notFound || !location.pathname.startsWith('/documents/')}
      sessionNotice={sessionNotice}
      renderSidebar={(menu) => (
        <SidebarView
          mobileNav={menu.isOpen}
          menuRef={menu.menuRef}
          onNavigate={menu.close}
          page={location.page}
          avatar={avatar}
          displayName={displayName}
          workspaceName={workspaceName}
          navigate={(page) => {
            if (onNavigate(pagePaths[page])) menu.close();
          }}
          counts={{ all: state.data?.totals.active ?? '—' }}
          development={
            <>
              {(categoryState.data?.items ?? []).map((category) => (
                <button
                  key={category.id}
                  className="nav-item"
                  title={category.name}
                  onClick={() => {
                    if (onNavigate('/projects?category=' + category.id)) menu.close();
                  }}
                >
                  <span className="category-nav-name">{category.name}</span>
                  <span className="nav-count">
                    {state.data?.items.find((item) => item.categoryId === category.id)?.active ??
                      '—'}
                  </span>
                </button>
              ))}
              <button
                className="nav-item"
                onClick={() => {
                  if (onNavigate('/projects?category=uncategorized')) menu.close();
                }}
              >
                미분류
                <span className="nav-count">
                  {state.data?.items.find((item) => item.categoryId === null)?.active ?? '—'}
                </span>
              </button>
              {(state.status === 'error' || categoryState.status === 'error') && (
                <button
                  className="nav-item"
                  onClick={() => {
                    projects.counts.invalidate();
                    categories.list.invalidate();
                  }}
                >
                  개발 분야 다시 불러오기
                </button>
              )}
            </>
          }
          onProfile={() => {
            menu.close();
            setProfile(true);
          }}
        />
      )}
      renderTopbar={(menu) => (
        <TopbarView
          page={location.notFound ? 'Page not found' : location.page}
          projectId={location.projectId ?? undefined}
          avatar={avatar}
          onMenu={menu.open}
          menuOpen={menu.isOpen}
          menuRef={menu.triggerRef}
          accountMenu={
            <AccountMenu
              key={url.pathname + url.search}
              avatar={avatar}
              displayName={displayName}
              error={sessionError}
            >
              {sessionControls}
            </AccountMenu>
          }
        />
      )}
    >
      {children}
    </AppLayout>
  );
}
