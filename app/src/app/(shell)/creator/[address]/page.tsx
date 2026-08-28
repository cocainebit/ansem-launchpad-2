"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  CopySimple,
  Horse,
  ShareNetwork,
  User,
  XLogo,
} from "@phosphor-icons/react";
import { useTokens } from "@/hooks/use-tokens";
import { fetchWalletTokens, type TokenListItem } from "@/lib/api";
import { TokenCard } from "@/components/feed/token-card";
import { DEFAULT_TOKEN_SUPPLY } from "@/lib/chain-config";

type Tab = "holdings" | "launches" | "activity";

export default function CreatorPage() {
  const params = useParams();
  const address = params.address as string;
  const [tab, setTab] = useState<Tab>("launches");
  const [copied, setCopied] = useState(false);

  const { data: tokens } = useTokens();
  const holdings = useQuery({
    queryKey: ["wallet", "tokens", address],
    queryFn: () => fetchWalletTokens(address),
    enabled: Boolean(address),
    staleTime: 30_000,
  });

  const launches = useMemo(
    () => (tokens ?? []).filter((t) => t.creator === address),
    [tokens, address],
  );

  const solUsd = launches[0]?.market.solUsd ?? tokens?.[0]?.market.solUsd ?? 0;

  // Combined market cap of everything this address launched.
  const launchedValue = useMemo(
    () =>
      launches.reduce(
        (sum, t) => sum + (Number(t.current_price) / 1e6) * t.market.solUsd * DEFAULT_TOKEN_SUPPLY,
        0,
      ),
    [launches],
  );

  // Any social linked on one of their coins -> show a linked badge + X handle.
  const twitter = useMemo(
    () => launches.map((t) => t.listing.links?.twitter).find(Boolean),
    [launches],
  );

  const avatarImage = launches.find((t) => t.image)?.image ?? null;
  const handle = shortHandle(address);

  async function copyAddress() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0a0a0b] text-zinc-100">
      <div className="mx-auto max-w-3xl px-5 py-8">
        {/* Profile header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[#2a2a30] bg-[#1a1a1e]">
              {avatarImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-zinc-500">
                  <User size={26} weight="fill" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-display text-[20px] font-semibold tracking-tight text-white">
                  {handle}
                </h1>
                <button
                  type="button"
                  onClick={copyAddress}
                  title={copied ? "Copied" : "Copy address"}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-[#1a1a1e] hover:text-zinc-200"
                >
                  {copied ? <Check size={14} weight="bold" /> : <CopySimple size={14} />}
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2">
                {twitter ? (
                  <a
                    href={externalUrl(twitter)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-[4px] border border-[#26262b] bg-[#131316] px-1.5 py-0.5 text-[11px] font-medium text-zinc-300 transition-colors hover:text-white"
                  >
                    <XLogo size={11} weight="fill" /> Linked
                  </a>
                ) : (
                  <span className="text-[11px] text-zinc-600">Unverified creator</span>
                )}
                <span className="text-[11px] text-zinc-600">·</span>
                <span className="text-[11px] text-zinc-500">
                  {launches.length} {launches.length === 1 ? "launch" : "launches"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={copyAddress}
              className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[#26262b] bg-[#101012] px-3 font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-[#3a3a42] hover:text-white"
            >
              <ShareNetwork size={14} weight="bold" /> Share
            </button>
            <Link
              href="/horns"
              className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[#2c4030] bg-[#101c12] px-3 font-display text-[11px] font-bold uppercase tracking-[0.12em] text-[#9ff5ae] transition-colors hover:border-[#3a5a44] hover:text-white"
            >
              <Horse size={14} weight="fill" /> Earn
            </Link>
          </div>
        </div>

        {/* Stat cards */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard label="Launched value" value={usd(launchedValue)} foot="combined market cap of launches" />
          <StatCard
            label="Holdings"
            value={holdings.isLoading ? "…" : String(holdings.data?.length ?? 0)}
            foot="coins held by this wallet"
          />
        </div>

        {/* Tabs */}
        <div className="mt-6 rounded-2xl border border-[#1e1e22] bg-[#0c0c0e]/80">
          <div className="flex items-center gap-5 border-b border-[#1a1a1e] px-4">
            {(["launches", "holdings", "activity"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`h-11 border-b-2 font-display text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                  tab === t
                    ? "border-[#6cf07f] text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {t}
                {t === "launches" && launches.length > 0 && (
                  <span className="ml-1.5 text-zinc-600">{launches.length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === "launches" &&
              (launches.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {launches.map((t) => (
                    <TokenCard key={t.address} token={t} />
                  ))}
                </div>
              ) : (
                <Empty title="No coins launched yet" body="Coins this wallet creates on ANSEM will show here." />
              ))}

            {tab === "holdings" &&
              (holdings.isLoading ? (
                <Empty title="Loading holdings…" body="Reading token balances." />
              ) : holdings.data && holdings.data.length ? (
                <div className="divide-y divide-[#141417]">
                  {holdings.data.map((h) => (
                    <Link
                      key={h.mint}
                      href={`/token/${h.market}`}
                      className="group flex items-center gap-3 py-2.5"
                    >
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[6px] border border-[#1e1e22] bg-[#131316]">
                        {h.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-xs text-zinc-600">
                            {h.symbol.slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-zinc-100">{h.name}</p>
                        <p className="truncate font-mono text-[11px] text-zinc-500">${h.symbol}</p>
                      </div>
                      <span className="mono text-[13px] font-semibold text-zinc-200">
                        {compact(h.balance)}
                      </span>
                      <ArrowUpRight size={14} className="text-zinc-600 transition-colors group-hover:text-[#6cf07f]" />
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty title="No coins held" body="Tokens bought by this wallet will appear here." />
              ))}

            {tab === "activity" && (
              <Empty
                title="No activity yet"
                body="Trades and launches by this wallet will stream here as they're indexed."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, foot }: { label: string; value: string; foot: string }) {
  return (
    <div className="rounded-2xl border border-[#1e1e22] bg-[#0e0e10]/80 p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mono mt-1.5 text-[26px] font-bold tracking-tight text-white">{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-600">{foot}</p>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-14 text-center">
      <p className="font-display text-[15px] font-semibold text-zinc-200">{title}</p>
      <p className="max-w-xs text-[12px] text-zinc-500">{body}</p>
    </div>
  );
}

function shortHandle(addr: string): string {
  if (!addr) return "creator";
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr;
}

function externalUrl(v: string): string {
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function usd(v: number): string {
  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(v || 0);
}

function compact(v: number): string {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v || 0);
}
