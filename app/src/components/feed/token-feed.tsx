"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Fire,
  MagnifyingGlass,
  Plant,
  Trophy,
} from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { useTokens } from "@/hooks/use-tokens";
import { useFloorlaunchLive } from "@/hooks/use-floorlaunch-live";
import { TokenCard } from "./token-card";
import { TokenCardSkeleton } from "./token-card-skeleton";
import { HeroBullFrame } from "./hero-bull-frame";
import type { TokenListItem } from "@/lib/api";
import { DEFAULT_TOKEN_SUPPLY } from "@/lib/chain-config";
import { formatDistanceToNow } from "date-fns";

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

export function TokenFeed() {
  const [sortMode, setSortMode] = useState<SortMode>("trending");
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
      ].some((value) =>
        value ? normalizeSearch(value).includes(normalized) : false,
      );
    });
    return sortTokens(visible, sortMode);
  }, [tokens, query, sortMode]);

  const recentTokens = useMemo(
    () => sortTokens(tokens ?? [], "newest").slice(0, 10),
    [tokens],
  );

  const heroStats = useMemo(() => {
    const source = tokens ?? [];
    // Lifetime totals from the pool fee accumulators (monotonic), not the rolling
    // 24h figure which decays as the launch burst ages out of the window.
    const volumeUsd = source.reduce(
      (sum, token) => sum + (Number(token.volume_total) / 1_000_000) * token.market.solUsd,
      0,
    );
    const feesUsd = source.reduce(
      (sum, token) => sum + (Number(token.creator_fees_total) / 1_000_000) * token.market.solUsd,
      0,
    );
    return {
      volume: formatUsdCompact(volumeUsd),
      fees: formatUsdCompact(feesUsd),
      communities: source.length.toLocaleString(),
    };
  }, [tokens]);

  return (
    <div className="space-y-10">
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: "1376 / 560", containerType: "inline-size" }}>
        <section
          className="pointer-events-none absolute left-0 top-0 z-[6] overflow-hidden rounded-[24px] bg-transparent shadow-[inset_0_1px_0_rgba(255,255,255,.08),inset_0_0_0_1px_rgba(255,255,255,.025),0_18px_80px_rgba(0,0,0,.2)]"
          style={{ width: 1376, height: 560, transform: "scale(calc(100cqw * (1 / 1376px)))", transformOrigin: "left top" }}
        >
          <div className="absolute inset-0 overflow-hidden rounded-[24px]"><HeroBullFrame /></div>
          <div className="absolute inset-y-0 left-0 z-[1] w-[64%] bg-[rgba(42,42,46,.48)] backdrop-blur-[12px] [mask-image:linear-gradient(90deg,#000_0%,#000_78%,rgba(0,0,0,.82)_88%,transparent_100%)]" />
          <div className="absolute inset-0 z-[2] rounded-[24px] bg-[linear-gradient(90deg,rgba(12,12,14,.64)_0%,rgba(16,16,18,.54)_38%,rgba(18,18,21,.18)_68%,rgba(18,18,21,.03)_100%)]" />
          <div className="absolute inset-0 z-[3] rounded-[24px] border border-[#343438]" />

          <div className="pointer-events-auto absolute left-10 top-10 z-10 flex h-[480px] w-[640px] flex-col items-start justify-between">
            <div className="flex w-[640px] flex-col items-start gap-8">
              <h1 className="self-stretch text-[50px] font-semibold leading-[58px] tracking-[-0.02em] text-zinc-100">Launch and trade on ANSEM.</h1>
              <p className="self-stretch text-[20px] font-normal leading-8 tracking-[-0.01em] text-zinc-400">Launch a token on the ANSEM bonding curve, denominated in CHANSE or ANSEM, and trade it instantly. Every token graduates to the ANSEM AMM once its curve fills. Fair launch, on-chain, no presale.</p>
            </div>
            <div className="inline-flex items-end gap-2">
              <Link href="/create" className="inline-flex h-12 items-center justify-center rounded-[24px] bg-[#16a34a] px-6 text-base font-semibold leading-6 text-white transition-opacity hover:opacity-85">Launch a token</Link>
              <Link href="/explore" className="inline-flex h-12 items-center justify-center rounded-[24px] bg-zinc-100 px-6 text-base font-semibold leading-6 text-zinc-900 transition-opacity hover:opacity-85">Explore tokens</Link>
            </div>
          </div>

          <div className="absolute bottom-10 right-10 z-10 grid h-[100px] w-[640px] grid-cols-2 items-center rounded-[18px] border border-white/20 bg-[#111113]/45 px-6 shadow-[0_12px_40px_rgba(0,0,0,.16)] backdrop-blur-[5px]">
            <Metric label="Total volume" value={heroStats.volume} />
            <Metric label="Markets" value={heroStats.communities} />
          </div>
        </section>
      </div>

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-[26px] tracking-[-0.04em] text-zinc-100">Trending tokens today</h2>
          <Link href="/explore" className="hidden items-center gap-2 text-sm text-zinc-100 sm:flex">View all <ArrowRight size={16} /></Link>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto">
            <Tab active={sortMode === "top"} onClick={() => setSortMode("top")} icon={<Trophy size={16} weight="fill" />}>Top</Tab>
            <Tab active={sortMode === "trending"} onClick={() => setSortMode("trending")} icon={<Fire size={16} weight="fill" />}>Trending</Tab>
            <Tab active={sortMode === "newest"} onClick={() => setSortMode("newest")} icon={<Plant size={16} weight="fill" />}>Newest</Tab>
          </div>
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Search tokens</span>
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
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
        <div id="tokens" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {isLoading ? Array.from({ length: 8 }).map((_, index) => <TokenCardSkeleton key={index} />) : filteredTokens.map((token) => <TokenCard key={token.address} token={token} />)}
        </div>
        {!isLoading && !error && filteredTokens.length === 0 && <p className="py-14 text-center text-zinc-500">No tokens found.</p>}
      </section>

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-[26px] tracking-[-0.04em] text-zinc-100">Recently launched tokens</h2>
        </div>
        <div className="overflow-x-auto rounded-[16px] border border-[#2d2d31] bg-[#111113]">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[48px_minmax(280px,1fr)_150px_150px_120px_80px] items-center border-b border-[#2d2d31] px-5 py-4 text-sm font-medium text-zinc-500">
              <span>#</span><span>Token</span><span>Market Cap</span><span>24h Vol</span><span>Launched</span><span />
            </div>
            {recentTokens.map((token, index) => <RecentTokenRow key={token.address} token={token} index={index} />)}
            {!isLoading && recentTokens.length === 0 && <p className="px-5 py-12 text-center text-sm text-zinc-500">No recently launched tokens.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-12 flex-col justify-center gap-1 border-l border-white/35 px-3 first:border-l-0">
      <span className="text-[18px] font-semibold leading-5 text-white/55">{label}</span>
      <strong suppressHydrationWarning className="text-[18px] font-semibold leading-5 tracking-[-0.01em] text-zinc-100">{value}</strong>
    </div>
  );
}

