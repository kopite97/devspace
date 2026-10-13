# Source instructions

Applies to `src/` and all descendants. Follow the additional area instructions linked from the root `AGENTS.md` for the source paths being modified.

- Write application code in TypeScript.
- Keep React components and hooks focused on a single responsibility.
- Prefer simple and explicit code over premature abstraction.
- Do not introduce new dependencies unless the task requires them.
- Do not modify unrelated application behavior.

## Server query policy

- Follow [the server query policy guide](../guides/query-policy.md) when adding or changing server-state reads.
- Declare query identity, freshness policy, mutation invalidation targets, and session isolation checks. Reuse the shared query/transport infrastructure rather than creating component-local caches or direct network paths.
- PLAN-0022 proposes the managed query factory and automated enforcement; they are not implemented yet. After implementation, use that entry point for new reads and explicitly track remaining legacy exceptions. Do not silently apply Project TTL values to unrelated features.
