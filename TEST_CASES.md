# Test Cases Specification

This document details the test strategy and test cases for **Prism Tracker**, covering both **API** procedures (oRPC / Elysia) and **UI** interactions (TanStack Router / Selenium).

---

## 1. API Test Cases

### 1.1 Workspaces (`workspaceRouter`)
| ID | Test Case | Description / Scenario | Input Data | Expected Result |
|---|---|---|---|---|
| **API-WS-01** | Create Workspace with valid input | User creates a workspace with a valid name, slug, and timezone. | `{ name: "Acme Corp", slug: "acme-corp", timezone: "UTC" }` | Returns created workspace object with cuid2 ID; seeds default issue statuses, priorities, built-in roles, default team, and workspace membership. |
| **API-WS-02** | Reject workspace creation with invalid slug | Slug contains invalid characters (e.g., spaces or uppercase). | `{ name: "Acme", slug: "Acme Corp!" }` | Validation error (`ZodError`): slug must match `/^[a-z0-9-]+$/`. |
| **API-WS-03** | Get Workspace by Slug | Authenticated user with `workspace:read` permission requests workspace by slug. | `{ slug: "acme-corp" }` | Returns workspace details matching slug. |
| **API-WS-04** | Get Workspace by Slug - Unauthorized / Not Found | User requests non-existent slug or lacks `workspace:read` permission. | `{ slug: "non-existent" }` | Throws `NOT_FOUND` error. |
| **API-WS-05** | Update Workspace | User with `workspace:update` permission updates workspace name. | `{ id: "ws-1", name: "Acme Updated" }` | Updates database record and returns updated workspace. |
| **API-WS-06** | Delete Workspace | User with `workspace:delete` permission deletes a workspace. | `{ id: "ws-1" }` | Workspace record removed from DB. |

---

### 1.2 Teams (`teamRouter`)
| ID | Test Case | Description / Scenario | Input Data | Expected Result |
|---|---|---|---|---|
| **API-TM-01** | Create Team | Create team within workspace using valid key and name. | `{ workspaceId: "ws-1", name: "Frontend Team", key: "FE" }` | Team created with `key` uppercased/validated against `/^[A-z0-9-]+$/`. Built-in team roles generated. |
| **API-TM-02** | Reject Invalid Team Key | Attempt to create team with illegal key (e.g., longer than 12 chars or invalid chars). | `{ workspaceId: "ws-1", name: "Engineering", key: "VERY_LONG_KEY_NAME" }` | Validation error: key max length 12 characters. |
| **API-TM-03** | List Teams for Workspace | Fetch all teams accessible to user in workspace. | `{ id: "ws-1" }` | Returns array of team objects. |

---

### 1.3 Issues (`issueRouter`)
| ID | Test Case | Description / Scenario | Input Data | Expected Result |
|---|---|---|---|---|
| **API-IS-01** | Create Issue | User with `issue:create` creates issue with title, team, and status. | `{ workspaceId: "ws-1", teamId: "team-1", statusId: "status-todo", title: "Fix header alignment" }` | Issue created with auto-incremented `number` for team, initial `sortOrder` lexorank, and activity logged (`issue.created`). |
| **API-IS-02** | Update Issue Title/Description | Update issue content. | `{ id: "issue-1", workspaceId: "ws-1", title: "Updated Title" }` | Updates fields, updates FTS/trigram search vectors, publishes `issue:changed` event. |
| **API-IS-03** | Move Issue Status (Lexorank Rebalancing) | Drag/move issue to new status column. | `{ id: "issue-1", workspaceId: "ws-1", statusId: "status-done" }` | Recalculates `sortOrder` at target status column top; triggers rebalance if ranks are exhausted. |
| **API-IS-04** | Parent Assignment - Hierarchy Validation | Assign a parent issue to create sub-issue. | `{ id: "sub-1", workspaceId: "ws-1", parentIssueId: "parent-1" }` | Validates parent belongs to same workspace & team. Checks tree depth <= 5. |
| **API-IS-05** | Parent Assignment - Prevent Loop | Attempt to set issue's parent to itself or a descendant. | `{ id: "parent-1", workspaceId: "ws-1", parentIssueId: "sub-1" }` | Throws `HIERARCHY_LOOP` error. |
| **API-IS-06** | Assign Closed Cycle Restriction | Attempt to assign issue to completed or canceled cycle. | `{ id: "issue-1", workspaceId: "ws-1", cycleId: "cycle-completed" }` | Throws `CYCLE_CLOSED` error. |

---

### 1.4 Cycles (`cycleRouter`)
| ID | Test Case | Description / Scenario | Input Data | Expected Result |
|---|---|---|---|---|
| **API-CY-01** | Create Cycle | Create cycle with start/end ISO date strings. | `{ workspaceId: "ws-1", teamId: "team-1", name: "Sprint 1", startDate: "2026-08-01T00:00:00Z", endDate: "2026-08-14T00:00:00Z" }` | Returns new cycle record in `upcoming` state. |
| **API-CY-02** | Cycle State Transition | Update cycle state from `upcoming` -> `active` -> `completed`. | `{ id: "cycle-1", workspaceId: "ws-1", state: "active" }` | Updates cycle state and records velocity metrics. |

