import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type AppReadyContextValue = {
	isDataReady: boolean;
	markDataReady: () => void;
	resetDataReady: () => void;
};

const AppReadyContext = createContext<AppReadyContextValue | undefined>(undefined);

export function AppReadyProvider({ children }: { children: ReactNode }) {
	const [isDataReady, setIsDataReady] = useState(false);

	const markDataReady = useCallback(() => setIsDataReady(true), []);
	const resetDataReady = useCallback(() => setIsDataReady(false), []);

	const value = useMemo(
		() => ({ isDataReady, markDataReady, resetDataReady }),
		[isDataReady, markDataReady, resetDataReady]
	);

	return <AppReadyContext.Provider value={value}>{children}</AppReadyContext.Provider>;
}

export function useAppReady() {
	const context = useContext(AppReadyContext);
	if (!context) {
		throw new Error('useAppReady must be used inside AppReadyProvider');
	}
	return context;
}
