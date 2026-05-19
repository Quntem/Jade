"use client";

import { CheckIcon, ColumnsIcon, KeyIcon, PlusIcon, SettingsIcon, XIcon } from "lucide-react";
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
import { useState } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

const columns = [
    {
        accessorKey: "name",
        header: "Name",
        id: "name",
    },
    {
        accessorKey: "description",
        header: "Description",
        id: "description",
        cell: ({ getValue }: { getValue: () => string | null }) => getValue() || "-",
    },
    {
        accessorKey: "scopeId",
        header: "Scope ID",
        id: "scopeId",
    },
    {
        accessorKey: "createdBy",
        header: "Created By",
        id: "createdBy",
    },
    {
        accessorKey: "expiresAt",
        header: "Expires At",
        id: "expiresAt",
        meta: {
            defaultHidden: true,
        },
    },
    {
        accessorKey: "usedAt",
        header: "Used At",
        id: "usedAt",
        meta: {
            defaultHidden: true,
        },
    },
    {
        accessorKey: "revokedAt",
        header: "Revoked At",
        id: "revokedAt",
        meta: {
            defaultHidden: true,
        },
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

export function AccessTokens(props: IDockviewPanelProps) {
    const [enabledColumns, setEnabledColumns] = useState<Array<string>>(Array.from(columns).filter((column) => !column.meta?.defaultHidden).map((column) => column.id));
    const accessTokens = useAccessTokens();
    const table = useReactTable({
        data: accessTokens.data || [],
        columns: columns.filter((column) => enabledColumns.includes(column.id)),
        getCoreRowModel: getCoreRowModel(),
    });

    return <div className="flex-1">
        <div className="flex flex-row h-[40px] items-center px-1 border-b-1 border-[#e4e4e7]">
            <Button size="sm" variant={"ghost"} onClick={() => {
                addNewTab(props.containerApi, props.api.group!, "accessTokens_create", { text: "Create Access Token", icon: "key" });
            }}><PlusIcon />Create Access Token</Button>
            <div className="flex-1" />
            <ColumnSelector enabledColumns={enabledColumns} setEnabledColumns={setEnabledColumns} />
        </div>
        <div className="flex flex-col gap-2 p-4">
            <AccessTokensTable
                table={table}
                isLoading={!accessTokens.loaded}
                error={accessTokens.error}
            />
        </div>
    </div>;
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

function AccessTokensTable({
    table,
    isLoading,
    error,
}: {
    table: ReactTable<AccessToken>;
    isLoading: boolean;
    error: Error | null;
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
                        Loading access tokens...
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

export function createAccessToken(_props: IDockviewPanelProps) {
    const [tokenName, setTokenName] = useState("");
    const [tokenDescription, setTokenDescription] = useState("");
    const createAccessTokenMutation = useCreateAccessToken();
    return <div className="flex-1 flex-col w-full h-full">
        <div className="flex flex-row p-4 border-b-1 border-b-[#e4e4e7] items-center gap-4">
            <KeyIcon size={35} />
            <div className="flex flex-col gap-0">
                <div className="text-lg text-[#666666]">
                    Create Access Token
                </div>
                <div className="text-sm text-[#999999]">Create a new access token</div>
            </div>
        </div>
        {createAccessTokenMutation.data == null ? (
            <div className="flex-1 p-6">
                <Tabs defaultValue="general">
                    <TabsList className="mb-2">
                        <TabsTrigger value="general"><SettingsIcon /> General</TabsTrigger>
                        <TabsTrigger value="confirm"><CheckIcon /> Confirm</TabsTrigger>
                    </TabsList>
                    <TabsContent value="general" className="max-w-2xl">
                        <div className="text-2xl font-medium">General</div>
                        <p className="text-sm text-[#999999]">An access token is used to enroll a new server into your Jade scope</p>
                        <div className="mt-4">
                            {/* <div className="text-xl mt-6 mb-3">Information</div> */}
                            <Field>
                                <FieldTitle>Token Name</FieldTitle>
                                <FieldDescription>Enter a name for the access token</FieldDescription>
                                <Input placeholder="Enter token name" value={tokenName} onChange={(e) => setTokenName(e.target.value)} />
                            </Field>
                            <Field className="mt-4">
                                <FieldTitle>Description</FieldTitle>
                                <FieldDescription>Describe what this token will be used for</FieldDescription>
                                <Input placeholder="Optional description" value={tokenDescription} onChange={(e) => setTokenDescription(e.target.value)} />
                            </Field>
                        </div>
                    </TabsContent>
                    <TabsContent value="confirm" className="max-w-2xl">
                        <div className="text-2xl font-medium">Confirm</div>
                        <p className="text-sm text-[#999999]">A new token will be created with the following details</p>
                        <div className="mt-4">
                            <div>Token Name: {tokenName || "[Not provided]"}</div>
                            <div>Token Description: {tokenDescription || "[Not provided]"}</div>
                            <div>Scope ID: {window.localStorage.getItem('scope') || "[Not provided]"}</div>
                        </div>
                        <div className="mt-4">
                            <Button onClick={() => {
                                createAccessTokenMutation.create({
                                    name: tokenName,
                                    description: tokenDescription,
                                    scopeId: window.localStorage.getItem('scope') || ""
                                });
                            }} disabled={!tokenName || !tokenDescription || !window.localStorage.getItem('scope')}>Confirm</Button>
                        </div>
                        <div className="mt-2">
                            {!tokenName && <p className="text-sm text-red-500">Token name is required</p>}
                            {!tokenDescription && <p className="text-sm text-red-500">Token description is required</p>}
                            {!window.localStorage.getItem('scope') && <p className="text-sm text-red-500">Scope ID is required</p>}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        ) : (
            <div className="flex-1 flex w-full h-full items-center justify-center">
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <CheckIcon />
                        </EmptyMedia>
                        <EmptyTitle>Access token created</EmptyTitle>
                        <EmptyDescription className="flex flex-col gap-2">
                            <div>Your access token has been created successfully.</div>
                            <code className="select-all bg-[#f5f5f5] p-2 border border-[#e4e4e7] rounded">{createAccessTokenMutation.data?.token}</code>
                            <p className="text-sm text-[#999999]">Copy this token and store it securely. You won't be able to see it again.</p>
                        </EmptyDescription>
                        <Button onClick={() => {
                            _props.api.close();
                        }}><XIcon />Close</Button>
                    </EmptyHeader>
                </Empty>
            </div>
        )}
    </div>;
}
