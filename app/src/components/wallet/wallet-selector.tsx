"use client";

import { useEffect, useState, type ReactNode } from "react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface WalletSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
}

export function WalletSelector({
  open,
  onOpenChange,
  trigger,
}: WalletSelectorProps) {
  const { wallets, select, connect, connecting, wallet } = useWallet();
  const [pending, setPending] = useState<WalletName | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending || wallet?.adapter.name !== pending) return;
    connect()
      .then(() => {
        setPending(null);
        onOpenChange(false);
      })
      .catch((cause) =>
        {
          setPending(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Wallet connection failed",
          );
        },
      );
  }, [pending, wallet, connect, onOpenChange]);

  function choose(
    name: WalletName,
    readyState: WalletReadyState,
    url: string,
  ) {
    setError(null);
    if (
      readyState === WalletReadyState.NotDetected ||
      readyState === WalletReadyState.Unsupported
    ) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setPending(name);
    select(name);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="z-[100] w-[22rem] rounded-2xl border-[#2a2a30] bg-[#131316] p-4 text-zinc-100 shadow-2xl"
      >
        <h3 className="text-base font-semibold">Connect a Solana wallet</h3>
        <p className="mb-4 mt-1 text-sm text-zinc-400">
          Select the wallet used to trade and launch markets.
        </p>
        <div className="space-y-2">
          {wallets.map(({ adapter, readyState }) => {
            const available =
              readyState === WalletReadyState.Installed ||
              readyState === WalletReadyState.Loadable;
            return (
              <Button
                key={adapter.name}
                variant="outline"
                className="h-14 w-full justify-between border-[#2a2a30] bg-[#1d1d20] text-zinc-100 hover:bg-[#242428]"
                disabled={connecting || pending !== null}
                onClick={() =>
                  choose(adapter.name, readyState, adapter.url)
                }
              >
                <span className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={adapter.icon} alt="" className="h-6 w-6" />
                  {adapter.name}
                </span>
                <span className="text-xs text-zinc-400">
                  {pending === adapter.name
                    ? "Connecting…"
                    : available
                      ? "Detected"
                      : "Install"}
                </span>
              </Button>
            );
          })}
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
