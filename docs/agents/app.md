# Application composition instructions

Applies to `src/app/` and all descendants, in addition to [source instructions](source.md). References to this directory mean `src/app/`.

- Use this directory for application bootstrap and top-level composition.
- Keep providers, routing setup, and application-wide configuration here.
- Do not place feature-specific business logic in this directory.
- Prefer composing features over implementing feature behavior directly.
- Application code here may depend on `features` and `shared`.

## Conventions

- Use named exports for application code.
- Use PascalCase for React component names and component files.
- Prefix custom hooks with `use`.
- Use camelCase for non-component modules, functions, and variables.
- Prefix boolean names with `is`, `has`, `can`, or `should` when applicable.
- Prefix callback props with `on` and internal event handlers with `handle`.
- Avoid `any`; use `unknown` and narrow the type when necessary.
- Avoid barrel files unless they intentionally define a module's public API.
- Write comments to explain why, not what.
