// Config for the ANSEM launchpad, repointed from the old Solana/floorlaunch
// backend to the ansem-1 CosmWasm stack (indexer + launchpad + AMM). The export
// names are kept so existing imports across the app keep resolving.

// ── ansem-1 chain ──────────────────────────────────────────────────────────
export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID ?? "ansem-1";
export const RPC_URL =
  process.env.NEXT_PUBLIC_ANSEM_RPC ?? "https://rpc.ansemchain.fun";
export const REST_URL =
  process.env.NEXT_PUBLIC_ANSEM_REST ?? "https://rest.ansemchain.fun";
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
  process.env.NEXT_PUBLIC_ANSEM_API_URL ?? "https://api.ansemchain.fun/api"
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

// Tokens hidden from every listing + search FOR NOW — a pre-launch cleanup so
// the rehearsal/test tokens don't show. Detail pages (/token/<addr>) still
// resolve, so these stay reachable by direct link for testing. To show
// everything again at launch, empty this set.
export const HIDDEN_TOKEN_ADDRESSES = new Set<string>([
  "ansem1v0840lt6kv2khlgk2hgm230j4f6vmtf4e8lhszcxazfusshx6j7qufe304",
  "ansem1qvar9rwypdgyhyycmfee0zslpp489szn25wl2k5f2erxvy75mwds36e08k",
  "ansem1kc749lkcm6v7euwrqr2c9cwf208tqwu0mqetp6s4te4chr6ysj4qtetyq3",
  "ansem12dwgxsmhx5wwx7ywtqj2s72cjylwr46mqdjsm7e092w44m9mue7q60juz8",
  "ansem12cks8zuclf9339tnanpdd8z8ycf5ygdgy885sejc7kyhvryzfyzs50tgkh",
  "ansem1dmd65eend0mjvnmswzxq7ugpyukyfk40ylr6fm2hdhv3lema0yjsxgn4c6",
  "ansem10dl9tnsfpldlzktvw3xtsn436ntnynkg3xa420hx7pkd2mtz37pq8cxvh0",
  "ansem1lnx4r7styl209e9lfce8tdd7hyclq98upx25ax3t2qkmcl3jlgvsppdzc2",
  "ansem18nwjauhgpmfsjf8c4yea0mfj74n6dhy0wkqzydtvvhkmr7gqzxtsawgz5r",
  "ansem1enrur4t6kyyfgmh84e88muzej4m3zcvje999trctck0e7zr7ktjqvxeytp",
  "ansem1nkxfnchghtwx73p9fe9keepaerpykagydq00etp09qxk8n048mcs8my62h",
  "ansem167xst2jy9n6u92t3n8hf762adtpe3cs6acsgn0w5n2xlz9hv3xgsrf6yzu",
]);

export const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://explorer.ansemchain.fun";
export function explorerUrl(kind: "address" | "tx", value: string): string {
  return `${EXPLORER_BASE}/${kind === "tx" ? "tx" : "account"}/${value}`;
}
export function solscanUrl(kind: "account" | "token" | "tx", value: string): string {
  return explorerUrl(kind === "tx" ? "tx" : "address", value);
}
