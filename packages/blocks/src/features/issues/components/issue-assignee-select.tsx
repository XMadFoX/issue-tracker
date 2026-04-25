import { Badge } from "@prism/ui/components/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import type { ComponentProps } from "react";
import type { TeamMemberList } from "../types";

type Props = {
	assigneeId: string | null;
	teamMembers: TeamMemberList;
	onChange: (assigneeId: string | null) => Promise<unknown>;
	triggerClassName?: string;
	showBadge?: boolean;
};

export function IssueAssigneeSelect({
	assigneeId,
	teamMembers,
	onChange,
	triggerClassName,
	showBadge = false,
}: Props) {
	const getMemberName = (value: string) =>
		teamMembers.find((member) => member.user.id === value)?.user.name ?? value;

	return (
		<Select value={assigneeId ?? ""} onValueChange={(value) => onChange(value)}>
			<SelectTrigger
				className={triggerClassName}
				clearable={!!assigneeId}
				onClear={() => onChange(null)}
			>
				<SelectValue placeholder="Unassigned">
					{(value) => {
						const name = getMemberName(value);
						if (showBadge) {
							return <Badge variant="outline">{name}</Badge>;
						}

						return name;
					}}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{teamMembers.map((member) => (
					<SelectItem key={member.user.id} value={member.user.id}>
						{member.user.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export type IssueAssigneeSelectProps = ComponentProps<
	typeof IssueAssigneeSelect
>;
