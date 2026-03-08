import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import { AlertTriangleIcon, RefreshCwIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type AppErrorCardProps = {
	error: unknown;
	reset?: () => void;
	className?: string;
};

const FALLBACK_MESSAGE =
	"Something unexpected went wrong while loading this page.";
const RETRY_FEEDBACK_KEY = "app-error-card:last-retry-at";
const RETRY_FEEDBACK_WINDOW_MS = 5000;
const RETRY_RESET_DELAY_MS = 700;

function hasErrorMessage(value: unknown): value is { message: string } {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	if (!("message" in value)) {
		return false;
	}

	return typeof value.message === "string";
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		const message = error.message.trim();

		if (message.length > 0) {
			return message;
		}
	}

	if (hasErrorMessage(error)) {
		const message = error.message.trim();

		if (message.length > 0) {
			return message;
		}
	}

	if (typeof error === "string") {
		const message = error.trim();

		if (message.length > 0) {
			return message;
		}
	}

	return FALLBACK_MESSAGE;
}

export function AppErrorCard({ error, reset, className }: AppErrorCardProps) {
	const errorMessage = getErrorMessage(error);
	const [isRetrying, setIsRetrying] = useState(false);
	const [showRetryNotice, setShowRetryNotice] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const retryAt = window.sessionStorage.getItem(RETRY_FEEDBACK_KEY);

		if (!retryAt) {
			return;
		}

		const retryAtMs = Number(retryAt);

		if (Number.isNaN(retryAtMs)) {
			window.sessionStorage.removeItem(RETRY_FEEDBACK_KEY);
			return;
		}

		const timeSinceRetry = Date.now() - retryAtMs;

		if (timeSinceRetry >= RETRY_FEEDBACK_WINDOW_MS) {
			window.sessionStorage.removeItem(RETRY_FEEDBACK_KEY);
			return;
		}

		setShowRetryNotice(true);

		const timeout = window.setTimeout(() => {
			setShowRetryNotice(false);
			window.sessionStorage.removeItem(RETRY_FEEDBACK_KEY);
		}, RETRY_FEEDBACK_WINDOW_MS - timeSinceRetry);

		return () => {
			window.clearTimeout(timeout);
		};
	}, []);

	const handleRetry = async () => {
		if (!reset || isRetrying) {
			return;
		}

		setIsRetrying(true);
		setShowRetryNotice(false);

		if (typeof window !== "undefined") {
			window.sessionStorage.setItem(RETRY_FEEDBACK_KEY, String(Date.now()));
		}

		window.setTimeout(() => {
			reset();
		}, RETRY_RESET_DELAY_MS);
	};

	return (
		<div
			className={cn(
				"relative flex min-h-[70vh] w-full items-center justify-center overflow-hidden px-4 py-8",
				className,
			)}
		>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--color-destructive)/0.12,transparent_55%),radial-gradient(circle_at_bottom_right,var(--color-primary)/0.11,transparent_50%)]"
			/>
			<Card className="relative w-full max-w-2xl border-destructive/30 bg-card/95 shadow-xl supports-backdrop-filter:backdrop-blur-sm">
				<CardHeader className="gap-3">
					<div className="bg-destructive/15 text-destructive flex size-11 items-center justify-center rounded-xl border border-destructive/30">
						<AlertTriangleIcon className="size-5" />
					</div>
					<CardTitle className="text-2xl">Something went wrong</CardTitle>
					<CardDescription className="text-sm/relaxed">
						Try again, or reload the page if the problem keeps happening.
					</CardDescription>
				</CardHeader>

				<CardContent>
					{showRetryNotice ? (
						<div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
							Still having trouble.
						</div>
					) : null}
					<div className="bg-muted/70 text-muted-foreground rounded-lg border p-3 font-mono text-xs leading-5">
						{errorMessage}
					</div>
				</CardContent>

				<CardFooter className="border-t pt-5 flex flex-wrap gap-2">
					{reset ? (
						<Button onClick={handleRetry} disabled={isRetrying}>
							<RotateCcwIcon className={cn(isRetrying && "animate-spin")} />
							{isRetrying ? "Trying again..." : "Try again"}
						</Button>
					) : null}
					<Button variant="secondary" onClick={() => window.location.reload()}>
						<RefreshCwIcon />
						Reload page
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
