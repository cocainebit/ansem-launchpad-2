"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { User } from "@phosphor-icons/react";
import { useFloorWallet } from "@/components/wallet/solana-wallet-provider";
import { usePosts, useGraph, type Post } from "@/lib/social";
import { useTokens } from "@/hooks/use-tokens";
import { DEFAULT_TOKEN_SUPPLY } from "@/lib/chain-config";
import type { TokenListItem } from "@/lib/api";
import { PostCard } from "@/components/social/post-card";
import { PostComposer } from "@/components/social/post-composer";

type Tab = "for-you" | "following";
type Wallet = ReturnType<typeof useFloorWallet>;

export default function FeedPage() {
  const wallet = useFloorWallet();
  const qc = useQueryClient();
  const posts = usePosts(wallet.address); // global timeline + viewer flags
  const [tab, setTab] = useState<Tab>("for-you");

  const all = useMemo(
    () => [...(posts.data ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [posts.data],
  );

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["social", "posts"] });
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
      {/* LEFT rail: Trending (top coins) */}
      <aside className="hidden xl:block">
        <div className="sticky top-4">
          <TrendingRail />
        </div>
      </aside>

      {/* CENTER: the feed */}
      <main className="mx-auto w-full max-w-[620px]">
        <div className="mb-4">
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-white">
            Feed
          </h1>
          <p className="mt-0.5 font-sans text-[13px] text-zinc-500">
            The global timeline of everyone on ansemchain.
          </p>
        </div>

        <PostComposer wallet={wallet} onPosted={refresh} />

        <div className="flex border-b border-[var(--hairline)]">
          <TabButton active={tab === "for-you"} onClick={() => setTab("for-you")}>
            For you
          </TabButton>
          <TabButton active={tab === "following"} onClick={() => setTab("following")}>
            Following
          </TabButton>
        </div>

        <div key={tab} className="ansem-fade-in">
          {posts.isLoading ? (
            <Empty label="Loading the timeline…" />
          ) : tab === "for-you" ? (
            all.length === 0 ? (
              <Empty label="No posts yet." hint="Be the first to say something above." />
            ) : (
              <div>
                {all.map((p) => (
                  <PostCard key={p.id} post={p} wallet={wallet} onChanged={refresh} />
                ))}
              </div>
            )
          ) : (
            <FollowingTimeline posts={all} wallet={wallet} onChanged={refresh} />
          )}
        </div>
      </main>

      {/* RIGHT rail: Leaderboard (top creators) */}
      <aside className="hidden xl:block">
        <div className="sticky top-4">
          <LeaderboardRail />
        </div>
      </aside>
    </div>
  );
}

/* ---------------- Following timeline ---------------- */

function FollowingTimeline({
  posts,
  wallet,
  onChanged,
}: {
  posts: Post[];
  wallet: Wallet;
  onChanged: () => Promise<void> | void;
}) {
  const viewer = wallet.address;
  const authors = useMemo(() => Array.from(new Set(posts.map((p) => p.author))), [posts]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});

  if (!viewer) {
    return (
      <Empty
        label="Connect your wallet to see who you follow."
        hint="Follow people from their profiles, then their posts land here."
      />
    );
  }

  const resolvedCount = authors.filter((a) => a in followed).length;
  const loading = authors.length > 0 && resolvedCount < authors.length;
  const visible = posts.filter((p) => followed[p.author]);

  return (
    <>
      {authors.map((a) => (
        <FollowProbe
          key={a}
          author={a}
          viewer={viewer}
          onResult={(f) => setFollowed((prev) => (prev[a] === f ? prev : { ...prev, [a]: f }))}
        />
      ))}

      {loading && visible.length === 0 ? (
        <Empty label="Checking who you follow…" />
      ) : visible.length === 0 ? (
        <Empty
          label="You're not following anyone with posts yet."
          hint="Find people on their profiles and hit Follow to fill this tab."
        />
      ) : (
        <div>
          {visible.map((p) => (
            <PostCard key={p.id} post={p} wallet={wallet} onChanged={onChanged} />
          ))}
        </div>
      )}
    </>
  );
}

