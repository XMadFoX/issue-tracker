# Test Cases Specification

This document details the test strategy and test cases for **Prism Tracker**, covering both **API** procedures (oRPC / Elysia) and **End-to-End (E2E) UI** interactions (TanStack Router / Playwright in TypeScript).

---

## QA Automation Stack & Architecture

- **Language & Runtime**: TypeScript (Strict Mode, ESM), Bun runtime
- **E2E Test Runner & Browser Automation**: [Playwright](https://playwright.dev/) (`@playwright/test`) configured in `apps/e2e/playwright.config.ts` with custom test fixture extensions (`test.extend<CustomFixtures>`)
- **Design Pattern**: Page Object Model (POM) under `apps/e2e/pages/` separating locator logic from test assertions
- **Test Fixtures & Teardown**: `apps/e2e/fixtures/test.ts` injecting isolated test pages, authenticated contexts, and database lifecycle management (`apps/e2e/fixtures/db.ts`)
- **Locator Strategy**: Prioritize accessible, user-facing role locators (`getByRole`, `getByLabel`, `getByText`, `getByPlaceholder`) over brittle CSS/XPath selectors
- **Execution Environment**: Nix flake (`flake.nix`) providing browser binaries via `PLAYWRIGHT_BROWSERS_PATH`

---

## 1. API Test Cases

API tests validate the typed oRPC procedures exposed by Elysia/oRPC backend packages.

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

## 2. UI End-to-End Test Cases (Playwright)

All UI tests run in `apps/e2e` using TypeScript, Playwright page abstractions, and `@playwright/test` runner.

### 2.1 Authentication & Auth Forms
- **Target Spec**: `apps/e2e/tests/auth.spec.ts`
- **Page Object**: `AuthPage` (`apps/e2e/pages/auth.page.ts`)

| ID | Test Case | Description / Scenario | Target Route / Component | Locators & Expected Result |
|---|---|---|---|---|
| **UI-AUTH-01** | Auth Form Render | Navigate to `/auth` route. | `/auth` | `getByRole("textbox", { name: /email/i })`, password input, and `getByRole("button", { name: "Sign In" })` are visible. Mode toggle button visible. Sign-up-only fields (name input) remain hidden. |
| **UI-AUTH-02** | Toggle Sign-In / Sign-Up Mode | Click sign-up toggle button on `/auth`. | `/auth` | Toggles submit button text between "Sign In" and "Sign Up". `nameInput` (`getByRole("textbox", { name: /name/i })`) is visible in sign-up mode and hidden when switching back. |
| **UI-AUTH-03** | Auth Input Validation | Enter invalid email format or password under 8 characters. | `/auth` | Form submission is prevented; client-side or inline error message (`getByRole("alert")`) is displayed indicating validation failure. |
| **UI-AUTH-04** | Invalid Credentials Error State | Submit unauthenticated/incorrect login credentials. | `/auth` | Top-level alert banner (`getByRole("alert")`) renders auth failure message from service. |
| **UI-AUTH-05** | Invite Token Query Handling | Navigate to `/auth?inviteToken=abc-123`. | `/auth` | Preserves `inviteToken` query parameter in state and redirects to `/invite/abc-123` upon successful authentication. |

---

### 2.2 Workspace Navigation & Management
- **Target Spec**: `apps/e2e/tests/workspace.spec.ts`
- **Page Object**: `WorkspacePage` (`apps/e2e/pages/workspace.page.ts`)

| ID | Test Case | Description / Scenario | Target Route / Component | Locators & Expected Result |
|---|---|---|---|---|
| **UI-WS-01** | Create Workspace Form Render | Navigate to `/workspace/create`. | `/workspace/create` | Workspace name input, slug input, timezone selector, and submit button are visible. |
| **UI-WS-02** | Create Workspace Form Validation | Submit creation form with invalid slug format (spaces or uppercase). | `/workspace/create` | Inline field error displays message indicating slug must match `/^[a-z0-9-]+$/`. |
| **UI-WS-03** | Workspace Dashboard Layout | Navigate to `/workspace/:slug`. | `/workspace/$slug` | Sidebar navigation renders with Links to Issues, Cycles, Settings, and active workspace title. |
| **UI-WS-04** | Workspace Selector Dropdown | Click workspace selector dropdown in sidebar. | `WorkspaceSidebar` | Popover displays list of accessible workspaces; selecting an item navigates to `/workspace/:newSlug`. |
| **UI-WS-05** | Workspace Settings Navigation | Click settings navigation links (Members, Roles, Labels, Priorities). | `/workspace/:slug/settings/*` | Navigates to corresponding settings sub-route and applies active state styling to sidebar link. |

---

### 2.3 Teams & Team Management
- **Target Spec**: `apps/e2e/tests/teams.spec.ts`
- **Page Object**: `TeamPage` (`apps/e2e/pages/team.page.ts`)

| ID | Test Case | Description / Scenario | Target Route / Component | Locators & Expected Result |
|---|---|---|---|---|
| **UI-TM-01** | Team Sidebar Group Render | View workspace sidebar with active teams. | `WorkspaceSidebar` | "Your teams" section renders with team names and nested navigation links (Issues, Cycles). |
| **UI-TM-02** | Team Sub-Menu Navigation Routing | Click "Issues" or "Cycles" link under team in sidebar. | `TeamSidebarMenuItem` | URL updates to `/workspace/:slug/teams/:teamSlug/issues` (or `/cycles`), loads view, and highlights team menu item. |
| **UI-TM-03** | Manage Teams Action Link | Click gear icon next to "Your teams" in sidebar header. | `/workspace/:slug/teams` | Navigates to workspace team list route with team management table and create team button. |
| **UI-TM-04** | Create Team Modal Render | Click "+ Create team" button. | `TeamCreateModal` | Modal dialog opens (`getByRole("dialog")`) with team name input, key input, and submit button. |
| **UI-TM-05** | Create Team Submission | Enter valid team name (e.g. "Frontend") and key (e.g. "FE"). | `TeamCreateForm` | Team is created via API, dialog closes, and sidebar updates dynamically with the new team. |
| **UI-TM-06** | Create Team Key Validation | Enter invalid team key (>12 chars or special chars). | `TeamCreateForm` | Inline validation error displays key constraints (max 12 alphanumeric characters). |
| **UI-TM-07** | Team Cycle Settings | Navigate to team cycle settings. | `/workspace/:slug/teams/:teamSlug/settings/cycles` | Form controls for default cycle duration, auto-start, and auto-archive are rendered and interactive. |

---

### 2.4 Issue Board & Detail Views
- **Target Spec**: `apps/e2e/tests/issues.spec.ts`
- **Page Object**: `IssueBoardPage`, `IssueDetailPage` (`apps/e2e/pages/issue.page.ts`)

| ID | Test Case | Description / Scenario | Target Route / Component | Locators & Expected Result |
|---|---|---|---|---|
| **UI-IS-01** | Issue Board / List Route Render | Navigate to team issues page. | `/workspace/:slug/teams/:teamSlug/issues` | Columns for Backlog, Todo, In Progress, Done, and Canceled render with issue count badges and header controls. |
| **UI-IS-02** | Toggle Kanban vs List View | Click view mode toggle button in header. | `IssueViewHeader` | Layout toggles between Kanban board columns and compact table list view (`role="table"`). |
| **UI-IS-03** | Create Issue Modal Render | Click "+ New issue" button or trigger shortcut (`C`). | `IssueCreateModal` | Modal dialog opens (`getByRole("dialog")`) with title input, description editor, and attribute select dropdowns. |
| **UI-IS-04** | Create Issue Submission | Fill title and select status/priority, click "Create issue". | `IssueCreateForm` | Submits form, closes modal, and verifies new issue card (e.g., `FE-1`) is rendered in target status column. |
| **UI-IS-05** | Create Issue Form Validation | Submit creation form without entering a title. | `IssueCreateForm` | Submission is blocked; inline error is displayed below the title field. |
| **UI-IS-06** | Kanban Drag & Drop Status Update | Drag issue card from "Todo" to "In Progress" column. | `IssueBoardColumn` | Uses Playwright `locator.dragTo()` to drop card; issue moves to target column and status updates via API. |
| **UI-IS-07** | Real-Time Issue Text Search | Type search query into issue filter bar. | `IssueFilters` | Issue cards filter dynamically to show only items matching title, description, or key query. |
| **UI-IS-08** | Filter Issues by Status / Priority / Label | Select filter options from dropdown popovers. | `IssueFilters` | Only issues matching all filter criteria remain visible; active filter chips with remove buttons are rendered. |
| **UI-IS-09** | Grouping & Sorting Controls | Change group-by selector (e.g. Assignee, Priority) or sort order. | `IssueViewOptions` | Board columns and list groupings re-render according to selected group-by criterion. |
| **UI-IS-10** | Issue Detail View Render | Navigate to issue detail route. | `/workspace/:slug/teams/:teamSlug/issue/:issueId` | Detail page displays issue title, description, property sidebar, sub-issues section, and activity timeline. |
| **UI-IS-11** | Edit Issue Title & Description | Click to edit title or description in detail view. | `IssueDetail` | In-place editor activates; changes auto-save on blur and reflect in page title and breadcrumb. |
| **UI-IS-12** | Update Meta Attributes via Property Bar | Update status, priority, assignee, or cycle in property bar. | `IssuePropertyBar` | Dropdown change triggers immediate update; new attribute displays and change is logged in activity stream. |
| **UI-IS-13** | Sub-Issue (Child) Hierarchy Management | Click "Add sub-issue" in issue detail view and link/create child. | `AddSubIssueDialog` | Child issue appears in sub-issues hierarchy tree with correct nesting depth indicator (max 5 levels). |
| **UI-IS-14** | Issue Comments & Activity Stream | Type comment in activity section and click "Comment". | `IssueActivitySection` | New comment item appends to activity timeline with user avatar, timestamp, and content. |
| **UI-IS-15** | Delete Issue Action | Select "Delete issue" from issue action menu and confirm dialog. | `IssueDetailHeader` | Deletion confirmation removes issue, displays toast notification, and redirects back to team issues route. |

---

### 2.5 Cycles & Sprint Planning
- **Target Spec**: `apps/e2e/tests/cycles.spec.ts`
- **Page Object**: `CyclePage` (`apps/e2e/pages/cycle.page.ts`)

| ID | Test Case | Description / Scenario | Target Route / Component | Locators & Expected Result |
|---|---|---|---|---|
| **UI-CY-01** | Cycle List Route Render | Navigate to team cycles page. | `/workspace/:slug/teams/:teamSlug/cycles/` | Active, Upcoming, and Completed cycle sections/tabs are displayed with date ranges. |
| **UI-CY-02** | Create Cycle Modal & Submission | Click "Create cycle", fill name and ISO date range. | `CycleFormDialog` | Validates date ranges, creates cycle in "upcoming" state, and appends card to cycle list. |
| **UI-CY-03** | Active Cycle Progress & Velocity Metrics | View active cycle card. | `CycleCard` / `CycleMetricsCard` | Renders burn-down progress bar, remaining vs completed issue points count, and countdown indicator. |
| **UI-CY-04** | Assign Issue to Active Cycle | Select cycle from issue property dropdown or drag issue into cycle. | `IssueCycleSelect` | Updates cycle association on issue; cycle scope metrics recalculate. |
| **UI-CY-05** | Cycle State Transition & Complete Cycle Dialog | Click "Complete cycle" on active cycle. | `CycleCompleteDialog` | Modal prompts for rollover of unfinished issues (move to backlog or next cycle); state transitions to "completed". |

---

### 2.6 Command Palette & Navigation Shortcuts
- **Target Spec**: `apps/e2e/tests/command-palette.spec.ts`
- **Page Object**: `CommandPalettePage` (`apps/e2e/pages/command-palette.page.ts`)

| ID | Test Case | Description / Scenario | Target Route / Component | Locators & Expected Result |
|---|---|---|---|---|
| **UI-CMD-01** | Command Palette Render | Press `Meta+K` / `Control+K` keyboard shortcut or click search button. | `SearchPaletteDialog` | Search overlay modal (`getByRole("dialog")`) appears with auto-focused search input. |
| **UI-CMD-02** | Command Palette Search & Navigation | Type search query (issue key, team name, setting) and press `Enter`. | `SearchPalette` | List items filter in real-time; selecting a match navigates immediately to the selected route. |

---

### 2.7 Workspace Settings & Administration
- **Target Spec**: `apps/e2e/tests/settings.spec.ts`
- **Page Object**: `SettingsPage` (`apps/e2e/pages/settings.page.ts`)

| ID | Test Case | Description / Scenario | Target Route / Component | Locators & Expected Result |
|---|---|---|---|---|
| **UI-SET-GEN-01** | General Settings Render & Update | Navigate to `/workspace/:slug/settings/general`. | `WorkspaceSettingsGeneral` | Displays workspace name, slug, and timezone fields; saving updates workspace properties and shows toast. |
| **UI-SET-GEN-02** | Workspace Deletion Flow | In general settings Danger Zone, enter slug and confirm deletion. | `WorkspaceSettingsGeneral` | Workspace is deleted from database; browser redirects to `/workspace/create`. |
| **UI-SET-MEM-01** | Workspace Members List View | Navigate to `/workspace/:slug/settings/members`. | `WorkspaceMembersView` | Table renders active workspace members, email addresses, assigned roles, and pending invites tab. |
| **UI-SET-MEM-02** | Invite Workspace Member | Click "Invite member", enter recipient email, and select role. | `InviteMemberModal` | Creates pending invite record, generates invitation link, and displays success toast. |
| **UI-SET-MEM-03** | Change Member Role & Revoke Membership | Change role dropdown or click "Remove member" action. | `WorkspaceMembersView` | Updates membership role in real-time or removes member following confirmation dialog. |
| **UI-SET-ROL-01** | Roles & Permissions Matrix Render | Navigate to `/workspace/:slug/settings/roles`. | `WorkspaceRolesView` | Lists built-in (Owner, Admin, Member) and custom roles with granular permission toggle checkboxes. |
| **UI-SET-ROL-02** | Create & Edit Custom Role | Click "Create role", fill name/description, select permissions. | `WorkspaceRoleModal` | Custom role is saved, added to role list, and becomes assignable in members view. |
| **UI-SET-WF-01** | Workflow Statuses Management View | Navigate to `/workspace/:slug/settings/workflow`. | `IssueStatusesView` | Displays status categories (Backlog, Todo, In Progress, Done, Canceled) with existing workflow statuses. |
| **UI-SET-WF-02** | Create Custom Workflow Status | Click "Add status", enter name, choose color and status category. | `StatusCreateModal` | Adds new status to workflow category; status becomes selectable on issues and boards. |
| **UI-SET-LBL-01** | Labels List & Create Modal | Navigate to `/workspace/:slug/settings/labels`. | `LabelList` | Displays label list with color chips; "Create label" dialog allows adding new label with hex color. |
| **UI-SET-LBL-02** | Edit & Delete Label | Click edit/delete icon on label table row. | `LabelFormModal` | Updates label details or removes label after confirming deletion. |
| **UI-SET-PRI-01** | Priorities Management View | Navigate to `/workspace/:slug/settings/priorities`. | `IssuePrioritiesView` | Displays system and custom priority levels (Urgent, High, Medium, Low, None) with order controls. |
| **UI-SET-TYP-01** | Issue Types Management View | Navigate to `/workspace/:slug/settings/issue-types`. | `IssueTypesView` | Displays list of issue types (Task, Bug, Feature, Improvement); allows editing name and icon. |

---

### 2.8 Workspace Invitations & Member Onboarding
- **Target Spec**: `apps/e2e/tests/invite.spec.ts`
- **Page Object**: `InvitePage` (`apps/e2e/pages/invite.page.ts`)

| ID | Test Case | Description / Scenario | Target Route / Component | Locators & Expected Result |
|---|---|---|---|---|
| **UI-INV-01** | Invite Token Link Page Render | Navigate to `/invite/:token` as authenticated user. | `/invite/$token` | Renders invitation card with workspace name, inviter details, and "Accept Invitation" button. |
| **UI-INV-02** | Accept Invitation Flow | Click "Accept Invitation" button on invite page. | `/invite/$token` | Membership is created; user is redirected to `/workspace/:slug` with welcome toast. |
| **UI-INV-03** | Invalid or Expired Token Error State | Navigate to `/invite/invalid-token-code`. | `/invite/$token` | Error alert banner displays indicating invitation is expired or invalid, with link to home. |

---

## 3. Automation Test Suite Execution

### 3.1 E2E Tests (Playwright)
All E2E tests reside in `apps/e2e` and are executed via Bun and Playwright:

| Action | Command | Notes |
|---|---|---|
| **Run all E2E tests (headless)** | `bun test:e2e` | Runs Playwright tests across configured browsers (`firefox` default in Nix) |
| **Run E2E tests with UI** | `bun test:e2e:ui` | Opens interactive Playwright UI mode |
| **Run E2E tests in headed browser** | `bun test:e2e:headed` | Opens headed browser automation in real-time |
| **Open Playwright HTML Report** | `bun test:e2e:report` | Opens generated Playwright HTML test report |
| **Run specific test file** | `bun -F e2e test tests/auth.spec.ts` | Executes tests matching specific spec |

### 3.2 Unit & Integration Tests (Bun Test)
Developer unit tests reside inside package and app source trees:

| Action | Command | Scope |
|---|---|---|
| **All Unit / Integration Tests** | `bun test:unit` | Runs `bun test` across packages and apps |
| **API Procedure Tests** | `bun test packages/api` | Tests oRPC routers and validation logic |
| **Frontend Component Tests** | `bun -F tss-web test` | Runs developer unit tests for UI components |

### 3.3 Nix & Browser Environment
When running inside NixOS or Nix develop shell:
- `PLAYWRIGHT_BROWSERS_PATH`: Automatically provided by `flake.nix` pointing to `pkgs.playwright-driver.browsers`
- `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true`: Bypasses standard Linux OS distribution checks
- Command with Nix wrapper:
  ```bash
  nix develop --command bun test:e2e
  ```

---

## 4. Test Implementation Pattern (Reference)

All UI tests follow the Page Object Model (POM) pattern with custom Playwright fixtures:

```typescript
// apps/e2e/tests/auth.spec.ts
import { expect, test } from "../fixtures/test";

test.describe("Authentication - UI-AUTH Test Cases", () => {
  test("[UI-AUTH-01] Auth Form Render", async ({ authPage }) => {
    await test.step("Navigate to /auth route", async () => {
      await authPage.goto();
    });

    await test.step("Verify default sign-in fields and buttons are visible", async () => {
      await expect(authPage.emailInput).toBeVisible();
      await expect(authPage.passwordInput).toBeVisible();
      await expect(authPage.signInSubmitButton).toBeVisible();
      await expect(authPage.toggleSignUpButton).toBeVisible();
    });

    await test.step("Verify sign-up-only fields are hidden in sign-in mode", async () => {
      await expect(authPage.nameInput).not.toBeVisible();
      await expect(authPage.signUpSubmitButton).not.toBeVisible();
    });
  });
});
```
