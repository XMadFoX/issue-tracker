import { CommandDialog } from "@prism/ui/components/command";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";
import { PaletteContent } from "./palette";

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

export function PaletteDialog() {
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
		>
			<PaletteContent />
		</CommandDialog>
	);
}
