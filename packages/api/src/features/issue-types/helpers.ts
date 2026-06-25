type IssueTypeOverrideFields = {
	hiddenAt: Date | null;
	replacementIssueTypeId: string | null;
};

/**
 * Returns true when the override is a pure hide — the source type is suppressed
 * with no replacement nominated.
 */
export function isPureHideOverride(override: IssueTypeOverrideFields): boolean {
	return override.hiddenAt !== null && override.replacementIssueTypeId === null;
}

/**
 * Returns true when the override nominates a replacement type for the source.
 * The source is still omitted from selection; the replacement is shown instead.
 */
export function isReplacementOverride(
	override: IssueTypeOverrideFields,
): boolean {
	return override.replacementIssueTypeId !== null;
}

/**
 * Returns true when the override causes the source type to be omitted from
 * selection — either a pure hide or a replacement.
 *
 * Use this instead of checking `hiddenAt ?? replacementIssueTypeId` directly,
 * which conflates both concepts and can mislead callers that only care about
 * one of them.
 */
export function omitsSourceType(override: IssueTypeOverrideFields): boolean {
	return override.hiddenAt !== null || override.replacementIssueTypeId !== null;
}
