"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, Check, CopySimple } from "@phosphor-icons/react";
import type { TokenListItem } from "@/lib/api";
import { DEFAULT_TOKEN_SUPPLY } from "@/lib/chain-config";

interface TokenCardProps { token: TokenListItem }

export function TokenCard({ token }: TokenCardProps) {
  const [copied, setCopied] = useState(false);
  const change = getChange(token);
  const solUsd = token.market.solUsd;
  const marketCapUsd = (Number(token.current_price) / 1e6) * DEFAULT_TOKEN_SUPPLY * solUsd;
  const volumeUsd = (Number(token.volume_24h) / 1_000_000) * solUsd;

  async function copyTokenAddress(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    await navigator.clipboard.writeText(token.mint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <Link href={`/token/${token.address}`} className="block min-w-0">
      <article className="group rounded-[11px] border border-[#2d2d31]/65 bg-[#151517] p-4 transition-colors hover:border-[#57575e]/65">
        <div className="flex items-start gap-5">
          <div className="relative h-[68px] w-[68px] shrink-0 overflow-visible rounded-full border border-[#3d3d42] bg-[#202023] p-1">
            {token.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={token.image} alt={token.symbol ?? "token"} className="h-full w-full rounded-full object-cover" />
            ) : <div className="flex h-full w-full items-center justify-center rounded-full text-xl text-zinc-400">{token.symbol?.slice(0, 1)}</div>}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[16px] text-zinc-100">{token.name ?? "Unknown Token"}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[15px] text-zinc-500">
                  <span className="truncate">{token.symbol ?? "TOKEN"}</span>
                  <button
                    type="button"
                    onClick={copyTokenAddress}
                    aria-label="Copy token address"
                    title={copied ? "Copied" : "Copy token address"}
                    className="relative z-10 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-600 transition-colors hover:bg-[#29292d] hover:text-zinc-200"
                  >
                    {copied ? <Check size={13} weight="bold" /> : <CopySimple size={13} />}
                  </button>
                </div>
              </div>
              {change != null && (
                <span className={`whitespace-nowrap pt-3 text-xs font-medium ${change >= 0 ? "text-[#30e879]" : "text-[#ff6269]"}`}>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Metric label="Market Cap" value={formatUsd(marketCapUsd)} />
          <Metric label="24h Vol" value={formatUsd(volumeUsd)} />
        </div>

        <div className="my-3 h-px bg-[#2c2c30]" />
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><p className="text-zinc-500">Creator</p><p className="mt-1 truncate font-semibold text-[11px] text-zinc-300">{truncate(token.creator ?? token.address, 5)}</p></div>
          <div className="text-right"><p className="text-zinc-500">Venue</p><p className="mt-1 font-semibold text-[11px] text-zinc-300">{token.graduated ? "AMM" : "Curve"}</p></div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600"><span>{formatAge(token.first_seen_at)}</span><ArrowUpRight size={13} className="opacity-0 transition-opacity group-hover:opacity-100" /></div>
      </article>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-[15px] font-medium text-zinc-100">{value}</p></div>; }
function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}
function getChange(token: TokenListItem): number | null { return token.price_change_24h; }
function formatAge(value: string): string { const date = new Date(value); return isNaN(date.getTime()) ? "just now" : formatDistanceToNow(date, { addSuffix: true }); }
function truncate(value: string, size: number): string { return value.length <= size * 2 ? value : `${value.slice(0, size)}...${value.slice(-size)}`; }
