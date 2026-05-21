import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, Command } from "@/components/ui/command"
import { createContext, useContext, useEffect, useState } from "react"
import { useSearchResources, type SearchResult } from "./servers"
import { DockviewApi } from "dockview-react"

export const AppContext = createContext<{
    scope: string | null
    setScope: (scope: string | null) => void
    commandOpen: boolean
    setCommandOpen: (open: boolean) => void
    dockViewApi: DockviewApi | null
    setDockViewApi: (api: DockviewApi | null) => void
}>({
    scope: null,
    setScope: () => {},
    commandOpen: false,
    setCommandOpen: () => {},
    dockViewApi: null,
    setDockViewApi: () => {},
})

function getTypeLabel(type: SearchResult["type"]): string {
    const labels: Record<SearchResult["type"], string> = {
        vpn_client: "VPN Client",
        vpn_peer: "VPN Peer",
        server: "Server",
        scope: "Scope",
        resource: "Resource",
    }
    return labels[type]
}

export function AppProvider({ children }: { children: React.ReactNode }) {
    const [scope, setScope] = useState<string | null>(
        typeof window !== "undefined" ? localStorage.getItem("scope") || null : null
    )
    const [dockViewApi, setDockViewApi] = useState<DockviewApi | null>(null)
    const [commandOpen, setCommandOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const { data: searchResults, loaded: searchLoaded } = useSearchResources(searchQuery, {
        enabled: commandOpen && searchQuery.length > 0,
    })

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setCommandOpen((open) => !open)
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [])

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

    const handleCommandInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.currentTarget.value)
    }

    const groupedResults = searchResults?.reduce(
        (acc, result) => {
            const type = result.type
            if (!acc[type]) {
                acc[type] = []
            }
            acc[type].push(result)
            return acc
        },
        {} as Record<SearchResult["type"], SearchResult[]>,
    ) ?? {}

    return (
        <AppContext.Provider value={{ scope, setScope: updateScope, commandOpen, setCommandOpen, dockViewApi, setDockViewApi }}>
            <CommandDialog className="top-[6px]" style={{
                width: "35vw",
                minWidth: "35vw",
                maxWidth: "35vw",
            }} open={commandOpen} onOpenChange={(open) => {
                setCommandOpen(open)
                if (!open) setSearchQuery("")
            }}>
                <Command className="p-0" filter={() => 1}>
                    <CommandInput
                        placeholder="Type a command or find a resource..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                    />
                    <CommandList>
                        {searchQuery.length === 0 ? (
                            <>
                                <CommandEmpty>Start typing to search...</CommandEmpty>
                                <CommandGroup heading="Suggestions">
                                    <CommandItem value="calendar">Calendar</CommandItem>
                                    <CommandItem value="emoji">Search Emoji</CommandItem>
                                    <CommandItem value="calculator">Calculator</CommandItem>
                                </CommandGroup>
                            </>
                        ) : searchLoaded ? (
                            searchResults && searchResults.length > 0 ? (
                                Object.entries(
                                    groupedResults as Partial<Record<SearchResult["type"], SearchResult[]>>
                                ).map(([type, results]) => (
                                    <CommandGroup
                                        key={type}
                                        heading={`${getTypeLabel(type as SearchResult["type"])} (${(results ?? []).length})`}
                                    >
                                        {(results ?? []).map((result) => (
                                            <CommandItem
                                                key={result.id}
                                                value={`${result.type}:${result.id}`}
                                                onSelect={() => {
                                                    console.log("Selected:", result)
                                                    if (result.type === "scope") {
                                                        setScope(result.scopeId)
                                                    } else if (result.type === "resource") {
                                                        // TODO: Navigate to resource
                                                    }
                                                    setCommandOpen(false)
                                                }}
                                            >
                                                <div className="flex flex-col gap-1">
                                                    <span>{result.name}</span>
                                                    {result.status && (
                                                        <span className="text-xs text-gray-500">{result.status}</span>
                                                    )}
                                                </div>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                ))
                            ) : (
                                <CommandEmpty>No resources found.</CommandEmpty>
                            )
                        ) : (
                            <CommandEmpty>Searching...</CommandEmpty>
                        )}
                    </CommandList>
                </Command>
            </CommandDialog>
            {children}
        </AppContext.Provider>
    )
}

export function useAppContext() {
    return useContext(AppContext)
}
