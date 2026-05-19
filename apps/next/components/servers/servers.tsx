"use client";

import { ColumnsIcon, EyeIcon, NetworkIcon, RotateCwIcon, SendIcon, TagIcon } from "lucide-react";
import { flexRender, getCoreRowModel, type Table as ReactTable, useReactTable } from "@tanstack/react-table";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../ui/table";
import { AccessToken, useAccessTokens, useCreateAccessToken } from "@/lib/accessTokens";
import { Button } from "../ui/button";
import { IDockviewPanelProps } from "dockview-react";
import { createContext, useContext, useState } from "react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { deliverVpnConfig, getVpnConfig, JadeServer, provisionVpnPeer, SpokeVpnConfig, useServers } from "@/lib/servers";
import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

const ServersContext = createContext({
    selectedColumns: [] as string[],
    setSelectedColumns: (columns: string[]) => {},
});

const columns: (ColumnDef<JadeServer> & { meta?: { defaultHidden?: boolean } })[] = [
    {
        cell: (cell) => {
            const { selectedColumns, setSelectedColumns } = useContext(ServersContext);
            return <Checkbox checked={selectedColumns.includes(cell.row.original.id)} onCheckedChange={(checked) => setSelectedColumns(checked ? [...selectedColumns, cell.row.original.id] : selectedColumns.filter((col) => col !== cell.row.original.id))} />;
        },
        id: "checkbox",
    },
    {
        accessorKey: "name",
        header: "Name",
        id: "name",
    },
    {
        accessorKey: "hostname",
        header: "Hostname",
        id: "hostname",
    },
    {
        accessorKey: "scopeId",
        header: "Scope ID",
        id: "scopeId",
        meta: {
            defaultHidden: true,
        },
    },
    {
        accessorKey: "status",
        header: "Status",
        id: "status",
    },
    {
        header: "VPN",
        id: "vpnStatus",
        cell: (cell) => cell.row.original.vpnPeers[0]?.status ?? "Not provisioned",
    },
    {
        header: "Tunnel IP",
        id: "vpnTunnelIp",
        cell: (cell) => cell.row.original.vpnPeers[0]?.tunnelIp ?? "-",
    },
    {
        header: "VPN Revision",
        id: "vpnRevision",
        cell: (cell) => {
            const revision = cell.row.original.vpnPeers[0]?.configRevisions[0];
            return revision ? `#${revision.revision} ${revision.deliveryStatus}` : "-";
        },
        meta: {
            defaultHidden: true,
        },
    },
    {
        accessorKey: "arch",
        header: "Architecture",
        id: "arch",
    },
    {
        accessorKey: "createdAt",
        header: "Created At",
        id: "createdAt",
    },
    {
        accessorKey: 'lastSeenAt',
        header: 'Last Seen At',
        id: 'lastSeenAt',
        meta: {
            defaultHidden: true,
        },
    },
    {
        accessorKey: "os",
        header: "OS",
        id: "os",
        meta: {
            defaultHidden: true,
        },
    }, 
    {
        accessorKey: "version",
        header: "Version",
        id: "version",
        meta: {
            defaultHidden: true,
        },
    }

];

