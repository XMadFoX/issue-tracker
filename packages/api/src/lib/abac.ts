import { db } from "db";
import {
	entityAttributes,
	permissionsCatalog,
	policyConstraints,
	roleAssignments,
	rolePermissions,
} from "db/features/abac/abac.schema";
import { user } from "db/features/auth/auth.schema";
import { workspaceMembership } from "db/features/tracker/tracker.schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

type Ambient = Record<string, any> | undefined;
type Resource = { id?: string; attributes?: Record<string, any> } | undefined;

const mapEntityAttributes = (
	rows: { key: string; value: unknown }[] | undefined,
) => {
	const acc: Record<string, unknown> = {};
	for (const row of rows ?? []) {
		acc[row.key] = row.value;
	}
	return acc;
};

/**
 * ABAC helper: isAllowed
 *
 * - Evaluates whether a given user (in a workspace, optionally team) is allowed
 *   to perform a permissionKey (e.g. "workspace:read") on an optional resource.
 * - Supports wildcard permissions in permissions_catalog where resource_type = '*' and action = '*'
 *   or key = '*'.
 *
 * Notes:
 * - This is a synchronous DB-backed evaluator that relies on role_assignments -> role_permissions ->
 *   permissions_catalog. It evaluates constraints by fetching the predicate_json but does NOT
 *   execute the predicate DSL here — you must plug your predicate evaluator where noted.
 * - Deny overrides allow: if any matching permission (after constraint evaluation) yields effect='deny'
 *   the final decision is deny.
 */
