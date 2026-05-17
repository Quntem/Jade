import { createContext, useContext, useState } from "react"

export const AppContext = createContext<{
    scope: string | null
    setScope: (scope: string | null) => void
}>({
    scope: null,
    setScope: () => {},
})

export function AppProvider({ children }: { children: React.ReactNode }) {
    const [scope, setScope] = useState<string | null>(
        typeof window !== "undefined" ? localStorage.getItem("scope") || null : null
    )
    const updateScope = (scope: string | null) => {
        setScope(scope)

        if (typeof window === "undefined") {
            return
        }

        if (scope) {
            localStorage.setItem("scope", scope)
            return
        }

        localStorage.removeItem("scope")
    }

    return (
        <AppContext.Provider value={{ scope, setScope: updateScope }}>
            {children}
        </AppContext.Provider>
    )
}

export function useAppContext() {
    return useContext(AppContext)
}
