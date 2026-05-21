"use client"
import { Building2Icon, ChevronRightIcon, FolderIcon, MessageSquareXIcon, PanelLeftIcon, PlusIcon, RefreshCwIcon, SearchIcon, SwordIcon, TestTubeIcon, UserIcon, XIcon } from "lucide-react"
import { Avatar, AvatarFallback } from "./ui/avatar"
import { useAuthContext } from "@/lib/auth"
import { useAppContext } from "@/lib/appContext"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { Button } from "./ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { createScope, Scope, ScopeType, useScopes } from "@/lib/scopes"
import { FormEvent, useEffect, useMemo, useState } from "react"

const scopeTypes: ScopeType[] = ["Project", "ResourceGroup", "Folder", "Environment", "System"]

export function HeaderIcon() {
    return (
        <div className="bg-primary" style={{
            height: 25,
            width: 25,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "5px",
            // backgroundColor: "#983DFF",
            marginLeft: "15px",
        }}>
            <SwordIcon size={18} color="#fff" />
        </div>
    )
}

export function UserAvatar() {
    const {authState} = useAuthContext();
    return (
        <div style={{
            marginRight: "15px",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "15px",
        }}>
            <Avatar>
                <AvatarFallback>{authState?.data?.user?.name?.charAt(0).toUpperCase()}{authState?.data?.user?.name?.charAt(1).toUpperCase()}</AvatarFallback>
            </Avatar>
        </div>
    )
}

export function HeaderSearch() {
    const { commandOpen, setCommandOpen } = useAppContext();
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "35%",
            height: "30px",
            borderRadius: "5px",
            // backgroundColor: "#fff",
            backgroundColor: "rgba(0, 0, 0, 0.05)",
            border: "1px solid #e4e4e7",
            position: "fixed",
            top: "8px",
            left: "50%",
            transform: "translateX(-50%)",
            // zIndex: 1000,
        }} onClick={() => {
            setCommandOpen(true)
        }}>
            <SearchIcon size={16} />
            <div style={{
                marginLeft: "8px",
                fontSize: "14px",
            }}>
                Search Quntem Jade (cmd+k)
            </div>
        </div>
    )
}

export function Header({
    sidebarOpen,
    setSidebarOpen,
    hideSidebar,
}: {
    sidebarOpen: boolean;
    setSidebarOpen: (value: boolean) => void;
    hideSidebar?: boolean;
}) {
    return (
        <header
            style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                height: "50px",
                backgroundColor: "#fafafa",
                borderBottom: "1px solid #e4e4e7",
            }}
        >
            {hideSidebar != true && (
                <PanelLeftIcon
                        style={{
                            marginLeft: "15px",
                            cursor: "pointer",
                        }}
                        size={18}
                    onClick={() => {
                        setSidebarOpen(!sidebarOpen);
                    }}
                />
            )}
            <div style={{
                display: "flex",
                alignItems: "center"
            }} onClick={() => {
                // if (window.location.pathname !== "/") {
                //     window.location.pathname = "/";
                // }
            }}>
                <HeaderIcon />
                <div
                    style={{
                        marginLeft: "12px",
                    }}
                >
                    Quntem Jade
                </div>
            </div>
            <div style={{
                color: "#999999",
                marginLeft: "12px",
                marginRight: "4px",
            }}>
                /
            </div>
            <ScopeSwitcher />
            {/* <OrganizationSwitcher style={{
                backgroundColor: "transparent",
                color: "#666666",
                boxShadow: "none",
            }} size="sm" /> */}
            <div style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }} >
                {hideSidebar != true && (
                    <HeaderSearch />
                )}
            </div>
            {hideSidebar != true && (
                <MessageSquareXIcon
                    style={{
                        marginRight: "15px",
                        cursor: "pointer",
                    }}
                    size={18}
                    onClick={() => {
                        (window as any).dockViewApi.clear();
                    }}
                />
            )}
            <UserAvatar />
        </header>
    )
}

