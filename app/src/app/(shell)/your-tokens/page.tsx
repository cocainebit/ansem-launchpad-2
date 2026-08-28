"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Coins } from "@phosphor-icons/react";
import { useFloorWallet } from "@/components/wallet/solana-wallet-provider";
import {
  AssetImage,
  ConnectState,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/wallet/wallet-assets-ui";
import { fetchWalletTokens } from "@/lib/api";

export default function YourTokensPage() {
  const wallet = useFloorWallet();
  const holdings = useQuery({
    queryKey: ["wallet", "commas-tokens", wallet.address],
    queryFn: () => fetchWalletTokens(wallet.address!),
    enabled: Boolean(wallet.connected && wallet.address),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!wallet.connected || !wallet.address) {
    return <ConnectState title="Your Tokens" description="Connect your Solana wallet to see the ANSEM tokens you own." />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-zinc-100">
      <PageHeader
        title="Your Tokens"
        description="ANSEM market tokens held by your connected wallet."
        count={holdings.data?.length}
      />

      {holdings.isLoading && <LoadingState label="Loading token balances…" />}
      {holdings.error && <ErrorState message="Token balances could not be loaded from Solana. Try again shortly." />}
      {!holdings.isLoading && !holdings.error && holdings.data?.length === 0 && (
        <EmptyState icon={<Coins size={25} />} title="No ANSEM tokens found" description="Tokens purchased through an ANSEM market will appear here." />
      )}

      {holdings.data && holdings.data.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {holdings.data.map((token) => (
            <Link key={token.mint} href={`/token/${token.market}`} className="group rounded-[16px] border border-[#1e1e22] bg-[#131316] p-4 transition-colors hover:border-[#57575e]">
              <div className="flex items-center gap-3">
                <AssetImage image={token.image} name={token.name} fallback={token.symbol.slice(0, 1)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{token.name}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">{token.symbol}</p>
                </div>
                <ArrowUpRight size={16} className="text-zinc-600 transition-colors group-hover:text-[#6cef4b]" />
              </div>
              <div className="mt-5 border-t border-[#1e1e22] pt-4">
                <p className="text-xs text-zinc-500">Balance</p>
                <p className="mt-1 text-lg font-medium">{formatBalance(token.balance)} {token.symbol}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBalance(value: number): string { return Intl.NumberFormat("en-US", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 4 }).format(value); }
