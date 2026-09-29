import type { AuthSession } from './session';
import type { DocumentMemory } from '../../features/documents/controller';
export function documentHandoff(session: AuthSession) {
  let identity: string | undefined;
  let memory: DocumentMemory = { returns: {} };
  const update = () => {
    const { state, busy } = session.getSnapshot();
    if (state.kind === 'authenticated' && !busy) {
      const next = state.identity.id + ':' + state.identity.workspace.id;
      if (identity !== next) {
        memory.draft = undefined;
        memory.returns = {};
        memory = { returns: {} };
      }
      identity = next;
    } else if (busy || state.kind === 'unauthenticated' || state.kind === 'disabled') {
      memory.draft = undefined;
      memory.returns = {};
      memory = { returns: {} };
      identity = undefined;
    }
  };
  session.subscribe(update);
  update();
  return () => memory;
}
