# Page composition instructions

Applies to `src/pages/` and all descendants, in addition to [source instructions](source.md). References to this directory mean `src/pages/`.

- Use this directory for page-level application composition.
- Compose pages from `features` and `shared` rather than implementing feature behavior directly.
- Keep business logic and feature-specific state inside the appropriate feature.
- Do not place reusable, feature-agnostic code in this directory.
- Page code may depend on `features` and `shared`, but must not depend on `app`.
