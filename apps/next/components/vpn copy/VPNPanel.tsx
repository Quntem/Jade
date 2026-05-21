import { GlobeIcon, KeyIcon, NetworkIcon, SearchIcon, ServerIcon, SettingsIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { useEffect, useState } from "react";
// import { AccessTokens } from "./accessTokens";
import { IDockviewPanelProps } from "dockview-react";
import { Clients } from "./clients";

export function VpnPanel(props: IDockviewPanelProps) {
    const [tab, setTab] = useState<'clients' | 'configuration'>('clients');
    // useEffect(() => {
    //     if (tab === 'configuration') {
    //         props.api.updateParameters({ icon: "settings" });
    //         props.api.setTitle('Configuration');
    //     } else {
    //         props.api.updateParameters({ icon: "globe" });
    //         props.api.setTitle('Clients');
    //     }
    // }, [tab]);
    return <div className="flex-1 flex flex-col w-full h-full">
        <div className="flex flex-row p-4 border-b-1 border-b-[#e4e4e7] items-center gap-4">
            {tab === 'clients' ? <GlobeIcon size={35} /> : <SettingsIcon size={35} />}
            <div className="flex flex-col gap-0">
                <div className="text-lg text-[#666666]">
                    {tab === 'clients' ? 'Clients' : 'Configuration'}
                </div>
                <div className="text-sm text-[#999999]">
                    {/* {tab === 'clients' ? 'Clients' : 'Configuration'} Explorer */}
                    Virtual Private Network
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
                    <TabItem Icon={GlobeIcon} text="Clients" active={tab === 'clients'} onClick={() => setTab('clients')} />
                    <TabItem Icon={SettingsIcon} text="Configuration" active={tab === 'configuration'} onClick={() => setTab('configuration')} />
                </div>
            </div>
            {tab === 'clients' ? <Clients {...props} /> : <div>Configuration</div>}
        </div>
    </div>;
}

function TabItem({ Icon, text, active, onClick }: { Icon: React.ComponentType<{ size?: number }>, text: string, active: boolean, onClick: () => void }) {
    return <div onClick={onClick} className={`px-2 py-1 flex flex-row items-center rounded-md gap-2 ${active ? 'bg-primary text-primary-foreground' : 'text-[#666666] hover:bg-[#f5f5f5]'}`}>
        <Icon size={16} />
        {text}
    </div>
}
