"use client";

import { useCallback } from "react";
import {
  DockviewReact,
  IDockviewDefaultTabProps,
  themeLight,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from "./ui/empty";

function DefaultPanel({ params }: IDockviewPanelProps<{ text: string }>) {
  return <div style={{ padding: 16 }}>{params.text}</div>;
}

function DefaultTab({params}: IDockviewDefaultTabProps) {
  return <div>{params.title}</div>;
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

const components = {
  default: DefaultPanel,
};

const tabComponents = {
  default: DefaultTab,
};

export function DockviewWorkbench() {
  const onReady = useCallback((event: DockviewReadyEvent) => {
    event.api.addEdgeGroup('left', {
        id: 'left-group',
        initialSize: 350,
        minimumSize: 250,
        // collapsed: true
    });
    event.api.addEdgeGroup('bottom', {
        id: 'bottom-group',
        initialSize: 200,
        minimumSize: 100,
        collapsed: true
    });
    event.api.addPanel({
      id: "explorer",
      component: "default",
      title: "Explorer",
      position: { referenceGroup: "left-group" },
      params: { text: "Hello from Dockview." },
    });
    event.api.addPanel({
      id: "cloudShell",
      component: "default",
      // tabComponent: "default",
      title: "Cloud Shell",
      position: { referenceGroup: "bottom-group" },
      params: { text: "Drag tabs to rearrange the layout." },
    });
  }, []);

  return (
    <div className="dockview-theme-light" style={{ height: "100vh" }}>
      <DockviewReact watermarkComponent={WatermarkComponent} tabComponents={tabComponents} theme={themeLight} components={components} onReady={onReady} />
    </div>
  );
}
