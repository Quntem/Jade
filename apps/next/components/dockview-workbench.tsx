"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DockviewReact,
  IDockviewHeaderActionsProps,
  IDockviewPanelHeaderProps,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
  type EdgeGroupPosition,
  type IWatermarkPanelProps,
  type IDockviewPanelProps,
  type SerializedDockview,
} from "dockview-react";
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from "./ui/empty";
import { Button } from "./ui/button";
import { HardDriveIcon, KeyIcon, Maximize2, PlusIcon, ServerIcon, ShapesIcon, TerminalIcon, X, XIcon } from "lucide-react";
import { WebShell } from "./webshell/webshell";
import { ChatKitUi } from "./chatkit";
import { useAppContext } from "@/lib/appContext";
import { Sidebar } from "./sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { StorageExplorer } from "./storage/explorer";
import { DeploymentProcessUi } from "./deployment/deploymentProcess";
import { AccessTokens, createAccessToken } from "./servers/accessTokens";
import { ServersPanel } from "./servers/ServersPanel";


const DOCKVIEW_LAYOUTS_STORAGE_KEY = "dockview-layouts";
const EDGE_GROUP_POSITIONS: EdgeGroupPosition[] = ["top", "bottom", "left", "right"];

const panelIcons = {
  server: ServerIcon,
  terminal: TerminalIcon,
  hardDrive: HardDriveIcon,
  shapes: ShapesIcon,
  key: KeyIcon,
};

type PanelIconName = keyof typeof panelIcons;
type PanelParams = {
  text: string;
  icon?: PanelIconName;
};
type StoredDockviewLayouts = Record<string, SerializedDockview>;

function DefaultPanel({ params }: IDockviewPanelProps<PanelParams>) {
  return <div style={{ padding: 16 }}>{params.text}</div>;
}

function DefaultTab(params: IDockviewPanelHeaderProps<PanelParams>) {
  params.api.onDidParametersChange(() => {
    setIcon(params.params.icon ? panelIcons[params.params.icon] : null);
  });
  const [Icon, setIcon] = useState<PanelIconName | null>(params.params.icon ? panelIcons[params.params.icon] : null);

  return (
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '8px',
        height: '100%',
        width: '100%',
        // width: '150px',
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

export function addNewTab(api: DockviewApi, referenceGroup?: IDockviewHeaderActionsProps["group"], component: string = "default", params: PanelParams = { text: "Drag tabs to rearrange the layout.", icon: "server" }) {
  const panelId = `Untitled-${Date.now()}`;

  api.addPanel({
    id: panelId,
    component: component,
    title: "Untitled",
    tabComponent: "default",
    position: referenceGroup ? { referenceGroup } : undefined,
    params: params,
  });
}

function NewTabButton({
  api,
  referenceGroup,
  className,
}: {
  api: DockviewApi;
  referenceGroup?: IDockviewHeaderActionsProps["group"];
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant="ghost"
          size="icon-sm"
          className={className}
          title="New tab"
          aria-label="New tab"
        >
          <PlusIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => addNewTab(api, referenceGroup, "default", { text: "Drag tabs to rearrange the layout.", icon: "server" })}>
          New tab
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => addNewTab(api, referenceGroup, "storageExplorer", { text: "Storage Explorer", icon: "hardDrive" })}>
          Storage Explorer
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => addNewTab(api, referenceGroup, "deploymentProcess", { text: "Deployment Process", icon: "shapes" })}>
          Deployment Process
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => addNewTab(api, referenceGroup, "servers", { text: "Servers", icon: "server" })}>
          Servers
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WatermarkComponent(props: IWatermarkPanelProps) {
  return <div className="flex-1 h-full flex flex-row items-center justify-center bg-[#fafafa]">
    <Empty>
      <EmptyContent className="gap-2">
        <EmptyMedia>
          <img src="/assets/jadelogo.svg" alt="Jade Logo" className="w-15 h-15" />
        </EmptyMedia>
        <EmptyTitle className="text-xl">Quntem Jade</EmptyTitle>
        <EmptyDescription>Use the explorer to open resources</EmptyDescription>
        <NewTabButton api={props.containerApi} className="mt-1" />
      </EmptyContent>
    </Empty>
  </div>;
}

function RightHeaderActionsComponent(props: IDockviewHeaderActionsProps) {
  const isFloating = props.group.model.location.type === "floating";

  return <div className="flex flex-row items-center gap-1 h-[35px] pr-1 bg-[#FAFAFA] border-b-[1px] border-b-[#e4e4e7] w-full">
    <NewTabButton api={props.containerApi} referenceGroup={props.group} />
    <div className="flex-1" />
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
  chatkit: ChatKitUi,
  storageExplorer: StorageExplorer,
  deploymentProcess: DeploymentProcessUi,
  servers: ServersPanel,
  accessTokens_create: createAccessToken,
};

const tabComponents = {
  default: DefaultTab,
};

function readStoredLayouts(): StoredDockviewLayouts {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storedLayouts = window.localStorage.getItem(DOCKVIEW_LAYOUTS_STORAGE_KEY);
    return storedLayouts ? JSON.parse(storedLayouts) : {};
  } catch {
    return {};
  }
}

function writeStoredLayouts(layouts: StoredDockviewLayouts) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DOCKVIEW_LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
}

