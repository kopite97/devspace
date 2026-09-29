# BlockNote document editor

Status: accepted through PLAN-0025 execution approval (2026-09-23)

## Context

The document API stores opaque JSON arrays. The frontend needs nested blocks, formatting, file blocks, undo and a read-only rendering of the same content without converting existing Journal text.

## Decision

Use BlockNote core/react/mantine 0.55.0 with Mantine core/hooks 8.3.11, pinned in the lockfile. These packages support the installed React 19 version. Load the editor and its CSS through a dynamic import. Preserve application typography and scope custom styles to the document surface.

Document data, the attachment registry and serialized save controller belong to `features/documents`. Journal document collections belong to `features/journal`; application/page composition connects them. New reads use the workspace QueryManager with zero freshness, 60-second inactive retention and no focus refetch. Session retirement aborts requests; same-identity revalidation retains an in-memory draft and requires explicit reconciliation.

## Consequences

The editor adds a substantial lazy-loaded bundle, separate from the initial Journal list. Unknown block structures fail visibly and never trigger replacement with empty content. The backend is the attachment metadata authority; persisted blocks use stable authenticated same-origin URLs. A per-document serial queue prevents overlapping writes within an editor but does not provide cross-tab conflict detection.

See [PLAN-0025](../plans/PLAN-0025-journal-document-editor.md) and [the controller](../../src/features/documents/controller.ts).
