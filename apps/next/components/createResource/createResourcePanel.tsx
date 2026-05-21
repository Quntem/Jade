import { IDockviewPanelProps } from "dockview-react";
import { CodeIcon, ContainerIcon, DatabaseIcon, GlobeIcon, HardDriveIcon, HomeIcon, icons, LayoutGridIcon, MonitorIcon, NetworkIcon, PlusIcon, SearchIcon, ServerIcon, UserIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { useState } from "react";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../ui/item";

const resourceTypes = [
  {id: "jade.compute.virutalMachine", name: "Virtual Machine", icon: ServerIcon, category: "compute", description: "Create a virtual machine"},
  {id: "jade.compute.container", name: "Container", icon: ContainerIcon, category: "compute", description: "Create a container"},
  {id: "jade.compute.function", name: "Function", icon: CodeIcon, category: "compute", description: "Create a function"},
  {id: "jade.storage.bucket", name: "Storage Bucket", icon: HardDriveIcon, category: "storage", description: "Create a storage bucket"},
  {id: "jade.deskspace.collection", name: "DeskSpace Collection", icon: LayoutGridIcon, category: "endUser", description: "Create a deskspace collection"},
  {id: "jade.deskspace.session", name: "DeskSpace Session", icon: MonitorIcon, category: "endUser", description: "Create a deskspace session"},
  {id: "jade.hosting.whs", name: "Web Hosting Service", icon: GlobeIcon, category: "hosting", description: "Create a web hosting service"},
  {id: "jade.database.postgres", name: "PostgreSQL Database", icon: DatabaseIcon, category: "database", description: "Create a PostgreSQL database"},
]

const sidebarTabs = [
  { id: "all", text: "All", Icon: HomeIcon },
  { id: "compute", text: "Compute", Icon: ServerIcon },
  { id: "storage", text: "Storage", Icon: HardDriveIcon },
  { id: "endUser", text: "End User", Icon: UserIcon },
  { id: "database", text: "Database", Icon: DatabaseIcon },
  { id: "hosting", text: "Hosting", Icon: GlobeIcon },
  { id: "networking", text: "Networking", Icon: NetworkIcon },
]

export function CreateResourcePanel(props: IDockviewPanelProps) {
  const [tab, setTab] = useState("all")
  return <div className="flex-1 flex flex-col w-full h-full">
        <div className="flex flex-row p-4 border-b-1 border-b-[#e4e4e7] items-center gap-4">
            <PlusIcon />
            <div className="flex flex-col gap-0">
                <div className="text-lg text-[#666666]">
                    Create resource
                </div>
            </div>
        </div>
        <div className="flex-1 flex flex-row">
            <div className="flex clex-col w-[250px] border-r-1 border-[#e4e4e7] flex flex-col p-4">
                <InputGroup>
                    <InputGroupAddon>
                        <SearchIcon />
                    </InputGroupAddon>
                    <InputGroupInput placeholder="Search" />
                </InputGroup>
                <div className="flex flex-col gap-1 mt-2">
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
            <div className="flex-1 flex flex-col p-4">
                <div className="text-2xl font-medium mb-4 text-[#666666]">
                    {tab === 'all' ? 'All resources' : sidebarTabs.find(t => t.id === tab)?.text}
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {resourceTypes.filter(r => r.category === tab || tab === 'all').map(r => {
                        const Icon = r.icon
                        return (
                            <Item key={r.id} variant={"outline"} className="hover:bg-black/5">
                                <ItemMedia variant={"icon"}>
                                    <Icon />
                                </ItemMedia>
                                <ItemContent>
                                    <ItemTitle>{r.name}</ItemTitle>
                                    <ItemDescription>{r.description}</ItemDescription>
                                </ItemContent>
                            </Item>
                        )
                        })}
                </div>
            </div>
        </div>
    </div>;
}

function TabItem({ Icon, text, active, onClick }: { Icon: React.ComponentType<{ size?: number }>, text: string, active: boolean, onClick: () => void }) {
    return <div onClick={onClick} className={`px-2 py-1 flex flex-row items-center rounded-md gap-2 ${active ? 'bg-primary text-primary-foreground' : 'text-[#666666] hover:bg-[#f5f5f5]'}`}>
        <Icon size={16} />
        {text}
    </div>
}
