"use client";

import { useState } from "react";
import { Menu, RefreshCw } from "lucide-react";
import { useSWRConfig } from "swr";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import OutletSwitcher from "./OutletSwitcher";
import { OutletProvider } from "@/lib/outlet-context";
import { SWRProvider } from "@/lib/swr-config";

interface AppShellProps {
  children: React.ReactNode;
  role: string;
  username: string;
  outletName?: string | null;
  outletId?: string | null;
}

export default function AppShell({
  children,
  role,
  username,
  outletName,
  outletId,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { mutate } = useSWRConfig();
  const router = useRouter();

  async function handleRefresh() {
    setRefreshing(true);
    await mutate(() => true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  }

  return (
    <SWRProvider>
      <OutletProvider role={role} outletId={outletId}>
        <div className="app-layout">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          role={role}
          username={username}
          outletName={outletName}
        />

        <div className="main-content">
          {/* Top bar: outlet selector + global refresh */}
          <header className="main-header flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                className="mobile-menu-btn"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={22} strokeWidth={2.5} />
              </button>

              <OutletSwitcher role={role} fallbackName={outletName} />
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              title="Refresh data"
              style={{ minHeight: 36, padding: "0.35rem 0.85rem", flexShrink: 0 }}
            >
              <RefreshCw size={15} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
              <span className="font-bold text-sm">Refresh</span>
            </button>
          </header>

          <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {children}
          </main>
        </div>
        </div>
      </OutletProvider>
    </SWRProvider>
  );
}
