import { type Scope } from '../features/projects/scope';
import type { PageId } from './navigation';
export const pagePaths: Record<PageId, string> = {
  '나의 홈': '/',
  프로젝트: '/projects',
  '작업 보드': '/tasks',
  '개발 일지': '/journals',
  자료실: '/library',
};
export type WorkspaceLocation = {
  pathname: string;
  page: PageId;
  projectId: string | null;
  notFound: boolean;
  filter: Scope;
  query: string;
  showArchivedProjects: boolean;
};
export function readLocation(url: URL): WorkspaceLocation {
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const page = (Object.keys(pagePaths) as PageId[]).find((p) => pagePaths[p] === pathname);
  let projectId: string | null = null;
  const match = pathname.match(/^\/projects\/([^/]+)$/);
  if (match) {
    try {
      projectId = decodeURIComponent(match[1]) || null;
    } catch {
      /* Malformed paths show the not-found page. */
    }
  }
  const scope = url.searchParams.get('scope');
  const isDocument =
    /^\/(?:journals|documents)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/edit)?$/.test(
      pathname,
    );
  return {
    pathname,
    page: isDocument ? '개발 일지' : projectId ? '프로젝트' : (page ?? '나의 홈'),
    projectId,
    notFound: !page && !projectId && !isDocument,
    filter: scope === 'unity' || scope === 'server' ? scope : 'all',
    query: url.searchParams.get('q') ?? '',
    showArchivedProjects: url.searchParams.get('archived') === 'true',
  };
}
export function locationUrl(location: WorkspaceLocation): string {
  const params = new URLSearchParams();
  if (location.filter !== 'all') params.set('scope', location.filter);
  if (location.query) params.set('q', location.query);
  if (location.showArchivedProjects && location.page === '프로젝트') params.set('archived', 'true');
  return location.pathname + (params.size ? `?${params}` : '');
}
export function projectPath(id: string) {
  return `/projects/${encodeURIComponent(id)}`;
}
