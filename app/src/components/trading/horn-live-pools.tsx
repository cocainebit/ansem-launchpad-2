"use client";

/**
 * HornLivePools - the "Live Horns" explorer: every graduated LP that actually
 * has a Horn attached on-chain, with its REAL current fee, a live decay window
 * countdown, its skim/split, and pool liquidity. One shared 1s clock drives all
 * the timers together.
 *
 * HONESTY: every figure is read from chain. The attach state comes from the AMM
 * pool's hook; the fee/timing from the horn's own `config`. A pool with no horn
 * never renders. Until coins graduate WITH a horn, this is an honest empty state
 * (nothing on-chain to show), never a fabricated row.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { useTokens } from "@/hooks/use-tokens";
import type { TokenListItem } from "@/lib/api";
import {
  loadTokenHorn,
  useDecayConfig,
  useDynfeeConfig,
  decayFeeBpsAt,
  type AttachedHorn,
} from "@/hooks/use-token-horn";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const pct = (v: number) => `${v.toFixed(2)}%`;

function usd(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "-";
  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: v >= 1000 ? "compact" : "standard",
    maximumFractionDigits: v < 1 ? 4 : 2,
  }).format(v);
}

/** One shared per-second clock (unix seconds) so every row's timer ticks together. */
function useNowSec(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function HornLivePools() {
  const { data: tokens, isLoading } = useTokens();
  const nowSec = useNowSec();

  const graduated = useMemo(
    () => (tokens ?? []).filter((t) => t.graduated),
    [tokens],
  );

  // Batch the attach read for every graduated pool (shares react-query cache
  // with each token page's useTokenHorn, so no duplicate fetches).
  const attachQueries = useQueries({
    queries: graduated.map((t) => ({
      queryKey: ["token-horn", t.address, t.graduated],
      queryFn: () => loadTokenHorn(t),
      staleTime: 180_000,
    })),
  });

  const rows = useMemo(
    () =>
      graduated
        .map((token, i) => ({ token, horn: attachQueries[i]?.data }))
        .filter((r): r is { token: TokenListItem; horn: AttachedHorn } =>
          Boolean(r.horn?.attached),
        ),
    // attachQueries identity changes each render; key on the resolved data only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graduated, attachQueries.map((q) => q.data?.slug ?? "").join(",")],
  );

  const resolving = attachQueries.some((q) => q.isLoading);

  return (
    <section className="rounded-2xl border border-[#1e1e22] bg-[#0e0e10]/80 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[16px] font-bold tracking-tight text-white">
            Live Horns
          </h2>
          <p className="mt-1 text-[12px] text-zinc-500">
            Graduated pools running a Horn right now, with their real fee and window.
          </p>
        </div>
        <span className="shrink-0 rounded-[4px] border border-[#26262b] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
          {rows.length} live
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-[#1e1e22] bg-[#0a0a0b] px-4 py-10 text-center">
          <p className="text-[13px] text-zinc-400">
            {isLoading || resolving
              ? "Reading pools..."
              : "No pool is running a Horn yet."}
          </p>
          <p className="mt-1.5 text-[12px] text-zinc-600">
            When a coin graduates with a Horn attached, it appears here live with its fee and countdown.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#1e1e22] font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                <th className="py-2 pr-3 font-normal">Pool</th>
                <th className="py-2 pr-3 font-normal">Horn</th>
                <th className="py-2 pr-3 font-normal">Current fee</th>
                <th className="py-2 pr-3 font-normal">Window</th>
                <th className="py-2 pr-3 font-normal">Skim</th>
                <th className="py-2 pr-3 text-right font-normal">Liquidity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ token, horn }) => (
                <HornPoolRow key={token.address} token={token} horn={horn} nowSec={nowSec} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HornPoolRow({
  token,
  horn,
  nowSec,
}: {
  token: TokenListItem;
  horn: AttachedHorn;
  nowSec: number;
}) {
  const isDecay = horn.slug === "decay";
  const isDynfee = horn.slug === "dynfee";
  const decayQ = useDecayConfig(isDecay ? horn.address : null);
  const dynfeeQ = useDynfeeConfig(isDynfee ? horn.address : null);

  // Current fee + window, from real on-chain config.
  let feeLabel = "-";
  let windowLabel = "Live";
  let progress: number | null = null;
  if (isDecay && decayQ.data) {
    const cfg = decayQ.data;
    feeLabel = pct(decayFeeBpsAt(cfg, nowSec) / 100);
    const endSec = cfg.launchTime + cfg.decaySeconds;
    const settled = nowSec >= endSec;
    progress = cfg.decaySeconds > 0 ? clamp01((nowSec - cfg.launchTime) / cfg.decaySeconds) : 1;
    if (settled) {
      windowLabel = `At base ${pct(cfg.endFeeBps / 100)}`;
    } else {
      const mins = Math.ceil((endSec - nowSec) / 60);
      windowLabel = `~${mins}m to base ${pct(cfg.endFeeBps / 100)}`;
    }
  } else if (isDynfee && dynfeeQ.data) {
    feeLabel = pct(dynfeeQ.data.baseFeeBps / 100);
    windowLabel = `Reactive, staker ${pct(dynfeeQ.data.discountFeeBps / 100)}`;
  } else if (isDecay || isDynfee) {
    windowLabel = "Loading schedule";
  }

  const skimLabel =
    horn.skimBps != null
      ? `${(horn.skimBps / 100).toFixed(1)}%${
          horn.ansemBps != null ? ` (${horn.ansemBps / 100}/${(horn.chanseBps ?? 0) / 100})` : ""
        }`
      : "-";
  const liquidity = usd(token.market.ammSolReserve * token.market.solUsd);

  return (
    <tr className="border-b border-[#161619] text-[13px] transition-colors hover:bg-[#131316]">
      <td className="py-3 pr-3">
        <Link href={`/token/${token.address}`} className="flex items-center gap-2.5 group">
          {token.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={token.image} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="h-7 w-7 shrink-0 rounded-full bg-[#1c1c1e]" />
          )}
          <span className="min-w-0">
            <span className="block truncate font-semibold text-zinc-200 group-hover:text-white">
              ${token.symbol}
            </span>
            <span className="block truncate text-[11px] text-zinc-600">{token.name}</span>
          </span>
        </Link>
      </td>
      <td className="py-3 pr-3">
        <span className="rounded-[4px] border border-[#26262b] bg-[#141416] px-2 py-0.5 text-[11px] text-zinc-300">
          {horn.name ?? horn.slug ?? "Horn"}
        </span>
      </td>
      <td className="py-3 pr-3 font-mono tabular-nums text-zinc-100">{feeLabel}</td>
      <td className="py-3 pr-3">
        <span className="block text-[12px] text-zinc-400">{windowLabel}</span>
        {progress != null ? (
          <span className="mt-1 block h-1 w-28 overflow-hidden rounded-full bg-[#1c1c1e]">
            <span
              className="block h-full rounded-full bg-[#6cf07f]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </span>
        ) : null}
      </td>
      <td className="py-3 pr-3 font-mono text-[12px] text-zinc-400">{skimLabel}</td>
      <td className="py-3 pr-3 text-right font-mono tabular-nums text-zinc-300">{liquidity}</td>
    </tr>
  );
}
