import { Badge } from "@prism/ui/components/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import type { ComponentProps } from "react";
import type { IssueTypeList } from "../types";

type Props = {
	issueTypeId: string | null | undefined;
	issueTypes: IssueTypeList;
	onChange: (issueTypeId: string) => Promise<unknown>;
	triggerClassName?: string;
	showBadge?: boolean;
};

export function IssueTypeSelect({
	issueTypeId,
	issueTypes,
	onChange,
	triggerClassName,
	showBadge = false,
}: Props) {
	const getType = (value: string) => issueTypes.find((t) => t.id === value);
	const selected = issueTypeId ? getType(issueTypeId) : undefined;

	return (
		<Select
			value={issueTypeId ?? ""}
			onValueChange={(value) => onChange(value ?? "")}
		>
			<SelectTrigger
				className={triggerClassName}
				style={{ borderColor: selected?.color ?? undefined }}
			>
				<SelectValue placeholder="-">
					{(value) => {
						const type = getType(value);
						if (showBadge) {
							return (
								<Badge
									variant="outline"
									style={{
										borderColor: type?.color ?? undefined,
										color: type?.color ?? undefined,
									}}
								>
									{type?.icon ? `${type.icon} ` : ""}
									{type?.name ?? value}
								</Badge>
							);
						}
						return type ? `${type.icon} ${type.name}` : value;
					}}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{issueTypes.map((type) => (
					<SelectItem key={type.id} value={type.id}>
						<span className="flex items-center gap-2">
							<span>{type.icon}</span>
							{type.name}
						</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export type IssueTypeSelectProps = ComponentProps<typeof IssueTypeSelect>;
