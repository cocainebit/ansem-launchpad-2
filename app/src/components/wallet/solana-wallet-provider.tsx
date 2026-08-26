"use client";

// ANSEM-chain wallet provider. Replaces the Solana/Privy bridge with the ANSEM
// browser extension (window.bwickWallet.cosmos, Keplr fallback) on ansem-1.
// Keeps the `SolanaWalletProvider` + `useFloorWallet` names so existing imports
// resolve unchanged; the returned shape now exposes `getSigningClient()` for
// CosmWasm execute instead of a Solana AnchorProvider.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { GasPrice } from "@cosmjs/stargate";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import {
  CHAIN_ID,
  RPC_URL,
  REST_URL,
  DENOM,
  BASE_DENOMS,
  INDEXER_HTTP,
} from "@/lib/floorlaunch/config";

type WalletKind = "bwick" | "keplr";

interface KeplrLike {
  experimentalSuggestChain: (info: unknown) => Promise<void>;
  enable: (chainId: string) => Promise<void>;
  disable?: (chainId: string) => Promise<void>;
  getOfflineSigner: (chainId: string) => OfflineSigner;
  getKey: (chainId: string) => Promise<{ name: string; bech32Address: string }>;
}

function providerFor(kind: WalletKind): KeplrLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    bwickWallet?: { cosmos?: KeplrLike };
    keplr?: KeplrLike;
  };
  if (kind === "bwick") return w.bwickWallet?.cosmos ?? null;
  return w.keplr ?? null;
}

const CHAIN_INFO = {
  chainId: CHAIN_ID,
  chainName: "ANSEM Chain",
  rpc: RPC_URL,
  rest: REST_URL,
  bip44: { coinType: 118 },
  bech32Config: {
    bech32PrefixAccAddr: "ansem",
    bech32PrefixAccPub: "ansempub",
    bech32PrefixValAddr: "ansemvaloper",
    bech32PrefixValPub: "ansemvaloperpub",
    bech32PrefixConsAddr: "ansemvalcons",
    bech32PrefixConsPub: "ansemvalconspub",
  },
  currencies: [{ coinDenom: "CHANSE", coinMinimalDenom: DENOM, coinDecimals: 6 }],
  feeCurrencies: [
    {
      coinDenom: "CHANSE",
      coinMinimalDenom: DENOM,
      coinDecimals: 6,
      gasPriceStep: { low: 0.01, average: 0.025, high: 0.04 },
    },
  ],
  stakeCurrency: { coinDenom: "CHANSE", coinMinimalDenom: DENOM, coinDecimals: 6 },
  features: ["cosmwasm"],
};

interface AnsemWallet {
  connected: boolean;
  connecting: boolean;
  address: string | null;
  /** Kept for shape-compat; always null on the Cosmos chain. */
  publicKey: null;
  balance: number | null; // CHANSE (whole units)
  ansemBalance: number | null; // ANSEM (whole units)
  walletName: string;
  connect: (kind?: WalletKind) => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  /** A CosmWasm signing client bound to the connected signer. */
  getSigningClient: () => Promise<SigningCosmWasmClient>;
}

const Ctx = createContext<AnsemWallet | null>(null);
const STORAGE_KEY = "ansem-wallet-kind";

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string>("");
  const [signer, setSigner] = useState<OfflineSigner | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [ansemBalance, setAnsemBalance] = useState<number | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    try {
      // Read all bank balances straight from the chain so we show both native
      // denoms the wallet holds: CHANSE (uchanse) and ANSEM (uansem).
      const res = await fetch(
        `${REST_URL}/cosmos/bank/v1beta1/balances/${address}`,
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        balances?: Array<{ denom: string; amount: string }>;
      };
      const amt = (denom: string) =>
        Number(json.balances?.find((b) => b.denom === denom)?.amount ?? "0") / 1e6;
      setBalance(amt(BASE_DENOMS.chanse));
      setAnsemBalance(amt(BASE_DENOMS.ansem));
    } catch {
      /* leave prior balances */
    }
  }, [address]);

  const connect = useCallback(
    async (kind: WalletKind = "bwick") => {
      setConnecting(true);
      try {
        let provider = providerFor(kind);
        if (!provider) provider = providerFor(kind === "bwick" ? "keplr" : "bwick");
        if (!provider) throw new Error("No ANSEM wallet or Keplr detected.");
        try {
          await provider.experimentalSuggestChain(CHAIN_INFO);
        } catch {
          /* some builds throw if already added */
        }
        await provider.enable(CHAIN_ID);
        const s = provider.getOfflineSigner(CHAIN_ID);
        const key = await provider.getKey(CHAIN_ID);
        setSigner(s);
        setAddress(key.bech32Address);
        setWalletName(key.name || "ANSEM Wallet");
        try {
          window.localStorage.setItem(STORAGE_KEY, kind);
        } catch {
          /* quota */
        }
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const disconnect = useCallback(() => {
    setAddress(null);
    setSigner(null);
    setWalletName("");
    setBalance(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const getSigningClient = useCallback(async () => {
    if (!signer) throw new Error("Connect a wallet first.");
    return SigningCosmWasmClient.connectWithSigner(RPC_URL, signer, {
      gasPrice: GasPrice.fromString(`0.025${DENOM}`),
    });
  }, [signer]);

  // Auto-reconnect on mount if a prior kind is remembered.
  useEffect(() => {
    let kind: WalletKind | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "bwick" || raw === "keplr") kind = raw;
    } catch {
      /* ignore */
    }
    if (kind && providerFor(kind)) void connect(kind);
  }, [connect]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  // Re-connect on extension account switch.
  useEffect(() => {
    const handler = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === "bwick" || raw === "keplr") void connect(raw);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("keplr_keystorechange", handler);
    return () => window.removeEventListener("keplr_keystorechange", handler);
  }, [connect]);

  const value = useMemo<AnsemWallet>(
    () => ({
      connected: Boolean(address),
      connecting,
      address,
      publicKey: null,
      balance,
      ansemBalance,
      walletName,
      connect,
      disconnect,
      refreshBalance,
      getSigningClient,
    }),
    [address, connecting, balance, ansemBalance, walletName, connect, disconnect, refreshBalance, getSigningClient],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFloorWallet(): AnsemWallet {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFloorWallet must be used within SolanaWalletProvider");
  return ctx;
}
