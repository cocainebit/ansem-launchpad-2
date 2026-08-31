"use client";

/**
 * Reserved-username claim surface. An admin reserves a handle (with an optional
 * preset profile + a verified badge) and hands the intended recipient a one-time
 * token. Here the recipient connects their wallet, submits the token, signs a
 * message binding that exact token, and the reserved handle + preset bind to
 * THEIR wallet. The token is single-use and consumed on claim; afterwards it's a
 * normal profile they own.
 *
 * An admin can also deep-link the recipient straight here with the token
 * prefilled: /claim?token=<raw token>.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SealCheck, Ticket, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useFloorWallet } from "@/components/wallet/solana-wallet-provider";
import { useClaimUsername, type Profile } from "@/lib/social";
import { resolveIdentity, errMsg } from "@/components/social/shared";

export function ClaimUsername() {
  const wallet = useFloorWallet();
  const router = useRouter();
  const params = useSearchParams();
  const claim = useClaimUsername();

  const [token, setToken] = useState("");
  const [claimed, setClaimed] = useState<Profile | null>(null);

  // Prefill the token from a deep link (/claim?token=...), once.
  useEffect(() => {
    const t = params.get("token");
    if (t) setToken(t.trim());
  }, [params]);

  async function handleClaim() {
    if (!wallet.address) {
      try {
        await wallet.connect();
      } catch {
        /* the connect UI surfaces its own errors */
      }
      return;
    }
    const raw = token.trim();
    if (!raw) {
      toast.error("Paste your claim token first");
      return;
    }
    try {
      const profile = await claim.mutateAsync({ address: wallet.address, token: raw, signer: wallet });
      setClaimed(profile);
      const identity = resolveIdentity(profile, wallet.address);
      toast.success(`Claimed ${identity.handle ?? identity.name}`);
    } catch (e) {
      toast.error("Could not claim", { description: errMsg(e) });
    }
  }

  // ── success ────────────────────────────────────────────────────────────────
  if (claimed && wallet.address) {
    const identity = resolveIdentity(claimed, wallet.address);
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border border-[var(--hairline)] bg-[#1c1c1e] p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#6cf07f]/10">
            <CheckCircle size={34} weight="fill" className="text-[#6cf07f]" />
          </div>
          <h1 className="mt-4 font-display text-[20px] font-semibold tracking-tight text-white">
            Handle claimed
          </h1>
          <div className="mt-1.5 inline-flex items-center gap-1.5">
            <span className="font-display text-[16px] font-semibold text-zinc-100">{identity.name}</span>
            {claimed.verified && (
              <SealCheck size={17} weight="fill" className="text-[#6cf07f]" aria-label="Verified" />
            )}
          </div>
          <p className="mt-3 text-[13px] leading-6 text-zinc-500">
            {identity.handle ? `${identity.handle} is` : "It is"} now bound to your wallet. This
            token has been used and can&apos;t be claimed again.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/creator/${encodeURIComponent(wallet.address!)}`)}
            className="mt-6 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#6cf07f] text-[14px] font-semibold text-black transition-opacity hover:opacity-90"
          >
            View your profile <ArrowRight size={15} weight="bold" />
          </button>
        </div>
      </div>
    );
  }

  // ── claim form ───────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--hairline)] bg-[#202022]">
          <Ticket size={24} weight="duotone" className="text-[#6cf07f]" />
        </div>
        <h1 className="mt-3 font-display text-[22px] font-semibold tracking-tight text-white">
          Claim a reserved handle
        </h1>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-6 text-zinc-500">
          Got a claim token? Connect your wallet and paste it below. The reserved
          username and its profile will bind to your wallet. Tokens are one-time.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--hairline)] bg-[#1c1c1e] p-5">
        <label htmlFor="claim-token" className="block text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Claim token
        </label>
        <input
          id="claim-token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleClaim();
          }}
          placeholder="Paste the token you were sent"
          spellCheck={false}
          autoComplete="off"
          className="mt-2 w-full rounded-lg border border-[var(--hairline)] bg-[#161616] px-3.5 py-2.5 font-mono text-[13px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-[#6cf07f]/50"
        />

        {wallet.address ? (
          <p className="mt-2.5 truncate text-[12px] text-zinc-500">
            Claiming as <span className="font-mono text-zinc-400">{wallet.address}</span>
          </p>
        ) : (
          <p className="mt-2.5 text-[12px] text-zinc-500">
            Connect your wallet to claim. Your wallet signs the token, so only you
            can bind it.
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleClaim()}
          disabled={claim.isPending}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#6cf07f] text-[14px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {claim.isPending
            ? "Claiming…"
            : wallet.address
              ? (
                <>
                  Claim handle <ArrowRight size={15} weight="bold" />
                </>
              )
              : "Connect wallet"}
        </button>
      </div>
    </div>
  );
}
