"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider, useSidebar } from "@/components/layout/sidebar-context";
import { TokenSearch } from "@/components/layout/token-search";
import { ConnectButton } from "@/components/wallet/connect-button";
import { usePathname } from "next/navigation";

interface AppShellProps {
  children: React.ReactNode;
}

function ShellInner({ children }: AppShellProps) {
  const { isCollapsed, toggle } = useSidebar();
  const pathname = usePathname();
  const isTerminal = pathname.startsWith("/token/");

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <Sidebar isCollapsed={isCollapsed} onToggle={toggle} />
      {isTerminal && (
        <header className={`fixed right-0 top-0 z-20 flex h-16 items-center gap-4 border-b border-[#29292d] bg-[#0d0d0f] px-5 ${isCollapsed ? "md:left-[72px]" : "md:left-[263px]"}`}>
          <div className="shrink-0 text-[18px] font-bold text-zinc-100">Trade</div>
          <div className="flex flex-1 justify-center">
            <TokenSearch />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href="/create" className="flex h-10 items-center rounded-lg bg-[#6cef4b] px-4 text-sm font-bold text-[#10250a] hover:bg-[#55d936]">
              Launch a token
            </a>
            <ConnectButton
              label="Connect Wallet"
              balanceOnly
              className="h-10 rounded-lg border border-[#34343a] bg-[#202024] px-4 text-sm text-zinc-100 hover:bg-[#29292d]"
              connectedClassName="h-10 w-auto rounded-lg px-3"
            />
          </div>
        </header>
      )}
      <main
        className={`min-h-screen transition-[padding-left] duration-300 ease-in-out ${
          isCollapsed ? "md:pl-[72px]" : "md:pl-[263px]"
        }`}
      >
        <div className={"w-full " + (isTerminal ? "px-0 py-0 md:pt-16" : "px-4 py-6 sm:px-6 lg:px-8 lg:py-[56px]")}>
          {children}
        </div>
      </main>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <ShellInner>{children}</ShellInner>
    </SidebarProvider>
  );
}
