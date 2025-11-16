import { teamMembership } from "db/features/tracker/tracker.schema";
import { createInsertSchema } from "drizzle-zod";

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
