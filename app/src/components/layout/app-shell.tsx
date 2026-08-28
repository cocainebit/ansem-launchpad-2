"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { AnimatedBackground } from "@/components/layout/animated-background";
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
  const leftPad = isCollapsed ? "md:pl-[64px]" : "md:pl-[212px]";
  const leftEdge = isCollapsed ? "md:left-[64px]" : "md:left-[212px]";

  return (
    <div className="relative min-h-screen bg-[#0a0a0b] text-zinc-100">
      <AnimatedBackground />
      <Sidebar isCollapsed={isCollapsed} onToggle={toggle} />

      {/* Persistent top bar (pew: centered search + Connect) */}
      <header
        className={`fixed right-0 top-0 z-20 flex h-14 items-center gap-3 border-b border-[#1a1a1e] bg-[#0a0a0b]/85 px-4 backdrop-blur-md transition-[left] duration-200 ${leftEdge} left-0`}
      >
        <div className="flex flex-1 justify-center">
          <TokenSearch />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isTerminal && (
            <a
              href="/create"
              className="hidden h-9 items-center rounded-[4px] bg-white px-4 font-display text-[12px] font-bold text-[#0a0a0b] transition-opacity hover:opacity-85 sm:flex"
            >
              CREATE
            </a>
          )}
          <ConnectButton
            label="Connect"
            balanceOnly
            className="h-9 rounded-full border border-[#26262b] bg-transparent px-4 text-sm font-semibold text-zinc-200 transition-colors hover:border-[#3a3a42] hover:text-white"
            connectedClassName="h-9 w-auto rounded-full px-3"
          />
        </div>
      </header>

      <main className={`relative z-10 min-h-screen transition-[padding-left] duration-200 ease-in-out ${leftPad}`}>
        <div
          className={
            "w-full " +
            (isTerminal
              ? "px-0 pt-14"
              : "px-4 pb-6 pt-[72px] sm:px-6 lg:px-8 lg:pb-8")
          }
        >
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
