import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { roleDefinitions } from "db/features/abac/abac.schema";
import { user } from "db/features/auth/auth.schema";
import { team, teamMembership } from "db/features/tracker/tracker.schema";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import { sanitizeAttributes } from "../../lib/permissions-helpers";

export const teamMembershipInsertSchema = createInsertSchema(teamMembership);

export const teamMembershipCreateSchema = teamMembershipInsertSchema.omit({
	id: true,
	invitedBy: true,
	joinedAt: true,
	lastSeenAt: true,
});

export const teamMembershipListSchema = teamMembershipInsertSchema.pick({
	teamId: true,
});

export const teamMembershipGetSchema = teamMembershipInsertSchema.pick({
	id: true,
	teamId: true,
});

export const teamMembershipUpdateSchema = teamMembershipInsertSchema
	.partial()
	.pick({
		id: true,
		teamId: true,
		roleId: true,
		status: true,
		attributes: true,
	})
	.required({ id: true, teamId: true });

export const teamMembershipDeleteSchema = teamMembershipInsertSchema.pick({
	id: true,
	teamId: true,
});
export const teamMembershipRouter = {};
