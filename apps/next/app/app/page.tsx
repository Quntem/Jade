"use client"
import { DockviewWorkbench } from "@/components/dockview-workbench";
import { Header } from "@/components/header";
import { AppProvider } from "@/lib/appContext";
import { AuthProvider } from "@/lib/auth";
import { useEffect, useState } from "react";

export default function AppPage() {
  const [sidebarOpen, setSidebarOpen] = useState(window.localStorage.getItem("sidebarOpen") === "true");
  useEffect(() => {
    window.localStorage.setItem("sidebarOpen", sidebarOpen.toString());
  }, [sidebarOpen]);

  if (typeof window === "undefined") {
    return null;
  }
  return (
    <AuthProvider>
      <AppProvider>
        <div className="flex flex-col h-screen">
          <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
          <DockviewWorkbench sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        </div>
      </AppProvider>
    </AuthProvider>
  );
}
