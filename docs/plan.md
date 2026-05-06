# Linear-Style Issue Tracker — API Implementation Plan

Recommended build order for backend services. Each chapter contains API-focused todos that rely on preceding foundations.

---

## Chapter 1 – Identity & Membership APIs

- [ ] User service (`USER`)
  - [x] Auth endpoints (sign up, login, refresh, revoke)
  - [ ] Password reset / SSO placeholder
  - [x] User profile read/update API
- [ ] Workspace service (`WORKSPACE`)
  - [x] CRUD endpoints for workspace lifecycle
  - [ ] Workspace settings API (plan, timezone, billing metadata stub)
- [ ] Membership management (`WORKSPACE_MEMBERSHIP`)
  - [x] Invite/create membership endpoint (with email token flow)
  - [ ] Accept/reject invitation endpoints
  - [x] Role update & removal endpoints
  - [ ] Membership listing + pagination per workspace
- [ ] Authorization middleware
  - [ ] Scope tokens to workspace
  - [x] Enforce role-based policies on routes

---

## Chapter 2 – Team & Workflow Configuration APIs

- [x] Team service (`TEAM`)
  - [x] CRUD endpoints with team lead assignment, privacy flag
  - [x] List teams by workspace and membership
- [x] Team membership (`TEAM_MEMBERSHIP`)
  - [x] Add/remove members, update team role
  - [x] List team members endpoint
- [ ] Status configuration
  - [x] CRUD endpoints for `ISSUE_STATUS_GROUP`
  - [ ] CRUD endpoints for `ISSUE_STATUS` (workspace + team overrides)
  - [x] Ordering APIs (bulk reorder)
- [x] Labels
  - [x] CRUD endpoints for workspace-level labels
  - [x] CRUD for team-scoped labels
  - [x] List labels filtered by scope
- [ ] Issue types & priorities
  - [ ] CRUD for `ISSUE_TYPE` and `ISSUE_PRIORITY`
  - [ ] Sync endpoints for clients to fetch configuration snapshots

---

## Chapter 3 – Core Issue Management APIs

- [ ] Issue service (`ISSUE`)
  - [x] Create/update/delete endpoints
  - [ ] Bulk creation/import endpoint
  - [x] List/search endpoint with filter & pagination support
  - [ ] Retrieve single issue with related metadata (labels, custom fields, relations)
- [ ] Sequence/number generator
  - [ ] Service to assign team-based issue keys (`TEAM-###`)
- [x] Parent/child management
  - [x] Endpoint to set/change parent (`parent_issue_id`)
  - [x] Enforce hierarchy constraints (no loops, depth limit)
- [x] Label links (`ISSUE_LABEL_LINK`)
  - [x] Add/remove label endpoints (batch support)
- [ ] Status transitions
  - [ ] Transition endpoint with validation against allowed statuses
  - [x] Automation hooks placeholder (publish events)

---

## Chapter 4 – Collaboration & Communication APIs

- [ ] Comments (`ISSUE_COMMENT`)
  - [ ] CRUD endpoints with internal comment flag
  - [ ] Mention parsing & validation in backend
- [ ] Activity log (`ISSUE_ACTIVITY`)
  - [ ] Append-on-change service
  - [ ] Activity feed endpoint (with pagination)
- [ ] Watchers & subscribers
  - [ ] Endpoints to follow/unfollow issues (`ISSUE_WATCHER`)
  - [ ] Configure notification level (`ISSUE_SUBSCRIBER`)
- [ ] Reactions
  - [ ] Add/remove reaction endpoints for issues (`ISSUE_REACTION`) and comments (`ISSUE_COMMENT_REACTION`)
- [ ] Attachments (`ISSUE_ATTACHMENT`)
  - [ ] Upload URL issuance (signed URL) & finalize callback
  - [ ] List/delete attachment endpoints
- [ ] Checklists
  - [ ] CRUD endpoints for `ISSUE_CHECKLIST` and `ISSUE_CHECKLIST_ITEM`
  - [ ] Batch reorder items
- [ ] External links (`ISSUE_LINK`)
  - [ ] Add/remove/list external references

---

## Chapter 5 – Planning APIs (Cycles, Milestones, Projects, Initiatives)

- [ ] Cycles (`CYCLE`)
  - [ ] CRUD endpoints tied to team cadence
  - [ ] Assign/unassign issue to cycle endpoint
  - [ ] Cycle metrics endpoint (planned vs completed)
- [ ] Milestones (`MILESTONE`)
  - [ ] CRUD endpoints with scope (workspace/team/project)
  - [ ] Link/unlink issues via `ISSUE_MILESTONE`
  - [ ] Milestone progress endpoint
- [ ] Projects (`PROJECT`)
  - [ ] CRUD endpoints with metadata (lead, dates, description)
  - [ ] Issue listing endpoint filtered by project
  - [ ] Project metrics endpoint
- [ ] Initiatives (`INITIATIVE`)
  - [ ] CRUD endpoints with hierarchy support
  - [ ] Link/unlink projects via `PROJECT_INITIATIVE`
  - [ ] Initiative summary endpoint aggregating linked projects/issues

---

## Chapter 6 – Issue Relations & Dependency APIs

- [ ] Relations (`ISSUE_RELATION`)
  - [ ] Create relation endpoint with type validation
  - [ ] Remove relation endpoint
  - [ ] List relations for a given issue
  - [ ] Enforce directionality, symmetric duplicates, and anti-cycle checks
- [ ] Bulk operations
  - [ ] Batch link/unlink for multiple issues
  - [ ] API to merge duplicates (copy data, close duplicate)
