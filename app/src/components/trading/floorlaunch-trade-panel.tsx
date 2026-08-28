"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TokenListItem } from "@/lib/api";
import {
  buy,
  sell,
  simulateBuy,
  simulateSell,
  ammBuy,
  ammSell,
  ammSimulateBuy,
  ammSimulateSell,
} from "@/lib/ansem/launchpad-tx";
import { denomLabel, explorerUrl } from "@/lib/floorlaunch/config";
import { useFloorWallet } from "@/components/wallet/solana-wallet-provider";
import { ConnectButton } from "@/components/wallet/connect-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOKEN_DETAIL_QUERY_KEY } from "@/hooks/use-token-detail";
import { TOKEN_TRADES_QUERY_KEY, TOKEN_HOLDERS_QUERY_KEY, fetchTokenBalance } from "@/lib/api";

const SLIPPAGE = 0.02;
const UTOKEN = 1_000_000;

export function FloorlaunchTradePanel({ token }: { token: TokenListItem }) {
  const wallet = useFloorWallet();
  const queryClient = useQueryClient();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [quoteOut, setQuoteOut] = useState<number | null>(null);
  // The connected wallet's balance of THIS token, so the Sell tab can show how
  // much the user holds (and a Max shortcut). Refetched after each trade (busy).
  const [holdings, setHoldings] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!wallet.address) {
      setHoldings(null);
      return;
    }
    fetchTokenBalance(token.address, wallet.address).then((b) => {
      if (!cancelled) setHoldings(b);
    });
    return () => {
      cancelled = true;
    };
  }, [wallet.address, token.address, busy]);

  const baseDenom = token.base_denom || "uchanse";
  const baseLabel = denomLabel(baseDenom);
  const numeric = Number(amount) || 0;
  // Graduated tokens trade on the AMM, not the curve; route quotes + trades there.
  const graduated = Boolean(token.graduated);

  // Live quote via the on-chain simulate queries (curve or AMM).
  useEffect(() => {
    let cancelled = false;
    if (numeric <= 0) {
      setQuoteOut(null);
      return;
    }
    const inUtoken = String(Math.round(numeric * UTOKEN));
    const p =
      side === "buy"
        ? (graduated ? ammSimulateBuy : simulateBuy)(token.address, inUtoken)
        : (graduated ? ammSimulateSell : simulateSell)(token.address, inUtoken);
    p.then((out) => {
      if (!cancelled) setQuoteOut(Number(out) / UTOKEN);
    }).catch(() => {
      if (!cancelled) setQuoteOut(null);
    });
    return () => {
      cancelled = true;
    };
  }, [side, numeric, token.address, graduated]);

  const outLabel = side === "buy" ? token.symbol ?? "tokens" : baseLabel;
  const payLabel = side === "buy" ? baseLabel : token.symbol ?? "tokens";

  const minOut = useMemo(
    () => (quoteOut != null ? Math.floor(quoteOut * (1 - SLIPPAGE) * UTOKEN) : 0),
    [quoteOut],
  );

  async function submit() {
    if (!wallet.address) return;
    setBusy(true);
    toast.loading(`Confirm the ${side} in your wallet…`, { id: "trade" });
    try {
      const client = await wallet.getSigningClient();
      const inUtoken = String(Math.round(numeric * UTOKEN));
      const hash =
        side === "buy"
          ? await (graduated ? ammBuy : buy)(client, wallet.address, token.address, baseDenom, inUtoken, String(minOut))
          : await (graduated ? ammSell : sell)(client, wallet.address, token.address, inUtoken, String(minOut));
      toast.success(`${side === "buy" ? "Bought" : "Sold"} ${token.symbol ?? "token"}`, {
        id: "trade",
        // Clickable tx hash -> the ansemchain explorer.
        description: (
          <a
            href={explorerUrl("tx", hash)}
            target="_blank"
            rel="noreferrer"
            className="font-mono underline decoration-dotted underline-offset-2 hover:text-[#6cef4b]"
          >
            {hash.slice(0, 10)}… ↗
          </a>
        ),
      });
      setAmount("");
      const refresh = () => {
        // Chain-backed reads (holders, wallet balance) update immediately;
        // indexer-derived reads (detail, trades, candles) lag a few seconds, so
        // we refetch now AND again after the indexer catches up.
        void queryClient.invalidateQueries({ queryKey: TOKEN_HOLDERS_QUERY_KEY(token.address) });
        void queryClient.invalidateQueries({ queryKey: TOKEN_DETAIL_QUERY_KEY(token.address) });
        void queryClient.invalidateQueries({ queryKey: TOKEN_TRADES_QUERY_KEY(token.address) });
        void queryClient.invalidateQueries({ queryKey: ["candles", token.address] });
        void queryClient.invalidateQueries({ queryKey: ["tokens"] });
        void wallet.refreshBalance();
      };
      refresh();
      window.setTimeout(refresh, 3000);
      window.setTimeout(refresh, 8000);
    } catch (e) {
      toast.error("Trade failed", {
        id: "trade",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#1e1e22] bg-[#0e0e10]/80 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-zinc-100">Trade</h3>
        <span className="rounded-[4px] border border-[#1e1e22] px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-500">
          {baseLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-[6px] bg-[#131316] p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={`rounded-[4px] px-4 py-2 font-display text-[12px] font-bold uppercase tracking-[0.1em] transition ${
              side === s
                ? s === "buy"
                  ? "bg-[#6cf07f] text-[#0a0a0b]"
                  : "bg-[#ff5b5b] text-[#0a0a0b]"
                : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-[12px] text-zinc-500">
            {side === "buy" ? `Spend (${payLabel})` : `Sell (${payLabel})`}
          </label>
          {side === "sell" && holdings != null && (
            <button
              type="button"
              onClick={() => setAmount(String(holdings))}
              className="text-[12px] font-medium text-zinc-400 transition hover:text-zinc-100"
              title="Use full balance"
            >
              Holding {holdings.toLocaleString(undefined, { maximumFractionDigits: 6 })} {token.symbol ?? "tokens"}
              <span className="ml-1.5 text-[#16a34a]">Max</span>
            </button>
          )}
        </div>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
        />
        <p className="mt-1.5 text-[12px] text-zinc-500">
          {quoteOut != null && numeric > 0
            ? `≈ ${quoteOut.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${outLabel}`
            : `Enter an amount to quote`}
        </p>
      </div>

      {!wallet.connected ? (
        <ConnectButton />
      ) : (
        <Button
          onClick={submit}
          disabled={busy || numeric <= 0}
          className={
            "h-11 rounded-[4px] font-display text-[12px] font-bold uppercase tracking-[0.1em] " +
            (side === "buy"
              ? "bg-[#6cf07f] text-[#0a0a0b] hover:bg-[#5ee070]"
              : "bg-[#ff5b5b] text-[#0a0a0b] hover:bg-[#f04a4a]")
          }
        >
          {busy ? "Submitting…" : side === "buy" ? `Buy ${token.symbol ?? ""}` : `Sell ${token.symbol ?? ""}`}
        </Button>
      )}

      <p className="text-[11px] text-zinc-600">
        Trades settle on the ANSEM bonding curve. Slippage tolerance {SLIPPAGE * 100}%.
      </p>
    </div>
  );
}
