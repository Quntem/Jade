"use client";

import { IDockviewPanelProps } from "dockview-react";
import { CheckIcon, HardDriveIcon, SettingsIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { addNewTab } from "../dockview-workbench";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Field, FieldDescription, FieldTitle } from "../ui/field";
import { Input } from "../ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useAppContext } from "@/lib/appContext";
import { useCreateResource } from "@/lib/resources";
import { useServers, type JadeServer } from "@/lib/servers";

export function createBucketPanel(props: IDockviewPanelProps) {
  const { scope } = useAppContext();
  const [resourceName, setResourceName] = useState("SeaweedFS Bucket");
  const [bucketName, setBucketName] = useState(`bucket-${Date.now().toString(36)}`);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const servers = useServers({ scopeId: scope });
  const createBucketMutation = useCreateResource();
  const createdBucket = createBucketMutation.data;

  useEffect(() => {
    if (!selectedServerIds.length && servers.data?.length) {
      setSelectedServerIds([servers.data[0].id]);
    }
  }, [selectedServerIds.length, servers.data]);

  const selectedServers = useMemo(
    () => servers.data?.filter((server) => selectedServerIds.includes(server.id)) ?? [],
    [selectedServerIds, servers.data],
  );

  async function handleCreate() {
    if (!scope || !resourceName.trim() || !bucketName.trim() || selectedServerIds.length === 0) {
      return;
    }

    await createBucketMutation.mutate({
      scopeId: scope,
      type: "jade.storage.bucket",
      name: resourceName.trim(),
      spec: {
        bucketName: bucketName.trim(),
        serverIds: selectedServerIds,
      },
    });
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex flex-row items-center gap-4 border-b-1 border-b-[#e4e4e7] p-4">
        <HardDriveIcon size={35} />
        <div className="flex flex-col gap-0">
          <div className="text-lg text-[#666666]">Create Storage Bucket</div>
          <div className="text-sm text-[#999999]">Create a standalone SeaweedFS bucket</div>
        </div>
      </div>

      {createBucketMutation.error ? (
        <div className="mx-6 mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {createBucketMutation.error.message}
        </div>
      ) : null}

      {createdBucket == null ? (
        <div className="flex-1 p-6">
          <Tabs defaultValue="general">
            <TabsList className="mb-2">
              <TabsTrigger value="general">
                <SettingsIcon />
                General
              </TabsTrigger>
              <TabsTrigger value="placement">
                <HardDriveIcon />
                Placement
              </TabsTrigger>
              <TabsTrigger value="confirm">
                <CheckIcon />
                Confirm
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="max-w-2xl">
              <div className="text-2xl font-medium">General</div>
              <p className="text-sm text-[#999999]">
                Choose the resource name, bucket name, and the servers that will host SeaweedFS.
              </p>

              <div className="mt-4 space-y-4">
                <Field>
                  <FieldTitle>Resource Name</FieldTitle>
                  <FieldDescription>Enter a name for this bucket resource</FieldDescription>
                  <Input
                    placeholder="Enter resource name"
                    value={resourceName}
                    onChange={(event) => setResourceName(event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldTitle>Bucket Name</FieldTitle>
                  <FieldDescription>Enter the S3 bucket name</FieldDescription>
                  <Input
                    placeholder="Enter bucket name"
                    value={bucketName}
                    onChange={(event) => setBucketName(event.target.value)}
                  />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="placement" className="max-w-2xl">
              <div className="text-2xl font-medium">Placement</div>
              <p className="text-sm text-[#999999]">
                Pick the servers that should run SeaweedFS for this bucket.
              </p>

              <div className="mt-4 space-y-2">
                {!servers.loaded ? (
                  <div className="text-sm text-[#999999]">Loading servers...</div>
                ) : servers.error ? (
                  <div className="text-sm text-destructive">{servers.error.message}</div>
                ) : servers.data?.length ? (
                  servers.data.map((server) => (
                    <ServerSelectionRow
                      key={server.id}
                      server={server}
                      checked={selectedServerIds.includes(server.id)}
                      onCheckedChange={(checked) =>
                        setSelectedServerIds((current) =>
                          checked
                            ? [...new Set([...current, server.id])]
                            : current.filter((id) => id !== server.id),
                        )
                      }
                    />
                  ))
                ) : (
                  <div className="text-sm text-[#999999]">No servers are available in this scope.</div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="confirm" className="max-w-2xl">
              <div className="text-2xl font-medium">Confirm</div>
              <p className="text-sm text-[#999999]">
                A new bucket resource will be created with the following details.
              </p>

              <div className="mt-4 flex flex-col gap-1 text-sm text-[#666666]">
                <div>Resource Name: {resourceName || "[Not provided]"}</div>
                <div>Bucket Name: {bucketName || "[Not provided]"}</div>
                <div>Scope ID: {scope || "[Not provided]"}</div>
                <div>
                  Servers: {selectedServers.length ? selectedServers.map((server) => server.name).join(", ") : "[Not selected]"}
                </div>
              </div>

              <div className="mt-4">
                <Button
                  onClick={handleCreate}
                  disabled={!scope || !resourceName.trim() || !bucketName.trim() || selectedServerIds.length === 0 || createBucketMutation.loading}
                >
                  {createBucketMutation.loading ? "Creating..." : "Confirm"}
                </Button>
              </div>

              <div className="mt-2">
                {!resourceName.trim() && <p className="text-sm text-red-500">Resource name is required</p>}
                {!bucketName.trim() && <p className="text-sm text-red-500">Bucket name is required</p>}
                {!scope && <p className="text-sm text-red-500">Scope ID is required</p>}
                {selectedServerIds.length === 0 && <p className="text-sm text-red-500">Select at least one server</p>}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="flex h-full w-full flex-1 items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HardDriveIcon />
              </EmptyMedia>
              <EmptyTitle>Storage bucket created</EmptyTitle>
              <EmptyDescription className="flex flex-col gap-2">
                <div>Your storage bucket has been created successfully.</div>
                <code className="select-all rounded border border-[#e4e4e7] bg-[#f5f5f5] p-2">
                  {createdBucket.name}
                </code>
                <p className="text-sm text-[#999999]">
                  Open the storage explorer to browse the new bucket contents.
                </p>
              </EmptyDescription>
              <Button
                onClick={() => {
                  addNewTab(props.containerApi, props.api.group!, "storageExplorer", {
                    text: "Storage Explorer",
                    icon: "hardDrive",
                    resourceId: createdBucket.id,
                  });
                }}
              >
                Open Storage Explorer
              </Button>
              <Button
                onClick={() => {
                  props.api.close();
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

function ServerSelectionRow({
  server,
  checked,
  onCheckedChange,
}: {
  server: JadeServer;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md border border-[#f0f0f0] px-3 py-2 hover:bg-[#fafafa]">
      <Checkbox checked={checked} onCheckedChange={(next) => onCheckedChange(Boolean(next))} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[#444444]">{server.name}</div>
        <div className="truncate text-xs text-[#999999]">
          {server.hostname ?? "No hostname"} · {server.status}
        </div>
      </div>
    </label>
  );
}
