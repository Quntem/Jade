import { KeyIcon, SearchIcon, ServerIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { useEffect, useState } from "react";
import { AccessTokens } from "./accessTokens";
import { IDockviewPanelProps } from "dockview-react";

export function ServersPanel(props: IDockviewPanelProps) {
    const [tab, setTab] = useState<'servers' | 'access-tokens'>('servers');
    useEffect(() => {
        if (tab === 'access-tokens') {
            props.api.updateParameters({ icon: "key" });
            props.api.setTitle('Access Tokens');
        } else {
            props.api.updateParameters({ icon: "server" });
            props.api.setTitle('Servers');
        }
    }, [tab]);
    return <div className="flex-1 flex flex-col w-full h-full">
        <div className="flex flex-row p-4 border-b-1 border-b-[#e4e4e7] items-center gap-4">
            {tab === 'servers' ? <ServerIcon size={35} /> : <KeyIcon size={35} />}
            <div className="flex flex-col gap-0">
                <div className="text-lg text-[#666666]">
                    {tab === 'servers' ? 'Servers' : 'Access Tokens'}
                </div>
                <div className="text-sm text-[#999999]">{tab === 'servers' ? 'Servers' : 'Access Tokens'} Explorer</div>
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
                    <TabItem Icon={ServerIcon} text="Servers" active={tab === 'servers'} onClick={() => setTab('servers')} />
                    <TabItem Icon={KeyIcon} text="Access Tokens" active={tab === 'access-tokens'} onClick={() => setTab('access-tokens')} />
                </div>
            </div>
            {tab === 'servers' ? <div>Servers</div> : <AccessTokens {...props} />}
        </div>
    </div>;
}

function TabItem({ Icon, text, active, onClick }: { Icon: React.ComponentType<{ size?: number }>, text: string, active: boolean, onClick: () => void }) {
    return <div onClick={onClick} className={`px-2 py-1 flex flex-row items-center rounded-md gap-2 ${active ? 'bg-primary text-primary-foreground' : 'text-[#666666] hover:bg-[#f5f5f5]'}`}>
        <Icon size={16} />
        {text}
    </div>
}
