"use client";

import { useMemo, useState } from "react";
import { Fire, MagnifyingGlass, Plant, Trophy } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { useTokens } from "@/hooks/use-tokens";
import { useFloorlaunchLive } from "@/hooks/use-floorlaunch-live";
import { TokenCard } from "./token-card";
import { TokenCardSkeleton } from "./token-card-skeleton";
import type { TokenListItem } from "@/lib/api";

type SortMode = "newest" | "trending" | "top";

function sortTokens(tokens: TokenListItem[], mode: SortMode): TokenListItem[] {
  return [...tokens].sort((a, b) => {
    if (mode === "newest") return new Date(b.first_seen_at).getTime() - new Date(a.first_seen_at).getTime();
    if (mode === "top") return Number(b.hodl_reserves) - Number(a.hodl_reserves);
    return (b.trade_count_24h ?? 0) - (a.trade_count_24h ?? 0);
  });
}

function normalizeSearch(value: string): string {
  return value.normalize("NFKD").trim().toLowerCase();
}

// Full token explorer: every token on the launchpad on one page, searchable
// and sortable. Shares the home feed's card grid, minus the hero.
export function TokenExplorer() {
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [query, setQuery] = useState("");
  const { data: tokens, isLoading, error } = useTokens();
  useFloorlaunchLive();

  const filteredTokens = useMemo(() => {
    const normalized = normalizeSearch(query);
    const visible = (tokens ?? []).filter((token) => {
      if (!normalized) return true;
      return [
        token.name,
        token.symbol,
        token.creator,
        token.address,
        token.mint,
        token.listing.identifier,
      ].some((value) => (value ? normalizeSearch(value).includes(normalized) : false));
    });
    return sortTokens(visible, sortMode);
  }, [tokens, query, sortMode]);

  const total = tokens?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-zinc-100">Explore tokens</h1>
        <p className="text-[15px] text-zinc-400">
          Every token launched on ANSEM, across CHANSE and ANSEM bonding curves.
          {total > 0 ? ` ${total.toLocaleString()} live.` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto">
          <Tab active={sortMode === "top"} onClick={() => setSortMode("top")} icon={<Trophy size={16} weight="fill" />}>Top</Tab>
          <Tab active={sortMode === "trending"} onClick={() => setSortMode("trending")} icon={<Fire size={16} weight="fill" />}>Trending</Tab>
          <Tab active={sortMode === "newest"} onClick={() => setSortMode("newest")} icon={<Plant size={16} weight="fill" />}>Newest</Tab>
        </div>
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search tokens</span>
          <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            placeholder="Search name, ticker, address"
            autoComplete="off"
            className="h-9 rounded-lg border-[#2d2d31] bg-[#151517] pl-9 text-xs text-zinc-200 placeholder:font-semibold placeholder:text-zinc-600"
          />
        </label>
      </div>

      {error && <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-center text-red-300">Failed to load tokens.</div>}
      {query.trim() && !isLoading && !error && (
        <p className="text-xs text-zinc-500">
          {filteredTokens.length} {filteredTokens.length === 1 ? "result" : "results"} for “{query.trim()}”
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 12 }).map((_, index) => <TokenCardSkeleton key={index} />)
          : filteredTokens.map((token) => <TokenCard key={token.address} token={token} />)}
      </div>
      {!isLoading && !error && filteredTokens.length === 0 && <p className="py-14 text-center text-zinc-500">No tokens found.</p>}
    </div>
  );
}

function Tab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-[8px] px-4 text-sm transition-colors ${active ? "bg-[#29292d] text-zinc-100" : "text-zinc-300 hover:bg-[#1b1b1e]"}`}
    >
      {icon}
      {children}
    </button>
  );
}
