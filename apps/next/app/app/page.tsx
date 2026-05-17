import { DockviewWorkbench } from "@/components/dockview-workbench";
import { Header } from "@/components/header";

export default function AppPage() {
  return (
    <div className="flex flex-col h-screen">
      <Header />
      <DockviewWorkbench />
    </div>
  );
}
