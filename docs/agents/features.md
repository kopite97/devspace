# Feature instructions

Applies to `src/features/` and all descendants, in addition to [source instructions](source.md). References to this directory mean `src/features/`.

- Organize code in this directory by user-facing feature.
- Keep each feature self-contained and focused on a single domain responsibility.
- Place feature-specific components, hooks, state, and API logic inside its feature boundary.
- Do not depend on other features directly unless the dependency is intentionally shared.
- Move reusable, feature-agnostic code to `shared`.
- Feature code may depend on `shared`, but must not depend on `app`.
