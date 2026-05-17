"use client";

import { useCallback } from "react";
import {
  DockviewReact,
  IDockviewDefaultTabProps,
  IDockviewHeaderActionsProps,
  IDockviewPanelHeaderProps,
  themeLight,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from "./ui/empty";
import { Button } from "./ui/button";
import { FolderOpenIcon, Maximize2, ServerIcon, TerminalIcon, X, XIcon } from "lucide-react";
import { WebShell } from "./webshell/webshell";

function DefaultPanel({ params }: IDockviewPanelProps<{ text: string }>) {
  return <div style={{ padding: 16 }}>{params.text}</div>;
}

function DefaultTab(params: IDockviewPanelHeaderProps) {
  const Icon = params.params.icon;
  return (
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '8px',
        height: '100%',
        width: '100%',
        marginLeft: '5px',
        marginRight: '5px',
        color: '#666666',
      }}>
        {Icon && <Icon size={14} />}
        <div className="text-[15px]">{params.api.title}</div>
        <XIcon 
          size={16} 
          style={{
            flexShrink: 0,
            marginLeft: '5px',
            cursor: 'pointer',
            color: '#999999',
          }} 
          onClick={(e) => {
            e.stopPropagation();
            params.api.close();
          }} 
        />
      </div>
    );
}

function WatermarkComponent() {
  return <div className="flex-1 h-full flex flex-row items-center justify-center bg-neutral-100">
    <Empty>
      <EmptyContent className="gap-0">
        <EmptyMedia>
          <img src="/assets/jadelogo.svg" alt="Jade Logo" className="w-15 h-15" />
        </EmptyMedia>
        <EmptyTitle className="text-xl">Quntem Jade</EmptyTitle>
        <EmptyDescription>Use the explorer to open resources</EmptyDescription>
      </EmptyContent>
    </Empty>
  </div>;
}

function RightHeaderActionsComponent(props: IDockviewHeaderActionsProps) {
  const isFloating = props.group.model.location.type === "floating";

  return <div className="flex flex-row items-center gap-1 h-[35px] pr-1 bg-[#FAFAFA] border-b-[1px] border-b-[#e4e4e7]">
    {isFloating && (
      <>
        <Button variant="ghost" size="icon-sm">
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon-sm">
          <X className="h-4 w-4" />
        </Button>
      </>
    )}
  </div>;
}

const components = {
  default: DefaultPanel,
  webshell: WebShell,
};

const tabComponents = {
  default: DefaultTab,
};

export function DockviewWorkbench() {
  const onReady = useCallback((event: DockviewReadyEvent) => {
    event.api.addPanel({
      id: "Test",
      component: "default",
      title: "Test",
      tabComponent: "default",
      params: { text: "Drag tabs to rearrange the layout.", icon: ServerIcon },
    });
    event.api.addPanel({
      id: "Test2",
      component: "default",
      title: "Test",
      tabComponent: "default",
      params: { text: "Drag tabs to rearrange the layout.", icon: ServerIcon },
    });
    event.api.addPanel({
      id: "Test3",
      component: "default",
      title: "Test",
      tabComponent: "default",
      params: { text: "Drag tabs to rearrange the layout.", icon: ServerIcon },
    });
    event.api.addPanel({
      id: "Test4",
      component: "default",
      title: "Test",
      tabComponent: "default",
      params: { text: "Drag tabs to rearrange the layout.", icon: ServerIcon },
    });
    event.api.addPanel({
      id: "Test5",
      component: "default",
      title: "Test",
      tabComponent: "default",
      params: { text: "Drag tabs to rearrange the layout.", icon: ServerIcon },
    });
    // event.api.addEdgeGroup('left', {
    //     id: 'left-group',
    //     initialSize: 350,
    //     minimumSize: 250,
    //     // collapsed: true
    // });
    event.api.addEdgeGroup('bottom', {
        id: 'bottom-group',
        initialSize: 200,
        minimumSize: 100,
        collapsed: true
    });
    // event.api.addPanel({
    //   id: "explorer",
    //   component: "default",
    //   title: "Explorer",
    //   position: { referenceGroup: "left-group" },
    //   params: { text: "Hello from Dockview." },
    // });
    event.api.addPanel({
      id: "WebShell",
      component: "webshell",
      tabComponent: "default",
      title: "WebShell",
      position: { referenceGroup: "bottom-group" },
      params: { text: "Drag tabs to rearrange the layout.", icon: TerminalIcon },
    });
  }, []);

  return (
    <div className="dockview-theme-light" style={{ height: "100vh" }}>
      <DockviewReact getTabContextMenuItems={() => {
        return ['close',
        'closeOthers',
        'closeAll',]
      }} disableTabsOverflowList rightHeaderActionsComponent={RightHeaderActionsComponent} watermarkComponent={WatermarkComponent} tabComponents={tabComponents} theme={themeLight} components={components} onReady={onReady} />
    </div>
  );
}
