# Workspace User Management and Invitation v1 Progress

## Scope implemented

This work introduced the first pass of workspace user management and invitation flow across the DB, API, blocks, and `tss-web`.

Implemented capabilities:

- Invite users to a workspace by email using a copyable invite link
- Support invites for both existing users and users who do not exist yet
- Accept invites explicitly through an invite landing page
- Reassign workspace roles for existing members
- Remove members from a workspace
- Assign invited users to teams during invite setup
- Preserve invite context through auth so signup/signin can return to invite acceptance

## Work completed

### 1. Role and permission foundations

- Extended the permission catalog so the API can seed all permission keys already referenced by routers.
- Added built-in workspace roles:
  - `admin`
  - `member`
- Added built-in team roles:
  - `lead`
  - `member`
- Updated workspace and team creation paths to ensure these built-in roles exist.
- Updated permission seeding and backfill logic in API init so existing workspaces and teams can get the missing built-ins.
- Made built-in role lookup case-stable going forward and case-insensitive for legacy rows such as `"Admin"`.
- Fixed ABAC team checks so team membership roles are considered for team-scoped permission evaluation.

### 2. Workspace membership behavior

- Updated workspace membership creation to resolve the default workspace `member` role case-insensitively.
- Updated last-admin protection to work case-insensitively.
- Updated workspace member deletion to also remove all team memberships for that user inside the same workspace in one transaction.
- Updated team membership defaults and lead protection with the same case-insensitive built-in role handling.

### 3. Invitation data model

- Added `workspace_invitation` table to the tracker schema.
- Added `workspace_invitation_team` table to store selected teams per invite.
- Added relations for the new invitation entities.
- Generated the Drizzle migration from schema changes.

## 4. Invitation API

- Added a new `workspaceInvitation` API namespace.
- Implemented:
  - `create`
  - `list`
  - `getByToken`
  - `accept`
  - `revoke`
- Invite creation now:
  - validates workspace role and selected teams
  - rejects active workspace members
  - replaces prior pending invite for the same email in the same workspace
  - returns a raw invite URL for copy flow
- Invite acceptance now:
  - requires authentication
  - requires session email to match the invite email
  - creates or reuses workspace membership
  - creates missing team memberships using the built-in team `member` role
  - marks the invite as accepted

### 5. Web UI

- Added a new blocks feature for workspace members UI.
- Added workspace settings route:
  - `/workspace/$slug/settings/members`
- Added invite acceptance route:
  - `/invite/$token`
- Added the Members entry in workspace settings navigation.
- Added members UI for:
  - creating invites
  - selecting workspace role
  - selecting teams
  - listing pending invites
  - copying invite links
  - revoking invites
  - changing member roles
  - removing members
- Updated auth flow so invite token context survives login/signup and returns the user to invite acceptance instead of always landing on `/`.

### 6. Environment and plumbing

- Added `APP_URL` support on the API side for invite link generation.
- Registered the invitation router in the main API router.

### 7. Verification completed

- Ran Biome formatting on touched files.
- Ran Biome lint on touched files.
- Generated DB migration with `bun -F db generate`.
- Built `apps/tss-web` successfully after the feature work.

## Runtime fix after migration

After DB migration, the members page failed at:

`TypeError: can't access property "status", member.workspaceMembership is undefined`

Cause:

- The members route passed raw API rows directly into the UI block.
- The block expected a nested shape like:
  - `member.workspaceMembership`
  - `member.user`
  - `member.roleDefinitions`
- The actual response shape was not consistently that structure.

Fix applied:

- Normalized the `workspaceMembership.list` response in the route layer before passing it to the members block.
- Added support for nested camelCase, nested snake_case, and flatter membership rows.
- Dropped malformed rows instead of letting render crash.

Affected file:

- [apps/tss-web/src/routes/workspace/$slug/settings/members/index.tsx](/home/madfox/Development/prism-tracker/apps/tss-web/src/routes/workspace/$slug/settings/members/index.tsx)

## Remaining gaps

The main missing area is test coverage.

Not yet added:

- API tests for invitation lifecycle and membership edge cases
- Web tests for members page and invite/auth flow
- Manual smoke test notes committed into the repo

## Suggested next steps

1. Add API tests for invite creation, acceptance, revocation, email mismatch, expiry, and member removal.
2. Add web tests for `/workspace/$slug/settings/members`, `/invite/$token`, and auth invite round-trip.
3. Verify the full flow manually against a clean local database:
   - invite new user
   - sign up
   - accept invite
   - land in workspace
4. Verify existing-user invite flow and role reassignment/removal behavior.
