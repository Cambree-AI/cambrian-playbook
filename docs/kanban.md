# Sprint / Kanban Estimation Scale (Fibonacci)

## Purpose

This estimation scale is intended to provide a consistent sizing framework for sprint and Kanban work items. Story points are based on **complexity + effort + uncertainty**, rather than direct time estimates.

Time ranges below are provided only as a calibration aid and should not be treated as commitments.

---

## Estimation Scale

| Points | Typical Time | Suggested Meaning |
|----------|-------------|-------------------|
| 1 | 15–60 min | Tiny change, typo, configuration tweak, simple update |
| 2 | 1–2 hours | Small isolated task with minimal risk |
| 3 | 2–4 hours | Small feature or straightforward bug fix |
| 5 | 4–8 hours | Half-day to one-day task with some unknowns |
| 8 | 1–2 days | Moderate feature or integration work |
| 13 | 2–3 days | Significant work spanning multiple components |
| 21 | 3–5 days | Large item with uncertainty; nearing split threshold |
| 34 | 5–7 days | Maximum desirable size for a single sprint item |

---

## Board Usage Guidelines

| Point Range | Guidance |
|-------------|----------|
| 0 | No estimate / administrative item |
| 1–8 | Ideal work size |
| 13–21 | Review for possible splitting |
| 34 | Must split unless exceptional |
| 55+ | Epic; do not place directly on sprint board |

---

## General Rules

- Story points represent:
  - Complexity
  - Engineering effort
  - Unknowns and risk
  - Dependencies

- Story points do **not** represent:
  - Exact hours
  - Calendar duration
  - Individual developer productivity

- Large items should be broken into smaller independently deliverable work.

- Items estimated at **21 points or greater** should trigger a discussion about decomposition.

- Items larger than **34 points** should be converted into epics and split before entering an active sprint.

---

## Example Estimates (RAG SaaS Project)

| Points | Example Task |
|----------|-------------|
| 1 | Change API timeout value |
| 2 | Add missing Swagger annotations |
| 3 | Fix Firebase login validation issue |
| 5 | Add new CRUD API endpoint |
| 8 | Implement bucket upload functionality with permissions |
| 13 | Add RBAC policy enforcement |
| 21 | Integrate graph search into document ingestion workflow |
| 34 | Multi-tenant authentication redesign |

---

## Long-Term Guidance

The initial time mapping exists only to establish consistency while estimating.

As the team completes multiple sprints:

1. Measure completed points per sprint
2. Determine average team velocity
3. Use velocity for planning
4. Stop relying on hour estimates

Over time, velocity becomes a stronger predictor than estimated hours.
