import * as React from "react";

export const GLOBAL_CONFIRM_ACTIONS_SKIP_STORAGE_KEY =
	"prism:confirm-actions:skip";

function readPersistedBoolean(key: string, initialValue: boolean) {
	if (typeof window === "undefined") {
		return initialValue;
	}

	const storedValue = window.localStorage.getItem(key);

	if (storedValue === null) {
		return initialValue;
	}

	return storedValue === "true";
}

function writePersistedBoolean(key: string, value: boolean) {
	if (typeof window === "undefined") {
		return;
	}

	window.localStorage.setItem(key, String(value));
}

export function usePersistedBoolean(key: string, initialValue = false) {
	const [value, setValue] = React.useState(() =>
		readPersistedBoolean(key, initialValue),
	);

	React.useEffect(() => {
		setValue(readPersistedBoolean(key, initialValue));
	}, [initialValue, key]);

	const setPersistedValue = React.useCallback(
		(nextValue: boolean | ((currentValue: boolean) => boolean)) => {
			setValue((currentValue) => {
				const resolvedValue =
					typeof nextValue === "function" ? nextValue(currentValue) : nextValue;

				writePersistedBoolean(key, resolvedValue);

				return resolvedValue;
			});
		},
		[key],
	);

	return [value, setPersistedValue] as const;
}
