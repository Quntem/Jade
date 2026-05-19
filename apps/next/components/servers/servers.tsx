"use client";

import { CheckIcon, ColumnsIcon, KeyIcon, PlusIcon, RotateCwIcon, SettingsIcon, TagIcon, XIcon } from "lucide-react";
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
import { addNewTab } from "../dockview-workbench";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Field, FieldDescription, FieldTitle } from "../ui/field";
import { Input } from "../ui/input";
import { createContext, useContext, useState } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { JadeServer, useServers } from "@/lib/servers";
import { ColumnDef } from "@tanstack/react-table";
import { Server } from "../../../../packages/database/src/generated/prisma/client";
import { Checkbox } from "../ui/checkbox";

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
    const [enabledColumns, setEnabledColumns] = useState<Array<string>>(Array.from(columns).filter((column) => !column.meta?.defaultHidden).map((column) => column.id));
    const servers = useServers();
    const table = useReactTable({
        data: servers.data || [],
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
                <div className="flex-1" />
                <ColumnSelector enabledColumns={enabledColumns} setEnabledColumns={setEnabledColumns} />
            </div>
            <div className="flex flex-col gap-2 p-4">
                <ServersTable
                    table={table}
                    isLoading={!servers.loaded}
                    error={servers.error}
                    selectedRows={selectedRows}
                    setSelectedRows={setSelectedRows}
                />
            </div>
        </div>
    </ServersContext.Provider>);
}

function ColumnSelector({ enabledColumns, setEnabledColumns }: { enabledColumns: Array<string>; setEnabledColumns: (columns: Array<string>) => void }) {
    return <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm"><ColumnsIcon />Select Columns</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
            {columns.map((column) => (
                <DropdownMenuCheckboxItem onClick={(e) => e.stopPropagation()} checked={enabledColumns.includes(column.id)} onCheckedChange={(checked) => {
                    if (checked) {
                        setEnabledColumns([...enabledColumns, column.id]);
                    } else {
                        setEnabledColumns(enabledColumns.filter((id) => id !== column.id));
                    }
                }} key={column.id}>
                    {column.header}
                </DropdownMenuCheckboxItem>
            ))}
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
