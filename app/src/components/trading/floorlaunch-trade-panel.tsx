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
import { denomLabel } from "@/lib/floorlaunch/config";
import { useFloorWallet } from "@/components/wallet/solana-wallet-provider";
import { ConnectButton } from "@/components/wallet/connect-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOKEN_DETAIL_QUERY_KEY } from "@/hooks/use-token-detail";
import { TOKEN_TRADES_QUERY_KEY, TOKEN_HOLDERS_QUERY_KEY } from "@/lib/api";

const SLIPPAGE = 0.02;
const UTOKEN = 1_000_000;

export function FloorlaunchTradePanel({ token }: { token: TokenListItem }) {
  const wallet = useFloorWallet();
  const queryClient = useQueryClient();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [quoteOut, setQuoteOut] = useState<number | null>(null);

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
        description: `${hash.slice(0, 10)}…`,
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
    <div className="flex flex-col gap-4 rounded-2xl border border-[#29292d] bg-[#111113] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-zinc-100">Trade</h3>
        <span className="rounded-full border border-[#29292d] px-2 py-0.5 text-[11px] font-semibold text-zinc-400">
          {baseLabel}-denominated
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={`rounded-xl px-4 py-2.5 text-[14px] font-semibold capitalize transition ${
              side === s
                ? s === "buy"
                  ? "bg-[#16a34a] text-white"
                  : "bg-[#dc2626] text-white"
                : "border border-[#29292d] bg-[#161618] text-zinc-300 hover:text-white"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div>
        <label className="mb-1.5 block text-[12px] text-zinc-500">
          {side === "buy" ? `Spend (${payLabel})` : `Sell (${payLabel})`}
        </label>
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
          className={side === "buy" ? "bg-[#16a34a] hover:bg-[#15803d]" : "bg-[#dc2626] hover:bg-[#b91c1c]"}
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
