"use client";

import { useMemo, useState } from "react";
import { ChevronRightIcon, FileIcon, FolderIcon, HardDriveIcon } from "lucide-react";
import { type StorageItem, useFiles } from "@/lib/files";
import { flexRender, getCoreRowModel, type Table as ReactTable, useReactTable } from "@tanstack/react-table";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../ui/table";

export function StorageExplorer() {
    const [location, setLocation] = useState("");
    const files = useFiles({ resourceId: "test", location });
    const pathParts = useMemo(() => getPathParts(location), [location]);
    const table = useReactTable({
        data: files.data?.items || [],
        columns: [
            {
                accessorKey: "name",
                header: "Name",
                cell: ({ row }) => {
                    const item = row.original;
                    const Icon = item.kind === "folder" ? FolderIcon : FileIcon;

                    return <div className="flex min-w-0 items-center gap-2">
                        <Icon size={16} className={item.kind === "folder" ? "shrink-0 text-[#d58a00]" : "shrink-0 text-[#666666]"} />
                        <span className="truncate">{item.name}</span>
                    </div>;
                },
            },
            {
                accessorKey: "type",
                header: "Type",
                cell: ({ row, getValue }) => row.original.kind === "folder" ? "Folder" : getValue<string>(),
            },
            {
                accessorKey: "size",
                header: "Size",
                cell: ({ row, getValue }) => row.original.kind === "folder" ? "-" : formatFileSize(getValue<number>()),
            },
            {
                accessorKey: "lastModified",
                header: "Last modified",
                cell: ({ getValue }) => formatLastModified(getValue<number | undefined>()),
            },
        ],
        getCoreRowModel: getCoreRowModel(),
    });

    return <div className="flex-1">
        <div className="flex flex-row p-4 border-b-1 border-b-[#e4e4e7] items-center gap-4">
            <HardDriveIcon size={35} />
            <div className="flex flex-col gap-0">
                <div className="text-lg text-[#666666]">
                    Storage Name
                </div>
                <div className="text-sm text-[#999999]">Storage Explorer</div>
            </div>
        </div>
        <div className="flex flex-col gap-2 p-4">
            <div className="flex min-h-9 flex-wrap items-center gap-1 text-sm text-[#666666]">
                <button
                    type="button"
                    className="rounded px-2 py-1 hover:bg-[#f4f4f5] disabled:text-[#999999]"
                    disabled={!location}
                    onClick={() => setLocation("")}
                >
                    Root
                </button>
                {pathParts.map((part, index) => (
                    <div key={part.path} className="flex items-center gap-1">
                        <ChevronRightIcon size={14} className="text-[#999999]" />
                        <button
                            type="button"
                            className="rounded px-2 py-1 hover:bg-[#f4f4f5] disabled:text-[#999999]"
                            disabled={index === pathParts.length - 1}
                            onClick={() => setLocation(part.path)}
                        >
                            {part.name}
                        </button>
                    </div>
                ))}
            </div>
            <FilesTable
                table={table}
                isLoading={!files.loaded}
                error={files.error}
                onOpenFolder={setLocation}
            />
        </div>
    </div>;
}

function FilesTable({
    table,
    isLoading,
    error,
    onOpenFolder,
}: {
    table: ReactTable<StorageItem>;
    isLoading: boolean;
    error: Error | null;
    onOpenFolder: (key: string) => void;
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
                        Loading files...
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
                        className={row.original.kind === "folder" ? "cursor-pointer" : undefined}
                        onClick={() => {
                            if (row.original.kind === "folder") {
                                onOpenFolder(row.original.key);
                            }
                        }}
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

function formatFileSize(bytes: number) {
    if (!Number.isFinite(bytes)) {
        return "-";
    }

    if (bytes === 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    const sizeIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** sizeIndex;

    return `${value.toFixed(value >= 10 || sizeIndex === 0 ? 0 : 1)} ${units[sizeIndex]}`;
}

function formatLastModified(value?: number) {
    if (!value) {
        return "-";
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function getPathParts(location: string) {
    const segments = location.split("/").filter(Boolean);

    return segments.map((name, index) => ({
        name,
        path: `${segments.slice(0, index + 1).join("/")}/`,
    }));
}
