"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowSquareOut,
  BookOpen,
  CaretDown,
  Compass,
  FolderSimple,
  Lightning,
  Newspaper,
  Plus,
  ChartDonut,
  ShieldCheck,
  SidebarSimple,
} from "@phosphor-icons/react";
import { ConnectButton } from "@/components/wallet/connect-button";

type Item = {
  label: string;
  href?: string;
  icon: typeof Compass;
  activeWhen?: (pathname: string) => boolean;
  external?: boolean;
};

const exploreItems: Item[] = [
  { label: "All tokens", href: "/explore", icon: Compass },
];

const buildItems: Item[] = [
  { label: "Your Tokens", href: "/your-tokens", icon: Lightning },
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [exploreOpen, setExploreOpen] = useState(true);
  const [buildOpen, setBuildOpen] = useState(true);
  const widthClass = isCollapsed ? "w-[72px]" : "w-[263px]";

  return (
    <aside
      className={"fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-[#29292d] bg-[#151517] text-zinc-100 transition-[width] duration-200 md:flex " + widthClass}
    >
      <div className={"flex h-16 shrink-0 items-center border-b border-[#29292d] " + (isCollapsed ? "justify-center px-2" : "justify-between px-4")}>
        {!isCollapsed && (
          <Link href="/" aria-label="ANSEM home" className="flex min-w-0 flex-1 items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="ANSEM logo"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-full object-cover"
              priority
            />
            <span className="truncate text-lg font-semibold tracking-[0.12em] text-white">
              ANSEM
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-100"
        >
          <SidebarSimple size={20} weight="regular" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-1 p-2">
          <SidebarItem
            item={{ label: "New Launch", href: "/create", icon: Plus }}
            pathname={pathname}
            collapsed={isCollapsed}
            prominent
          />

          <div className="my-1 h-px bg-[#29292d]" />

          <SidebarItem
            item={{
              label: "Trade",
              href: "/",
              icon: ChartDonut,
              activeWhen: (path) => path === "/" || path.startsWith("/token/"),
            }}
            pathname={pathname}
            collapsed={isCollapsed}
          />

          <SidebarSection
            label="Explore"
            open={exploreOpen}
            onToggle={() => setExploreOpen((value) => !value)}
            collapsed={isCollapsed}
          >
            {exploreItems.map((item) => (
              <SidebarItem key={item.label} item={item} pathname={pathname} collapsed={isCollapsed} />
            ))}
          </SidebarSection>

          <SidebarSection
            label="Build"
            open={buildOpen}
            onToggle={() => setBuildOpen((value) => !value)}
            collapsed={isCollapsed}
          >
            {buildItems.map((item) => (
              <SidebarItem key={item.label} item={item} pathname={pathname} collapsed={isCollapsed} />
            ))}
          </SidebarSection>
        </div>
      </div>

      <div className="flex h-[68px] min-w-0 shrink-0 items-center border-t border-[#29292d] p-2">
        <ConnectButton
          label={isCollapsed ? "" : "Connect Wallet"}
          compact={isCollapsed}
          connectedClassName={
            isCollapsed
              ? "h-11 w-11 shrink-0 rounded-[24px] px-0"
              : "h-11 w-full rounded-[24px]"
          }
          className={
            "h-11 shrink-0 rounded-[24px] bg-[#16a34a] text-base font-semibold text-white transition-opacity hover:opacity-85 " +
            (isCollapsed ? "w-11 px-0" : "w-full")
          }
        />
      </div>
    </aside>
  );
}

function SidebarSection({
  label,
  open,
  onToggle,
  collapsed,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      {!collapsed && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex h-9 w-full items-center justify-between px-2 text-sm font-semibold text-zinc-400 transition-colors hover:text-zinc-100"
        >
          <span>{label}</span>
          <CaretDown
            size={16}
            className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
          />
        </button>
      )}
      {(open || collapsed) && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

function SidebarItem({
  item,
  pathname,
  collapsed,
  prominent = false,
}: {
  item: Item;
  pathname: string;
  collapsed: boolean;
  prominent?: boolean;
}) {
  const Icon = item.icon;
  const active = item.activeWhen
    ? item.activeWhen(pathname)
    : pathname === item.href ||
      Boolean(
        item.href &&
          item.href !== "/" &&
          pathname.startsWith(`${item.href}/`),
      );
  const itemClass =
    "relative flex h-10 w-full items-center gap-2 rounded-lg px-2 text-sm transition-colors " +
    (collapsed ? "justify-center " : "") +
    (active
      ? "bg-[#29292d] text-zinc-100 "
      : prominent
        ? "bg-[#1b1b1e] text-zinc-200 hover:bg-[#202024] hover:text-white "
        : item.href
          ? "text-zinc-300 hover:bg-[#202024] hover:text-zinc-100 "
          : "cursor-default text-zinc-500 ");
  const content = (
    <>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <Icon size={20} weight={active ? "fill" : "regular"} />
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate text-left font-semibold leading-5">
          {item.label}
        </span>
      )}
      {!collapsed && item.external && (
        <ArrowSquareOut size={14} className="shrink-0 text-zinc-600" />
      )}
    </>
  );

  return item.href && item.external ? (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer"
      className={itemClass}
      title={collapsed ? item.label : undefined}
    >
      {content}
    </a>
  ) : item.href ? (
    <Link href={item.href} className={itemClass} title={collapsed ? item.label : undefined}>
      {content}
    </Link>
  ) : (
    <div className={itemClass} title={collapsed ? item.label : undefined} aria-disabled="true">
      {content}
    </div>
  );
}
