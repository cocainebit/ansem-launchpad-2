"use client";

import { useCallback, useState } from "react";
import { Check, CopySimple, SignOut, Wallet } from "@phosphor-icons/react";
import { useFloorWallet } from "@/components/wallet/solana-wallet-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 5)}...${address.slice(-4)}`;
}

function formatSol(balance: number): string {
  if (balance > 0 && balance < 0.0001) return "<0.0001";
  return balance.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function AccountDisplay({
  className,
  compact = false,
  balanceOnly = false,
}: {
  className?: string;
  compact?: boolean;
  balanceOnly?: boolean;
} = {}) {
  const { address, balance, ansemBalance, walletName, disconnect } = useFloorWallet();
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = useCallback(async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    }
  }, [address]);

  if (!address) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label={`Wallet ${truncateAddress(address)}`}
          className={cn(
            "min-w-0 max-w-full overflow-hidden border-[#29292d] bg-[#202024] text-zinc-100 hover:border-[#3f3f46] hover:bg-[#29292d] hover:text-white",
            compact ? "size-10 px-0" : "w-full px-3 font-mono text-sm",
            className,
          )}
        >
          {compact ? (
            <Wallet size={17} weight="fill" />
          ) : balanceOnly ? (
            <>
              <Wallet size={17} weight="fill" className="shrink-0 text-zinc-400" />
              <span className="flex min-w-0 flex-col items-start font-sans text-[12px] font-semibold leading-tight">
                <span className="truncate">{balance === null ? "—" : formatSol(balance)} CHANSE</span>
                <span className="truncate text-zinc-400">{ansemBalance ? formatSol(ansemBalance) : "0"} ANSEM</span>
              </span>
            </>
          ) : (
            <>
              <span className="min-w-0 truncate">{truncateAddress(address)}</span>
              {balance !== null && (
                <>
                  <span className="shrink-0 text-zinc-600">|</span>
                  <span className="shrink-0">
                    {formatSol(balance)} CHANSE
                    {ansemBalance ? ` · ${formatSol(ansemBalance)} ANSEM` : ""}
                  </span>
                </>
              )}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-60 rounded-xl border-[#34343a] bg-[#17171a] p-2 text-zinc-100 shadow-2xl shadow-black/50"
      >
        <div className="px-2 pb-2 pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            Connected wallet
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#242428] text-zinc-400">
              <Wallet size={16} weight="fill" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-mono text-xs font-semibold text-zinc-200">
                {truncateAddress(address)}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-600">via {walletName}</p>
            </div>
          </div>
        </div>
        <div className="mb-1 flex items-center justify-between rounded-lg bg-[#202024] px-3 py-2.5 text-xs">
          <span className="text-zinc-500">SOL balance</span>
          <span className="font-semibold text-zinc-100">
            {balance === null ? "—" : `${formatSol(balance)} SOL`}
          </span>
        </div>
        <DropdownMenuItem
          onClick={handleCopyAddress}
          className="h-10 cursor-pointer gap-2 rounded-lg px-3 text-xs text-zinc-300 focus:bg-[#242428] focus:text-white"
        >
          {copied ? <Check size={15} className="text-emerald-400" /> : <CopySimple size={15} />}
          {copied ? "Address copied" : "Copy address"}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => disconnect()}
          className="h-10 cursor-pointer gap-2 rounded-lg px-3 text-xs text-red-400 focus:bg-red-950/60 focus:text-red-300"
        >
          <SignOut size={15} />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