function FollowProbe({
  author,
  viewer,
  onResult,
}: {
  author: string;
  viewer: string;
  onResult: (follows: boolean) => void;
}) {
  const graph = useGraph(author, viewer);
  const follows = graph.data?.viewerFollows;
  useEffect(() => {
    if (typeof follows === "boolean") onResult(follows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follows]);
  return null;
}

/* ---------------- LEFT rail: Trending ---------------- */

function TrendingRail() {
  const { data: tokens, isLoading } = useTokens();
  const trending = useMemo(
    () => [...(tokens ?? [])].sort((a, b) => capUsd(b) - capUsd(a)).slice(0, 10),
    [tokens],
  );

  return (
    <RailShell
      title="Trending"
      tabs={["Trending", "Movers", "Watchlist"]}
    >
      {isLoading ? (
        <RailLoading />
      ) : trending.length === 0 ? (
        <RailEmpty label="No coins yet." />
      ) : (
        <ul className="ansem-fade-in">
          {trending.map((t) => (
            <li key={t.address}>
              <Link
                href={`/token/${t.address}`}
                className="group flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-[#232326]"
              >
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-[var(--hairline)] bg-[#202022]">
                  {t.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center font-mono text-[11px] text-zinc-600">
                      {t.symbol?.slice(0, 1)}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-display text-[13px] font-semibold text-[#6cf07f]">
                      ${t.symbol}
                    </span>
                  </div>
                  <span className="block truncate font-sans text-[11px] text-zinc-500">
                    {t.name}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block font-mono text-[12px] font-semibold text-zinc-200">
                    {usd(capUsd(t))}
                  </span>
                  {t.price_change_24h != null && (
                    <span
                      className={`block font-mono text-[11px] ${t.price_change_24h >= 0 ? "text-[#4ade80]" : "text-[#ff5b5b]"}`}
                    >
                      {t.price_change_24h >= 0 ? "+" : ""}
                      {t.price_change_24h.toFixed(1)}%
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </RailShell>
  );
}

/* ---------------- RIGHT rail: Leaderboard ---------------- */

function LeaderboardRail() {
  const { data: tokens, isLoading } = useTokens();
  const creators = useMemo(() => {
    const map = new Map<
      string,
      { creator: string; launches: number; launchedValue: number; image: string | null }
    >();
    for (const t of tokens ?? []) {
      const c = t.creator ?? t.address;
      const row = map.get(c) ?? { creator: c, launches: 0, launchedValue: 0, image: null };
      row.launches += 1;
      row.launchedValue += capUsd(t);
      if (!row.image && t.image) row.image = t.image;
      map.set(c, row);
    }
    return [...map.values()].sort((a, b) => b.launchedValue - a.launchedValue).slice(0, 10);
  }, [tokens]);

  return (
    <RailShell
      title="Leaderboard"
      tabs={["Creators"]}
    >
      {isLoading ? (
        <RailLoading />
      ) : creators.length === 0 ? (
        <RailEmpty label="No creators yet." />
      ) : (
        <ul className="ansem-fade-in">
          {creators.map((c, i) => (
            <li key={c.creator}>
              <Link
                href={`/creator/${c.creator}`}
                className="group flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-[#232326]"
              >
                <span className="w-5 shrink-0 text-center font-mono text-[12px] text-zinc-500">
                  {medal(i)}
                </span>
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[var(--hairline)] bg-[#202022]">
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User size={16} weight="fill" className="m-auto mt-1.5 text-zinc-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[13px] font-semibold text-zinc-200 group-hover:text-[#6cf07f]">
                    {short(c.creator)}
                  </span>
                  <span className="block font-sans text-[11px] text-zinc-500">
                    {c.launches} launch{c.launches === 1 ? "" : "es"}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[12px] font-semibold text-white">
                  {usd(c.launchedValue)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </RailShell>
  );
}

/* ---------------- Rail shell ---------------- */

function RailShell({
  title,
  tabs,
  children,
}: {
  title: string;
  tabs: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[#1c1c1e]">
      <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-3 py-3">
        <h2 className="font-display text-[15px] font-semibold text-white">{title}</h2>
      </div>
      {tabs.length > 1 && (
        <div className="flex gap-4 border-b border-[var(--hairline)] px-3 py-2">
          {tabs.map((t, i) => (
            <span
              key={t}
              className={`font-sans text-[12px] font-medium ${i === 0 ? "text-zinc-200" : "text-zinc-600"}`}
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="divide-y divide-[var(--hairline)]">{children}</div>
    </div>
  );
}

function RailLoading() {
  return <p className="px-3 py-6 text-center font-sans text-[12px] text-zinc-600">Loading…</p>;
}
function RailEmpty({ label }: { label: string }) {
  return <p className="px-3 py-6 text-center font-sans text-[12px] text-zinc-600">{label}</p>;
}

/* ---------------- bits ---------------- */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative -mb-px h-11 flex-1 font-sans text-[14px] font-medium transition-colors ${
        active ? "text-white" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
      {active && (
        <span className="absolute inset-x-0 bottom-0 mx-auto h-[3px] w-14 rounded-full bg-[#6cf07f]" />
      )}
    </button>
  );
}

function Empty({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-16 text-center">
      <p className="font-sans text-[14px] text-zinc-400">{label}</p>
      {hint && <p className="font-sans text-[12px] text-zinc-600">{hint}</p>}
    </div>
  );
}

/* ---------------- helpers ---------------- */

function capUsd(t: TokenListItem): number {
  return (Number(t.current_price) / 1e6) * t.market.solUsd * DEFAULT_TOKEN_SUPPLY;
}
function usd(v: number): string {
  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(v || 0);
}
function short(a: string): string {
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a;
}
function medal(i: number): string {
  return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1);
}
