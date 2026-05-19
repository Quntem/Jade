"use client";

import { CheckIcon, KeyIcon, PlusIcon, SettingsIcon, XIcon } from "lucide-react";
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

export function AccessTokens(props: IDockviewPanelProps) {
    const accessTokens = useAccessTokens();
    const table = useReactTable({
        data: accessTokens.data || [],
        columns: [
            {
                accessorKey: "name",
                header: "Name",
            },
            {
                accessorKey: "description",
                header: "Description",
                cell: ({ getValue }) => getValue<string | null>() || "-",
            },
            {
                accessorKey: "scopeId",
                header: "Scope ID",
            },
            {
                accessorKey: "createdBy",
                header: "Created By",
            },
            {
                accessorKey: "expiresAt",
                header: "Expires At",
            },
            {
                accessorKey: "usedAt",
                header: "Used At",
            },
            {
                accessorKey: "revokedAt",
                header: "Revoked At",
            },
            {
                accessorKey: "createdAt",
                header: "Created At",
            },
            {
                accessorKey: "updatedAt",
                header: "Updated At",
            },
        ],
        getCoreRowModel: getCoreRowModel(),
    });

    return <div className="flex-1">
        <div className="flex flex-row p-4 border-b-1 border-b-[#e4e4e7] items-center gap-4">
            <KeyIcon size={35} />
            <div className="flex flex-col gap-0">
                <div className="text-lg text-[#666666]">
                    Access Tokens
                </div>
                <div className="text-sm text-[#999999]">Access Tokens Explorer</div>
            </div>
            <div className="ml-auto">
                <Button onClick={() => {
                    addNewTab(props.containerApi, props.api.group!, "accessTokens_create", { text: "Create Access Token", icon: "key" });
                }}><PlusIcon />Create Access Token</Button>
            </div>
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
