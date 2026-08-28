"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTokens } from "@/hooks/use-tokens";
import { DEFAULT_TOKEN_SUPPLY } from "@/lib/chain-config";
import type { TokenListItem } from "@/lib/api";

type Tab = "creators" | "coins";

export function Leaderboard() {
  const { data: tokens, isLoading } = useTokens();
  const [tab, setTab] = useState<Tab>("creators");

  const creators = useMemo(() => {
    const map = new Map<
      string,
      { creator: string; launches: number; launchedValue: number; volume: number; image: string | null }
    >();
    for (const t of tokens ?? []) {
      const c = t.creator ?? t.address;
      const row = map.get(c) ?? { creator: c, launches: 0, launchedValue: 0, volume: 0, image: null };
      row.launches += 1;
      row.launchedValue += capUsd(t);
      row.volume += (Number(t.volume_24h) / 1e6) * t.market.solUsd;
      if (!row.image && t.image) row.image = t.image;
      map.set(c, row);
    }
    return [...map.values()].sort((a, b) => b.launchedValue - a.launchedValue);
  }, [tokens]);

  const coins = useMemo(
    () => [...(tokens ?? [])].sort((a, b) => capUsd(b) - capUsd(a)),
    [tokens],
  );

  return (
    <div className="space-y-5 font-sans">
      <div>
        <h1 className="font-display text-[24px] font-semibold tracking-tight text-white">Leaderboard</h1>
        <p className="mt-1 text-[13px] text-zinc-500">Top creators and coins on ansemchain, by market value.</p>
      </div>

      <div className="relative flex w-fit items-center rounded-lg border border-[var(--hairline)] bg-[#1c1c1e] p-1">
        <span
          aria-hidden
          className="absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-md bg-[#6cf07f] transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${tab === "coins" ? "100%" : "0%"})` }}
        />
        {(["creators", "coins"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`relative z-10 h-8 w-[104px] rounded-md text-[13px] font-medium capitalize transition-colors ${
              tab === t ? "text-black" : "text-zinc-400 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--hairline)] bg-[#1c1c1e]">
        <div key={tab} className="ansem-fade-in">
        {tab === "creators" ? (
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-[var(--hairline)] text-[11px] uppercase tracking-wider text-zinc-600">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Creator</th>
                <th className="px-4 py-3 text-right font-medium">Launches</th>
                <th className="px-4 py-3 text-right font-medium">Launched value</th>
                <th className="px-4 py-3 text-right font-medium">24h volume</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-[13px] text-zinc-500">Loading…</td></tr>
              ) : (
                creators.map((c, i) => (
                  <tr key={c.creator} className="group border-b border-[var(--hairline)] transition-colors last:border-0 hover:bg-[#232326]">
                    <td className="px-4 py-3 text-[13px] text-zinc-600">{medal(i)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/creator/${c.creator}`} className="flex items-center gap-2.5">
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[var(--hairline)] bg-[#202022]">
                          {c.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.image} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <span className="font-mono text-[13px] font-semibold text-zinc-200 group-hover:text-[#6cf07f]">{short(c.creator)}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] text-zinc-300">{c.launches}</td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold text-white">{usd(c.launchedValue)}</td>
                    <td className="px-4 py-3 text-right text-[13px] text-zinc-300">{usd(c.volume)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-[var(--hairline)] text-[11px] uppercase tracking-wider text-zinc-600">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Coin</th>
                <th className="px-4 py-3 text-right font-medium">Mcap</th>
                <th className="px-4 py-3 text-right font-medium">24h</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-[13px] text-zinc-500">Loading…</td></tr>
              ) : (
                coins.map((t, i) => {
                  const change = t.price_change_24h;
                  return (
                    <tr key={t.address} className="group border-b border-[var(--hairline)] transition-colors last:border-0 hover:bg-[#232326]">
                      <td className="px-4 py-3 text-[13px] text-zinc-600">{medal(i)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/token/${t.address}`} className="flex items-center gap-2.5">
                          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-[var(--hairline)] bg-[#202022]">
                            {t.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.image} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-[#6cf07f] group-hover:underline">${t.symbol}</p>
                            <p className="truncate text-[12px] text-zinc-500">{t.name}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-white">{usd(capUsd(t))}</td>
                      <td className={`px-4 py-3 text-right text-[13px] ${change == null ? "text-zinc-600" : change >= 0 ? "text-[#4ade80]" : "text-[#ff5b5b]"}`}>
                        {change == null ? "-" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
        </div>
      </div>
    </div>
  );
}

function capUsd(t: TokenListItem): number {
  return (Number(t.current_price) / 1e6) * t.market.solUsd * DEFAULT_TOKEN_SUPPLY;
}
function usd(v: number): string {
  return Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(v || 0);
}
function short(a: string): string {
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a;
}
function medal(i: number): string {
  return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1);
}
