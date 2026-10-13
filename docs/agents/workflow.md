# Workflow

Applies to all repository work. Read this document before starting a task.

## Before Starting

- Identify the user's requested outcome, scope, and constraints from the current conversation.
- Before making changes, read and follow the [development and documentation guidelines](../AGENTS.md). Read every applicable instruction document in the root [instruction map](../../AGENTS.md), including any nested `AGENTS.md` files governing the affected paths.
- Apply all matching scopes cumulatively. Centralized source instructions govern their mapped source paths even though they are stored outside `src/`. More specific source-area instructions take precedence over common source instructions, and more deeply nested `AGENTS.md` files take precedence over broader instructions when they conflict.
- Use the plan-based workflow when the user requests a PLAN or the task continues an approved plan. Otherwise, use the workflow without a PLAN.
- Give the user's explicit instructions priority over repository workflow defaults. Carry forward authorization already given in the conversation.

## Work Without a PLAN

- Use the user's requirements as the basis for implementation and validation.
- Do not create a PLAN or require plan approval unless the user requests the plan-based workflow.
- Follow all applicable implementation and documentation instructions, even when no PLAN is required.
- Complete the requested work and the validation appropriate to the change. Report the outcome and any unresolved limitations.

## Work With a PLAN

- Before creating, updating, or implementing a PLAN, read the [plan instructions](../plans/PLANS.md) and the [plan registry](../plans/README.md). These documents define templates, approval requirements, status transitions, execution order, numbering, and completion rules.
- When the user requests a new PLAN, use the appropriate template and register it according to the plan instructions. A request to draft a PLAN does not by itself authorize implementation.
- Before implementation, establish which approved plan applies to the task and follow the existing activation rules. Use approval already provided in the conversation without requesting it again.
- During implementation, consult the applicable active plan's goal, scope, changes, validation, and completion criteria. Follow the implementation instructions for every affected path as well.
- Give the user's later explicit requirements priority and keep the plan aligned with authorized changes and material implementation differences.
- Keep plan records and registry status current according to the plan instructions. Complete the required validation before marking the plan complete.
- An active plan governs work within that plan's scope. Its existence does not make unrelated user requests part of the plan or require a PLAN for those requests.

## Instruction Maintenance

- Keep the root `AGENTS.md` focused on the required workflow entry point and instruction locations and scopes.
- Maintain common workflow and source instructions in `docs/agents/`. Keep detailed development procedures in `docs/guides/` and link to them instead of duplicating their rules.
- Update the root map and affected links whenever an instruction document moves or its scope changes.