export function ScopeSwitcher() {
    const { authState, sessionCookieReady } = useAuthContext();
    const { scope, setScope } = useAppContext();
    const scopes = useScopes(Boolean(sessionCookieReady && authState?.loaded && !authState.error));
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [scopeSearch, setScopeSearch] = useState("");

    const selectedScope = useMemo(
        () => scopes.data?.find((item) => item.id === scope) ?? null,
        [scope, scopes.data]
    );
    const selectedScopeName = selectedScope
        ? getScopeDisplayName(selectedScope, scopes.data ?? [])
        : "Scope";
    const scopeSelectionRequired = Boolean(
        scopes.loaded && !scopes.error && (!scope || !selectedScope)
    );

    const filteredScopes = useMemo(
        () => filterScopesForTree(scopes.data ?? [], scopeSearch),
        [scopeSearch, scopes.data]
    );

    const roots = useMemo(() => {
        return getScopeTreeRoots(filteredScopes);
    }, [filteredScopes]);

    useEffect(() => {
        if (!scopeSelectionRequired) {
            return;
        }

        if (scope && !selectedScope) {
            setScope(null);
        }

        if (!createOpen) {
            setSwitcherOpen(true);
        }
    }, [createOpen, scope, scopeSelectionRequired, selectedScope, setScope]);

    return (
        <>
            <Dialog
                open={switcherOpen}
                onOpenChange={(open) => {
                    if (!open && scopeSelectionRequired && !createOpen) {
                        return;
                    }

                    setSwitcherOpen(open);
                }}
            >
                <DialogTrigger asChild>
                    <Button variant={"ghost"} size="sm">
                        {selectedScope ? (
                            <ScopeTypeIcon type={selectedScope.type} />
                        ) : (
                            <Building2Icon />
                        )}
                        {selectedScopeName}
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Switch Scope</DialogTitle>
                    <DialogDescription>
                        Select a different scope to work with.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={scopeSearch}
                        onChange={(event) => setScopeSearch(event.target.value)}
                        placeholder="Search scopes..."
                        aria-label="Search scopes"
                        className="pl-8"
                    />
                </div>

                <div className="max-h-[360px] overflow-auto rounded-lg border bg-background p-1" role="tree" aria-label="Scopes">
                    {!scopes.loaded && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Loading scopes...</div>
                    )}
                    {scopes.loaded && scopes.error && (
                        <div className="px-3 py-2 text-sm text-destructive">{scopes.error.message}</div>
                    )}
                    {scopes.loaded && !scopes.error && (scopes.data ?? []).length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No scopes yet.</div>
                    )}
                    {scopes.loaded && !scopes.error && (scopes.data ?? []).length > 0 && roots.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No scopes match your search.</div>
                    )}
                    {roots.map((item) => (
                        <ScopeTreeItem
                            key={item.id}
                            scope={item}
                            scopes={filteredScopes}
                            selectedScopeId={scope}
                            forceExpanded={scopeSearch.trim().length > 0}
                            onSelect={(scopeId) => {
                                setScope(scopeId);
                                setSwitcherOpen(false);
                            }}
                        />
                    ))}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => scopes.reload()}>
                        <RefreshCwIcon />
                        Refresh
                    </Button>
                    <Button onClick={() => {
                        setSwitcherOpen(false);
                        setCreateOpen(true);
                    }}>
                        <PlusIcon />
                        New scope
                    </Button>
                </DialogFooter>
                </DialogContent>
            </Dialog>
            <CreateScopeDialog
                key={`${createOpen ? "open" : "closed"}-${scope ?? "none"}-${scopes.data?.map((item) => item.id).join(":") ?? "loading"}`}
                open={createOpen}
                onOpenChange={setCreateOpen}
                scopes={scopes.data ?? []}
                selectedScopeId={scope}
                onCreated={(createdScope) => {
                    setScope(createdScope.id);
                    scopes.reload();
                }}
            />
        </>
    )
}

