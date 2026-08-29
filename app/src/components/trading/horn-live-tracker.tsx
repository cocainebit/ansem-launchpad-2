"use client";

/**
 * HornLiveTracker - a live, animated readout of a Horn's fee mechanic, sitting
 * directly under the price chart on the token page.
 *
 * HONESTY NOTE (read before touching this):
 * The Horns stack is LIVE on ansem-1. This tracker reads the token's graduated
 * AMM pool for a real attached hook (useTokenHorn) and, when one is attached,
 * drives the readout from REAL on-chain params: for Fee Decay it fetches the
 * decay horn's config and computes the current fee from start/end/decay_seconds
 * + wall-clock block time; for Dynamic Fee it shows the real base / discount
 * tiers. The "preview" pill drops to "live" in that case and no figure is
 * simulated.
 *
 * When NO horn is attached (every pre-migration pool has hook=null, and a real
 * per-pool readout can only appear once a coin graduates AFTER the migration
 * with a horn bolted on), the tracker falls back to an explicitly-labelled
 * PREVIEW: an honest client-clock simulation of the MECHANISM, never presented
 * as on-chain data. The per-horn PRESETS map (keyed by catalog slug) powers that
 * preview and its selector tabs.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { TokenListItem } from "@/lib/api";
import { HORNS } from "@/lib/horns-catalog";
import {
  useTokenHorn,
  useDecayConfig,
  useDynfeeConfig,
  decayFeeBpsAt,
  type DecayConfig,
  type DynfeeConfig,
} from "@/hooks/use-token-horn";

/* ------------------------------------------------------------------ */
/* Per-horn simulation model                                          */
/* ------------------------------------------------------------------ */

type Readout = {
  /** Big number, formatted (e.g. "2.41%"). */
  headline: string;
  /** Label above the big number (e.g. "Current fee"). */
  headlineLabel: string;
  /** One-line trajectory description under the number. */
  caption: string;
  /** Whether the mechanic has run its course (rests / steps aside). */
  settled: boolean;
  /** 0..1 x-position of the "now" marker on the trajectory track. */
  marker: number;
  /** Normalized height (0..1, 1 = top) of the trajectory at track x in [0,1]. */
  sample: (x: number) => number;
  /** Left / right end labels under the track. */
  startLabel: string;
  endLabel: string;
};

