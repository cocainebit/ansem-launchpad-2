"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "@phosphor-icons/react";
import { useTokens } from "@/hooks/use-tokens";
import { Sparkline } from "@/components/utoken/sparkline";
import { DEFAULT_TOKEN_SUPPLY } from "@/lib/chain-config";
import { fetchGraduationThreshold, type TokenListItem } from "@/lib/api";

export function UtokenHome() {
  const { data: tokens, isLoading } = useTokens();
  const { data: threshold = 0 } = useQuery({
    queryKey: ["graduation-threshold"],
    queryFn: fetchGraduationThreshold,
  });

  const ranked = useMemo(
    () =>
      [...(tokens ?? [])].sort(
        (a, b) => capUsd(b) - capUsd(a),
      ),
    [tokens],
  );
  const featured = ranked.slice(0, 6);
  const trending = ranked.slice(0, 8);

  return (
    <div className="space-y-12 font-sans">
      <Hero />

      {/* Featured */}
      <section>
        <h2 className="mb-4 font-display text-[24px] font-semibold tracking-tight text-white">
          Featured coins
        </h2>
        {isLoading ? (
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-[150px] w-[300px] shrink-0 animate-pulse rounded-xl border border-[var(--hairline)] bg-[#1c1c1e]" />
            ))}
          </div>
        ) : (
          <FeaturedCarousel items={featured} thresholdMicro={threshold} />
        )}
      </section>

      {/* Trending */}
      <section>
        <h2 className="mb-4 font-display text-[24px] font-semibold tracking-tight text-white">
          Trending
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-[92px] animate-pulse rounded-xl border border-[var(--hairline)] bg-[#1c1c1e]" />
              ))
            : trending.map((t) => <TrendingCard key={t.address} token={t} />)}
        </div>
      </section>

      {/* Registry */}
      <Registry tokens={ranked} loading={isLoading} />
    </div>
  );
}

/* ---------------- Hero ---------------- */

type HeroSlide = {
  badge: string;
  l1: string;
  l2: string;
  accent: "l1" | "l2" | "none";
  body: React.ReactNode;
  ctas: Array<{ href: string; label: string; primary?: boolean }>;
};

const HERO_SLIDES: HeroSlide[] = [
  {
    badge: "Horns · live on every pool",
    l1: "COINS THAT PAY",
    l2: "THEIR HOLDERS.",
    accent: "l2",
    body: (
      <>
        Every coin launches on a bonding curve and graduates to the ANSEM AMM. A{" "}
        <span className="text-zinc-200">Horn</span> skims a slice of every swap fee to CHANSE and ANSEM
        stakers, so real trading becomes real yield.
      </>
    ),
    ctas: [
      { href: "/create", label: "Launch a coin", primary: true },
      { href: "/explore", label: "Explore coins" },
    ],
  },
  {
    badge: "The launch",
    l1: "LAUNCH ON A CURVE.",
    l2: "GRADUATE TO THE AMM.",
    accent: "none",
    body: (
      <>
        No presale, no team allocation. Your coin opens on a fair bonding curve, and once it fills it
        graduates straight into a live ANSEM AMM pool with <span className="text-zinc-200">Horns</span>{" "}
        attached from block one.
      </>
    ),
    ctas: [
      { href: "/create", label: "Launch a coin", primary: true },
      { href: "/horns", label: "How it works" },
    ],
  },
  {
    badge: "Stake · earn the skim",
    l1: "STAKE ANSEM OR CHANSE.",
    l2: "EARN EVERY POOL'S FEES.",
    accent: "l2",
    body: (
      <>
        Stake into the <span className="text-zinc-200">Horn Vault</span> and collect a per-block cut of
        the fees skimmed from every graduated pool, in both CHANSE and ANSEM. One vault, two sinks.
      </>
    ),
    ctas: [
      { href: "/vault", label: "Open the Vault", primary: true },
      { href: "/horns", label: "Explore Horns" },
    ],
  },
];

const HERO_DURATION = 7000;

// Banner art behind the hero. Drop the files at these paths in /public/hero/;
// a missing file simply shows the base background (no broken-image icon).
const HERO_IMAGES = ["/hero/bull-ride.png", "/hero/bull-eyes.png", "/hero/bull-rest.png"];

