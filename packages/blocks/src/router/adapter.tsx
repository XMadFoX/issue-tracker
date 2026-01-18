import * as React from "react";

export type RouterAdapter = {
	Link: React.ComponentType<{
		to: string;
		children: React.ReactNode;
		className?: string;
	}>;
	navigate: (to: string) => void;
};

const RouterAdapterContext = React.createContext<RouterAdapter | undefined>(
	undefined,
);

export function RouterAdapterProvider({
	children,
	value,
}: {
	children: React.ReactNode;
	value: RouterAdapter;
}) {
	return (
		<RouterAdapterContext.Provider value={value}>
			{children}
		</RouterAdapterContext.Provider>
	);
}

export function useRouterAdapter(): RouterAdapter {
	const adapter = React.useContext(RouterAdapterContext);

	if (adapter === undefined) {
		throw new Error(
			"RouterAdapterProvider is missing. " +
				"Make sure you have wrapped your app with RouterAdapterProvider at the app boundary.",
		);
	}

	return adapter;
}