export async function isAllowed({
	userId,
	workspaceId,
	teamId,
	permissionKey, // canonical permission key like 'workspace:read'
	resource,
	ambient,
}: {
	userId: string;
	workspaceId: string;
	teamId?: string | null;
	// TODO: type, perhaps allow {resourceType, action} or {resourceType, action, subjectFilter}
	permissionKey: string;
	resource?: Resource;
	ambient?: Ambient;
}) {
	// 1) Load role assignments for user in workspace (and team if provided)
	const assignments = await db
		.select()
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.userId, userId),
				eq(roleAssignments.workspaceId, workspaceId),
				teamId
					? eq(roleAssignments.teamId, teamId)
					: isNull(roleAssignments.teamId),
			),
		);

	if (!assignments || assignments.length === 0) {
		return false;
	}

	const roleIds = assignments.map((a) => a.roleId);

	// 2) Collect candidate permissions for these roles
	// We want:
	//  - exact permission key match
	//  - wildcard permission key ('*')
	//  - wildcard resource/action: we will match by permission key pieces as fallback
	// Fetch role_permissions joined with permissions_catalog and policy_constraints (if any)
	const perms = await db
		.select({
			rp: rolePermissions,
			pc: permissionsCatalog,
			constraint: policyConstraints,
		})
		.from(rolePermissions)
		.where(inArray(rolePermissions.roleId, roleIds))
		.leftJoin(
			permissionsCatalog,
			eq(rolePermissions.permissionId, permissionsCatalog.id),
		)
		.leftJoin(
			policyConstraints,
			eq(rolePermissions.constraintId, policyConstraints.id),
		);

	const [reqResource, reqAction] = permissionKey.split(":");

	// Filter candidate permissions that match either:
	//  - exact key
	//  - wildcard key ('*')
	//  - resource/action wildcards: resource='*' or action='*'
	const matchingCandidates = perms.filter((row) => {
		const permKey = row.pc?.key;
		if (!permKey) return false;

		if (permKey === permissionKey) return true;
		if (permKey === "*") return true;

		const [permResource, permAction] = permKey.split(":");
		if (!permAction) {
			// if permission key doesn't follow resource:action, fallback to exact only
			return false;
		}

		if (permResource === "*" && permAction === "*") return true;
		if (permResource === "*" && permAction === reqAction) return true;
		if (permAction === "*" && permResource === reqResource) return true;

		return false;
	});

	if (matchingCandidates.length === 0) {
		return false;
	}

	// Evaluate constraints (if any). For now we support:
	// - constraint === null -> treated as unconditional match
	// - constraint.predicate_json -> you must evaluate it against subject/resource/ambient
	//
	// Placeholder predicate evaluator:
	// TODO: replace with actual predicate evaluator (e.g., small DSL interpreter or OPA/Rego call).
	function evaluatePredicate(
		predicateJson: any,
		ctx: { subject: any; resource: any; ambient: any },
	) {
		if (!predicateJson) return true;
		// Basic example: support predicateJson = { "always": true } or { "subject": { "attribute_equals": { "k":"v" } } }
		// For production use integrate a proper predicate engine.
		if (predicateJson.always === true) return true;

		// If predicateJson.subject.attribute_equals exists, all of those must match subject attributes
		try {
			if (predicateJson?.subject?.attribute_equals) {
				const checks = predicateJson.subject.attribute_equals;
				const subjectAttrs = ctx.subject?.attributes ?? {};
				return Object.entries(checks).every(([k, v]) => subjectAttrs[k] === v);
			}
		} catch (_e) {
			return false;
		}

		// Fallback: if unknown structure, deny (safe default)
		return false;
	}

	// Build subject context (aggregate attributes).
	// Merge attributes from:
	//  - users.attributes
	//  - workspaceMembership.attributes (membership-level overrides)
	//  - assignment.attributes (already available on each assignment row - we merged them earlier via assignments variable if needed)
	//
	// We fetch user + membership rows and shallow-merge their JSON attributes into one subject.attributes object.
	// Fetch user and membership rows; Drizzle returns arrays from `.all()`.
	const userRows = await db.select().from(user).where(eq(user.id, userId));
	const userRow = userRows?.[0] ?? null;

	const membershipRows = await db
		.select()
		.from(workspaceMembership)
		.where(
			and(
				eq(workspaceMembership.userId, userId),
				eq(workspaceMembership.workspaceId, workspaceId),
			),
		);
	const membershipRow = membershipRows?.[0] ?? null;

	// Fetch entity attributes for the user, workspace, and team via (entity_type, entity_id)
	const userAttributes = await db
		.select({
			key: entityAttributes.key,
			value: entityAttributes.value,
		})
		.from(entityAttributes)
		.where(
			and(
				eq(entityAttributes.entityType, "user"),
				eq(entityAttributes.entityId, userId),
			),
		);

	const workspaceAttributes = await db
		.select({
			key: entityAttributes.key,
			value: entityAttributes.value,
		})
		.from(entityAttributes)
		.where(
			and(
				eq(entityAttributes.entityType, "workspace"),
				eq(entityAttributes.entityId, workspaceId),
			),
		);

	const teamAttributes = teamId
		? await db
				.select({
					key: entityAttributes.key,
					value: entityAttributes.value,
				})
				.from(entityAttributes)
				.where(
					and(
						eq(entityAttributes.entityType, "team"),
						eq(entityAttributes.entityId, teamId),
					),
				)
		: [];

	const subject = {
		attributes: {
			// ...(userRow?.attributes ?? {}),
			...(membershipRow?.attributes ?? {}),
			...(assignments?.reduce(
				(acc: Record<string, unknown>, a) => ({
					...acc,
					...(a.attributes ?? {}),
				}),
				{},
			) ?? {}), // Assignment attributes
			...mapEntityAttributes(userAttributes),
			...mapEntityAttributes(workspaceAttributes),
			...mapEntityAttributes(teamAttributes),
		},
		user: userRow
			? { id: (userRow as any).id, email: (userRow as any).email }
			: undefined,
		membership: membershipRow
			? { status: (membershipRow as any).status }
			: undefined,
	};

	// 3) Evaluate each candidate: check constraint (if present) and collect effects
	let anyAllow = false;
	for (const c of matchingCandidates) {
		const effect = c.rp.effect; // 'allow' or 'deny'
		const predicate = c.constraint?.predicateJson ?? null;

		const predicateResult = evaluatePredicate(predicate, {
			subject,
			resource,
			ambient,
		});

		if (!predicateResult) continue;

		if (effect === "deny") {
			// deny overrides: immediate deny
			return false;
		}

		if (effect === "allow") {
			anyAllow = true;
		}
	}

	return anyAllow;
}
