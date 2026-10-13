# Shared code instructions

Applies to `src/shared/` and all descendants, in addition to [source instructions](source.md). References to this directory mean `src/shared/`.

- Use this directory only for reusable, feature-agnostic code.
- Keep shared components, hooks, utilities, types, and infrastructure independent of application features.
- Do not place feature-specific business logic in this directory.
- Do not depend on `features` or `app`.
- Prefer small, composable abstractions over broad generic utilities.
