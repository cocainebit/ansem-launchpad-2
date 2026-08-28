"use client";

import { usePathname } from "next/navigation";
import { TopNav } from "@/components/utoken/top-nav";
import { CommandSearchProvider } from "@/components/utoken/command-search";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isTerminal = pathname.startsWith("/token/");
  const isCreate = pathname.startsWith("/create");
  // These routes manage their own full-bleed layout (no max-width container, no
  // extra padding) and hide the footer, so the create wizard never scrolls.
  const bare = isTerminal || isCreate;
  const hideFooter = bare;

  return (
    <CommandSearchProvider>
      <div className="flex min-h-screen flex-col text-zinc-100">
        <TopNav />
        <main className={`flex-1 ${isTerminal ? "bg-[#0d0d0f]" : ""}`}>
          {bare ? (
            children
          ) : (
            <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">{children}</div>
          )}
        </main>
        {!hideFooter && <SiteFooter />}
      </div>
    </CommandSearchProvider>
  );
}

function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-[var(--hairline)] bg-[#161616]">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-x-6 gap-y-3 px-4 py-7 text-[13px] text-zinc-500 sm:flex-row sm:flex-wrap sm:px-6">
        <span className="flex items-center gap-2 text-zinc-300">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-5 w-5 rounded-[5px] object-cover" />
          ansemchain
        </span>
        <a href="/explore" className="hover:text-white">Scanner</a>
        <a href="/leaderboard" className="hover:text-white">Leaderboard</a>
        <a href="/horns" className="hover:text-white">Horns</a>
        <a href="/create" className="hover:text-white">Launch</a>
        <span className="text-zinc-600 sm:ml-auto">© 2026 ansemchain · coins that pay their holders</span>
      </div>
    </footer>
  );
}
