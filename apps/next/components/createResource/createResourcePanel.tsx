import { IDockviewPanelProps } from "dockview-react";
import {
  CodeIcon,
  ContainerIcon,
  DatabaseIcon,
  GlobeIcon,
  HardDriveIcon,
  HomeIcon,
  LayoutGridIcon,
  MonitorIcon,
  NetworkIcon,
  PlusIcon,
  SearchIcon,
  ServerIcon,
  UserIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../ui/item";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { useAppContext } from "@/lib/appContext";
import { useServers, type JadeServer } from "@/lib/servers";
import { useCreateResource } from "@/lib/resources";
import { addNewTab } from "../dockview-workbench";

const resourceTypes = [
  { id: "jade.compute.virutalMachine", name: "Virtual Machine", icon: ServerIcon, category: "compute", description: "Create a virtual machine" },
  { id: "jade.compute.container", name: "Container", icon: ContainerIcon, category: "compute", description: "Create a container" },
  { id: "jade.compute.function", name: "Function", icon: CodeIcon, category: "compute", description: "Create a function" },
  { id: "jade.storage.bucket", name: "Storage Bucket", icon: HardDriveIcon, category: "storage", description: "Create a storage bucket" },
  { id: "jade.deskspace.collection", name: "DeskSpace Collection", icon: LayoutGridIcon, category: "endUser", description: "Create a deskspace collection" },
  { id: "jade.deskspace.session", name: "DeskSpace Session", icon: MonitorIcon, category: "endUser", description: "Create a deskspace session" },
  { id: "jade.hosting.whs", name: "Web Hosting Service", icon: GlobeIcon, category: "hosting", description: "Create a web hosting service" },
  { id: "jade.database.postgres", name: "PostgreSQL Database", icon: DatabaseIcon, category: "database", description: "Create a PostgreSQL database" },
];

const sidebarTabs = [
  { id: "all", text: "All", Icon: HomeIcon },
  { id: "compute", text: "Compute", Icon: ServerIcon },
  { id: "storage", text: "Storage", Icon: HardDriveIcon },
  { id: "endUser", text: "End User", Icon: UserIcon },
  { id: "database", text: "Database", Icon: DatabaseIcon },
  { id: "hosting", text: "Hosting", Icon: GlobeIcon },
  { id: "networking", text: "Networking", Icon: NetworkIcon },
];

export function CreateResourcePanel(props: IDockviewPanelProps) {
  const { scope } = useAppContext();
  const [tab, setTab] = useState("all");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  return (
    <div className="flex h-full w-full flex-1 flex-col">
      <div className="flex flex-row items-center gap-4 border-b-1 border-b-[#e4e4e7] p-4">
        <PlusIcon />
        <div className="flex flex-col gap-0">
          <div className="text-lg text-[#666666]">Create resource</div>
        </div>
      </div>
      <div className="flex flex-1 flex-row">
        <div className="flex flex-col border-r-1 border-[#e4e4e7] p-4 w-[250px]">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search" />
          </InputGroup>
          <div className="mt-2 flex flex-col gap-1">
            {sidebarTabs.map(({ id, text, Icon }) => (
              <TabItem
                key={id}
                Icon={Icon}
                text={text}
                active={tab === id}
                onClick={() => setTab(id)}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4">
          {!selectedTypeId ? (
            <>
              <div className="text-2xl font-medium text-[#666666]">
                {tab === "all" ? "All resources" : sidebarTabs.find((item) => item.id === tab)?.text}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {resourceTypes
                  .filter((resource) => resource.category === tab || tab === "all")
                  .map((resource) => {
                    const Icon = resource.icon;

                    return (
                      <Item
                        key={resource.id}
                        variant="outline"
                        className="cursor-pointer hover:bg-black/5"
                        onClick={() => setSelectedTypeId(resource.id)}
                      >
                        <ItemMedia variant="icon">
                          <Icon />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle>{resource.name}</ItemTitle>
                          <ItemDescription>{resource.description}</ItemDescription>
                        </ItemContent>
                      </Item>
                    );
                  })}
              </div>
            </>
          ) : selectedTypeId === "jade.storage.bucket" ? (
            <BucketWizard
              scopeId={scope ?? ""}
              onCancel={() => setSelectedTypeId(null)}
              onCreated={(resourceId) => {
                addNewTab(props.containerApi, props.api.group!, "storageExplorer", {
                  text: "Storage Explorer",
                  icon: "hardDrive",
                  resourceId,
                });
                setSelectedTypeId(null);
              }}
            />
          ) : (
            <div className="rounded-md border border-[#e4e4e7] p-4">
              <div className="text-lg font-medium text-[#666666]">
                This resource type is not wired yet
              </div>
              <div className="mt-1 text-sm text-[#999999]">
                Storage buckets are the first fully managed resource here.
              </div>
              <Button className="mt-4" variant="outline" onClick={() => setSelectedTypeId(null)}>
                Back
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BucketWizard({
  scopeId,
  onCancel,
  onCreated,
}: {
  scopeId: string;
  onCancel: () => void;
  onCreated: (resourceId: string) => void;
}) {
  const [bucketName, setBucketName] = useState(`bucket-${Date.now().toString(36)}`);
  const [resourceName, setResourceName] = useState("SeaweedFS Bucket");
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const servers = useServers({ scopeId });
  const createResourceMutation = useCreateResource();

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
    if (!scopeId || selectedServerIds.length === 0 || !bucketName.trim() || !resourceName.trim()) {
      return;
    }

    try {
      const resource = await createResourceMutation.mutate({
        scopeId,
        type: "jade.storage.bucket",
        name: resourceName.trim(),
        spec: {
          bucketName: bucketName.trim(),
          serverIds: selectedServerIds,
        },
      });

      onCreated(resource.id);
    } catch {
      // The mutation state already captures the error for display.
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <div className="text-2xl font-medium text-[#666666]">Storage Bucket</div>
        <div className="text-sm text-[#999999]">
          Pick the servers that should run SeaweedFS, then create the bucket resource.
        </div>
      </div>

      {createResourceMutation.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {createResourceMutation.error.message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="rounded-md border border-[#e4e4e7] p-4">
            <div className="mb-3 text-sm font-medium text-[#666666]">Bucket Details</div>
            <div className="space-y-3">
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-wide text-[#999999]">Resource Name</div>
                <Input value={resourceName} onChange={(event) => setResourceName(event.target.value)} />
              </label>
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-wide text-[#999999]">Bucket Name</div>
                <Input value={bucketName} onChange={(event) => setBucketName(event.target.value)} />
              </label>
            </div>
          </div>

          <div className="rounded-md border border-[#e4e4e7] p-4">
            <div className="mb-3 text-sm font-medium text-[#666666]">Placement</div>
            {!servers.loaded ? (
              <div className="text-sm text-[#999999]">Loading servers...</div>
            ) : servers.error ? (
              <div className="text-sm text-destructive">{servers.error.message}</div>
            ) : servers.data?.length ? (
              <div className="space-y-2">
                {servers.data.map((server) => (
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
                ))}
              </div>
            ) : (
              <div className="text-sm text-[#999999]">No servers are available in this scope.</div>
            )}
          </div>
        </div>

        <div className="rounded-md border border-[#e4e4e7] p-4">
          <div className="mb-3 text-sm font-medium text-[#666666]">Summary</div>
          <div className="space-y-2 text-sm text-[#666666]">
            <div>Resource: {resourceName.trim() || "-"}</div>
            <div>Bucket: {bucketName.trim() || "-"}</div>
            <div>Servers selected: {selectedServers.length}</div>
            <div className="text-xs text-[#999999]">
              The first selected server becomes the primary SeaweedFS node and gateway host.
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              onClick={handleCreate}
              disabled={
                !scopeId ||
                !resourceName.trim() ||
                !bucketName.trim() ||
                selectedServerIds.length === 0 ||
                createResourceMutation.loading
              }
            >
              {createResourceMutation.loading ? "Creating..." : "Create bucket"}
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
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

function TabItem({
  Icon,
  text,
  active,
  onClick,
}: {
  Icon: React.ComponentType<{ size?: number }>;
  text: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-row items-center gap-2 rounded-md px-2 py-1 ${
        active ? "bg-primary text-primary-foreground" : "text-[#666666] hover:bg-[#f5f5f5]"
      }`}
    >
      <Icon size={16} />
      {text}
    </div>
  );
}
