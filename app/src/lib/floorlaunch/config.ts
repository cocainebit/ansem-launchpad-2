// Config for the ANSEM launchpad, repointed from the old Solana/floorlaunch
// backend to the ansem-1 CosmWasm stack (indexer + launchpad + AMM). The export
// names are kept so existing imports across the app keep resolving.

// ── ansem-1 chain ──────────────────────────────────────────────────────────
export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID ?? "ansem-1";
export const RPC_URL =
  process.env.NEXT_PUBLIC_ANSEM_RPC ?? "http://195.72.61.234:26657";
export const REST_URL =
  process.env.NEXT_PUBLIC_ANSEM_REST ?? "http://195.72.61.234:1317";
export const DENOM = process.env.NEXT_PUBLIC_ANSEM_DENOM ?? "uchanse";
export const DENOM_DECIMALS = 6;

// Native base denoms a launch can use.
export const BASE_DENOMS = {
  chanse: "uchanse",
  ansem: "uansem",
} as const;
export type BaseDenom = (typeof BASE_DENOMS)[keyof typeof BASE_DENOMS];
export function denomLabel(denom: string): string {
  return denom === "uansem" ? "ANSEM" : "CHANSE";
}

// ── mutable contract addresses ──────────────────────────────────────────────
// These are now resolved LIVE from the config registry at runtime (see
// live-config.ts: getLaunchpadContract / getAmmContract / getOracleContract).
// The consts below are ONLY the last-resort fallback used when the registry is
// unreachable. Launch model: the only two baked anchors are the config-registry
// ADDRESS (NEXT_PUBLIC_ANSEM_REGISTRY, in live-config.ts) and the REST endpoint
// (NEXT_PUBLIC_ANSEM_REST) - both genesis-stable. On a fresh genesis nothing
// here changes; the pinned registry auto-points to the new contracts.
export const LAUNCHPAD_CONTRACT =
  process.env.NEXT_PUBLIC_LAUNCHPAD_CONTRACT ??
  "ansem1gjg0m75mnav5xftgwjxded5v0shlsj3vk8uh4adk9k7a33034wmsp7xq4c";

// The AMM a token graduates to. Once a token's curve fills it can no longer be
// traded on the launchpad; buys/sells route to this AMM's Swap instead.
export const AMM_CONTRACT =
  process.env.NEXT_PUBLIC_ANSEM_AMM ??
  "ansem14wzrxt6u557ecr98w2z22ygnu77w34uqfel72k8t8xatneajy2xqkn4m6e";

// ── indexer (our ansemchain-indexer on val1) ───────────────────────────────
export const INDEXER_HTTP = (
  process.env.NEXT_PUBLIC_ANSEM_API_URL ?? "http://195.72.61.234:3001/api"
).replace(/\/+$/, "");
// SSE stream (not a WebSocket): the indexer serves /api/sse/feed.
export const INDEXER_SSE = `${INDEXER_HTTP}/sse/feed`;
// Kept for import compatibility; the app now uses SSE, not a WS.
export const INDEXER_WS = INDEXER_SSE;

// ── launch economics ───────────────────────────────────────────────────────
// The platform creation fee is charged on-chain (in the create_token funds),
// always in CHANSE. This is the display value; the exact utoken amount comes
// from the launchpad Config query at submit time.
export const CREATION_FEE_CHANSE = 80_000; // 80,000 CHANSE
export const TOKEN_DECIMALS = 6;
// Total supply per token, in WHOLE tokens. Must match the launchpad contract's
// TOTAL_SUPPLY (100_000_000_000 utokens = 100,000 tokens). Market cap = price
// per token x this. (Was 1e9 by mistake, which inflated every market cap 10000x.)
export const TOKEN_SUPPLY = 100_000;

// ── oracle (CHANSE/USD) ─────────────────────────────────────────────────────
// The ansem-oracle contract holds the base-denom -> USD price the launchpad
// itself uses for all curve math. query {"price":{}} -> ansem_usd_price is
// micro-USD per CHANSE (e.g. 100 = $0.0001). Everything denominated in USD on
// the UI resolves the rate from here, per the "hit the oracle, do the math"
// model. NOTE: this rate is the base-asset/USD rate the contract applies to
// BOTH CHANSE and ANSEM curves; a distinct ANSEM(SPL)/USD feed does not exist
// yet, so ANSEM-denominated tokens use the same rate as a documented fallback.
export const ORACLE_CONTRACT =
  process.env.NEXT_PUBLIC_ANSEM_ORACLE ??
  "ansem1d2wr6ej95xepd3wmmpgrkyxwjns6gt5tfscrr3jcuetz7m7z0req0u7slp";

export const IS_LOCALNET =
  RPC_URL.includes("127.0.0.1") || RPC_URL.includes("localhost");
export const IS_DEVNET = false;

export const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://explorer.ansemchain.fun";
export function explorerUrl(kind: "address" | "tx", value: string): string {
  return `${EXPLORER_BASE}/${kind === "tx" ? "tx" : "account"}/${value}`;
}
export function solscanUrl(kind: "account" | "token" | "tx", value: string): string {
  return explorerUrl(kind === "tx" ? "tx" : "address", value);
}
