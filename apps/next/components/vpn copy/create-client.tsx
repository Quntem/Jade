"use client";

import { CheckIcon, GlobeIcon, KeyIcon, SettingsIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { IDockviewPanelProps } from "dockview-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Field, FieldDescription, FieldTitle } from "../ui/field";
import { Input } from "../ui/input";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "../ui/empty";
import { Button } from "../ui/button";
import { useAppContext } from "@/lib/appContext";
import {
    downloadVpnClientConfig,
    useCreateVpnClient,
    type VpnClientCreationMode,
} from "@/lib/vpnClients";

export function createVpnClient(_props: IDockviewPanelProps) {
    const { scope } = useAppContext();
    const [name, setName] = useState("");
    const [mode, setMode] = useState<VpnClientCreationMode>("secure");
    const createVpnClientMutation = useCreateVpnClient();

    return (
        <div className="flex h-full w-full flex-col">
            <div className="flex flex-row items-center gap-4 border-b-1 border-b-[#e4e4e7] p-4">
                <KeyIcon size={35} />
                <div className="flex flex-col gap-0">
                    <div className="text-lg text-[#666666]">Create VPN Client</div>
                    <div className="text-sm text-[#999999]">Create a standalone VPN client</div>
                </div>
            </div>
            {createVpnClientMutation.data == null ? (
                <div className="flex-1 p-6">
                    <Tabs defaultValue="general">
                        <TabsList className="mb-2">
                            <TabsTrigger value="general">
                                <SettingsIcon />
                                General
                            </TabsTrigger>
                            <TabsTrigger value="confirm">
                                <CheckIcon />
                                Confirm
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="general" className="max-w-2xl">
                            <div className="text-2xl font-medium">General</div>
                            <p className="text-sm text-[#999999]">
                                Jade will attach this client to the first available hub and generate a config file for you.
                            </p>
                            <div className="mt-4">
                                <Field>
                                    <FieldTitle>Client Name</FieldTitle>
                                    <FieldDescription>Enter a name for this VPN client</FieldDescription>
                                    <Input
                                        placeholder="Enter client name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </Field>
                            </div>
                            <div className="mt-6">
                                <Field>
                                    <FieldTitle>Creation Mode</FieldTitle>
                                    <FieldDescription>
                                        Secure mode keeps the private key ephemeral. Regular mode stores it on Jade so the config can be downloaded later.
                                    </FieldDescription>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            variant={mode === "secure" ? "default" : "outline"}
                                            onClick={() => setMode("secure")}
                                        >
                                            Secure Mode
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={mode === "regular" ? "default" : "outline"}
                                            onClick={() => setMode("regular")}
                                        >
                                            Regular Mode
                                        </Button>
                                    </div>
                                </Field>
                            </div>
                        </TabsContent>
                        <TabsContent value="confirm" className="max-w-2xl">
                            <div className="text-2xl font-medium">Confirm</div>
                            <p className="text-sm text-[#999999]">
                                A new VPN client will be created with the following details
                            </p>
                            <div className="mt-4 flex flex-col gap-1">
                                <div>Client Name: {name || "[Not provided]"}</div>
                                <div>Hub: First available</div>
                                <div>Scope ID: {scope || "[Not provided]"}</div>
                                <div>Mode: {mode === "secure" ? "Secure" : "Regular"}</div>
                            </div>
                            <div className="mt-4">
                                <Button
                                    onClick={async () => {
                                        await createVpnClientMutation.mutate({
                                            name,
                                            scopeId: scope || "",
                                            creationMode: mode,
                                        });
                                    }}
                                    disabled={!name || !scope || createVpnClientMutation.loading}
                                >
                                    {createVpnClientMutation.loading ? "Creating..." : "Confirm"}
                                </Button>
                            </div>
                            <div className="mt-2">
                                {!name && <p className="text-sm text-red-500">Client name is required</p>}
                                {!scope && <p className="text-sm text-red-500">Scope ID is required</p>}
                                {createVpnClientMutation.error ? (
                                    <p className="text-sm text-red-500">{createVpnClientMutation.error.message}</p>
                                ) : null}
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            ) : (
                <div className="flex h-full w-full flex-1 items-center justify-center">
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <GlobeIcon />
                            </EmptyMedia>
                            <EmptyTitle>VPN client created</EmptyTitle>
                            <EmptyDescription className="flex flex-col gap-2">
                                <div>Your VPN client has been created successfully.</div>
                                <code className="select-all rounded border border-[#e4e4e7] bg-[#f5f5f5] p-2">
                                    {createVpnClientMutation.data?.tunnelIp}
                                </code>
                                <p className="text-sm text-[#999999]">
                                    Download the WireGuard config file and import it into your client.
                                </p>
                                {mode === "regular" ? (
                                    <p className="text-sm text-[#999999]">
                                        This config is stored on Jade for later download.
                                    </p>
                                ) : null}
                            </EmptyDescription>
                            <Button
                                onClick={() => {
                                    downloadVpnClientConfig(createVpnClientMutation.data);
                                }}
                            >
                                Download WireGuard Config
                            </Button>
                            <Button
                                onClick={() => {
                                    _props.api.close();
                                }}
                            >
                                <XIcon />
                                Close
                            </Button>
                        </EmptyHeader>
                    </Empty>
                </div>
            )}
        </div>
    );
}