function RecentTokenRow({ token, index }: { token: TokenListItem; index: number }) {
  const marketCap = (Number(token.current_price) / 1e6) * token.market.solUsd * DEFAULT_TOKEN_SUPPLY;
  const volume = (Number(token.volume_24h) / 1_000_000) * token.market.solUsd;
  const launched = new Date(token.first_seen_at);
  const age = Number.isNaN(launched.getTime()) ? "just now" : formatDistanceToNow(launched, { addSuffix: true });

  return (
    <div className="grid grid-cols-[48px_minmax(280px,1fr)_150px_150px_120px_80px] items-center border-b border-[#222226] px-5 py-4 text-[15px] last:border-b-0">
      <span className="text-zinc-300">#{index + 1}</span>
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[9px] border border-[#303035] bg-[#202023]">
          {token.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={token.image} alt="" className="h-full w-full object-cover" />
          ) : <span className="flex h-full items-center justify-center text-zinc-500">{token.symbol?.slice(0, 1) ?? "?"}</span>}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold text-zinc-100">{token.name ?? "Unknown Token"}</p>
          <p className="truncate text-xs text-zinc-500">${token.symbol ?? "TOKEN"}</p>
        </div>
      </div>
      <span suppressHydrationWarning className="text-[16px] font-medium text-[#30e879]">{formatUsd(marketCap)}</span>
      <span suppressHydrationWarning className="text-[16px] font-medium text-zinc-200">{formatUsd(volume)}</span>
      <span suppressHydrationWarning className="text-sm text-zinc-500">{age}</span>
      <Link href={`/token/${token.address}`} className="justify-self-end rounded-lg border border-[#303035] px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:border-[#6cef4b] hover:text-[#6cef4b]">View</Link>
    </div>
  );
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function formatUsdCompact(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function Tab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: string }) {
  return <button type="button" onClick={onClick} className={`inline-flex h-10 items-center gap-2 rounded-[8px] px-4 text-sm transition-colors ${active ? "bg-[#29292d] text-zinc-100" : "text-zinc-300 hover:bg-[#1b1b1e]"}`}>{icon}{children}</button>;
}