type HornPreset = {
  slug: string;
  /** Pure function of elapsed seconds since the (simulated) start. */
  compute: (elapsedSec: number) => Readout;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const pct = (v: number) => `${v.toFixed(2)}%`;

// Fee Decay: launch fee starts high and decays toward base over a window.
// Ease-out power curve so the first blocks pay the most (front-runs snipers)
// and it flattens into the base rate. Reaches base exactly at the window end.
const DECAY = { startFee: 5.0, baseFee: 0.3, windowSec: 45 * 60, gamma: 2.2 };
function decayReadout(elapsedSec: number): Readout {
  const u = clamp01(elapsedSec / DECAY.windowSec);
  const feeAt = (x: number) =>
    DECAY.baseFee + (DECAY.startFee - DECAY.baseFee) * Math.pow(1 - x, DECAY.gamma);
  const fee = feeAt(u);
  const settled = u >= 1;
  const remainingSec = Math.max(0, DECAY.windowSec - elapsedSec);
  const remainingMin = Math.ceil(remainingSec / 60);
  return {
    headline: pct(fee),
    headlineLabel: "Current fee",
    caption: settled
      ? `Settled to base ${pct(DECAY.baseFee)}`
      : `Decaying to ${pct(DECAY.baseFee)} base, ~${remainingMin}m remaining`,
    settled,
    marker: u,
    sample: (x) => Math.pow(1 - x, DECAY.gamma),
    startLabel: `${pct(DECAY.startFee)} launch`,
    endLabel: `${pct(DECAY.baseFee)} base`,
  };
}

// Dynamic Fee: fee reacts to a simulated volatility input, clamped to a cap.
// Deterministic layered sines stand in for a live volatility read.
const DYN = { baseFee: 0.3, capFee: 3.0, windowSec: 90 };
function volAt(tSec: number): number {
  return clamp01(0.5 + 0.32 * Math.sin(tSec / 23) + 0.18 * Math.sin(tSec / 7 + 1.3));
}
function dynfeeReadout(elapsedSec: number): Readout {
  const feeAt = (t: number) => DYN.baseFee + (DYN.capFee - DYN.baseFee) * volAt(t);
  return {
    headline: pct(feeAt(elapsedSec)),
    headlineLabel: "Current fee",
    caption: `Reacting to volatility, base ${pct(DYN.baseFee)} / cap ${pct(DYN.capFee)}`,
    settled: false,
    // Now sits at the right edge; the track shows the recent fee wave.
    marker: 1,
    sample: (x) => volAt(elapsedSec - (1 - x) * DYN.windowSec),
    startLabel: `${DYN.windowSec}s ago`,
    endLabel: "now",
  };
}

// Fee Auction (am-AMM): a seated manager holds the fee seat; rent decays per
// second until the lease ends and the seat opens for the next bid.
const AUCTION = { seatFee: 1.2, rent0: 250, leaseSec: 30 * 60 };
function auctionReadout(elapsedSec: number): Readout {
  const u = clamp01(elapsedSec / AUCTION.leaseSec);
  const rent = AUCTION.rent0 * (1 - u);
  const settled = u >= 1;
  const remainingMin = Math.ceil(Math.max(0, AUCTION.leaseSec - elapsedSec) / 60);
  return {
    headline: `${rent.toFixed(0)} CHANSE`,
    headlineLabel: "Seat rent",
    caption: settled
      ? "Lease ended, seat open for the next bid"
      : `Seat fee ${pct(AUCTION.seatFee)}, ~${remainingMin}m to lease end`,
    settled,
    marker: u,
    sample: (x) => 1 - x,
    startLabel: "lease start",
    endLabel: "lease end",
  };
}

// Oracle Arb: a funded subsidy budget hands traders capped price improvement,
// draining (front-loaded) until it is spent and the horn steps aside.
const ARB = { budget0: 500, windowSec: 60 * 60, gamma: 1.3 };
function arbReadout(elapsedSec: number): Readout {
  const u = clamp01(elapsedSec / ARB.windowSec);
  const remaining = ARB.budget0 * Math.pow(1 - u, ARB.gamma);
  const settled = u >= 1;
  const leftPct = (remaining / ARB.budget0) * 100;
  return {
    headline: `${remaining.toFixed(0)} CHANSE`,
    headlineLabel: "Subsidy left",
    caption: settled
      ? "Budget spent, steps aside to the plain swap"
      : `Handing capped improvement, ~${leftPct.toFixed(0)}% of budget left`,
    settled,
    marker: u,
    sample: (x) => Math.pow(1 - x, ARB.gamma),
    startLabel: "funded",
    endLabel: "spent",
  };
}

// Keyed by horn slug (matches src/lib/horns-catalog.ts). Fee Decay is the
// showcase default; the others are live bonus previews. To add another horn,
// drop a preset here keyed by its catalog slug.
const PRESETS: Record<string, HornPreset> = {
  decay: { slug: "decay", compute: decayReadout },
  dynfee: { slug: "dynfee", compute: dynfeeReadout },
  auction: { slug: "auction", compute: auctionReadout },
  arb: { slug: "arb", compute: arbReadout },
};

const PREVIEW_SLUGS = ["decay", "dynfee", "auction", "arb"] as const;
const ACCENT = "#6cf07f";

// Anchor the PREVIEW simulation to the current wall-clock hour so it is
// deterministic across refreshes (reloading no longer restarts it at "launch").
// Real attached horns ignore this and drive from their on-chain launch_time.
const PREVIEW_WINDOW_MS = 3_600_000;
function previewAnchor(): number {
  return Math.floor(Date.now() / PREVIEW_WINDOW_MS) * PREVIEW_WINDOW_MS;
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Real (on-chain) readouts                                           */
/* ------------------------------------------------------------------ */

// Fee Decay, driven by the horn's real on-chain config + wall-clock time.
// `nowSec` is real wall-clock seconds; the fee follows the on-chain linear
// schedule between start_fee_bps and end_fee_bps over decay_seconds.
function realDecayReadout(cfg: DecayConfig, nowSec: number): Readout {
  const endSec = cfg.launchTime + cfg.decaySeconds;
  const feeBps = decayFeeBpsAt(cfg, nowSec);
  const settled = nowSec >= endSec;
  const u = cfg.decaySeconds > 0 ? clamp01((nowSec - cfg.launchTime) / cfg.decaySeconds) : 1;
  const remainingMin = Math.ceil(Math.max(0, endSec - nowSec) / 60);
  const startPct = cfg.startFeeBps / 100;
  const endPct = cfg.endFeeBps / 100;
  const range = cfg.startFeeBps - cfg.endFeeBps;
  return {
    headline: pct(feeBps / 100),
    headlineLabel: "Current fee",
    caption: settled
      ? `Settled to base ${pct(endPct)}`
      : `Decaying to ${pct(endPct)} base, ~${remainingMin}m remaining`,
    settled,
    marker: u,
    // Normalized height: 1 at the launch fee, 0 at the base fee (linear).
    sample: (x) => {
      const f = cfg.startFeeBps + (cfg.endFeeBps - cfg.startFeeBps) * x;
      return range !== 0 ? clamp01((f - cfg.endFeeBps) / range) : 0;
    },
    startLabel: `${pct(startPct)} launch`,
    endLabel: `${pct(endPct)} base`,
  };
}

// Dynamic Fee: real base / discount tiers from the horn's on-chain config. Not a
// time trajectory, so it rests; the track shows the two tiers.
function realDynfeeReadout(cfg: DynfeeConfig): Readout {
  const basePct = cfg.baseFeeBps / 100;
  const discPct = cfg.discountFeeBps / 100;
  const minAnsem = Number(cfg.minAnsemStake) / 1e6;
  const minLabel = Number.isFinite(minAnsem)
    ? minAnsem.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "-";
  return {
    headline: pct(basePct),
    headlineLabel: "Base fee",
    caption: `ANSEM stakers pay ${pct(discPct)} with ${minLabel} ANSEM staked`,
    settled: true,
    marker: 1,
    // Two tiers: discounted (low) then base (high).
    sample: (x) => (x < 0.5 ? 0 : 1),
    startLabel: `${pct(discPct)} staker`,
    endLabel: `${pct(basePct)} base`,
  };
}

// Attached horn whose numeric readout we cannot (yet) compute, or whose config
// is still loading. Honest: names the horn, shows "-" rather than a fake value.
function liveMinimalReadout(name: string | null): Readout {
  return {
    headline: "-",
    headlineLabel: name ?? "Attached horn",
    caption: "Attached to this pool. Live fee schedule loading.",
    settled: true,
    marker: 0,
    sample: () => 0.5,
    startLabel: "on-chain",
    endLabel: "live",
  };
}

export function HornLiveTracker({ token }: { token: TokenListItem }) {
  // Real per-token attached-horn read (null / attached:false for pre-hook pools).
  const hornQ = useTokenHorn(token);
  const attachedHorn = hornQ.data?.attached ? hornQ.data : null;
  const attachedSlug = attachedHorn?.slug ?? null;
  const isLive = attachedHorn != null && attachedSlug != null;

  // Real on-chain params for the attached horn (queried only when relevant).
  const decayQ = useDecayConfig(
    isLive && attachedSlug === "decay" ? attachedHorn!.address : null,
  );
  const dynfeeQ = useDynfeeConfig(
    isLive && attachedSlug === "dynfee" ? attachedHorn!.address : null,
  );

  const [slug, setSlug] = useState<string>("decay");
  const [mounted, setMounted] = useState(false);
  const [motionOk, setMotionOk] = useState(true);
  const [nowMs, setNowMs] = useState(0);
  const launchRef = useRef(0);

  // Re-anchor the preview when the tracked horn changes (deterministic anchor,
  // so it doesn't jump back to "launch" on a refresh).
  useEffect(() => {
    launchRef.current = previewAnchor();
    setNowMs(Date.now());
  }, [slug]);

  // Live client clock. Deterministic elapsed=0 on the server / first paint
  // (mounted stays false) so there is no hydration mismatch; the clock only
  // starts after mount. Reduced-motion falls back to a single static read.
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setMotionOk(!reduce);
    setMounted(true);
    launchRef.current = previewAnchor();
    setNowMs(Date.now());
    if (reduce) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSec = mounted ? Math.max(0, (nowMs - launchRef.current) / 1000) : 0;

  // The horn identity shown: the real attached horn when live, else the
  // previewed one from the selector.
  const activeSlug = isLive ? attachedSlug! : slug;
  const horn = HORNS.find((h) => h.slug === activeSlug);

  // Readout: REAL on-chain values when a horn is attached, otherwise the
  // explicitly-labelled preview simulation. The decay fee is computed from real
  // config + wall-clock block time; never a simulated number when live.
  let readout: Readout;
  if (isLive && attachedSlug === "decay" && decayQ.data) {
    const nowSec = mounted ? nowMs / 1000 : decayQ.data.launchTime;
    readout = realDecayReadout(decayQ.data, nowSec);
  } else if (isLive && attachedSlug === "dynfee" && dynfeeQ.data) {
    readout = realDynfeeReadout(dynfeeQ.data);
  } else if (isLive) {
    // Attached, but its config is still loading (or a horn without a numeric
    // schedule): honest placeholder, never a simulated figure.
    readout = liveMinimalReadout(attachedHorn!.name);
  } else {
    const preset = PRESETS[slug] ?? PRESETS.decay;
    readout = preset.compute(elapsedSec);
  }

  const replay = () => {
    launchRef.current = Date.now();
    setNowMs(Date.now());
  };

  return (
    <section className="border-t border-[#161619] px-4 py-4">
      {/* Header: horn identity + live/preview state */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-zinc-100">
            Horn tracker
          </h3>
          <p className="mt-1 truncate text-[11px] leading-4 text-zinc-500">
            {horn ? `${horn.name} - ${horn.tagline}` : "Live fee mechanic"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mounted && motionOk && !readout.settled ? (
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }}
            />
          ) : null}
          <span className="rounded-[4px] border border-[#26262b] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            {isLive ? "live" : "preview"}
          </span>
        </div>
      </div>

      {/* Horn selector (bonus previews). Hidden once a real horn is attached. */}
      {!isLive ? (
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Preview a horn">
          {PREVIEW_SLUGS.map((s) => {
            const h = HORNS.find((x) => x.slug === s);
            const active = s === slug;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                title={h?.tagline}
                onClick={() => setSlug(s)}
                className={`h-7 rounded-[10px] border px-2.5 font-display text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors duration-300 ease-out ${
                  active
                    ? "border-[#2f7d3f] bg-[#6cf07f]/10 text-[#6cf07f]"
                    : "border-[#1e1e22] bg-[#131316] text-zinc-500 hover:border-[#2a2a30] hover:text-zinc-200"
                }`}
              >
                {h?.name ?? s}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Live readout: big number + trajectory track */}
      <div className="mt-3 grid gap-3 rounded-[10px] border border-[#1a1a1e] bg-[#0a0a0b] p-3 sm:grid-cols-[minmax(0,150px)_minmax(0,1fr)]">
        {/* Big current value. Keyed on the horn slug (not the ticking value) so
            the entry animation replays on a horn switch, never on a 1s tick. */}
        <div key={activeSlug} className="horn-swap flex flex-col justify-center">
          <p className="text-[9px] uppercase tracking-[0.16em] text-zinc-600">
            {readout.headlineLabel}
          </p>
          <p
            className="mt-1 font-mono text-[30px] font-bold leading-none tabular-nums text-zinc-100"
            aria-live={motionOk ? "off" : undefined}
          >
            {mounted ? readout.headline : readout.headline}
          </p>
          <p className="mt-2 text-[11px] leading-4 text-zinc-400">{readout.caption}</p>
        </div>

        {/* Trajectory track. Same slug key so the curve swaps in step with the
            readout, and stays put across the per-second value ticks. */}
        <div key={`${activeSlug}-track`} className="horn-swap flex flex-col justify-center">
          <TrajectoryTrack readout={readout} accent={ACCENT} />
          <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600">
            <span>{readout.startLabel}</span>
            <span>{readout.endLabel}</span>
          </div>
        </div>
      </div>

      {/* Footer: honest preview label + replay for settled sims */}
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[10px] leading-4 text-zinc-600">
          {isLive
            ? "Live fee schedule read from this pool's attached horn."
            : "Preview: a live simulation of the mechanic. A real per-pool readout appears once this coin's pool has a horn attached."}
        </p>
        {!isLive && readout.settled ? (
          <button
            type="button"
            onClick={replay}
            className="shrink-0 rounded-[6px] border border-[#2a2a30] px-2.5 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-300 transition-colors hover:border-[#3a3a42] hover:text-zinc-100"
          >
            Replay
          </button>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Trajectory sparkline                                               */
/* ------------------------------------------------------------------ */

function TrajectoryTrack({ readout, accent }: { readout: Readout; accent: string }) {
  const W = 100;
  const H = 40;
  const PAD = 4;
  const N = 48;

  // Sample the curve. Coordinates are rounded to 2 dp so an SSR pass and the
  // first client render produce byte-identical path strings (no hydration warn).
  const { line, area, markerX, markerY } = useMemo(() => {
    const yFor = (h: number) => PAD + (1 - clamp01(h)) * (H - 2 * PAD);
    const pts: string[] = [];
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      const px = (x * W).toFixed(2);
      const py = yFor(readout.sample(x)).toFixed(2);
      pts.push(`${px},${py}`);
    }
    const line = `M ${pts.join(" L ")}`;
    const area = `${line} L ${W},${(H - PAD).toFixed(2)} L 0,${(H - PAD).toFixed(2)} Z`;
    const mx = clamp01(readout.marker) * W;
    const my = yFor(readout.sample(clamp01(readout.marker)));
    return { line, area, markerX: Number(mx.toFixed(2)), markerY: Number(my.toFixed(2)) };
  }, [readout]);

  const gradId = "hornTrackGrad";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-[52px] w-full"
      role="img"
      aria-label={`${readout.headlineLabel} trajectory: ${readout.caption}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.10" />
          <stop offset="60%" stopColor={accent} stopOpacity="0.03" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* base / floor line */}
      <line
        x1="0"
        y1={(H - PAD).toFixed(2)}
        x2={W}
        y2={(H - PAD).toFixed(2)}
        stroke="#26262b"
        strokeWidth="0.5"
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={accent}
        strokeWidth="1"
        strokeOpacity="0.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* now marker */}
      <line
        x1={markerX}
        y1="0"
        x2={markerX}
        y2={H}
        stroke={accent}
        strokeWidth="0.75"
        strokeOpacity="0.4"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={markerX} cy={markerY} r="2.5" fill={accent} vectorEffect="non-scaling-stroke" />
      <circle
        cx={markerX}
        cy={markerY}
        r="2.5"
        fill="none"
        stroke="#0a0a0b"
        strokeWidth="0.75"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