function Hero() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % HERO_SLIDES.length), HERO_DURATION);
    return () => window.clearTimeout(id);
  }, [active, paused]);

  const slide = HERO_SLIDES[active];

  return (
    <section
      className="relative aspect-[2880/920] min-h-[300px] overflow-hidden rounded-2xl border border-[#1e1e22] bg-[#0c0c0e]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Banner art: the bull images, cross-fading with the slides. Both layers
          stay mounted so the opacity swap is a smooth cross-fade. */}
      <div className="pointer-events-none absolute inset-0">
        {HERO_IMAGES.map((src, i) => (
          <div
            key={src}
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-[900ms] ease-out"
            style={{
              backgroundImage: `url(${src})`,
              opacity: i === active % HERO_IMAGES.length ? 1 : 0,
            }}
          />
        ))}
      </div>
      {/* Legibility masks: solid only under the left copy, then clearing early so
          the art stays visible on the right. Kept light on purpose. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0c0c0e] from-[0%] via-[#0c0c0e]/50 via-[40%] to-transparent to-[70%]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c0c0e]/60 via-transparent to-transparent" />

      {/* Content overlay, vertically centered so the section height is driven by
          the banner aspect (full image visible), not the copy. Text carries its
          own shadow so it stays legible over the bright frames of the art. */}
      <div className="absolute inset-0 flex flex-col justify-center px-6 sm:px-8">
        <div key={active} className="ansem-hero-slide max-w-2xl">
          <h1
            className="font-display text-[32px] font-bold leading-[0.98] tracking-[-0.02em] text-white sm:text-[50px]"
            style={{ textShadow: "0 2px 22px rgba(4,4,6,0.92), 0 1px 4px rgba(4,4,6,0.95)" }}
          >
            <span className={slide.accent === "l1" ? "text-[#6cf07f]" : undefined}>{slide.l1}</span>
            <br />
            <span className={slide.accent === "l2" ? "text-[#6cf07f]" : undefined}>{slide.l2}</span>
          </h1>

          <p
            className="mt-4 max-w-xl font-sans text-[14px] leading-6 text-zinc-200 sm:text-[15px]"
            style={{ textShadow: "0 1px 12px rgba(4,4,6,0.95), 0 1px 3px rgba(4,4,6,0.98)" }}
          >
            {slide.body}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {slide.ctas.map((c) =>
              c.primary ? (
                <Link
                  key={c.href}
                  href={c.href}
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-[#22b45f] px-5 font-display text-[14px] font-semibold text-white transition-colors hover:bg-[#1f9d53]"
                >
                  {c.label} <ArrowRight size={15} weight="bold" />
                </Link>
              ) : (
                <Link
                  key={c.href}
                  href={c.href}
                  className="inline-flex h-11 items-center rounded-lg border border-[#2a2a30] bg-[#141416] px-5 font-display text-[14px] font-semibold text-white transition-colors hover:border-[#3a3a42]"
                >
                  {c.label}
                </Link>
              ),
            )}
          </div>
        </div>

        {/* Time-decay pager, anchored to the bottom of the banner */}
        <div className="absolute bottom-4 left-6 flex items-center gap-2 sm:left-8">
          {HERO_SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setActive(i)}
              className="group flex h-4 items-center"
            >
              {i === active ? (
                <span className="relative h-1.5 w-8 overflow-hidden rounded-full bg-[#2f2f36]">
                  <span
                    key={active}
                    className="ansem-hero-fill absolute inset-y-0 left-0 rounded-full bg-white"
                    style={{ animationDuration: `${HERO_DURATION}ms`, animationPlayState: paused ? "paused" : "running" }}
                  />
                </span>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-[#3f3f46] transition-colors group-hover:bg-zinc-500" />
              )}
            </button>
          ))}
        </div>
      </div>

    </section>
  );
}

/* ---------------- Featured card ---------------- */

/* ---------------- Featured carousel ---------------- */

function FeaturedCarousel({ items, thresholdMicro }: { items: TokenListItem[]; thresholdMicro: number }) {
  if (items.length === 0) return null;
  // Duplicate the set so the -50% translate loops seamlessly. Speed scales with
  // count so a short list is not frantic. Hover-pause lives in the CSS class.
  const loop = items.length > 1 ? [...items, ...items] : items;
  const duration = Math.max(24, items.length * 7);
  return (
    <div className="relative -mx-1 overflow-hidden px-1">
      <div
        className={items.length > 1 ? "ansem-featured-marquee flex w-max gap-3" : "flex gap-3"}
        style={items.length > 1 ? { animationDuration: `${duration}s` } : undefined}
      >
        {loop.map((t, i) => (
          <FeaturedCard key={`${t.address}-${i}`} token={t} thresholdMicro={thresholdMicro} />
        ))}
      </div>
    </div>
  );
}

