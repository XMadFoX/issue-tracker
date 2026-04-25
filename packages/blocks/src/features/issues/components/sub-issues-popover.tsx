import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@prism/ui/components/popover";
import { useRouterAdapter } from "../../../router/adapter";
import type { IssueListItem, IssueNavigation } from "../types";
import { getIssueReference } from "./issue-reference";

type Props = {
	subIssues: Array<IssueListItem>;
	getIssueUrl: IssueNavigation["getIssueUrl"];
};

export function SubIssuesPopover({ subIssues, getIssueUrl }: Props) {
	const { Link } = useRouterAdapter();

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button type="button" variant="ghost" size="sm" className="h-7 px-1.5">
					<Badge variant="secondary">{subIssues.length} sub-tasks</Badge>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 p-2">
				<div className="max-h-72 overflow-y-auto">
					{subIssues.map((subIssue) => {
						const issueUrl = getIssueUrl?.(subIssue);
						return (
							<div key={subIssue.id} className="rounded-md px-2 py-2">
								{issueUrl ? (
									<Link
										to={issueUrl}
										className="block hover:text-foreground hover:underline"
									>
										<span className="block text-muted-foreground text-xs">
											{getIssueReference(subIssue)}
										</span>
										<span className="block truncate font-medium text-sm">
											{subIssue.title}
										</span>
									</Link>
								) : (
									<>
										<span className="block text-muted-foreground text-xs">
											{getIssueReference(subIssue)}
										</span>
										<span className="block truncate font-medium text-sm">
											{subIssue.title}
										</span>
									</>
								)}
							</div>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
