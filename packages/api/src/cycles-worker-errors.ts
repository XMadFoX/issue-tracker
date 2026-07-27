const SECRET_VALUE_PATTERN =
	/(\b(?:authorization|bearer|token|password|passwd|api[_-]?key|secret|credential|dsn|connection(?:string)?|access[_-]?key)\b\s*[:=]\s*)([^\s,;})]+|"[^"]*"|'[^']*')/gi;
const URL_PATTERN = /\b(?:postgres(?:ql)?|mysql|redis):\/\/[^\s"']+/gi;
const SQL_PATTERN =
	/\b(?:select|insert|update|delete|alter|create|drop|truncate|with)\b[^;]*(?:;|$)/gim;
const HOST_PATTERN = /\b(?:host|hostname)\s*=\s*[^\s,;})]+/gi;

/** Convert arbitrary database/runtime errors into bounded, non-secret operational text. */
export function redactErrorSummary(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	const redacted = message
		.replace(URL_PATTERN, "<redacted-dsn>")
		.replace(SQL_PATTERN, "<redacted-sql>")
		.replace(/\bBearer\s+[^\s,;]+/gi, "Bearer <redacted>")
		.replace(SECRET_VALUE_PATTERN, "$1<redacted>")
		.replace(HOST_PATTERN, "host=<redacted>")
		.replace(/\s+/g, " ")
		.trim();
	return redacted.slice(0, 512);
}