---

## 2. UI Test Cases

### 2.1 Authentication & Auth Forms
| ID | Test Case | Description / Scenario | Target Route / Component | Expected Result |
|---|---|---|---|---|
| **UI-AUTH-01** | Auth Form Render | Navigate to `/auth` route. | `/auth` | Displays email input, password input, sign-in button, and sign-up toggle link. |
| **UI-AUTH-02** | Toggle Sign-In / Sign-Up Mode | Click sign-up toggle link on `/auth`. | `/auth` | Toggles form heading and submit button text between "Sign in" and "Sign up". Shows name input when in sign-up mode. |
| **UI-AUTH-03** | Auth Input Validation | Enter invalid email format or password under 8 characters. | `/auth` | Prevents submission and displays inline field validation error message. |
| **UI-AUTH-04** | Invalid Credentials Error State | Submit invalid login credentials. | `/auth` | Displays top-level form error banner (`.form-error` / `FieldError`) with error message from auth service. |
| **UI-AUTH-05** | Invite Token Query Handling | Navigate to `/auth?inviteToken=abc-123`. | `/auth` | Preserves invite token and redirects user to `/invite/abc-123` upon successful authentication. |

---

### 2.2 Workspace Navigation & Management
| ID | Test Case | Description / Scenario | Target Route / Component | Expected Result |
|---|---|---|---|---|
| **UI-WS-01** | Create Workspace Form Render | Navigate to `/workspace/create`. | `/workspace/create` | Displays workspace name input, workspace slug input, timezone input, and create workspace submission button. |
| **UI-WS-02** | Create Workspace Form Validation | Submit creation form with invalid slug format (e.g. spaces or uppercase). | `/workspace/create` | Displays field error indicating slug must match `/^[a-z0-9-]+$/`. |
| **UI-WS-03** | Workspace Dashboard Layout | Navigate to `/workspace/:slug`. | `/workspace/acme` | Displays workspace sidebar navigation (Issues, Cycles, Settings), team selector, and main content panel. |
| **UI-WS-04** | Workspace Selector Dropdown | Click workspace selector dropdown in sidebar. | `WorkspaceSidebar` | Displays list of user's workspaces; selecting a workspace navigates to `/workspace/:newSlug`. |
| **UI-WS-05** | Workspace Settings Navigation | Click settings items in sidebar (Members, Roles, Labels, Priorities). | `/workspace/:slug/settings/*` | Navigates to corresponding settings sub-route and updates active link state. |

---

### 2.3 Teams & Team Navigation
| ID | Test Case | Description / Scenario | Target Route / Component | Expected Result |
|---|---|---|---|---|
| **UI-TM-01** | Team Sidebar Group Render | View workspace sidebar with active teams. | `WorkspaceSidebar` | Displays "Your teams" section with team names and collapsable items for Issues and Cycles. |
| **UI-TM-02** | Toggle Team Sidebar Menu | Click collapsible team trigger header in sidebar. | `TeamSidebarMenuItem` | Toggles visibility of team sub-menu options (Issues, Cycles) with chevron icon animation. |
| **UI-TM-03** | Manage Teams Action Link | Click gear icon next to "Your teams" in sidebar header. | `/workspace/:slug/teams` | Navigates to workspace team management route. |

---

### 2.4 Issue Board & Detail Views
| ID | Test Case | Description / Scenario | Target Route / Component | Expected Result |
|---|---|---|---|---|
| **UI-IS-01** | Issue URL Generation | Generate URL for issue with/without explicit team key. | `buildIssueUrl` helper | Generates `/workspace/:slug/teams/:teamSlug/issue/:issueId`. |
| **UI-IS-02** | Issue List & Board Columns | View issues for selected team. | `/workspace/acme/teams/eng` | Displays kanban columns or list view categorized by status groups (Backlog, Todo, In Progress, Done). |
| **UI-IS-03** | Issue Status Column Drop Target | Drag issue card across kanban columns. | `/workspace/:slug/teams/:teamSlug/issues` | Updates issue status and rebalances `sortOrder` lexorank position in column. |
| **UI-IS-04** | Issue Filter & Search Controls | Enter search text or select status/priority filters. | `IssueFilters` component | Filters displayed issue list in real-time based on selected criteria. |

---

### 2.5 Cycles & Velocity Views
| ID | Test Case | Description / Scenario | Target Route / Component | Expected Result |
|---|---|---|---|---|
| **UI-CY-01** | Cycle List Route Render | Navigate to team cycles route. | `/workspace/:slug/teams/:teamSlug/cycles/` | Displays list of upcoming, active, and completed cycles with date ranges. |
| **UI-CY-02** | Active Cycle Progress Indicator | View active cycle item card. | `CycleCard` | Renders progress bar, completed issue count, and cycle end date countdown. |

---

## 3. Automation Test Suite Execution

- **API Unit Tests**: Executed via Bun Test: `nix develop --command bun test packages/api`
- **UI Unit Tests**: Executed via Vitest: `nix develop --command bun -F tss-web test:unit`
- **UI E2E Selenium Tests**: Executed via PyTest: `nix develop --command pytest tests/ui`
