"use client";

import { useState } from "react";
import Link from "next/link";
import { Lightning } from "@phosphor-icons/react";
import type { TokenListItem } from "@/lib/api";

/**
 * Horns surfaces for the token terminal, shaped to the real CosmWasm contracts.
 *
 * IMPORTANT: the Horns program + Horn Vault are deployed on localnet but are NOT
 * yet wired to the live indexer, so these panels must NOT show live-looking
 * numbers (APR, TVL, pending rewards, per-pool skim). They render as a clearly
 * marked PREVIEW that explains the mechanic; every figure stays "-" until real
 * addresses + a read path are handed over. Flip HORNS_LIVE (and fill the
 * addresses) to switch them to live reads; the query/exec shapes below mirror
 * the contracts 1:1:
 *
 *   Launchpad query  HornConfig{}                 -> { feeshare, skim_bps, ansem_bps }
 *   Fee-Share query  PoolSplit{ token_address }   -> { ansem_bps, chanse_bps }  // sum 10000
 *   Horn Vault query Sink{ denom }                -> { total_staked, reward_denoms }
 *   Horn Vault query Stake{ denom, staker }       -> { staked }
 *   Horn Vault query Pending{ denom, staker }     -> { rewards: Coin[] }
 *   Horn Vault exec  Stake{}  (attach native coin of denom)
 *   Horn Vault exec  Unstake{ denom, amount }
 *   Horn Vault exec  Claim{ denom }
 */
const HORN_VAULT_ADDRESS = ""; // TODO: deployed Horn Vault contract
const FEE_SHARE_ADDRESS = ""; // TODO: deployed Fee-Share Horn contract
const HORNS_LIVE = Boolean(HORN_VAULT_ADDRESS && FEE_SHARE_ADDRESS);

type Coin = { denom: string; amount: string }; // micro-units, cosmos Coin shape

const DENOM_LABEL: Record<string, string> = {
  uansem: "ANSEM",
  uchanse: "CHANSE",
};

function denomLabel(denom: string): string {
  return DENOM_LABEL[denom] ?? denom.replace(/^u/, "").toUpperCase();
}

const DASH = "-";

/* ---------------- What Horns are (explainer + fee mechanic) ---------------- */

