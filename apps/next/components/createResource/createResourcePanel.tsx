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
import { useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../ui/item";
import { Button } from "../ui/button";
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
        <div className="flex w-[250px] flex-col border-r-1 border-[#e4e4e7] p-4">
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
                    const isBucket = resource.id === "jade.storage.bucket";

                    return (
                      <Item
                        key={resource.id}
                        variant="outline"
                        className="cursor-pointer hover:bg-black/5"
                        onClick={() => {
                          if (isBucket) {
                            addNewTab(props.containerApi, props.api.group!, "createBucketPanel", {
                              text: "Create Storage Bucket",
                              icon: "hardDrive",
                            });
                            return;
                          }

                          setSelectedTypeId(resource.id);
                        }}
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
          ) : (
            <div className="rounded-md border border-[#e4e4e7] p-4">
              <div className="text-lg font-medium text-[#666666]">
                This resource type is not wired yet
              </div>
              <div className="mt-1 text-sm text-[#999999]">
                Storage buckets now open their own creation panel. The other resource types are still pending.
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
