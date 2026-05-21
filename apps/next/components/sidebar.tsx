"use client"
import { motion } from "framer-motion";
import {
  Tree,
  TreeItem,
  TreeItemLabel,
} from "@/components/reui/tree"
import { hotkeysCoreFeature, syncDataLoaderFeature } from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
import { HomeIcon, PlusIcon } from "lucide-react";
import { Button } from "./ui/button";
import { useAppContext } from "@/lib/appContext";
import { addNewTab } from "./dockview-workbench";

export function Sidebar({ sidebarOpen, setSidebarOpen }: { sidebarOpen: boolean; setSidebarOpen: (value: boolean) => void }) {
    // const tree = useTree({
    //     features: [syncDataLoaderFeature, hotkeysCoreFeature],
    // })
    const {dockViewApi} = useAppContext()
    return (
        <motion.div 
            className="h-full w-[250px] bg-[#fafafa] shrink-0 border-r-1 border-[#e4e4e7] flex flex-col"
            initial={{ width: sidebarOpen ? 250 : 0 }}
            animate={{ width: sidebarOpen ? 250 : 0 }}
            exit={{ width: 0 }}
            transition={{ duration: 0.3 }}
        >   
            <div className="flex flex-col p-3 pb-0">
                <Button onClick={() => {
                    if (!dockViewApi) {
                        return
                    }

                    addNewTab(dockViewApi, undefined, 'createResourcePanel', {text: "Create resource", icon: "plus"})
                }}>
                    <PlusIcon />
                    Create
                </Button>
            </div>
            <div className="flex flex-col p-3 gap-1">
                <SidebarItem Icon={HomeIcon} title="Home" />
            </div>
            <Tree>
                
            </Tree>
        </motion.div>
    );
}

function SidebarItem({Icon, title}: {Icon: React.JSX.ElementType, title: string}) {
    return (
        <div className="flex flex-row items-center gap-2 py-1 px-2 hover:bg-black/5 rounded-md">
            <Icon size={18} />
            <span>{title}</span>
        </div>
    );
}
