"use client"
import { DockviewWorkbench } from "@/components/dockview-workbench";
import { Header } from "@/components/header";
import { AppProvider } from "@/lib/appContext";
import { AuthProvider } from "@/lib/auth";
import { useState } from "react";

export default function AppPage() {
  const sidebarOpen = useState(true);

  if (typeof window === "undefined") {
    return null;
  }
  return (
    <AuthProvider>
      <AppProvider>
        <div className="flex flex-col h-screen">
          <Header sidebarOpen={sidebarOpen} />
          <DockviewWorkbench />
        </div>
      </AppProvider>
    </AuthProvider>
  );
}