function saveScopeLayout(api: DockviewApi, scope: string | null) {
  if (!scope) {
    return;
  }

  writeStoredLayouts({
    ...readStoredLayouts(),
    [scope]: api.toJSON(),
  });
}

function removeScopeLayout(scope: string) {
  const layouts = readStoredLayouts();

  if (!(scope in layouts)) {
    return;
  }

  delete layouts[scope];
  writeStoredLayouts(layouts);
}

function addDefaultPanels(api: DockviewApi) {
  api.addPanel({
    id: "Test",
    component: "default",
    title: "Test",
    tabComponent: "default",
    params: { text: "Drag tabs to rearrange the layout.", icon: "server" },
  });
  api.addPanel({
    id: "Test2",
    component: "default",
    title: "Test",
    tabComponent: "default",
    params: { text: "Drag tabs to rearrange the layout.", icon: "server" },
  });
  api.addPanel({
    id: "Test3",
    component: "default",
    title: "Test",
    tabComponent: "default",
    params: { text: "Drag tabs to rearrange the layout.", icon: "server" },
  });
  api.addPanel({
    id: "Test4",
    component: "default",
    title: "Test",
    tabComponent: "default",
    params: { text: "Drag tabs to rearrange the layout.", icon: "server" },
  });
  api.addPanel({
    id: "Test5",
    component: "default",
    title: "Test",
    tabComponent: "default",
    params: { text: "Drag tabs to rearrange the layout.", icon: "server" },
  });
  api.addPanel({
    id: "ChatKit",
    component: "chatkit",
    title: "ChatKit",
    tabComponent: "default",
    params: { text: "Drag tabs to rearrange the layout.", icon: "server" },
  });
  // api.addEdgeGroup('left', {
  //     id: 'left-group',
  //     initialSize: 350,
  //     minimumSize: 250,
  //     // collapsed: true
  // });
  api.addEdgeGroup('bottom', {
      id: 'bottom-group',
      initialSize: 200,
      minimumSize: 100,
      collapsed: true
  });
  // api.addPanel({
  //   id: "explorer",
  //   component: "default",
  //   title: "Explorer",
  //   position: { referenceGroup: "left-group" },
  //   params: { text: "Hello from Dockview." },
  // });
  api.addPanel({
    id: "WebShell",
    component: "webshell",
    tabComponent: "default",
    title: "WebShell",
    position: { referenceGroup: "bottom-group" },
    params: { text: "Drag tabs to rearrange the layout.", icon: "terminal" },
  });
}

function resetLayout(api: DockviewApi) {
  api.clear();

  EDGE_GROUP_POSITIONS.forEach((position) => {
    if (api.getEdgeGroup(position)) {
      api.removeEdgeGroup(position);
    }
  });
}

function restoreScopeLayout(api: DockviewApi, scope: string | null) {
  resetLayout(api);

  if (!scope) {
    addDefaultPanels(api);
    return;
  }

  const savedLayout = readStoredLayouts()[scope];

  if (!savedLayout) {
    addDefaultPanels(api);
    return;
  }

  try {
    api.fromJSON(savedLayout);
  } catch (error) {
    console.warn(`Unable to restore dockview layout for scope ${scope}`, error);
    removeScopeLayout(scope);
    addDefaultPanels(api);
  }
}

export function DockviewWorkbench({ sidebarOpen, setSidebarOpen }: { sidebarOpen: boolean; setSidebarOpen: (value: boolean) => void }) {
  const { scope } = useAppContext();
  const apiRef = useRef<DockviewApi | null>(null);
  const currentScopeRef = useRef(scope);
  const previousScopeRef = useRef(scope);
  const isRestoringLayoutRef = useRef(false);

  const runWithLayoutSavingPaused = useCallback((callback: () => void) => {
    isRestoringLayoutRef.current = true;

    try {
      callback();
    } finally {
      queueMicrotask(() => {
        isRestoringLayoutRef.current = false;
      });
    }
  }, []);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    currentScopeRef.current = scope;
    previousScopeRef.current = scope;

    runWithLayoutSavingPaused(() => {
      restoreScopeLayout(event.api, scope);
    });

    event.api.onDidLayoutChange(() => {
      if (isRestoringLayoutRef.current) {
        return;
      }

      saveScopeLayout(event.api, currentScopeRef.current);
    });
  }, [runWithLayoutSavingPaused, scope]);

  useEffect(() => {
    const api = apiRef.current;
    const previousScope = previousScopeRef.current;

    currentScopeRef.current = scope;

    if (!api || previousScope === scope) {
      previousScopeRef.current = scope;
      return;
    }

    saveScopeLayout(api, previousScope);

    runWithLayoutSavingPaused(() => {
      restoreScopeLayout(api, scope);
    });

    previousScopeRef.current = scope;
  }, [runWithLayoutSavingPaused, scope]);

  return (
    <div className="dockview-theme-light flex flex-row" style={{ height: "100vh" }}>
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <DockviewReact getTabContextMenuItems={() => {
        return ['close',
        'closeOthers',
        'closeAll',]
      }} disableTabsOverflowList rightHeaderActionsComponent={RightHeaderActionsComponent} watermarkComponent={WatermarkComponent} tabComponents={tabComponents} theme={themeLight} components={components} onReady={onReady} />
    </div>
  );
}