export function HornsFeeSplitPanel({ token: _token }: { token: TokenListItem }) {
  // Per-pool horn attachment is not live yet, so pool params render honestly.
  const attached = false;
  return (
    <section className="flex flex-col rounded-xl bg-[#17171a] p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[15px] font-semibold text-zinc-100">Horns</h3>
        <span className="rounded-[4px] border border-[#26262b] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
          {HORNS_LIVE ? "live" : "preview"}
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-[17px] text-zinc-400">
        Horns are v4-style hooks on the graduation AMM. When a Horn is attached,
        a slice of <span className="text-zinc-200">every swap fee</span> is skimmed
        off and routed to the <span className="text-zinc-200">Horn Vault</span>,
        split between the ANSEM and CHANSE staker sinks by a ratio the creator sets
        at launch. Stakers of either token earn a real cut of the pool&apos;s trading.
      </p>

      {/* Illustrative flow, clearly not per-pool live data. */}
      <div className="mt-3 rounded-lg border border-[#1a1a1e] bg-[#0a0a0b] p-3">
        <FlowRow tone="#6cf07f" label="Swap fee" value="pool rate" sub="charged on every trade" />
        <div className="my-1.5 ml-[3px] h-3 w-px bg-[#26262b]" />
        <FlowRow tone="#6cf07f" label="Skim to Horns" value="creator-set" sub="a % of the fee" />
        <FlowRow tone="#8ab4ff" label="→ ANSEM + CHANSE sinks" value="split" sub="to Vault stakers" />
      </div>

      {/* This pool: the real per-pool params, "-" / None until wired. */}
      <div className="mt-3">
        <p className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-zinc-600">This pool</p>
        <div className="space-y-1.5 rounded-lg border border-[#1a1a1e] bg-[#0a0a0b] p-3">
          <PoolRow label="Attached Horn" value={attached ? DASH : "None"} />
          <PoolRow label="Skim to Vault" value={DASH} />
          <PoolRow label="ANSEM / CHANSE split" value={DASH} />
        </div>
      </div>

      {/* What creators + holders get out of it. */}
      <p className="mt-3 text-[12px] leading-[17px] text-zinc-400">
        A creator can bolt on Horns like <span className="text-zinc-200">Fee Decay</span>,{" "}
        <span className="text-zinc-200">Dynamic Fee</span> or <span className="text-zinc-200">Oracle Arb</span>{" "}
        at graduation to reshape how the pool prices and pays. Stakers earn the skim from every graduated
        pool through the Vault.
      </p>

      {/* Genuinely useful links, and they fill the panel. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href="/horns"
          className="flex items-center justify-center rounded-lg border border-[#26262b] bg-[#101012] px-3 py-2 font-display text-[12px] font-semibold text-zinc-200 transition-colors hover:border-[#3a3a42] hover:text-white"
        >
          Explore Horns →
        </Link>
        <Link
          href="/vault"
          className="flex items-center justify-center rounded-lg border border-[#26262b] bg-[#101012] px-3 py-2 font-display text-[12px] font-semibold text-zinc-200 transition-colors hover:border-[#3a3a42] hover:text-white"
        >
          Horn Vault →
        </Link>
      </div>

      <p className="mt-3 text-[10px] leading-4 text-zinc-600">
        {HORNS_LIVE
          ? "Live skim + split for this pool shown above."
          : "Preview: this pool's live skim and split appear once the Horns program is wired to the indexer."}
      </p>
    </section>
  );
}

function PoolRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-zinc-500">{label}</span>
      <span className="mono text-[12px] font-semibold text-zinc-300">{value}</span>
    </div>
  );
}

function FlowRow({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-[12px] text-zinc-300">
        <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="mono text-[12px] font-semibold text-zinc-200">{value}</span>
        <span className="mono text-[10px] text-zinc-600">{sub}</span>
      </span>
    </div>
  );
}

/* ---------------- Stake / Claim (Horn Vault) ---------------- */

type StakeDenom = "uansem" | "uchanse";
type VaultAction = "stake" | "unstake";

export function HornVaultPanel({ token: _token }: { token: TokenListItem }) {
  const [denom, setDenom] = useState<StakeDenom>("uansem");
  const [action, setAction] = useState<VaultAction>("stake");
  const [amount, setAmount] = useState("");

  const label = denomLabel(denom);
  const live = HORNS_LIVE;
  // Until a live read path exists, every figure is a dash, never a fake number.
  const rewards: Coin[] = [];
  const hasRewards = rewards.length > 0;

  return (
    <section className="rounded-xl bg-[#17171a] p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-zinc-100">
          <Lightning size={15} weight="fill" className="text-[#6cf07f]" />
          Horn Vault
        </h3>
        <span className="rounded-[4px] border border-[#26262b] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
          {live ? "live" : "preview"}
        </span>
      </div>

      {/* Sink stats for the selected denom: dashes until wired. */}
      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-[#1a1a1e] bg-[#1a1a1e]">
        <VaultStat label="APR" value={DASH} accent />
        <VaultStat label="Sink TVL" value={DASH} />
        <VaultStat label="Your stake" value={DASH} />
      </div>

      {/* Denom tabs: two sinks, ANSEM (uansem) + CHANSE (uchanse) */}
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-[6px] bg-[#131316] p-1">
        {(["uansem", "uchanse"] as StakeDenom[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDenom(d)}
            className={`h-8 rounded-[4px] font-display text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
              denom === d ? "bg-[#1e1e22] text-white" : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            {denomLabel(d)}
          </button>
        ))}
      </div>

      {/* Stake / Unstake switch */}
      <div className="mt-3 flex items-center gap-3">
        {(["stake", "unstake"] as VaultAction[]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAction(a)}
            className={`pb-1 font-display text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              action === a
                ? "border-b-2 border-[#6cf07f] text-white"
                : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div className="mt-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.0"
          disabled={!live}
          className="h-10 w-full rounded-[6px] border border-[#1e1e22] bg-[#131316] px-3 font-mono text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#2a2a30] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <button
        type="button"
        disabled={!live}
        title={live ? undefined : "Horn Vault staking goes live with the Horns program"}
        className={`mt-3 h-11 w-full rounded-[4px] font-display text-[12px] uppercase tracking-[0.12em] ${
          action === "stake" ? "btn-white" : "border border-[#2a2a30] bg-transparent text-zinc-100 hover:border-[#3a3a42]"
        } ${live ? "" : "cursor-not-allowed opacity-60"}`}
      >
        {action === "stake" ? `Stake ${label}` : `Unstake ${label}`}
      </button>

      {/* Pending rewards (Coin[]) + Claim */}
      <div className="mt-3 rounded-lg border border-[#1e1e22] bg-[#0a0a0b] p-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            Pending rewards
          </p>
          <button
            type="button"
            disabled={!live || !hasRewards}
            title={live ? undefined : "Claim goes live with the Horn Vault"}
            className={`h-7 rounded-[4px] border px-3 font-display text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${
              live && hasRewards
                ? "border-[#2f7d3f] bg-[#6cf07f]/10 text-[#6cf07f] hover:bg-[#6cf07f]/15"
                : "cursor-not-allowed border-[#1e1e22] text-zinc-600"
            }`}
          >
            Claim {label}
          </button>
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="mono text-[11px] text-zinc-500">ANSEM</span>
            <span className="mono text-[13px] font-semibold text-zinc-500">{DASH}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="mono text-[11px] text-zinc-500">CHANSE</span>
            <span className="mono text-[13px] font-semibold text-zinc-500">{DASH}</span>
          </div>
        </div>
      </div>

      <p className="mt-2 text-[10px] leading-4 text-zinc-600">
        {live
          ? "Stake ANSEM or CHANSE into this coin's Horn Vault sink to earn its skimmed swap fees. Rewards accrue per block in both denoms and are claimed independently."
          : "Preview of the live Horn Vault. Staking, sink TVL and rewards activate once the Horns program is wired in; the interface is final."}
      </p>
    </section>
  );
}

function VaultStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#0e0e10]/80 px-2.5 py-2 text-center">
      <p className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</p>
      <p className={`mono mt-1 text-[13px] font-semibold ${accent ? "text-[#6cf07f]" : "text-zinc-100"}`}>
        {value}
      </p>
    </div>
  );
}

// Reserved for when live contract addresses are handed over.
export const HORNS_ADDRESSES = { HORN_VAULT_ADDRESS, FEE_SHARE_ADDRESS };
