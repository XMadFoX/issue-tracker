import { teamMembership } from "db/features/tracker/tracker.schema";
import { createInsertSchema } from "drizzle-orm/zod";
import { z } from "zod";

export const teamMembershipInsertSchema = createInsertSchema(teamMembership);

const attributesSchema = z.record(z.string(), z.unknown());

export const teamMembershipCreateSchema = teamMembershipInsertSchema
	.omit({
		id: true,
		invitedBy: true,
		joinedAt: true,
		lastSeenAt: true,
	})
	.extend({
		attributes: attributesSchema.optional(),
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
	.extend({
		attributes: attributesSchema.optional(),
	})
	.required({ id: true, teamId: true });

export const teamMembershipDeleteSchema = teamMembershipInsertSchema.pick({
	id: true,
	teamId: true,
});
