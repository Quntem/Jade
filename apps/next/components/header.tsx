"use client"
import { Building2Icon, ChevronRightIcon, FolderIcon, MessageSquareXIcon, PanelLeftIcon, PlusIcon, SearchIcon, SwordIcon } from "lucide-react"
import { Avatar, AvatarFallback } from "./ui/avatar"
import { useAuthContext } from "@/lib/auth"
import { useAppContext } from "@/lib/appContext"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { Button } from "./ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { createScope, Scope, ScopeType, useScopes } from "@/lib/scopes"
import { FormEvent, useEffect, useMemo, useState } from "react"

const scopeTypes: ScopeType[] = ["Organization", "Project", "ResourceGroup", "Folder", "System"]

export function HeaderIcon() {
    return (
        <div style={{
            height: 25,
            width: 25,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "5px",
            backgroundColor: "#983DFF",
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
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "40%",
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
            (window as any).setCommandBarOpen()
        }}>
            <SearchIcon size={16} />
            <div style={{
                marginLeft: "8px",
                fontSize: "14px",
            }}>
                Search Quntem Jade
            </div>
        </div>
    )
}

export function Header({
    sidebarOpen,
    hideSidebar,
}: {
    sidebarOpen: [boolean, (value: boolean) => void];
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
                        sidebarOpen[1](!sidebarOpen[0]);
                    }}
                />
            )}
            <div style={{
                display: "flex",
                alignItems: "center"
            }} onClick={() => {
                if (window.location.pathname !== "/") {
                    window.location.pathname = "/";
                }
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

    const selectedScope = useMemo(
        () => scopes.data?.find((item) => item.id === scope) ?? null,
        [scope, scopes.data]
    );
    const scopeSelectionRequired = Boolean(
        scopes.loaded && !scopes.error && (!scope || !selectedScope)
    );

    const roots = useMemo(() => {
        const items = scopes.data ?? [];
        const organizationRoots = items.filter((item) => item.type === "Organization");

        if (organizationRoots.length > 0) {
            return organizationRoots;
        }

        return items.filter((item) => !item.parentId);
    }, [scopes.data]);

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
                        <Building2Icon />
                        {selectedScope?.name ?? "Scope"}
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Switch Scope</DialogTitle>
                    <DialogDescription>
                        Select a different scope to work with.
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[360px] overflow-auto rounded-lg border bg-background p-1" role="tree" aria-label="Scopes">
                    {!scopes.loaded && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Loading scopes...</div>
                    )}
                    {scopes.loaded && scopes.error && (
                        <div className="px-3 py-2 text-sm text-destructive">{scopes.error.message}</div>
                    )}
                    {scopes.loaded && !scopes.error && roots.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No scopes yet.</div>
                    )}
                    {roots.map((item) => (
                        <ScopeTreeItem
                            key={item.id}
                            scope={item}
                            scopes={scopes.data ?? []}
                            selectedScopeId={scope}
                            onSelect={(scopeId) => {
                                setScope(scopeId);
                                setSwitcherOpen(false);
                            }}
                        />
                    ))}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => scopes.reload()}>
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
    level = 0,
}: {
    scope: Scope;
    scopes: Scope[];
    selectedScopeId: string | null;
    onSelect: (scope: string | null) => void;
    level?: number;
}) {
    const children = scopes.filter((item) => item.parentId === scope.id);
    const [expanded, setExpanded] = useState(true);
    const isSelected = selectedScopeId === scope.id;

    return (
        <div role="none">
            <div
                role="treeitem"
                aria-expanded={children.length > 0 ? expanded : undefined}
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
                    aria-label={expanded ? "Collapse scope" : "Expand scope"}
                >
                    {children.length > 0 && (
                        <ChevronRightIcon className={expanded ? "rotate-90 transition-transform" : "transition-transform"} />
                    )}
                </Button>
                <button
                    type="button"
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1 text-left ${isSelected ? "bg-accent text-accent-foreground" : ""}`}
                    onClick={() => onSelect(scope.id)}
                >
                    {scope.type === "Organization" ? (
                        <Building2Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{scope.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{scope.type}</span>
                </button>
            </div>
            {expanded && children.length > 0 && (
                <div role="group">
                    {children.map((child) => (
                        <ScopeTreeItem
                            key={child.id}
                            scope={child}
                            scopes={scopes}
                            selectedScopeId={selectedScopeId}
                            onSelect={onSelect}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    )
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
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [type, setType] = useState<ScopeType>("Project");
    const [parentId, setParentId] = useState<string>(selectedScopeId ?? "");
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (open) {
            setParentId(selectedScopeId ?? "");
        }
    }, [open, selectedScopeId]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setCreating(true);

        try {
            const createdScope = await createScope({
                name,
                description: description || null,
                type,
                parentId: parentId || null,
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
            setParentId(selectedScopeId ?? "");
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
                            <FieldLabel htmlFor="scope-parent">Parent</FieldLabel>
                            <select
                                id="scope-parent"
                                value={parentId}
                                onChange={(event) => setParentId(event.target.value)}
                                className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border px-2.5 py-1 text-sm outline-none focus-visible:ring-3"
                            >
                                <option value="">No parent</option>
                                {scopes.map((scope) => (
                                    <option key={scope.id} value={scope.id}>{scope.name}</option>
                                ))}
                            </select>
                            <FieldDescription>
                                Use an organization as the parent for top-level project scopes.
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
                            Cancel
                        </Button>
                        <Button type="submit" disabled={creating}>
                            {creating ? "Creating..." : "Create"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
