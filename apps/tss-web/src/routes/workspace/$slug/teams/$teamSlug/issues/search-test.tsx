import { Input } from "@prism/ui/components/input";
import { skipToken, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute(
	"/workspace/$slug/teams/$teamSlug/issues/search-test",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { slug } = Route.useParams();
	const [query, setQuery] = useState("");

	const workspace = useQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);

	const { data: searchData, isLoading } = useQuery(
		orpc.issue.search.queryOptions({
			input:
				workspace.data?.id && query
					? {
							workspaceId: workspace.data.id,
							query,
							mode: "hybrid",
							includeArchived: false,
							options: { limit: 50, includeDebugInfo: true, minScore: 0.1 },
						}
					: skipToken,
		}),
	);

	return (
		<div className="p-6 space-y-6 w-full max-w-2xl">
			<h1 className="text-2xl font-bold">Issue Search Test</h1>

			<div className="space-y-2">
				<label htmlFor="search" className="text-sm font-medium">
					Search Query
				</label>
				<Input
					id="search"
					placeholder="Search issues..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</div>

			{isLoading && <p className="text-muted-foreground">Loading...</p>}

			{searchData && searchData.issues.length === 0 && (
				<p className="text-muted-foreground">No results found</p>
			)}

			{searchData && searchData.issues.length > 0 && (
				<div className="space-y-4">
					<h2 className="text-lg font-semibold">
						Results ({searchData.issues.length})
					</h2>
					<div className="space-y-2">
						{searchData.issues.map((result) => (
							<div key={result.id} className="p-4 border rounded-lg space-y-1">
								<div className="flex items-center justify-between">
									<p className="font-medium">{result.title}</p>
									<span className="text-sm text-muted-foreground">
										Score: {result?.debug?.score?.toFixed(3)}
									</span>
								</div>
								<p className="text-sm text-muted-foreground">ID: {result.id}</p>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
