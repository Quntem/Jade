import { InfoIcon, LoaderCircleIcon, LogsIcon, SearchIcon, ShapesIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupTextarea } from "../ui/input-group";
import { useState } from "react";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../ui/item";

export function DeploymentProcessUi() {
    const [tab, setTab] = useState<'info' | 'logs'>('info');
    return <div className="flex-1 flex flex-col w-full h-full">
        <div className="flex flex-row p-4 border-b-1 border-b-[#e4e4e7] items-center gap-4">
            <ShapesIcon size={35} />
            <div className="flex flex-col gap-0">
                <div className="text-lg text-[#666666]">
                    Deployment Name
                </div>
                <div className="text-sm text-[#999999]">Deployment</div>
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
                    <TabItem Icon={InfoIcon} text="Info" active={tab === 'info'} onClick={() => setTab('info')} />
                    <TabItem Icon={LogsIcon} text="Logs" active={tab === 'logs'} onClick={() => setTab('logs')} />
                </div>
            </div>
            {tab === 'info' ? <InfoTab /> : <LogsTab />}
        </div>
    </div>;
}

function TabItem({ Icon, text, active, onClick }: { Icon: React.ComponentType<{ size?: number }>, text: string, active: boolean, onClick: () => void }) {
    return <div onClick={onClick} className={`px-2 py-1 flex flex-row items-center rounded-md gap-2 ${active ? 'bg-primary text-primary-foreground' : 'text-[#666666] hover:bg-[#f5f5f5]'}`}>
        <Icon size={16} />
        {text}
    </div>
}

function InfoTab() {
    return <div className="flex-1">
        <Item className="p-6 flex flex-row items-center">
            <ItemMedia className="bg-neutral-100 p-2 rounded-md border-1 border-[#e4e4e7] mt-1.5 mr-2">
                <LoaderCircleIcon size={22} className="animate-spin" />
            </ItemMedia>
            <ItemContent>
                <ItemTitle className="text-xl">Deployment In Progress</ItemTitle>
                <ItemDescription>Deploying 5 resources to 3 servers</ItemDescription>
            </ItemContent>
        </Item>
    </div>
}

function LogsTab() {
    return <div className="flex-1">
        <div>
            <div>Deployment Logs</div>
        </div>
    </div>
}