function ScopeTreeItem({
    scope,
    scopes,
    selectedScopeId,
    onSelect,
    forceExpanded = false,
    level = 0,
}: {
    scope: Scope;
    scopes: Scope[];
    selectedScopeId: string | null;
    onSelect: (scope: string | null) => void;
    forceExpanded?: boolean;
    level?: number;
}) {
    const children = scopes.filter((item) => item.parentId === scope.id);
    const [expanded, setExpanded] = useState(true);
    const renderedExpanded = forceExpanded || expanded;
    const isSelected = selectedScopeId === scope.id;

    return (
        <div role="none">
            <div
                role="treeitem"
                aria-expanded={children.length > 0 ? renderedExpanded : undefined}
                aria-selected={isSelected}
                className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-sm hover:bg-accent"
                style={{ paddingLeft: `${level * 18 + 4}px` }}
            >
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-5"
                    onClick={() => setExpanded((value) => !value)}
                    disabled={children.length === 0}
                    aria-label={renderedExpanded ? "Collapse scope" : "Expand scope"}
                >
                    {children.length > 0 && (
                        <ChevronRightIcon className={renderedExpanded ? "rotate-90 transition-transform" : "transition-transform"} />
                    )}
                </Button>
                <button
                    type="button"
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1 text-left ${isSelected ? "bg-accent text-accent-foreground" : ""}`}
                    onClick={() => onSelect(scope.id)}
                >
                    <ScopeTypeIcon type={scope.type} className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{scope.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{scope.type}</span>
                </button>
            </div>
            {renderedExpanded && children.length > 0 && (
                <div role="group">
                    {children.map((child) => (
                        <ScopeTreeItem
                            key={child.id}
                            scope={child}
                            scopes={scopes}
                            selectedScopeId={selectedScopeId}
                            onSelect={onSelect}
                            forceExpanded={forceExpanded}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

function getScopeDisplayName(scope: Scope, scopes: Scope[]) {
    if (scope.type !== "Environment" || !scope.parentId) {
        return scope.name;
    }

    const parentScope = scopes.find((item) => item.id === scope.parentId);

    if (!parentScope) {
        return scope.name;
    }

    return `${parentScope.name} / ${scope.name}`;
}

function getScopeTreeRoots(scopes: Scope[]) {
    const scopeIds = new Set(scopes.map((item) => item.id));

    return scopes.filter((item) => !item.parentId || !scopeIds.has(item.parentId));
}

function filterScopesForTree(scopes: Scope[], search: string) {
    const query = search.trim().toLowerCase();

    if (!query) {
        return scopes;
    }

    const byId = new Map(scopes.map((item) => [item.id, item]));
    const childIdsByParentId = new Map<string, string[]>();

    for (const item of scopes) {
        if (!item.parentId) {
            continue;
        }

        childIdsByParentId.set(item.parentId, [
            ...(childIdsByParentId.get(item.parentId) ?? []),
            item.id,
        ]);
    }

    const visibleIds = new Set<string>();
    const markAncestors = (item: Scope) => {
        let current: Scope | undefined = item;

        while (current) {
            visibleIds.add(current.id);
            current = current.parentId ? byId.get(current.parentId) : undefined;
        }
    };
    const markDescendants = (item: Scope) => {
        for (const childId of childIdsByParentId.get(item.id) ?? []) {
            visibleIds.add(childId);
            const child = byId.get(childId);

            if (child) {
                markDescendants(child);
            }
        }
    };

    for (const item of scopes) {
        if (matchesScopeSearch(item, scopes, query)) {
            markAncestors(item);
            markDescendants(item);
        }
    }

    return scopes.filter((item) => visibleIds.has(item.id));
}

function matchesScopeSearch(scope: Scope, scopes: Scope[], query: string) {
    const displayName = getScopeDisplayName(scope, scopes);

    return (
        scope.name.toLowerCase().includes(query) ||
        scope.type.toLowerCase().includes(query) ||
        displayName.toLowerCase().includes(query)
    );
}

function ScopeTypeIcon({
    type,
    className,
}: {
    type: ScopeType;
    className?: string;
}) {
    if (type === "Organization") {
        return <Building2Icon className={className} />
    }

    if (type === "User") {
        return <UserIcon className={className} />
    }

    if (type === "Environment") {
        return <TestTubeIcon className={className} />
    }

    return <FolderIcon className={className} />
}

function CreateScopeDialog({
    open,
    onOpenChange,
    scopes,
    selectedScopeId,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    scopes: Scope[];
    selectedScopeId: string | null;
    onCreated: (scope: Scope) => void;
}) {
    const defaultParentId = useMemo(
        () => scopes.find((scope) => scope.type === "Organization")?.id ?? scopes[0]?.id ?? "",
        [scopes]
    );
    const initialParentId = useMemo(
        () => scopes.some((scope) => scope.id === selectedScopeId) ? selectedScopeId ?? defaultParentId : defaultParentId,
        [defaultParentId, scopes, selectedScopeId]
    );
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [type, setType] = useState<ScopeType>("Project");
    const [parentId, setParentId] = useState<string>(initialParentId);
    const [parentSearch, setParentSearch] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const parentScope = useMemo(
        () => scopes.find((scope) => scope.id === parentId) ?? null,
        [parentId, scopes]
    );
    const filteredParentScopes = useMemo(
        () => filterScopesForTree(scopes, parentSearch),
        [parentSearch, scopes]
    );
    const parentRoots = useMemo(
        () => getScopeTreeRoots(filteredParentScopes),
        [filteredParentScopes]
    );

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setCreating(true);

        try {
            const createdScope = await createScope({
                name,
                description: description || null,
                type,
                parentId,
            });
            setName("");
            setDescription("");
            setType("Project");
            onCreated(createdScope);
            onOpenChange(false);
        } catch (error) {
            setError(error instanceof Error ? error.message : "Unable to create scope");
        } finally {
            setCreating(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => {
            setParentId(initialParentId);
            setParentSearch("");
            onOpenChange(nextOpen);
        }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create Scope</DialogTitle>
                    <DialogDescription>
                        Add a scope to the current organization tree.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="scope-name">Name</FieldLabel>
                            <Input
                                id="scope-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                required
                                autoFocus
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="scope-description">Description</FieldLabel>
                            <Input
                                id="scope-description"
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="scope-type">Type</FieldLabel>
                            <select
                                id="scope-type"
                                value={type}
                                onChange={(event) => setType(event.target.value as ScopeType)}
                                className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border px-2.5 py-1 text-sm outline-none focus-visible:ring-3"
                            >
                                {scopeTypes.map((scopeType) => (
                                    <option key={scopeType} value={scopeType}>{scopeType}</option>
                                ))}
                            </select>
                        </Field>
                        <Field>
                            <FieldLabel>Parent</FieldLabel>
                            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2 text-sm">
                                {parentScope ? (
                                    <>
                                        <ScopeTypeIcon type={parentScope.type} className="size-3.5 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0 flex-1 truncate">{getScopeDisplayName(parentScope, scopes)}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground">{parentScope.type}</span>
                                    </>
                                ) : (
                                    <span className="text-muted-foreground">Select a parent scope</span>
                                )}
                            </div>
                            <div className="relative">
                                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={parentSearch}
                                    onChange={(event) => setParentSearch(event.target.value)}
                                    placeholder="Search parent scopes..."
                                    aria-label="Search parent scopes"
                                    className="pl-8"
                                />
                            </div>
                            <div className="max-h-[240px] overflow-auto rounded-lg border bg-background p-1" role="tree" aria-label="Parent scopes">
                                {scopes.length === 0 && (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">No parent scopes available.</div>
                                )}
                                {scopes.length > 0 && parentRoots.length === 0 && (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">No scopes match your search.</div>
                                )}
                                {parentRoots.map((item) => (
                                    <ScopeTreeItem
                                        key={item.id}
                                        scope={item}
                                        scopes={filteredParentScopes}
                                        selectedScopeId={parentId}
                                        forceExpanded={parentSearch.trim().length > 0}
                                        onSelect={(scopeId) => {
                                            if (scopeId) {
                                                setParentId(scopeId);
                                            }
                                        }}
                                    />
                                ))}
                            </div>
                            <FieldDescription>
                                Use an organization or personal as the parent for top-level project scopes.
                            </FieldDescription>
                        </Field>
                        {error && (
                            <Field>
                                <FieldError>{error}</FieldError>
                            </Field>
                        )}
                    </FieldGroup>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            <XIcon />
                            Cancel
                        </Button>
                        <Button type="submit" disabled={creating || !parentId}>
                            <PlusIcon />
                            {creating ? "Creating..." : "Create"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
