# Project Brief

> Copy this file into a new project and replace every bracketed field. Do not treat assumptions as approved requirements.

## 1. Project identity
- Name: [project name]
- Owner / decision-maker: [owner]
- Purpose: [one-sentence outcome]
- Primary users: [user groups]
- Repository: [GitHub URL]
- Current production / preview URL: [URL or none]

## 2. Scope
### Included
- [capability and measurable outcome]

### Excluded
- [explicit non-goals]

## 3. Requirements and acceptance criteria
| ID | Requirement | Acceptance test | Priority |
|---|---|---|---|
| R-01 | [requirement] | [observable pass condition] | P0 |

## 4. Architecture
- Frontend: [stack]
- Backend/API: [stack or none]
- Data store: [existing project/resource; never assume a new one]
- Hosting: [approved host]
- External integrations: [provider, purpose, permission scope]
- Offline / accessibility / localization requirements: [details]

## 5. Constraints
- Budget and paid-service policy: [approved limits]
- Data residency / privacy: [requirements]
- Secrets handling: environment secret store only
- Production write/deploy approval: [who approves]
- Prohibited services or migrations: [list]

## 6. Security and privacy
- Data classification: [public / internal / personal / sensitive]
- Minimum data collected: [fields]
- Authentication and authorization: [design]
- Retention and deletion: [policy]
- Threats and abuse limits: [rate limits, validation, logging]

## 7. Delivery plan
| Phase | Deliverable | Dependencies | Verification |
|---|---|---|---|
| 0 — Discovery | Current-state audit | Access to repo | Findings documented |
| 1 — Foundation | Branch, tests, docs | Approved scope | CI green |
| 2 — MVP | Minimum user flow | Foundation | Acceptance tests |
| 3 — Hardening | Security/performance/accessibility | MVP | Regression checks |
| 4 — Release | PR and release notes | Owner approval | Post-release smoke test |

## 8. Decision log
| Date | Decision | Rationale | Approved by |
|---|---|---|---|
| [date] | [decision] | [reason] | [owner] |

## 9. Risks and open questions
- [risk, impact, mitigation]
- [question that blocks implementation]