export function Servers(props: IDockviewPanelProps) {
    const [selectedRows, setSelectedRows] = useState<Array<string>>([]);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);
    const [configDialogOpen, setConfigDialogOpen] = useState(false);
    const [config, setConfig] = useState<SpokeVpnConfig | null>(null);
    const [enabledColumns, setEnabledColumns] = useState<Array<string>>(
        columns
            .filter((column) => column.id && !column.meta?.defaultHidden)
            .map((column) => column.id as string),
    );
    const servers = useServers();
    const table = useReactTable({
        data: servers.data || [],
        columns: columns.filter((column) => enabledColumns.includes(column.id!)),
        getCoreRowModel: getCoreRowModel(),
    });
    async function runSelectedAction(action: (serverId: string) => Promise<unknown>) {
        setIsWorking(true);
        setActionError(null);

        try {
            for (const serverId of selectedRows) {
                await action(serverId);
            }
            await servers.reload();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : "Action failed");
        } finally {
            setIsWorking(false);
        }
    }

    async function showSelectedConfig() {
        const serverId = selectedRows[0];
        if (!serverId) return;

        setIsWorking(true);
        setActionError(null);

        try {
            setConfig(await getVpnConfig(serverId));
            setConfigDialogOpen(true);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : "Unable to load VPN config");
        } finally {
            setIsWorking(false);
        }
    }

    return (<ServersContext.Provider value={{ selectedColumns: selectedRows, setSelectedColumns: setSelectedRows }}>
        <div className="flex-1">
            <div className="flex flex-row h-[40px] items-center px-1 border-b-1 border-[#e4e4e7]">
                <Button disabled={selectedRows.length === 0} size="sm" variant={"ghost"} onClick={() => {
                    
                }}><RotateCwIcon />Restart</Button>
                <Button disabled={selectedRows.length === 0} size="sm" variant={"ghost"} onClick={() => {
                    
                }}><TagIcon />Add tags</Button>
                <Button disabled={selectedRows.length === 0 || isWorking} size="sm" variant={"ghost"} onClick={() => runSelectedAction(provisionVpnPeer)}><NetworkIcon />Provision VPN</Button>
                <Button disabled={selectedRows.length === 0 || isWorking} size="sm" variant={"ghost"} onClick={() => runSelectedAction(deliverVpnConfig)}><SendIcon />Deliver VPN</Button>
                <Button disabled={selectedRows.length !== 1 || isWorking} size="sm" variant={"ghost"} onClick={showSelectedConfig}><EyeIcon />Config</Button>
                <div className="flex-1" />
                <ColumnSelector enabledColumns={enabledColumns} setEnabledColumns={setEnabledColumns} />
            </div>
            <div className="flex flex-col gap-2 p-4">
                {actionError ? <div className="text-sm text-destructive">{actionError}</div> : null}
                <ServersTable
                    table={table}
                    isLoading={!servers.loaded}
                    error={servers.error}
                    selectedRows={selectedRows}
                    setSelectedRows={setSelectedRows}
                />
            </div>
            <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>VPN Config</DialogTitle>
                        <DialogDescription>{config ? `${config.tunnelIp} via ${config.endpoint}` : "No config loaded"}</DialogDescription>
                    </DialogHeader>
                    <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs">
                        {config?.renderedConfig ?? ""}
                    </pre>
                </DialogContent>
            </Dialog>
        </div>
    </ServersContext.Provider>);
}

function ColumnSelector({ enabledColumns, setEnabledColumns }: { enabledColumns: Array<string>; setEnabledColumns: (columns: Array<string>) => void }) {
    return <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm"><ColumnsIcon />Select Columns</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
            {columns.filter((column) => column.id).map((column) => {
                const columnId = column.id as string;

                return (
                <DropdownMenuCheckboxItem onClick={(e) => e.stopPropagation()} checked={enabledColumns.includes(columnId)} onCheckedChange={(checked) => {
                    if (checked) {
                        setEnabledColumns([...enabledColumns, columnId]);
                    } else {
                        setEnabledColumns(enabledColumns.filter((id) => id !== columnId));
                    }
                }} key={columnId}>
                    {typeof column.header === "string" ? column.header : columnId}
                </DropdownMenuCheckboxItem>
            )})}
        </DropdownMenuContent>
    </DropdownMenu>;
}

function ServersTable({
    table,
    isLoading,
    error,
    selectedRows,
    setSelectedRows,
}: {
    table: ReactTable<JadeServer>;
    isLoading: boolean;
    error: Error | null;
    selectedRows: Array<string>;
    setSelectedRows: (rows: Array<string>) => void;
}) {
    const columnCount = table.getAllColumns().length;

    return <Table>
        <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-white">
                    {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                            {header.isPlaceholder ? null : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                            )}
                        </TableHead>
                    ))}
                </TableRow>
            ))}
        </TableHeader>
        <TableBody>
            {isLoading ? (
                <TableRow>
                    <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                        Loading servers...
                    </TableCell>
                </TableRow>
            ) : error ? (
                <TableRow>
                    <TableCell colSpan={columnCount} className="h-24 text-center text-destructive">
                        {error.message}
                    </TableCell>
                </TableRow>
            ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                    <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() && "selected"}
                    >
                        {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                        ))}
                    </TableRow>
                ))
            ) : (
                <TableRow>
                    <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                        No items found.
                    </TableCell>
                </TableRow>
            )}
        </TableBody>
    </Table>;
}
