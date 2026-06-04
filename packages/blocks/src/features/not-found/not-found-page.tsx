import { Button } from "@prism/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@prism/ui/components/empty";
import { FileQuestion } from "lucide-react";
import type { ReactNode } from "react";

type NotFoundPageProps = {
	homeLink?: ReactNode;
};

export function NotFoundPage({ homeLink }: NotFoundPageProps) {
	return (
		<main className="flex min-h-svh items-center justify-center bg-background p-6">
			<Empty className="max-w-xl border bg-card/40 shadow-sm">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<FileQuestion className="size-6" aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>Page not found</EmptyTitle>
					<EmptyDescription>
						The page you are looking for does not exist or has been moved.
					</EmptyDescription>
				</EmptyHeader>
				{homeLink ? (
					<EmptyContent>
						<Button asChild>{homeLink}</Button>
					</EmptyContent>
				) : null}
			</Empty>
		</main>
	);
}