function FeaturedCard({ token, thresholdMicro }: { token: TokenListItem; thresholdMicro: number }) {
  const change = token.price_change_24h;
  const graduated = token.graduated;
  const raised = Number(token.hodl_reserves) || 0;
  const pct = graduated ? 100 : thresholdMicro > 0 ? Math.min(100, Math.max(2, (raised / thresholdMicro) * 100)) : 4;
  return (
    <Link
      href={`/token/${token.address}`}
      className="group relative h-[150px] w-[300px] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--hairline)] bg-[#1c1c1e] transition-colors hover:border-zinc-500"
    >
      {token.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={token.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-[1px] transition-opacity group-hover:opacity-40" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#161616] via-[#161616]/70 to-transparent" />
      {/* Graduated coins keep the venue tag; bonding coins show a migration bar instead. */}
      {graduated && (
        <div className="absolute right-3 top-3">
          <VenueBadge token={token} />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-3.5 pb-4">
        <p className="font-display text-[15px] font-semibold text-white">{token.name}</p>
        <div className="mt-1 flex items-center gap-2 font-mono text-[12px]">
          <span className="text-zinc-400">Mkt cap</span>
          <span className="font-semibold text-zinc-100">{usd(capUsd(token))}</span>
          {change != null && (
            <span className={change >= 0 ? "text-[#4ade80]" : "text-[#ff5b5b]"}>
              {change >= 0 ? "+" : ""}{change.toFixed(1)}%
            </span>
          )}
          {!graduated && <span className="ml-auto text-[11px] text-[#6cf07f]">{pct.toFixed(0)}% to migration</span>}
        </div>
      </div>
      {/* Migration progress: a green bar horizontally across the bottom of the banner. */}
      {!graduated && (
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/40">
          <div className="h-full bg-[#6cf07f] transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </Link>
  );
}

/* ---------------- Trending card ---------------- */

function TrendingCard({ token }: { token: TokenListItem }) {
  const change = token.price_change_24h;
  const up = change == null ? true : change >= 0;
  const volUsd = (Number(token.volume_24h) / 1e6) * token.market.solUsd;
  return (
    <Link
      href={`/token/${token.address}`}
      className="flex items-center gap-3 rounded-[10px] border border-[var(--hairline)] bg-[#1c1c1e] p-3 transition-colors hover:border-[#3a3a42]"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[#202022]">
        {token.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={token.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center font-display text-lg font-bold text-zinc-500">{token.symbol?.slice(0, 1)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[15px] font-bold text-[#6cf07f]">${token.symbol}</span>
          <span className="truncate text-[13px] text-zinc-400">{token.name}</span>
        </div>
        <p className="mt-1 text-[12px] text-zinc-500">Mkt cap: <span className="text-zinc-300">{usd(capUsd(token))}</span></p>
        <p className="text-[12px] text-zinc-500">24h vol: <span className="text-zinc-300">{usd(volUsd)}</span></p>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2 self-stretch">
        <span className={`font-mono text-[13px] font-semibold ${change == null ? "text-zinc-600" : up ? "text-[#4ade80]" : "text-[#ff5b5b]"}`}>
          {change == null ? "-" : `${up ? "+" : ""}${change.toFixed(1)}%`}
        </span>
        <Sparkline address={token.address} up={up} width={82} height={30} />
      </div>
    </Link>
  );
}

/* ---------------- Registry ---------------- */

type Filter = "all" | "curve" | "amm";

function Registry({ tokens, loading }: { tokens: TokenListItem[]; loading: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { data: threshold = 0 } = useQuery({
    queryKey: ["graduation-threshold"],
    queryFn: fetchGraduationThreshold,
    staleTime: 5 * 60_000,
  });
  const rows = useMemo(
    () =>
      tokens.filter((t) =>
        filter === "all" ? true : filter === "amm" ? t.graduated : !t.graduated,
      ),
    [tokens, filter],
  );
  const filters: Filter[] = ["all", "curve", "amm"];

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[24px] font-semibold tracking-tight text-white">
          The Bullpen <span className="font-sans text-[13px] font-normal text-zinc-500">{tokens.length} tokens</span>
        </h2>
        {/* Segmented control with a sliding thumb (spec §7) */}
        <div className="relative grid grid-cols-3 rounded-lg bg-[#282828] p-0.5 ring-1 ring-[var(--hairline)]">
          <span
            className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-md bg-[#6cf07f] transition-transform duration-200"
            style={{ width: "calc((100% - 4px) / 3)", transform: `translateX(${filters.indexOf(filter) * 100}%)` }}
          />
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`relative z-10 h-7 rounded-md px-3 font-sans text-[12px] font-medium transition-colors ${
                filter === f ? "text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              {f === "amm" ? "Graduated" : f === "curve" ? "On curve" : "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-[#1c1c1e] ring-1 ring-[var(--hairline)]">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-[11px] uppercase tracking-[0.08em] text-zinc-600">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Token</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-right font-medium">24h</th>
              <th className="px-4 py-3 font-medium">Trend</th>
              <th className="px-4 py-3 text-right font-medium">Mcap</th>
              <th className="px-4 py-3 text-right font-medium">Holders</th>
              <th className="px-4 py-3 font-medium">Contract</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center font-sans text-[13px] text-zinc-500">Loading registry…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center font-sans text-[13px] text-zinc-500">No tokens.</td></tr>
            ) : (
              rows.map((t, i) => <RegistryRow key={t.address} token={t} rank={i + 1} thresholdMicro={threshold} />)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RegistryRow({ token, rank, thresholdMicro }: { token: TokenListItem; rank: number; thresholdMicro: number }) {
  const change = token.price_change_24h;
  const priceUsd = (Number(token.current_price) / 1e6) * token.market.solUsd;
  return (
    <tr className="group border-b border-[var(--hairline)] transition-colors last:border-0 hover:bg-[#232326]">
      <td className="px-4 py-3 tabular-nums text-[13px] text-zinc-600">{rank}</td>
      <td className="px-4 py-3">
        <Link href={`/token/${token.address}`} className="flex items-center gap-2.5">
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-[#202022] ring-1 ring-[var(--hairline)]">
            {token.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={token.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center text-[11px] text-zinc-600">{token.symbol?.slice(0, 1)}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[#6cf07f] group-hover:underline">{token.symbol}</p>
            <p className="truncate text-[12px] font-medium text-zinc-500">{token.name}</p>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3"><StatusPill token={token} thresholdMicro={thresholdMicro} /></td>
      <td className="px-4 py-3 text-right tabular-nums text-[13px] text-zinc-100">
        {priceUsd > 0 ? (priceUsd >= 0.01 ? usd(priceUsd) : `$${Number(priceUsd.toPrecision(2))}`) : "-"}
      </td>
      <td className={`px-4 py-3 text-right text-[13px] font-medium tabular-nums ${change == null ? "text-zinc-600" : change >= 0 ? "text-[#4ade80]" : "text-[#ff5b5b]"}`}>
        {change == null ? "-" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}
      </td>
      <td className="px-4 py-3"><Sparkline address={token.address} up={change == null ? true : change >= 0} /></td>
      <td className="px-4 py-3 text-right tabular-nums text-[13px] text-zinc-100">{usd(capUsd(token))}</td>
      <td className="px-4 py-3 text-right tabular-nums text-[13px] text-zinc-400">{token.trade_count_24h ?? 0}</td>
      <td className="px-4 py-3 tabular-nums text-[12px] text-zinc-500">{short(token.address)}</td>
    </tr>
  );
}

function VenueBadge({ token }: { token: TokenListItem }) {
  const graduated = token.graduated;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        graduated ? "bg-[#6cf07f]/15 text-[#9ff5ae]" : "bg-[#2a2a2c] text-zinc-400"
      }`}
    >
      {graduated ? "ANSEM AMM" : "Bonding"}
    </span>
  );
}

/** Status as a progress-bar pill: bonding fill, or full green when graduated. */
function StatusPill({ token, thresholdMicro }: { token: TokenListItem; thresholdMicro: number }) {
  const graduated = token.graduated;
  let pct = 100;
  let label = "Pool on AMM";
  if (!graduated) {
    const raised = Number(token.hodl_reserves) || 0;
    pct = thresholdMicro > 0 ? Math.min(100, Math.max(3, (raised / thresholdMicro) * 100)) : 6;
    label = thresholdMicro > 0 ? `Bonding ${pct.toFixed(0)}%` : "Bonding";
  }
  return (
    <div className="relative h-[19px] w-[148px] overflow-hidden rounded-md bg-[#2e2e2e]">
      <div
        className={`absolute inset-y-0 left-0 rounded-md ${graduated ? "bg-[#4ade80]/25" : "bg-[#6cf07f]/25"}`}
        style={{ width: `${pct}%` }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-zinc-100">{label}</span>
    </div>
  );
}

/* helpers */
function capUsd(t: TokenListItem): number {
  return (Number(t.current_price) / 1e6) * t.market.solUsd * DEFAULT_TOKEN_SUPPLY;
}
function usd(v: number): string {
  return Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(v || 0);
}
function short(a: string): string {
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a;
}
