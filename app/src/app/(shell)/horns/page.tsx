"use client";

import Link from "next/link";
import {
  Horse,
  Lightning,
  ChartLineUp,
  Wall,
  Timer,
  StackPlus,
  ArrowRight,
} from "@phosphor-icons/react";

/**
 * Horns explainer. Static, honest content describing the platform — no live
 * numbers. Mirrors the real CosmWasm contracts (AMM hooks + Horn Vault + the
 * individual Horns) so it stays accurate as they wire in.
 */
export default function HornsPage() {
  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0a0a0b] text-zinc-100">
      <div className="mx-auto max-w-3xl px-5 py-10">
        {/* Hero */}
        <div className="flex items-center gap-2">
          <Horse size={20} weight="fill" className="text-[#6cf07f]" />
          <span className="font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6cf07f]">
            Horns
          </span>
        </div>
        <h1 className="mt-3 font-display text-[34px] font-bold leading-[1.05] tracking-tight text-white">
          Hooks that pay ANSEM and CHANSE holders.
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-6 text-zinc-400">
          Horns are v4-style hooks on the graduation AMM. When a coin graduates,
          its creator can attach a Horn that skims a slice of every swap fee and
          routes it to the <span className="text-zinc-200">Horn Vault</span>,
          where ANSEM and CHANSE stakers earn it. That turns real trading on
          every graduated pool into a yield the two tokens capture — and the hook
          layer is open, so new Horns can be built and attached over time.
        </p>

        {/* Reward flow */}
        <section className="mt-8 rounded-2xl border border-[#1e1e22] bg-[#0e0e10]/80 p-5">
          <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-zinc-200">
            How the reward flows
          </h2>
          <ol className="mt-4 space-y-3">
            <FlowStep
              n={1}
              title="A swap pays a fee"
              body="Every trade on a graduated pool charges the pool fee, same as before."
            />
            <FlowStep
              n={2}
              title="The Horn skims a slice"
              body="The attached Horn diverts a creator-chosen percentage of that fee out of the pool instead of letting it all compound into reserves."
            />
            <FlowStep
              n={3}
              title="The Vault splits it two ways"
              body="The skim is split between an ANSEM staker sink and a CHANSE staker sink by a ratio the creator sets at launch. Both tokens are stakeable; CHANSE stays the gas token."
            />
            <FlowStep
              n={4}
              title="Stakers claim, per block"
              body="Rewards accrue to stakers of each sink continuously and are claimed independently in both denoms."
              last
            />
          </ol>
        </section>

        {/* The Horns */}
        <section className="mt-8">
          <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-zinc-200">
            The Horns
          </h2>
          <p className="mt-1.5 text-[13px] text-zinc-500">
            Each Horn is a small contract attached at graduation. They compose —
            a pool can run several at once behind the Composite router.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <HornCard
              icon={<Lightning size={17} weight="fill" />}
              name="Dynamic Fee"
              body="Charges a lower swap fee to traders who stake ANSEM in the Vault, and the standard fee to everyone else — a live discount for holders."
            />
            <HornCard
              icon={<ChartLineUp size={17} weight="fill" />}
              name="Custom Curve"
              body="Replaces constant-product pricing with a StableSwap curve for near-1:1 trading on pegged pairs, with a fee baked in for LPs."
            />
            <HornCard
              icon={<Wall size={17} weight="fill" />}
              name="Floor / Buyback"
              body="Banks its skim into an unwithdrawable treasury, then lets anyone fire a market buy that locks the bought tokens forever — a standing bid wall under the coin."
            />
            <HornCard
              icon={<Timer size={17} weight="fill" />}
              name="TWAMM"
              body="Rests a large order and executes it in time-proportional slices against the AMM, so a whale-sized buy fills over hours instead of moving the price in one shot."
            />
            <HornCard
              icon={<StackPlus size={17} weight="fill" />}
              name="Composite"
              body="Runs several Horns on one pool: it combines each hook's decision, sums pricing deltas, and rejects conflicts — the router that makes Horns stack."
            />
            <HornCard
              icon={<Horse size={17} weight="fill" />}
              name="Fee-Share"
              body="The reward keystone: receives the skim and deposits it into the ANSEM and CHANSE Vault sinks by the pool's split. Permissionless deposits keep it extensible."
            />
          </div>
        </section>

        {/* Build on it */}
        <section className="mt-8 rounded-2xl border border-[#1e1e22] bg-[#0e0e10]/80 p-5">
          <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-zinc-200">
            Build on Horns
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-zinc-400">
            A Horn is any contract that answers the AMM&apos;s hook interface —
            <span className="mono text-zinc-300"> before_swap</span> to price or
            gate a trade, <span className="mono text-zinc-300">after_swap</span> to
            act on it. The Vault takes deposits permissionlessly, so a new Horn can
            route value to stakers without changing anything else. Attach it at
            graduation; the pool does the rest.
          </p>
          <Link
            href="/create"
            className="mt-4 inline-flex items-center gap-1.5 rounded-[4px] border border-[#26262b] bg-[#101012] px-3.5 py-2 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-200 transition-colors hover:border-[#3a3a42] hover:text-white"
          >
            Launch a coin <ArrowRight size={13} weight="bold" />
          </Link>
        </section>

        <p className="mt-6 text-center text-[11px] text-zinc-600">
          Horns run on the ansemchain graduation AMM. Live staking and per-pool
          figures activate as the program is wired to the indexer.
        </p>
      </div>
    </div>
  );
}

function FlowStep({
  n,
  title,
  body,
  last = false,
}: {
  n: number;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#2f7d3f] bg-[#6cf07f]/10 font-mono text-[11px] font-semibold text-[#6cf07f]">
          {n}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-[#26262b]" />}
      </div>
      <div className="pb-1">
        <p className="text-[13px] font-semibold text-zinc-100">{title}</p>
        <p className="mt-0.5 text-[12px] leading-[17px] text-zinc-400">{body}</p>
      </div>
    </li>
  );
}

function HornCard({
  icon,
  name,
  body,
}: {
  icon: React.ReactNode;
  name: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-[#1e1e22] bg-[#0e0e10]/80 p-4">
      <div className="flex items-center gap-2 text-[#6cf07f]">
        {icon}
        <h3 className="font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-zinc-100">
          {name}
        </h3>
      </div>
      <p className="mt-2 text-[12px] leading-[17px] text-zinc-400">{body}</p>
    </div>
  );
}
