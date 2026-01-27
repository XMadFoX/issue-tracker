import { MemoryPublisher } from "@orpc/experimental-publisher/memory";
import type { IssueWithRelations } from "./queries";

export type IssueEvents = {
	"issue:changed":
		| {
				type: "create" | "update";
				workspaceId: string;
				teamId: string;
				issue: IssueWithRelations;
		  }
		| {
				type: "delete";
				workspaceId: string;
				teamId: string;
				issueId: string;
		  };
};

export const issuePublisher = new MemoryPublisher<IssueEvents>();
