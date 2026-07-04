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
	disabledIssueTypeIds?: readonly string[];
	disabledReason?: string;
};

export function IssueTypeSelect({
	issueTypeId,
	issueTypes,
	onChange,
	triggerClassName,
	showBadge = false,
	disabledIssueTypeIds = [],
	disabledReason = "Not compatible with the current status",
}: Props) {
	const getType = (value: string) => issueTypes.find((t) => t.id === value);
	const disabledIds = new Set(disabledIssueTypeIds);
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
				{issueTypes.map((type) => {
					const disabled = disabledIds.has(type.id);
					return (
						<SelectItem key={type.id} value={type.id} disabled={disabled}>
							<span className="flex items-center gap-2">
								<span>{type.icon}</span>
								<span>{type.name}</span>
								{disabled ? (
									<span className="text-muted-foreground text-xs">
										({disabledReason})
									</span>
								) : null}
							</span>
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}

export type IssueTypeSelectProps = ComponentProps<typeof IssueTypeSelect>;
