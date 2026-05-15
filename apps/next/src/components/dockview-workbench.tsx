"use client";

import { useCallback } from "react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";

function DefaultPanel({ params }: IDockviewPanelProps<{ text: string }>) {
  return <div style={{ padding: 16 }}>{params.text}</div>;
}

const components = {
  default: DefaultPanel,
};

export function DockviewWorkbench() {
  const onReady = useCallback((event: DockviewReadyEvent) => {
    event.api.addPanel({
      id: "panel-1",
      component: "default",
      title: "Panel 1",
      params: { text: "Hello from Dockview." },
    });
    event.api.addPanel({
      id: "panel-2",
      component: "default",
      title: "Panel 2",
      params: { text: "Drag tabs to rearrange the layout." },
      position: { referencePanel: "panel-1", direction: "right" },
    });
  }, []);

  return (
    <div className="dockview-theme-light" style={{ height: "100vh" }}>
      <DockviewReact components={components} onReady={onReady} />
    </div>
  );
}
