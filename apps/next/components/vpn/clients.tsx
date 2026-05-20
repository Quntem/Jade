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
import { useVpnClients, VpnClient } from "@/lib/vpnClients";

const ServersContext = createContext({
    selectedColumns: [] as string[],
    setSelectedColumns: (columns: string[]) => {},
});

const columns: (ColumnDef<VpnClient> & { meta?: { defaultHidden?: boolean } })[] = [
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
        accessorKey: "ip",
        header: "IP",
        id: "ip",
    },
    {
        accessorKey: "status",
        header: "Status",
        id: "status",
    },
    {
        accessorKey: "createdAt",
        header: "Created At",
        id: "createdAt",
        meta: {
            defaultHidden: true,
        },
    },
    {
        accessorKey: "updatedAt",
        header: "Updated At",
        id: "updatedAt",
        meta: {
            defaultHidden: true,
        },
    },
    {
        accessorKey: "publicKey",
        header: "Public Key",
        id: "publicKey",
    },
];

export function Clients(props: IDockviewPanelProps) {
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
    const clients = useVpnClients();
    const table = useReactTable({
        data: clients.data || [],
        columns: columns.filter((column) => enabledColumns.includes(column.id!)),
        getCoreRowModel: getCoreRowModel(),
    });

    return (<ServersContext.Provider value={{ selectedColumns: selectedRows, setSelectedColumns: setSelectedRows }}>
        <div className="flex-1">
            <div className="flex flex-row h-[40px] items-center px-1 border-b-1 border-[#e4e4e7]">
                <Button disabled={selectedRows.length === 0} size="sm" variant={"ghost"} onClick={() => {
                    
                }}><RotateCwIcon />Restart</Button>
                <Button disabled={selectedRows.length === 0} size="sm" variant={"ghost"} onClick={() => {
                    
                }}><TagIcon />Add tags</Button>
                {/* <Button disabled={selectedRows.length === 0 || isWorking} size="sm" variant={"ghost"} onClick={() => runSelectedAction(provisionVpnPeer)}><NetworkIcon />Provision VPN</Button>
                <Button disabled={selectedRows.length === 0 || isWorking} size="sm" variant={"ghost"} onClick={() => runSelectedAction(deliverVpnConfig)}><SendIcon />Deliver VPN</Button>
                <Button disabled={selectedRows.length !== 1 || isWorking} size="sm" variant={"ghost"} onClick={showSelectedConfig}><EyeIcon />Config</Button> */}
                <div className="flex-1" />
                <ColumnSelector enabledColumns={enabledColumns} setEnabledColumns={setEnabledColumns} />
            </div>
            <div className="flex flex-col gap-2 p-4">
                {actionError ? <div className="text-sm text-destructive">{actionError}</div> : null}
                <ClientsTable
                    table={table}
                    isLoading={!clients.loaded}
                    error={clients.error}
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

function ClientsTable({
    table,
    isLoading,
    error,
    selectedRows,
    setSelectedRows,
}: {
    table: ReactTable<VpnClient>;
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
