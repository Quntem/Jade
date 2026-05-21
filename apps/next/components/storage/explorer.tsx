"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRightIcon, FileIcon, FolderIcon, HardDriveIcon } from "lucide-react";
import { type IDockviewPanelProps } from "dockview-react";
import { type StorageItem, useFiles } from "@/lib/files";
import { useAppContext } from "@/lib/appContext";
import { useResources } from "@/lib/resources";
import { flexRender, getCoreRowModel, type Table as ReactTable, useReactTable } from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

type StorageExplorerParams = {
  resourceId?: string;
};

export function StorageExplorer(props: IDockviewPanelProps<StorageExplorerParams>) {
  const { scope } = useAppContext();
  const bucketResources = useResources({ scopeId: scope, type: "jade.storage.bucket" });
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    props.params?.resourceId ?? null,
  );
  const [location, setLocation] = useState("");

  useEffect(() => {
    if (props.params?.resourceId) {
      setSelectedResourceId(props.params.resourceId);
      return;
    }

    if (!selectedResourceId && bucketResources.data?.length) {
      setSelectedResourceId(bucketResources.data[0].id);
    }
  }, [bucketResources.data, props.params?.resourceId, selectedResourceId]);

  useEffect(() => {
    setLocation("");
  }, [selectedResourceId]);

  const selectedResource = useMemo(
    () => bucketResources.data?.find((item) => item.id === selectedResourceId) ?? null,
    [bucketResources.data, selectedResourceId],
  );

  const connection = selectedResource
    ? (selectedResource.status as {
        connection?: {
          endpoint: string;
          accessKeyId: string;
          secretAccessKey: string;
          bucket: string;
        };
      }).connection
    : null;

  const files = useFiles({
    resourceId: selectedResource?.id ?? null,
    location,
    enabled: Boolean(connection),
  });
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

          return (
            <div className="flex min-w-0 items-center gap-2">
              <Icon
                size={16}
                className={item.kind === "folder" ? "shrink-0 text-[#d58a00]" : "shrink-0 text-[#666666]"}
              />
              <span className="truncate">{item.name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row, getValue }) => (row.original.kind === "folder" ? "Folder" : getValue<string>()),
      },
      {
        accessorKey: "size",
        header: "Size",
        cell: ({ row, getValue }) => (row.original.kind === "folder" ? "-" : formatFileSize(getValue<number>())),
      },
      {
        accessorKey: "lastModified",
        header: "Last modified",
        cell: ({ getValue }) => formatLastModified(getValue<number | undefined>()),
      },
    ],
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex-1">
      <div className="flex flex-row items-center gap-4 border-b-1 border-b-[#e4e4e7] p-4">
        <HardDriveIcon size={35} />
        <div className="flex flex-col gap-0">
          <div className="text-lg text-[#666666]">{selectedResource?.name ?? "Storage Bucket"}</div>
          <div className="text-sm text-[#999999]">
            {connection ? `${connection.bucket} · ${connection.endpoint}` : "Storage Explorer"}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4 p-4">
        {!selectedResourceId ? (
          <div className="text-sm text-[#999999]">Select a storage bucket to browse.</div>
        ) : !selectedResource ? (
          <div className="text-sm text-[#999999]">Loading bucket...</div>
        ) : !connection ? (
          <div className="rounded-md border border-[#e4e4e7] bg-[#fafafa] p-4 text-sm text-[#666666]">
            Bucket is still being deployed. Once SeaweedFS finishes installing and the S3 gateway is ready,
            browsing will unlock here.
          </div>
        ) : (
          <>
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
          </>
        )}
        {!props.params?.resourceId && bucketResources.data?.length ? (
          <div className="flex flex-wrap gap-2 border-t border-[#e4e4e7] pt-3">
            {bucketResources.data.map((bucket) => (
              <button
                key={bucket.id}
                type="button"
                className={`rounded-md px-3 py-2 text-left text-sm ${
                  bucket.id === selectedResourceId
                    ? "bg-primary text-primary-foreground"
                    : "text-[#666666] hover:bg-[#f5f5f5]"
                }`}
                onClick={() => setSelectedResourceId(bucket.id)}
              >
                {bucket.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
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
    </Table>
  );
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
