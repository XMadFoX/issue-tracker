"use client";

import { Button } from "@prism/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@prism/ui/components/dropdown-menu";
import { EyeOff, MoreHorizontal, Replace, Trash2 } from "lucide-react";
import type { IssueType, IssueTypeScopeValue } from "../types";

type Props = {
	type: IssueType;
	managed: boolean;
	scope: IssueTypeScopeValue;
	workspaceId: string;
	onArchive: (type: IssueType) => void;
	onHide: (input: {
		workspaceId: string;
		teamId: string;
		sourceIssueTypeId: string;
	}) => void;
	onReplaceStart: (type: IssueType) => void;
};

export function IssueTypeRowMenu({
	type,
	managed,
	scope,
	workspaceId,
	onArchive,
	onHide,
	onReplaceStart,
}: Props) {
	const items: React.ReactNode[] = [];

	if (managed) {
		items.push(
			<DropdownMenuItem
				key="archive"
				variant="destructive"
				onClick={() => onArchive(type)}
			>
				<Trash2 className="size-4" />
				Archive type
			</DropdownMenuItem>,
		);
	} else if (scope.kind === "team") {
		const teamId = scope.teamId;
		items.push(
			<DropdownMenuItem
				key="hide"
				onClick={() =>
					onHide({ workspaceId, teamId, sourceIssueTypeId: type.id })
				}
			>
				<EyeOff className="size-4" />
				Hide for this team
			</DropdownMenuItem>,
			<DropdownMenuItem key="replace" onClick={() => onReplaceStart(type)}>
				<Replace className="size-4" />
				Replace for this team
			</DropdownMenuItem>,
		);
	}

	if (items.length === 0) {
		return null;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Row actions"
					>
						<MoreHorizontal className="size-4" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end">{items}</DropdownMenuContent>
		</DropdownMenu>
	);
}
