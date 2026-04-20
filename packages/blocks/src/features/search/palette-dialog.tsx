import { CommandDialog } from "@prism/ui/components/command";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";
import { PaletteContent, type PaletteIssueSearchResult } from "./palette";

type PaletteDialogContextValue = {
	open: boolean;
	setOpen: (nextOpen: boolean) => void;
	openPalette: () => void;
	closePalette: () => void;
	togglePalette: () => void;
};

const PaletteDialogContext = createContext<
	PaletteDialogContextValue | undefined
>(undefined);

type PaletteDialogProviderProps = {
	children: ReactNode;
};

export function PaletteDialogProvider({
	children,
}: PaletteDialogProviderProps) {
	const [open, setOpen] = useState(false);

	const openPalette = useCallback(() => {
		setOpen(true);
	}, []);

	const closePalette = useCallback(() => {
		setOpen(false);
	}, []);

	const togglePalette = useCallback(() => {
		setOpen((currentOpen) => !currentOpen);
	}, []);

	return (
		<PaletteDialogContext.Provider
			value={{
				open,
				setOpen,
				openPalette: openPalette,
				closePalette: closePalette,
				togglePalette: togglePalette,
			}}
		>
			{children}
		</PaletteDialogContext.Provider>
	);
}

export function usePaletteDialog() {
	const context = useContext(PaletteDialogContext);

	if (context === undefined) {
		throw new Error(
			"PaletteDialogProvider is missing. Wrap app with PaletteDialogProvider.",
		);
	}

	return context;
}

type PaletteDialogProps = {
	workspaceId?: string;
	query: string;
	onQueryChange: (query: string) => void;
	issues: Array<PaletteIssueSearchResult>;
	isSearching: boolean;
	hasSearched: boolean;
	minQueryLength?: number;
	onIssueSelect?: (issue: PaletteIssueSearchResult) => void;
};

export function PaletteDialog({
	workspaceId,
	query,
	onQueryChange,
	issues,
	isSearching,
	hasSearched,
	minQueryLength,
	onIssueSelect,
}: PaletteDialogProps) {
	const { open, setOpen } = usePaletteDialog();

	useHotkey("Mod+K", () => {
		setOpen(true);
	});

	return (
		<CommandDialog
			open={open}
			onOpenChange={setOpen}
			title="Command palette"
			description="Search for actions across the app."
			commandProps={{ shouldFilter: false }}
		>
			<PaletteContent
				workspaceId={workspaceId}
				query={query}
				onQueryChange={onQueryChange}
				issues={issues}
				isSearching={isSearching}
				hasSearched={hasSearched}
				minQueryLength={minQueryLength}
				onIssueSelect={(issue) => {
					onIssueSelect?.(issue);
					setOpen(false);
				}}
			/>
		</CommandDialog>
	);
}
