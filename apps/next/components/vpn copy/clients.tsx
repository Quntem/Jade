"use client";

import { ColumnsIcon, DownloadIcon, PlusIcon, Trash2Icon } from "lucide-react";
import {
    flexRender,
    getCoreRowModel,
    type Table as ReactTable,
    useReactTable,
} from "@tanstack/react-table";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../ui/table";
import { Button } from "../ui/button";
import { IDockviewPanelProps } from "dockview-react";
import { addNewTab } from "../dockview-workbench";
import { createContext, useContext, useState } from "react";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Checkbox } from "../ui/checkbox";
import { ColumnDef } from "@tanstack/react-table";
import {
    deleteVpnClient,
    downloadVpnClientConfig,
    getVpnClientConfig,
    useVpnClients,
    type VpnClient,
} from "@/lib/vpnClients";

const columns: (ColumnDef<VpnClient> & { meta?: { defaultHidden?: boolean } })[] = [
    {
        cell: (cell) => {
            const { selectedColumns, setSelectedColumns } = useContext(ServersContext);
            return (
                <Checkbox
                    checked={selectedColumns.includes(cell.row.original.id)}
                    onCheckedChange={(checked) =>
                        setSelectedColumns(
                            checked
                                ? [...selectedColumns, cell.row.original.id]
                                : selectedColumns.filter((col) => col !== cell.row.original.id),
                        )
                    }
                />
            );
        },
        id: "checkbox",
    },
    {
        accessorKey: "name",
        header: "Name",
        id: "name",
    },
    {
        accessorKey: "tunnelIp",
        header: "Tunnel IP",
        id: "tunnelIp",
    },
    {
        accessorKey: "status",
        header: "Status",
        id: "status",
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
        accessorKey: "hubId",
        header: "Hub ID",
        id: "hubId",
        meta: {
            defaultHidden: true,
        },
    },
    {
        accessorKey: "publicKey",
        header: "Public Key",
        id: "publicKey",
    },
    {
        cell: (cell) => <ClientConfigAction client={cell.row.original} />,
        header: "Config Mode",
        id: "config",
    },
    {
        accessorKey: "createdAt",
        header: "Created At",
        id: "createdAt",
    },
    {
        accessorKey: "updatedAt",
        header: "Updated At",
        id: "updatedAt",
        meta: {
            defaultHidden: true,
        },
    },
];

const ServersContext = createContext({
    selectedColumns: [] as string[],
    setSelectedColumns: (_columns: string[]) => {},
});

function ClientDownloadAction({ clients }: { clients: VpnClient[] }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleDownload() {
        if (!clients?.[0]?.privateKeyStored || loading || clients.length > 1) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const config = await getVpnClientConfig(clients?.[0]?.id);
            downloadVpnClientConfig(config);
        } catch (downloadError) {
            setError(
                downloadError instanceof Error
                    ? downloadError.message
                    : "Unable to download VPN config",
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <Button disabled={loading || !clients?.[0]?.privateKeyStored || clients.length > 1} variant={"ghost"} size="sm" onClick={handleDownload}>
            <DownloadIcon />
            {loading ? "Downloading..." : "Download"}
        </Button>
    );
}

function ClientConfigAction({ client }: { client: VpnClient }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleDownload() {
        if (!client.privateKeyStored || loading) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const config = await getVpnClientConfig(client.id);
            downloadVpnClientConfig(config);
        } catch (downloadError) {
            setError(
                downloadError instanceof Error
                    ? downloadError.message
                    : "Unable to download VPN config",
            );
        } finally {
            setLoading(false);
        }
    }

    if (!client.privateKeyStored) {
        return <span>Secure mode</span>;
    }

    // return (
    //     <div className="flex items-center gap-2">
    //         <Button size="sm" variant="outline" onClick={handleDownload} disabled={loading}>
    //             {loading ? "Downloading..." : "Download"}
    //         </Button>
    //         {error ? <span className="text-xs text-red-500">{error}</span> : null}
    //     </div>
    // );

    return <span>Regular mode</span>;
}

