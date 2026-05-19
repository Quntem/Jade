"use client"
import { motion } from "framer-motion";
import {
  Tree,
  TreeItem,
  TreeItemLabel,
} from "@/components/reui/tree"
import { hotkeysCoreFeature, syncDataLoaderFeature } from "@headless-tree/core"
import { useTree } from "@headless-tree/react"

export function Sidebar({ sidebarOpen, setSidebarOpen }: { sidebarOpen: boolean; setSidebarOpen: (value: boolean) => void }) {
    // const tree = useTree({
    //     features: [syncDataLoaderFeature, hotkeysCoreFeature],
    // })
    return (
        <motion.div 
            className="h-full w-[300px] bg-[#fafafa] shrink-0 border-r-1 border-[#e4e4e7]"
            initial={{ width: sidebarOpen ? 300 : 0 }}
            animate={{ width: sidebarOpen ? 300 : 0 }}
            exit={{ width: 0 }}
            transition={{ duration: 0.3 }}
        >
            <Tree>

            </Tree>
        </motion.div>
    );
}