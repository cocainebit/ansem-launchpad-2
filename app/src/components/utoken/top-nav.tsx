"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { REST_URL } from "@/lib/floorlaunch/config";
import { MagnifyingGlass, Plus, XLogo, BookOpen } from "@phosphor-icons/react";
import { useTokens } from "@/hooks/use-tokens";
import { ConnectButton } from "@/components/wallet/connect-button";
import { DEFAULT_TOKEN_SUPPLY } from "@/lib/chain-config";
import { useCommandSearch } from "@/components/utoken/command-search";

/** utoken.so-style top chrome: a thin stats line, the main header, and a
 *  horizontal price ticker. Reskinned to ANSEM (ansemchain, CHANSE, Horns). */
export function TopNav() {
  const { data: tokens } = useTokens();
  const search = useCommandSearch();

  // Token stats are client-only (react-query), so gate them behind mount to keep
  // the first client render identical to the server render (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Live ansemchain block height for the stats bar.
  const [block, setBlock] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch(`${REST_URL}/cosmos/base/tendermint/v1beta1/blocks/latest`);
        if (!r.ok) return;
        const j = (await r.json()) as { block?: { header?: { height?: string } } };
        const h = Number(j?.block?.header?.height);
        if (!cancelled && Number.isFinite(h)) setBlock(h);
      } catch {
        /* keep the prior height */
      }
    }
    poll();
    const id = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const stats = useMemo(() => {
    const src = tokens ?? [];
    const volume = src.reduce(
      (s, t) => s + (Number(t.volume_24h) / 1e6) * t.market.solUsd,
      0,
    );
    return { count: src.length, volume };
  }, [tokens]);

  const ranked = useMemo(
    () =>
      [...(tokens ?? [])]
        .sort(
          (a, b) =>
            Number(b.current_price) * b.market.solUsd -
            Number(a.current_price) * a.market.solUsd,
        )
        .slice(0, 12),
    [tokens],
  );

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--hairline)] bg-[#161616]/90 backdrop-blur-md">
      {/* Stats line */}
      <div className="border-b border-[var(--hairline)]">
        <div className="mx-auto flex h-8 w-full max-w-[1440px] items-center gap-6 overflow-x-auto px-4 font-mono text-[11px] text-zinc-500 sm:px-6">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4ade80]" />
            <span className="text-zinc-300">ansemchain</span>
          </span>
          <span>
            BLOCK{" "}
            <span className="text-[#6cf07f]">
              {mounted && block != null ? `#${block.toLocaleString()}` : "-"}
            </span>
          </span>
          <span>
            TOKENS <span className="text-zinc-300">{mounted ? stats.count : 0}</span>
          </span>
          <span>
            VOLUME <span className="text-zinc-300">{mounted ? usd(stats.volume) : "$0"}</span>
          </span>
        </div>
      </div>

      {/* Main header */}
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="ansemchain"
            className="h-6 w-6 rounded-md object-cover"
          />
          <span className="font-display text-[16px] font-semibold tracking-tight text-white">
            ansemchain
          </span>
        </Link>

        <nav className="ml-3 hidden items-center gap-5 font-sans text-[13px] text-zinc-400 md:flex">
          <Link href="/explore" className="transition-colors hover:text-white">
            Scanner
          </Link>
          <Link href="/feed" className="transition-colors hover:text-white">
            Feed
          </Link>
          <Link href="/leaderboard" className="transition-colors hover:text-white">
            Leaderboard
          </Link>
          <Link href="/horns" className="transition-colors hover:text-white">
            Horns
          </Link>
          <Link href="/vault" className="transition-colors hover:text-white">
            Vault
          </Link>
        </nav>

        {/* Search */}
        <button
          type="button"
          onClick={search.open}
          className="ml-auto flex h-9 w-full max-w-[340px] items-center gap-2 rounded-lg border border-[var(--hairline)] bg-[#1c1c1e] px-3 text-[13px] text-zinc-500 transition-colors hover:border-[var(--hairline-strong)]"
        >
          <MagnifyingGlass size={15} />
          <span>Search tokens or users</span>
          <kbd className="ml-auto rounded border border-[var(--hairline)] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            /
          </kbd>
        </button>

        <a
          href="https://docs.ansemchain.fun"
          target="_blank"
          rel="noreferrer"
          aria-label="ansemchain docs"
          title="Docs"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--hairline)] bg-[#1c1c1e] text-zinc-400 transition-colors hover:border-[var(--hairline-strong)] hover:text-white"
        >
          <BookOpen size={16} weight="bold" />
        </a>

        <a
          href="https://x.com/ansemchainfun/"
          target="_blank"
          rel="noreferrer"
          aria-label="ansemchain on X"
          title="ansemchain on X"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--hairline)] bg-[#1c1c1e] text-zinc-400 transition-colors hover:border-[var(--hairline-strong)] hover:text-white"
        >
          <XLogo size={16} weight="bold" />
        </a>

        <Link
          href="/create"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#6cf07f] px-3.5 font-sans text-[13px] font-semibold text-black transition-opacity hover:opacity-90"
        >
          <Plus size={15} weight="bold" /> Launch
        </Link>

        <ConnectButton
          label="Connect"
          balanceOnly
          className="h-9 shrink-0 rounded-lg bg-[#6cf07f] px-3.5 text-[13px] font-semibold text-black transition-opacity hover:opacity-90"
          connectedClassName="h-9 w-auto rounded-lg px-3"
        />
      </div>

      {/* Price ticker: animated marquee (duplicated for a seamless loop) */}
      {mounted && ranked.length > 0 && (
        <div className="overflow-hidden border-t border-[var(--hairline)]">
          <div className="ansem-marquee items-center">
            {[...ranked, ...ranked].map((t, i) => {
              const price = (Number(t.current_price) / 1e6) * t.market.solUsd * DEFAULT_TOKEN_SUPPLY;
              return (
                <Link
                  key={`${t.address}-${i}`}
                  href={`/token/${t.address}`}
                  className="flex h-9 shrink-0 items-center gap-1.5 border-r border-[var(--hairline)] px-4 font-mono text-[12px] transition-opacity hover:opacity-80"
                >
                  <span className="text-zinc-600">#{(i % ranked.length) + 1}</span>
                  <span className="font-semibold text-zinc-200">${t.symbol}</span>
                  <span className="text-zinc-500">{usdCompact(price)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}

function usd(v: number): string {
  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(v || 0);
}
function usdCompact(v: number): string {
  if (v >= 1000) return usd(v);
  return `$${(v || 0).toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 4 : 2 })}`;
}