export function Clients(props: IDockviewPanelProps) {
    const [selectedRows, setSelectedRows] = useState<Array<string>>([]);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
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

    async function handleDeleteSelected() {
        if (selectedRows.length === 0 || deleting) {
            return;
        }

        const label =
            selectedRows.length === 1 ? "this VPN tunnel" : `${selectedRows.length} VPN tunnels`;

        if (
            typeof window !== "undefined" &&
            !window.confirm(`Delete ${label}? This cannot be undone.`)
        ) {
            return;
        }

        setDeleting(true);
        setDeleteError(null);

        try {
            await Promise.all(selectedRows.map((id) => deleteVpnClient(id)));
            setSelectedRows([]);
            await clients.reload();
        } catch (error) {
            setDeleteError(
                error instanceof Error ? error.message : "Unable to delete VPN tunnels",
            );
        } finally {
            setDeleting(false);
        }
    }

    return (
        <ServersContext.Provider
            value={{ selectedColumns: selectedRows, setSelectedColumns: setSelectedRows }}
        >
            <div className="flex-1">
                <div className="flex h-[40px] flex-row items-center border-b-1 border-[#e4e4e7] px-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            addNewTab(props.containerApi, props.api.group!, "vpn_client_create", {
                                text: "Create VPN Client",
                                icon: "globe",
                            });
                        }}
                        >
                            <PlusIcon />Create VPN Client
                        </Button>
                        <ClientDownloadAction clients={clients.data?.filter((client) => selectedRows.includes(client.id)) || []} />
                        <Button
                            size="sm"
                            variant="ghost"
                            disabled={selectedRows.length === 0 || deleting}
                            onClick={handleDeleteSelected}
                        >
                            <Trash2Icon />
                            {deleting
                                ? "Deleting..."
                                : selectedRows.length > 1
                                    ? `Delete Tunnels (${selectedRows.length})`
                                    : "Delete Tunnel"}
                        </Button>
                    <div className="flex-1" />
                    <ColumnSelector
                        enabledColumns={enabledColumns}
                        setEnabledColumns={setEnabledColumns}
                    />
                </div>
                <div className="flex flex-col gap-2 p-4">
                    {deleteError ? (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {deleteError}
                        </div>
                    ) : null}
                    <ClientsTable
                        table={table}
                        isLoading={!clients.loaded}
                        error={clients.error}
                        selectedRows={selectedRows}
                    />
                </div>
            </div>
        </ServersContext.Provider>
    );
}

function ColumnSelector({
    enabledColumns,
    setEnabledColumns,
}: {
    enabledColumns: Array<string>;
    setEnabledColumns: (columns: Array<string>) => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                    <ColumnsIcon />
                    Select Columns
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                {columns.filter((column) => column.id).map((column) => {
                    const columnId = column.id as string;

                    return (
                        <DropdownMenuCheckboxItem
                            onClick={(e) => e.stopPropagation()}
                            checked={enabledColumns.includes(columnId)}
                            onCheckedChange={(checked) => {
                                if (checked) {
                                    setEnabledColumns([...enabledColumns, columnId]);
                                } else {
                                    setEnabledColumns(enabledColumns.filter((id) => id !== columnId));
                                }
                            }}
                            key={columnId}
                        >
                            {typeof column.header === "string" ? column.header : columnId}
                        </DropdownMenuCheckboxItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function ClientsTable({
    table,
    isLoading,
    error,
    selectedRows,
}: {
    table: ReactTable<VpnClient>;
    isLoading: boolean;
    error: Error | null;
    selectedRows: Array<string>;
}) {
    const columnCount = table.getAllColumns().length;

    return (
        <Table>
            <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="hover:bg-white">
                        {headerGroup.headers.map((header) => (
                            <TableHead key={header.id}>
                                {header.isPlaceholder
                                    ? null
                                    : flexRender(header.column.columnDef.header, header.getContext())}
                            </TableHead>
                        ))}
                    </TableRow>
                ))}
            </TableHeader>
            <TableBody>
                {isLoading ? (
                    <TableRow>
                        <TableCell
                            colSpan={columnCount}
                            className="h-24 text-center text-muted-foreground"
                        >
                            Loading VPN clients...
                        </TableCell>
                    </TableRow>
                ) : error ? (
                    <TableRow>
                        <TableCell
                            colSpan={columnCount}
                            className="h-24 text-center text-destructive"
                        >
                            {error.message}
                        </TableCell>
                    </TableRow>
                ) : table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                        <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                            {row.getVisibleCells().map((cell) => (
                                <TableCell key={cell.id}>
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))
                ) : (
                    <TableRow>
                        <TableCell
                            colSpan={columnCount}
                            className="h-24 text-center text-muted-foreground"
                        >
                            No items found.
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
}
