// Runtime config-registry resolver.
//
// Launch-day model: only TWO things are baked into the build and both are
// genesis-stable — the config-registry ADDRESS and the REST endpoint. Every
// mutable address (launchpad / amm / oracle / names contracts, the ANSEM SPL
// mint, and optional RPC/REST overrides) is read LIVE from the registry at
// runtime. On a fresh genesis the developer changes nothing: the pinned
// registry (same address) auto-points to the new contracts and this resolver
// picks them up. No rebuild, no code edit.
//
// The registry {config:{}} query returns snake_case fields; empty *_override
// strings mean "use the baked default".

import {
  REST_URL,
  LAUNCHPAD_CONTRACT as ENV_LAUNCHPAD,
  AMM_CONTRACT as ENV_AMM,
  ORACLE_CONTRACT as ENV_ORACLE,
  RPC_URL as ENV_RPC,
} from "./config";

// The ONE mutable-address anchor baked at build time. Default = the current
// live registry. The genesis-proof launch value (instantiate2 + fixed salt,
// survives any regenesis) is:
//   ansem1uruc2ue7wqvy83yysspe6afrwu02fuz4g0mxffuz3tssljakxu0qt57u4l
export const REGISTRY_CONTRACT =
  process.env.NEXT_PUBLIC_ANSEM_REGISTRY ??
  "ansem1vguuxez2h5ekltfj9gjd62fs5k4rl2zy5hfrncasykzw08rezpfs766uxe";

export interface RegistryConfig {
  version: number;
  ammContract: string;
  launchpadContract: string;
  oracleContract: string;
  namesContract: string;
  vestingCodeId: number;
  solanaBridgeProgramId: string;
  solanaAnsemSplMint: string;
  solanaRpcUrlOverride: string;
  ansemRpcUrlOverride: string;
  ansemRestUrlOverride: string;
}

const CACHE_TTL_MS = 60_000;
let cache: { value: RegistryConfig; fetchedAt: number } | null = null;
let inFlight: Promise<RegistryConfig> | null = null;

function b64(s: string): string {
  if (typeof btoa === "function") {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (const byte of bytes) bin += String.fromCharCode(byte);
    return btoa(bin);
  }
  return Buffer.from(s, "utf-8").toString("base64");
}

async function fetchRegistry(): Promise<RegistryConfig> {
  const query = b64(JSON.stringify({ config: {} }));
  const url = `${REST_URL.replace(/\/$/, "")}/cosmwasm/wasm/v1/contract/${REGISTRY_CONTRACT}/smart/${query}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`config registry HTTP ${res.status}`);
  const json = (await res.json()) as { data?: Record<string, unknown> };
  const d = json.data;
  if (!d) throw new Error("config registry response missing data");
  return {
    version: Number(d.version ?? 0),
    ammContract: String(d.amm_contract ?? ""),
    launchpadContract: String(d.launchpad_contract ?? ""),
    oracleContract: String(d.oracle_contract ?? ""),
    namesContract: String(d.names_contract ?? ""),
    vestingCodeId: Number(d.vesting_code_id ?? 0),
    solanaBridgeProgramId: String(d.solana_bridge_program_id ?? ""),
    solanaAnsemSplMint: String(d.solana_ansem_spl_mint ?? ""),
    solanaRpcUrlOverride: String(d.solana_rpc_url_override ?? ""),
    ansemRpcUrlOverride: String(d.ansem_rpc_url_override ?? ""),
    ansemRestUrlOverride: String(d.ansem_rest_url_override ?? ""),
  };
}

/** Load the registry config, cached ~60s. Throws only if unreachable. */
export async function loadRegistry(): Promise<RegistryConfig> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const value = await fetchRegistry();
      cache = { value, fetchedAt: Date.now() };
      return value;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// A resolved address is valid only if it looks like a bech32 contract address.
function pick(resolved: string, fallback: string): string {
  return resolved && resolved.startsWith("ansem1") ? resolved : fallback;
}

/** Launchpad contract — registry first, baked env as last-resort fallback. */
export async function getLaunchpadContract(): Promise<string> {
  try {
    return pick((await loadRegistry()).launchpadContract, ENV_LAUNCHPAD);
  } catch {
    return ENV_LAUNCHPAD;
  }
}

/** AMM contract (graduated-token trading). */
export async function getAmmContract(): Promise<string> {
  try {
    return pick((await loadRegistry()).ammContract, ENV_AMM);
  } catch {
    return ENV_AMM;
  }
}

/** Oracle contract (base-denom -> USD price). */
export async function getOracleContract(): Promise<string> {
  try {
    return pick((await loadRegistry()).oracleContract, ENV_ORACLE);
  } catch {
    return ENV_ORACLE;
  }
}

/** REST endpoint: registry override wins, else the baked anchor. The baked
 *  anchor is what reaches the registry in the first place. */
export async function getRestUrl(): Promise<string> {
  try {
    const o = (await loadRegistry()).ansemRestUrlOverride;
    if (o) return o.replace(/\/$/, "");
  } catch {
    /* fall through */
  }
  return REST_URL.replace(/\/$/, "");
}

/** RPC endpoint: registry override wins, else the baked anchor. */
export async function getRpcUrl(): Promise<string> {
  try {
    const o = (await loadRegistry()).ansemRpcUrlOverride;
    if (o) return o.replace(/\/$/, "");
  } catch {
    /* fall through */
  }
  return ENV_RPC.replace(/\/$/, "");
}
