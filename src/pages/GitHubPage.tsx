import { PageScaffold } from '../shared/ui/PageScaffold';
import { AccountConnection } from '../features/github/AccountConnection';
import type { GitHubStore } from '../features/github/store';
export function GitHubPage({
  store,
  result,
  onProjects,
}: {
  store: GitHubStore;
  result?: string | null;
  onProjects: () => void;
}) {
  return (
    <PageScaffold
      title="GitHub 연동"
      description="계정을 연결하고 프로젝트의 Issue를 Task로 관리하세요."
    >
      <AccountConnection store={store} result={result} onProjects={onProjects} />
    </PageScaffold>
  );
}
