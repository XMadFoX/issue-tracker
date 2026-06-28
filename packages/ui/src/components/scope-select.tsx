import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/select"

export type ScopeValue =
	| { kind: "workspace" }
	| { kind: "all" }
	| { kind: "team"; teamId: string }

export type ScopeTeam = { id: string; name: string }

const WORKSPACE_VALUE = "workspace"
const ALL_VALUE = "all"
const TEAM_PREFIX = "team:"

function encodeScope(value: ScopeValue): string {
	switch (value.kind) {
		case "workspace":
			return WORKSPACE_VALUE
		case "all":
			return ALL_VALUE
		case "team":
			return `${TEAM_PREFIX}${value.teamId}`
	}
}

function decodeScope(raw: string): ScopeValue {
	if (raw === ALL_VALUE) {
		return { kind: "all" }
	}
	if (raw.startsWith(TEAM_PREFIX)) {
		return { kind: "team", teamId: raw.slice(TEAM_PREFIX.length) }
	}
	return { kind: "workspace" }
}

export type ScopeSelectProps = {
	value: ScopeValue
	onValueChange: (value: ScopeValue) => void
	teams: ScopeTeam[]
	/** Show the "Workspace & all teams" option. Defaults to false. */
	includeAllTeams?: boolean
	workspaceLabel?: string
	allTeamsLabel?: string
	placeholder?: string
	className?: string
	"aria-label"?: string
}

/**
 * Reusable scope selector for workspace / all-teams / per-team filtering.
 * Renders human-readable labels in the trigger (not raw ids/keys) and emits a
 * normalized {@link ScopeValue}. Callers map this to their own scope model.
 */
export function ScopeSelect({
	value,
	onValueChange,
	teams,
	includeAllTeams = false,
	workspaceLabel = "Workspace",
	allTeamsLabel = "Workspace & all teams",
	placeholder = "Scope",
	className,
	"aria-label": ariaLabel,
}: ScopeSelectProps) {
	const labelByValue = new Map<string, string>([
		[WORKSPACE_VALUE, workspaceLabel],
		[ALL_VALUE, allTeamsLabel],
		...teams.map((team) => [`${TEAM_PREFIX}${team.id}`, team.name] as const),
	])

	return (
		<Select
			value={encodeScope(value)}
			onValueChange={(raw) => {
				if (!raw) {
					return
				}
				onValueChange(decodeScope(raw))
			}}
		>
			<SelectTrigger className={className} aria-label={ariaLabel}>
				<SelectValue placeholder={placeholder}>
					{(raw) => labelByValue.get(raw) ?? raw}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={WORKSPACE_VALUE}>{workspaceLabel}</SelectItem>
				{includeAllTeams ? (
					<SelectItem value={ALL_VALUE}>{allTeamsLabel}</SelectItem>
				) : null}
				{teams.map((team) => (
					<SelectItem key={team.id} value={`${TEAM_PREFIX}${team.id}`}>
						{team.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
