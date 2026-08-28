"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import localFont from "next/font/local";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Lightning,
  Coins,
  ChartLineUp,
  Scales,
  Gauge,
  Waves,
  Lock,
  Timer,
  ShieldCheck,
  ArrowsLeftRight,
  HandCoins,
  MagnifyingGlass,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Plus,
  PencilSimple,
  type Icon,
} from "@phosphor-icons/react";
import { useFloorWallet } from "@/components/wallet/solana-wallet-provider";
import { createToken } from "@/lib/ansem/launchpad-tx";
import { resolveTokenAddressFromTx, saveTeamLaunch } from "@/lib/token-meta";
import { HORNS, type Horn } from "@/lib/horns-catalog";
import { BASE_DENOMS, explorerUrl } from "@/lib/floorlaunch/config";

// Exact local Inter variable subset supplied for the create flow. It is scoped
// to the wizard root so the rest of the application keeps its existing typeface.
const wizSans = localFont({
  src: "../../../83afe278b6a6bb3c-s.p.3a6ba036.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--wiz-sans",
  display: "swap",
});

// LONG typography tokens, measured off app.long.xyz/create:
// - Heading (Inter 600, 26px, -0.26px tracking, 29.9px line-height)
// - Body / subtitle prose (Inter 400, 15px, 18px line-height)
// - CTA buttons + progress-bar nav labels (600, 14px, normal tracking)
// - Step-item + hint text (title 600 / sub 400; 14px, ~1.4 line-height)
const HEADING: React.CSSProperties = {
  fontFamily: "var(--wiz-sans)",
  fontWeight: 600,
  fontSize: "26px",
  letterSpacing: "-0.26px",
  lineHeight: "29.9px",
};
const BODY: React.CSSProperties = {
  fontFamily: "var(--wiz-sans)",
  fontWeight: 400,
  fontSize: "15px",
  lineHeight: "18px",
};
const CTA: React.CSSProperties = {
  fontFamily: "var(--wiz-sans)",
  fontWeight: 600,
  fontSize: "14px",
  letterSpacing: "normal",
};
// Shared create-flow font style alias (weight set per element).
const POPPINS: React.CSSProperties = { fontFamily: "var(--wiz-sans)" };

// ── Horn selection rules (preserved verbatim from create-token-form) ─────────
// The reward skim (Vault / Fee-Share) is the base and always implied; the
// Composite router itself and the hook interface are not user-selectable, and
// limit/twamm are a standalone router and a keeper, not pool hooks.
const COMPOSABLE_HORNS = HORNS.filter(
  (h) => !["vault", "feeshare", "composite", "_hooks-interface", "limit", "twamm"].includes(h.slug),
);
const HORN_NEEDS_CONFIG = new Set(["rehypo", "arb", "floor", "auction"]);

// ── On-chain composition rules (from the security audit) ─────────────────────
// The Composite router combines each Horn's before_swap decision under strict
// rules that are enforced on-chain: at most ONE Delta (pricing) hook, no
// conflicting fee overrides, and the two stateful Horns must run alone. We mirror
// those rules in the picker so a user can never build a set the chain rejects.
//   SOLO  → must run alone (arb, auction).
//   DELTA → pricing hooks; only one may sit on a pool (curve, ldf, schedule).
//   FEE   → fee-override hooks; conflicting overrides are rejected (dynfee, decay, witness).
// Everything else (gauge, rehypo, floor) is freely STACKABLE and combines with
// at most one DELTA and one FEE.
const HORN_SOLO = new Set(["arb", "auction"]);
const HORN_DELTA = new Set(["curve", "ldf", "schedule"]);
const HORN_FEE = new Set(["dynfee", "decay", "witness"]);
const FEATURED = ["dynfee", "curve", "auction"];

// The three category groups shown in the picker (matches HornCategory values on
// the composable subset).
const PICKER_GROUPS: { label: string; category: Horn["category"] }[] = [
  { label: "Reward layer", category: "Reward layer" },
  { label: "Fee strategy", category: "Fee strategy" },
  { label: "Liquidity & pricing", category: "Liquidity & pricing" },
];

const HORN_ICON: Record<string, Icon> = {
  gauge: Gauge,
  rehypo: HandCoins,
  dynfee: Lightning,
  decay: Timer,
  auction: Scales,
  schedule: Timer,
  witness: ShieldCheck,
  curve: Waves,
  ldf: ChartLineUp,
  arb: ArrowsLeftRight,
  floor: Lock,
};
function hornIcon(slug: string): Icon {
  return HORN_ICON[slug] ?? Coins;
}
/** The real per-Horn illustration (public/horns/art/<slug>.png), rendered bare
 *  with no circular container so the horn shape reads clearly. */
function HornArt({ slug, size, className = "" }: { slug: string; size: number; className?: string }) {
  return (
    <span className={`block shrink-0 ${className}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/horns/art/${slug}.png`}
        alt=""
        className="h-full w-full object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.55)]"
      />
    </span>
  );
}
function changesLine(cat: Horn["category"]): string {
  if (cat === "Reward layer") return "For holders: routes a slice of every swap fee to stakers.";
  if (cat === "Fee strategy") return "For traders: changes the fee paid per swap based on conditions.";
  return "For traders: reshapes how the pool prices and holds depth.";
}

type BaseChoice = "chanse" | "ansem";
type StepKey = "intro" | "horn" | "skim" | "name" | "review";
const STEP_LABEL: Record<StepKey, string> = {
  intro: "Start",
  horn: "Pick a Horn",
  skim: "Fees",
  name: "Name",
  review: "Review",
};

/**
 * Downscale an uploaded image to a small square and return a JPEG data URL.
 * The launchpad stores this string on-chain as the token image, so it must be
 * compact: capped at 256px and re-encoded so it renders with no external host.
 */
async function fileToDataUrl(file: File, max = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

// Intro collage ring. Each entry is EITHER a Phosphor `icon` OR an image `src`
// (`img`); the renderer shows an <img> when `img` is set, otherwise the icon.
// To drop in the real horn-design art later, edit ONLY this array: replace an
// entry with `{ img: "/horns/whatever.png" }` (or add `img` alongside `icon`)
// and it renders in place, no other change needed.
type RingEntry = { icon?: Icon; img?: string };
// The revolving Horn art (the real per-Horn illustrations in public/horns/art).
// A colour-diverse spread of the catalog; swap/extend by editing this list only.
const RING_ITEMS: RingEntry[] = [
  { img: "/horns/art/curve.png" },
  { img: "/horns/art/dynfee.png" },
  { img: "/horns/art/arb.png" },
  { img: "/horns/art/auction.png" },
  { img: "/horns/art/ldf.png" },
  { img: "/horns/art/floor.png" },
  { img: "/horns/art/vault.png" },
  { img: "/horns/art/composite.png" },
];
// Precompute orbit positions (rounded so SSR and client markup agree).
const RING = RING_ITEMS.map((item, i) => {
  const a = (i / RING_ITEMS.length) * Math.PI * 2 - Math.PI / 2;
  return {
    ...item,
    x: Math.round(Math.cos(a) * 86 * 100) / 100,
    y: Math.round(Math.sin(a) * 86 * 100) / 100,
  };
});

export function CreateTokenWizard() {
  const wallet = useFloorWallet();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [image, setImage] = useState("");
  const [description, setDescription] = useState("");
  const [twitter, setTwitter] = useState("");
  const [website, setWebsite] = useState("");
  const [telegram, setTelegram] = useState("");
  const [base, setBase] = useState<BaseChoice>("chanse");
  const [gradAnsem, setGradAnsem] = useState("");
  // Team token launch: when on, holders cannot open metadata-change proposals for
  // this token. Persisted off-chain (keyed by the new token address) right after
  // the launch tx confirms; see the write in submit() below.
  const [teamLaunch, setTeamLaunch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Horns: attach a fee-skim Horn at graduation, split ANSEM/CHANSE, compose extras.
  const [attachHorns, setAttachHorns] = useState(true);
  const [skimPct, setSkimPct] = useState(25);
  const [ansemPct, setAnsemPct] = useState(50);
  const [composite, setComposite] = useState<string[]>([]);

  const [stepKey, setStepKey] = useState<StepKey>("intro");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const flow: StepKey[] = attachHorns
    ? ["intro", "horn", "skim", "name", "review"]
    : ["intro", "name", "review"];
  const idx = Math.max(0, flow.indexOf(stepKey));
  const prevKey = flow[idx - 1];
  const nextKey = flow[idx + 1];
  const progress = (idx + 1) / flow.length;

  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setImgBusy(true);
    try {
      setImage(await fileToDataUrl(file));
    } catch {
      toast.error("Could not read that image");
    } finally {
      setImgBusy(false);
    }
  }, []);

  const nameValid = useMemo(
    () =>
      name.trim().length > 0 &&
      symbol.trim().length > 0 &&
      (base === "chanse" || Number(gradAnsem) > 0),
    [name, symbol, base, gradAnsem],
  );
  const canSubmit = Boolean(wallet.connected) && !submitting && nameValid;

  // Toggle a Horn in/out of the composite set, enforcing the on-chain
  // composition rules so the picker can never build a set the chain rejects.
  // Invariants that always hold afterwards: never two DELTA horns, never two FEE
  // horns, never a SOLO horn alongside anything else.
  function toggleHorn(slug: string) {
    setComposite((c) => {
      // Already selected → plain deselect.
      if (c.includes(slug)) return c.filter((s) => s !== slug);
      // Solo horns replace the entire selection.
      if (HORN_SOLO.has(slug)) return [slug];
      // Otherwise drop any solo horn, then the single conflicting pricing/fee
      // horn in the same group, before adding this one.
      let next = c.filter((s) => !HORN_SOLO.has(s));
      if (HORN_DELTA.has(slug)) next = next.filter((s) => !HORN_DELTA.has(s));
      if (HORN_FEE.has(slug)) next = next.filter((s) => !HORN_FEE.has(s));
      return [...next, slug];
    });
  }

  function goNext() {
    if (!nextKey) return;
    if (stepKey === "name" && !nameValid) return;
    setStepKey(nextKey);
  }
  function goPrev() {
    if (prevKey) setStepKey(prevKey);
  }

  async function submit() {
    if (!wallet.address) {
      await wallet.connect();
      return;
    }
    setSubmitting(true);
    toast.loading("Confirm the launch in your wallet...", { id: "launch" });
    try {
      const client = await wallet.getSigningClient();
      const socialLinks = [twitter, website, telegram].filter((l) => l.trim());
      const hash = await createToken(client, wallet.address, {
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        image: image.trim(),
        description: description.trim(),
        socialLinks,
        baseDenom: base === "chanse" ? BASE_DENOMS.chanse : BASE_DENOMS.ansem,
        baseGradThreshold:
          base === "ansem" ? String(Math.round(Number(gradAnsem) * 1_000_000)) : undefined,
        horn: attachHorns
          ? { skimBps: Math.round(skimPct * 100), ansemBps: Math.round(ansemPct * 100), composite }
          : undefined,
      });
      // Resolve the freshly minted token address from the launch tx's single
      // instantiate event so we can deep-link to it and (for team launches) tag it.
      let tokenAddress: string | null = null;
      try {
        tokenAddress = await resolveTokenAddressFromTx(hash);
      } catch {
        /* fall back to home if the address can't be read */
      }

      toast.success(`${symbol.toUpperCase()} launched`, {
        id: "launch",
        description: (
          <span className="block">
            {tokenAddress && (
              <span className="block truncate font-mono text-[11px] text-zinc-400">
                {tokenAddress}
              </span>
            )}
            <a
              href={explorerUrl(tokenAddress ? "address" : "tx", tokenAddress ?? hash)}
              target="_blank"
              rel="noreferrer"
              className="font-mono underline decoration-dotted underline-offset-2 hover:text-[#6cf07f]"
            >
              View on explorer ↗
            </a>
          </span>
        ),
      });

      // Team launch: persist the flag against the new token address (best effort;
      // never let it fault the launch itself).
      if (teamLaunch && tokenAddress) {
        try {
          await saveTeamLaunch(tokenAddress, true, wallet);
        } catch {
          toast.message("Launched. Team-launch flag not saved", {
            description: "The launch went through; you can set the flag later.",
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["tokens"] });
      await wallet.refreshBalance();
      // Auto-redirect to the new token's page.
      router.push(tokenAddress ? `/token/${tokenAddress}` : "/");
    } catch (e) {
      toast.error("Launch failed", {
        id: "launch",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "h-14 w-full rounded-[10px] border border-[#26262b] bg-[#161618] px-4 text-[15px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-[#6cf07f]/70 focus:bg-[#1a1a1c]";
  const chansePct = 100 - ansemPct;
  const selectedHorns = COMPOSABLE_HORNS.filter((h) => composite.includes(h.slug));

  return (
    <div
      className={`${wizSans.variable} relative min-h-[calc(100dvh-128px)] w-full overflow-hidden border border-[#1f1f23] bg-[#0d0d0f]`}
      style={{ fontFamily: "var(--wiz-sans)" }}
    >
      {/* Collage revolve: the ring container orbits, each item counter-rotates to
          stay upright. Disabled under prefers-reduced-motion. */}
      <style>{`
        @keyframes wizOrbit { to { transform: rotate(360deg); } }
        .wiz-orbit { animation: wizOrbit 60s linear infinite; transform-origin: 50% 50%; will-change: transform; }
        .wiz-orbit-item { animation: wizOrbit 60s linear infinite reverse; transform-origin: 50% 50%; will-change: transform; }
        @media (prefers-reduced-motion: reduce) {
          .wiz-orbit, .wiz-orbit-item { animation: none; }
        }
      `}</style>
      <div
        className="relative mx-auto w-full max-w-[860px] px-5 pb-8 pt-8 sm:px-8 sm:pt-10"
        style={{ zoom: 0.9 }}
      >
        <div className="mx-auto w-full max-w-[820px]">

        {/* Progress bar: Back <prev> on the left, <next> > on the right, green fill */}
        <div className="relative px-3 sm:px-7">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goPrev}
              disabled={!prevKey}
              style={{ ...CTA, fontWeight: 650, fontSize: "15px" }}
              className="inline-flex items-center gap-2 text-zinc-100 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-100"
            >
              <CaretLeft size={15} weight="bold" />
              Back
              <span className="text-zinc-600">{prevKey ? STEP_LABEL[prevKey] : ""}</span>
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!nextKey || (stepKey === "name" && !nameValid)}
              style={{ ...CTA, fontWeight: 650, fontSize: "15px" }}
              className="inline-flex items-center gap-2 text-zinc-100 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-100"
            >
              <span>{nextKey ? STEP_LABEL[nextKey] : "Launch a coin"}</span>
              <CaretRight size={15} weight="bold" />
            </button>
          </div>
          <div className="mt-4 h-[5px] w-full overflow-hidden bg-[#1f1f23]">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${progress * 100}%`, background: "#f1f7f3" }}
            />
          </div>
        </div>

        {/* Step body */}
        <div key={stepKey} className="ansem-fade-in px-3 py-12 sm:px-9 sm:py-[78px]">
          {stepKey === "intro" && (
            <IntroStep
              onChoose={() => {
                setAttachHorns(true);
                setStepKey("horn");
              }}
            />
          )}

          {stepKey === "horn" && (
            <HornStep
              query={query}
              setQuery={setQuery}
              composite={composite}
              toggleHorn={toggleHorn}
              expanded={expanded}
              setExpanded={setExpanded}
              onNoHorn={() => {
                setAttachHorns(false);
                setComposite([]);
                setStepKey("name");
              }}
            />
          )}

          {stepKey === "skim" && (
            <SkimStep
              selectedHorns={selectedHorns}
              skimPct={skimPct}
              setSkimPct={setSkimPct}
              ansemPct={ansemPct}
              setAnsemPct={setAnsemPct}
              chansePct={chansePct}
              onContinue={() => setStepKey("name")}
            />
          )}

          {stepKey === "name" && (
            <NameStep
              name={name}
              setName={setName}
              symbol={symbol}
              setSymbol={setSymbol}
              image={image}
              setImage={setImage}
              description={description}
              setDescription={setDescription}
              twitter={twitter}
              setTwitter={setTwitter}
              website={website}
              setWebsite={setWebsite}
              telegram={telegram}
              setTelegram={setTelegram}
              base={base}
              setBase={setBase}
              gradAnsem={gradAnsem}
              setGradAnsem={setGradAnsem}
              teamLaunch={teamLaunch}
              setTeamLaunch={setTeamLaunch}
              dragOver={dragOver}
              setDragOver={setDragOver}
              imgBusy={imgBusy}
              handleFile={handleFile}
              fileRef={fileRef}
              field={field}
              valid={nameValid}
              onContinue={() => setStepKey("review")}
            />
          )}

          {stepKey === "review" && (
            <ReviewStep
              name={name}
              symbol={symbol}
              image={image}
              base={base}
              gradAnsem={gradAnsem}
              teamLaunch={teamLaunch}
              attachHorns={attachHorns}
              skimPct={skimPct}
              ansemPct={ansemPct}
              chansePct={chansePct}
              selectedHorns={selectedHorns}
              connected={Boolean(wallet.connected)}
              submitting={submitting}
              canSubmit={canSubmit}
              onEditDetails={() => setStepKey("name")}
              onEditHorns={() => setStepKey("horn")}
              onEditFees={() => setStepKey(attachHorns ? "skim" : "horn")}
              onLaunch={submit}
            />
          )}
        </div>
        </div>
      </div>
      {stepKey === "horn" && selectedHorns.length > 0 && (
        <HornSelectionTray horns={selectedHorns} onContinue={() => setStepKey("skim")} />
      )}
    </div>
  );
}

// ── Step 1: intro ────────────────────────────────────────────────────────────
function IntroStep({ onChoose }: { onChoose: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <h1 style={HEADING} className="text-white">
        Launch with Horns
      </h1>
      <p style={BODY} className="mt-3 max-w-[440px] text-zinc-400">
        Add programmable liquidity to your token on ANSEM Chain
      </p>

      <ol className="mt-8 w-full max-w-[500px] space-y-4 text-left">
        {[
          { t: "Pick a Horn" },
          { t: "Launch a new token on top of it." },
        ].map((it, i) => (
          <li key={i} className="flex items-center gap-4">
            <span
              style={{ ...POPPINS, fontWeight: 500 }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-white/[0.035] text-[13px] text-zinc-300"
            >
              {i + 1}
            </span>
            <p style={{ ...POPPINS, fontWeight: 400, fontSize: "16px", lineHeight: "1.4" }} className="text-zinc-200">{it.t}</p>
          </li>
        ))}
      </ol>

      <p style={{ ...POPPINS, fontWeight: 400, fontSize: "13px" }} className="mt-5 w-full max-w-[500px] text-left text-zinc-500">
        Your ticker is protected during launch — no other token can claim it.
      </p>

      <div className="relative mt-9 h-[208px] w-[208px]" aria-hidden>
        {/* Super-subtle ANSEM glow behind the revolving Horns. */}
        <div className="absolute inset-10 rounded-full bg-[#6cf07f]/[0.06] blur-2xl" />
        <div className="wiz-orbit absolute inset-0">
          {RING.slice(0, 8).map((item, i) => {
            const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
            const left = 104 + Math.cos(angle) * 82;
            const top = 104 + Math.sin(angle) * 82;
            return (
              <span
                key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left, top }}
              >
                {/* No container: the Horn art sits bare and counter-rotates upright. */}
                <span className="wiz-orbit-item block h-[54px] w-[54px]">
                  {item.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.img}
                      alt=""
                      className="h-full w-full object-contain drop-shadow-[0_5px_12px_rgba(0,0,0,0.6)]"
                    />
                  ) : null}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onChoose}
        style={CTA}
        className="mt-11 inline-flex h-14 w-full max-w-[600px] items-center justify-center gap-2 rounded-[14px] bg-[#f1f7f3] text-[#0d0d0f] transition-transform hover:brightness-105 active:scale-[0.99]"
      >
        CHOOSE A HORN
      </button>
    </div>
  );
}

// ── Step 2: pick the Horn ────────────────────────────────────────────────────
function HornStep({
  query,
  setQuery,
  composite,
  toggleHorn,
  expanded,
  setExpanded,
  onNoHorn,
}: {
  query: string;
  setQuery: (v: string) => void;
  composite: string[];
  toggleHorn: (slug: string) => void;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  onNoHorn: () => void;
}) {
  const q = query.trim().toLowerCase();
  const match = (h: Horn) =>
    !q ||
    h.name.toLowerCase().includes(q) ||
    h.tagline.toLowerCase().includes(q) ||
    h.blurb.toLowerCase().includes(q) ||
    h.category.toLowerCase().includes(q);
  const featured = COMPOSABLE_HORNS.filter((h) => FEATURED.includes(h.slug));
  const visible = COMPOSABLE_HORNS.filter(match);
  const recentlyAdded = COMPOSABLE_HORNS.slice(-6);

  return (
    <div className="mx-auto max-w-[680px]">
      <h2 style={HEADING} className="text-center text-white">
        Pick your Horn
      </h2>
      <p style={BODY} className="mt-2 text-center text-zinc-400">
        Choose how your token trades and rewards holders.
      </p>

      <div className="relative mt-10">
        <MagnifyingGlass size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${COMPOSABLE_HORNS.length} Horns`}
          className="h-14 w-full rounded-[14px] border border-[#26262b] bg-[#161618] pl-12 pr-4 text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#6cf07f]/60"
        />
      </div>

      {!q && (
        <>
        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h3 style={{ ...POPPINS, fontWeight: 600 }} className="text-[14px] text-zinc-100">Quick pick</h3>
            <span className="text-[12px] text-zinc-600">Click to select</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {featured.map((h) => {
              const on = composite.includes(h.slug);
              return (
                <button
                  key={h.slug}
                  type="button"
                  onClick={() => toggleHorn(h.slug)}
                  className={`flex min-w-0 items-center gap-3 rounded-[14px] border p-4 text-left transition-colors ${
                    on
                      ? "border-[#6cf07f]/70 bg-[#17261d]"
                      : "border-[#26262b] bg-[#161618] hover:border-[#3a3a42]"
                  }`}
                >
                  <HornArt slug={h.slug} size={46} />
                  <span className="min-w-0">
                    <span style={{ ...POPPINS, fontWeight: 600 }} className="block truncate text-[14px] text-zinc-100">{h.name}</span>
                    <span className="mt-1 block truncate text-[12px] text-zinc-500">{h.category}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h3 style={{ ...POPPINS, fontWeight: 600 }} className="text-[14px] text-zinc-100">Themes</h3>
            <span className="text-[12px] text-zinc-600">See all</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {PICKER_GROUPS.map((grp) => {
              const horns = COMPOSABLE_HORNS.filter((h) => h.category === grp.category);
              return (
                <button key={grp.label} type="button" onClick={() => setQuery(grp.label)} className="rounded-[14px] border border-[#26262b] bg-[#161618] p-4 text-left transition-colors hover:border-[#3a3a42]">
                  <span className="flex gap-1.5">
                    {horns.slice(0, 3).map((h) => (
                      <HornArt key={h.slug} slug={h.slug} size={38} />
                    ))}
                  </span>
                  <span style={{ ...POPPINS, fontWeight: 600 }} className="mt-5 block text-[14px] text-zinc-100">{grp.label}</span>
                  <span className="mt-1 block text-[12px] text-zinc-500">{horns.length} Horns</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-9">
          <div className="mb-3 flex items-center justify-between">
            <h3 style={{ ...POPPINS, fontWeight: 600 }} className="text-[14px] text-zinc-100">Trending</h3>
            <span className="text-[12px] text-zinc-600">Popular</span>
          </div>
          <div className="space-y-1">
            {featured.map((h, i) => <HornListButton key={h.slug} horn={h} rank={i + 1} selected={composite.includes(h.slug)} onClick={() => toggleHorn(h.slug)} />)}
          </div>
        </section>

        <section className="mt-9">
          <div className="mb-3 flex items-center justify-between">
            <h3 style={{ ...POPPINS, fontWeight: 600 }} className="text-[14px] text-zinc-100">Recently added</h3>
            <span className="text-[12px] text-zinc-600">{recentlyAdded.length} Horns</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {recentlyAdded.map((h) => <HornMarketCard key={h.slug} horn={h} selected={composite.includes(h.slug)} onClick={() => toggleHorn(h.slug)} />)}
          </div>
        </section>
        </>
      )}

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h3 style={{ ...POPPINS, fontWeight: 600 }} className="text-[14px] text-zinc-100">All Horns</h3>
          <span className="text-[12px] text-zinc-600">A–Z</span>
        </div>
        <div className="space-y-2">
          {visible.length ? visible.map((h) => (
            <HornRow key={h.slug} horn={h} selected={composite.includes(h.slug)} open={expanded === h.slug} onToggleSelect={() => toggleHorn(h.slug)} onToggleOpen={() => setExpanded(expanded === h.slug ? null : h.slug)} />
          )) : <p className="py-10 text-center text-[14px] text-zinc-500">No Horns match “{query}”.</p>}
        </div>
      </section>

      <div className="mt-8 flex justify-center pb-24">
        <button
          type="button"
          onClick={onNoHorn}
          style={{ ...POPPINS, fontWeight: 500, fontSize: "14px" }}
          className="text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-300 hover:underline"
        >
          No Horn, launch a regular coin
        </button>
      </div>

    </div>
  );
}

function HornSelectionTray({ horns, onContinue }: { horns: Horn[]; onContinue: () => void }) {
  return (
    <div className="fixed inset-x-4 bottom-5 z-40 mx-auto flex max-w-[760px] items-center gap-3 rounded-[18px] bg-[#161616]/95 p-3 shadow-[0_18px_60px_rgba(0,0,0,.55)] backdrop-blur-xl sm:bottom-7 sm:p-4">
      <HornArt slug={horns[0].slug} size={44} />
      <span className="min-w-0 flex-1 text-left">
        <span style={{ ...POPPINS, fontWeight: 600 }} className="block truncate text-[14px] text-white">
          {horns[0].name}{horns.length > 1 ? ` +${horns.length - 1}` : ""}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-zinc-500">
          {horns.length === 1 ? horns[0].category : `${horns.length} Horns selected`}
        </span>
      </span>
      <button type="button" onClick={onContinue} style={CTA} className="h-11 shrink-0 rounded-full bg-[#6cf07f] px-7 text-black transition hover:brightness-105 active:scale-[0.99] sm:px-9">
        Continue
      </button>
    </div>
  );
}

function HornListButton({ horn, rank, selected, onClick }: { horn: Horn; rank: number; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="flex w-full items-center gap-4 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-white/[0.035]">
      <span className="w-4 text-center text-[12px] text-zinc-600">{rank}</span>
      <HornArt slug={horn.slug} size={38} />
      <span className="min-w-0 flex-1">
        <span style={{ ...POPPINS, fontWeight: 600 }} className="block truncate text-[14px] text-zinc-100">{horn.name}</span>
        <span className="block truncate text-[12px] text-zinc-500">{horn.tagline}</span>
      </span>
      <span className="text-[12px] font-medium text-[#6cf07f]">{selected ? "Selected" : `${horn.hooks.length} hooks`}</span>
    </button>
  );
}

function HornMarketCard({ horn, selected, onClick }: { horn: Horn; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={`flex items-center gap-4 rounded-[14px] border p-4 text-left transition-colors ${selected ? "border-[#6cf07f]/70 bg-[#17261d]" : "border-[#26262b] bg-[#161618] hover:border-[#3a3a42]"}`}>
      <HornArt slug={horn.slug} size={48} />
      <span className="min-w-0 flex-1">
        <span style={{ ...POPPINS, fontWeight: 600 }} className="block truncate text-[14px] text-zinc-100">{horn.name}</span>
        <span className="mt-1 block truncate text-[12px] text-zinc-500">{horn.category}</span>
      </span>
      {selected && <Check size={16} weight="bold" className="text-[#6cf07f]" />}
    </button>
  );
}

function HornRow({
  horn,
  selected,
  open,
  onToggleSelect,
  onToggleOpen,
}: {
  horn: Horn;
  selected: boolean;
  open: boolean;
  onToggleSelect: () => void;
  onToggleOpen: () => void;
}) {
  const solo = HORN_SOLO.has(horn.slug);
  const needsConfig = HORN_NEEDS_CONFIG.has(horn.slug);
  return (
    <div
      className={`rounded-[12px] border transition-colors ${
        selected ? "border-[#6cf07f]/50 bg-[#6cf07f]/[0.06]" : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={selected}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <HornArt slug={horn.slug} size={40} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span style={{ ...POPPINS, fontWeight: 600, fontSize: "14px" }} className="truncate text-zinc-100">
                {horn.name}
              </span>
              {solo && (
                <span className="rounded-[4px] bg-white/10 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-zinc-400">
                  Solo
                </span>
              )}
              {needsConfig && (
                <span
                  title="Needs extra config or funding to do anything"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e0b341]"
                />
              )}
            </span>
            <span style={{ ...POPPINS, fontWeight: 400, fontSize: "12.5px" }} className="mt-0.5 block truncate text-zinc-500">{horn.tagline}</span>
          </span>
        </button>

        {/* Select checkbox */}
        <button
          type="button"
          onClick={onToggleSelect}
          aria-label={selected ? "Deselect Horn" : "Select Horn"}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
            selected ? "border-[#6cf07f] bg-[#6cf07f] text-[#0d0d0f]" : "border-white/20 text-transparent"
          }`}
        >
          <Check size={14} weight="bold" />
        </button>

        {/* Summary toggle / expander */}
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-label="What this Horn does"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-100"
        >
          <CaretDown size={15} weight="bold" className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="ansem-fade-in border-t border-white/[0.06] px-3 pb-3.5 pt-3">
          <p className="text-[12.5px] leading-5 text-zinc-400">{horn.blurb}</p>
          <p className="mt-2 text-[12px] font-medium text-[#6cf07f]/90">{changesLine(horn.category)}</p>
          <ul className="mt-2 space-y-1">
            {horn.points.slice(0, 2).map((p, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] leading-4 text-zinc-500">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#6cf07f]/60" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Step 3: skim / fees ──────────────────────────────────────────────────────
function SkimStep({
  selectedHorns,
  skimPct,
  setSkimPct,
  ansemPct,
  setAnsemPct,
  chansePct,
  onContinue,
}: {
  selectedHorns: Horn[];
  skimPct: number;
  setSkimPct: (v: number) => void;
  ansemPct: number;
  setAnsemPct: (v: number) => void;
  chansePct: number;
  onContinue: () => void;
}) {
  const skimBps = Math.round(skimPct * 100);
  const primaryHorn = selectedHorns[0];
  const feeTitle = primaryHorn
    ? `${primaryHorn.name}${selectedHorns.length > 1 ? ` +${selectedHorns.length - 1}` : ""} fees`
    : "Horn fees";
  return (
    <div className="mx-auto flex max-w-[600px] flex-col items-center text-center">
      <h2 style={HEADING} className="text-white">
        {feeTitle}
      </h2>
      <p style={BODY} className="mt-2 text-zinc-400">
        How fees work with your selected Horns
      </p>

      <div className="mt-12 flex h-[128px] w-[128px] items-center justify-center">
        {primaryHorn ? (
          <HornArt slug={primaryHorn.slug} size={124} />
        ) : (
          <Coins size={48} weight="fill" className="text-[#6cf07f]" />
        )}
      </div>

      <p style={{ ...POPPINS, fontWeight: 400 }} className="mt-7 text-[15px] text-zinc-300">
        <strong className="font-semibold text-white">{skimPct}% of every swap fee</strong> goes to the Horn Vault, split between:
      </p>

      <div className="mt-5 w-full space-y-3 text-left">
        <div className="flex min-h-[72px] items-center gap-5 rounded-[13px] border border-[#26262b] bg-white/[0.035] px-5">
          <span style={{ ...POPPINS, fontWeight: 600 }} className="w-[76px] shrink-0 text-[20px] text-[#6cf07f]">{ansemPct}%</span>
          <span className="text-[14px] text-zinc-300">rewards ANSEM stakers</span>
        </div>
        <div className="flex min-h-[72px] items-center gap-5 rounded-[13px] border border-[#26262b] bg-white/[0.035] px-5">
          <span style={{ ...POPPINS, fontWeight: 600 }} className="w-[76px] shrink-0 text-[20px] text-[#8ab4ff]">{chansePct}%</span>
          <span className="text-[14px] text-zinc-300">rewards CHANSE stakers</span>
        </div>
      </div>

      <div className="mt-6 w-full space-y-5 text-left">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span style={{ ...POPPINS, fontWeight: 500 }} className="text-[12px] text-zinc-500">Vault skim</span>
            <span style={{ ...POPPINS, fontWeight: 600 }} className="text-[12px] text-[#8ff49d]">{skimBps} bps</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={skimPct}
            onChange={(e) => setSkimPct(Number(e.target.value))}
            className="fee-range w-full"
            style={{ background: `linear-gradient(to right, #6cf07f 0%, #6cf07f ${skimPct * 2}%, #1c1c1e ${skimPct * 2}%, #1c1c1e 100%)` }}
            aria-label="Skim percentage"
          />
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <span style={{ ...POPPINS, fontWeight: 500 }} className="text-[12px] text-zinc-500">Reward split</span>
            <span style={{ ...POPPINS, fontWeight: 600 }} className="text-[12px]"><span className="text-[#8ff49d]">{ansemPct}</span><span className="text-zinc-700">/</span><span className="text-[#a9c7ff]">{chansePct}</span></span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={ansemPct}
            onChange={(e) => setAnsemPct(Number(e.target.value))}
            className="fee-range w-full"
            style={{ background: `linear-gradient(to right, #6cf07f 0%, #6cf07f ${ansemPct}%, #8ab4ff ${ansemPct}%, #8ab4ff 100%)` }}
            aria-label="ANSEM share of the skim"
          />
        </div>
      </div>

      <p className="mt-4 max-w-[520px] text-[11.5px] leading-5 text-zinc-600">
        The skim activates with the Horns program at graduation. Until then, its configuration is recorded with your launch.
      </p>

      <button
        type="button"
        onClick={onContinue}
        style={CTA}
        className="mt-7 h-14 w-full rounded-[14px] bg-[#f1f7f3] text-[#0d0d0f] transition hover:brightness-105 active:scale-[0.99]"
      >
        CONTINUE
      </button>
    </div>
  );
}

// ── Step 4: name your token ──────────────────────────────────────────────────
function NameStep(props: {
  name: string;
  setName: (v: string) => void;
  symbol: string;
  setSymbol: (v: string) => void;
  image: string;
  setImage: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  twitter: string;
  setTwitter: (v: string) => void;
  website: string;
  setWebsite: (v: string) => void;
  telegram: string;
  setTelegram: (v: string) => void;
  base: BaseChoice;
  setBase: (v: BaseChoice) => void;
  gradAnsem: string;
  setGradAnsem: (v: string) => void;
  teamLaunch: boolean;
  setTeamLaunch: (v: boolean) => void;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  imgBusy: boolean;
  handleFile: (f: File | null | undefined) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  field: string;
  valid: boolean;
  onContinue: () => void;
}) {
  const {
    name, setName, symbol, setSymbol, image, setImage, description, setDescription,
    twitter, setTwitter, website, setWebsite, telegram, setTelegram,
    base, setBase, gradAnsem, setGradAnsem, teamLaunch, setTeamLaunch,
    dragOver, setDragOver, imgBusy,
    handleFile, fileRef, field, valid, onContinue,
  } = props;
  const ticker = symbol.trim() ? `$${symbol.trim().toUpperCase()}` : "$TICKER";

  return (
    <div className="mx-auto w-full max-w-[600px]">
      <h2 style={HEADING} className="text-center text-white">
        Name your token
      </h2>
      <p style={BODY} className="mt-2 text-center text-zinc-400">
        This is how it shows up everywhere.
      </p>

      {/* Live preview card */}
      <div className="mt-14 flex min-h-[100px] items-center gap-4 rounded-[16px] border border-[#26262b] bg-[#161618] px-5 py-4 shadow-[0_14px_40px_rgba(0,0,0,.18)]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="token" className="h-14 w-14 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-full bg-[radial-gradient(circle_at_32%_28%,#e8e8ec,#71717a_55%,#2a2a30)] shadow-[inset_0_1px_3px_rgba(255,255,255,.45)]" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <span style={{ fontFamily: "var(--wiz-sans)" }} className="block truncate text-[18px] font-bold text-white">{ticker}</span>
          <span className="mt-1 block truncate text-[13px] text-zinc-400">{name.trim() || "Your token"}</span>
        </div>
      </div>

      <div className="mt-8 space-y-5">
        <div>
          <label className="mb-2 block text-[14px] font-semibold text-zinc-100">Ticker</label>
          <input className={field} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="TICKER" maxLength={12} />
          <p className="mt-2 text-[12px] text-[#6cf07f]">• Available — held for you during launch</p>
        </div>
        <div>
          <label className="mb-2 block text-[14px] font-semibold text-zinc-100">Name</label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Token name" />
        </div>

        {/* Image */}
        <div>
          <label className="mb-2 block text-[14px] font-semibold text-zinc-100">Image</label>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-[10px] border px-4 transition ${
              dragOver ? "border-[#6cf07f] bg-[#17261d]" : "border-[#26262b] bg-[#161618] hover:border-[#3a3a42]"
            }`}
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="token" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <Plus size={18} className="shrink-0 text-[#6cf07f]" />
            )}
            <span className="text-[15px] text-zinc-200">
              {imgBusy ? "Processing..." : image ? "Image ready — click to replace" : "Upload image"}
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
          />
          <input
            className={`${field} mt-2`}
            value={image.startsWith("data:") ? "" : image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="Or paste an image URL"
          />
          <p className="mt-2 text-[11.5px] text-zinc-500">PNG, JPG or GIF. Images are downscaled to 256px.</p>
        </div>

        {/* Socials */}
        <div>
          <label className="mb-2 block text-[14px] font-semibold text-zinc-100">
            Social links <span className="ml-1 font-normal text-zinc-500">(optional)</span>
          </label>
          <div className="space-y-2">
            <input className={field} value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="X / Twitter link" />
            <input className={field} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website link" />
            <input className={field} value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="Telegram link" />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="mb-2 block text-[14px] font-semibold text-zinc-100">
            Description <span className="ml-1 font-normal text-zinc-500">(optional)</span>
          </label>
          <textarea
            className="min-h-[150px] w-full resize-y rounded-[10px] border border-[#26262b] bg-[#161618] px-4 py-3.5 text-[15px] leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-[#6cf07f]/70 focus:bg-[#1a1a1c]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell people about your token"
          />
        </div>
      </div>

      {/* Base denomination */}
      <div className="mt-5">
        <label className="mb-2 block text-[14px] font-semibold text-zinc-100">Launch denomination</label>
        <div className="flex gap-2">
          {(["chanse", "ansem"] as BaseChoice[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBase(b)}
              style={{ ...POPPINS, fontWeight: 600 }}
              className={`h-14 flex-1 rounded-[10px] px-4 text-[13px] uppercase tracking-[0.06em] transition ${
                base === b ? "bg-[#6cf07f] text-[#0d0d0f]" : "border border-[#26262b] bg-[#161618] text-zinc-400 hover:border-[#3a3a42] hover:text-white"
              }`}
            >
              {b === "chanse" ? "CHANSE" : "ANSEM"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] leading-5 text-zinc-500">
          The curve, buys and sells, and the graduated pool all trade in the chosen asset. The
          platform creation fee is paid in CHANSE either way.
        </p>
      </div>

      {base === "ansem" && (
        <div className="mt-5 ansem-fade-in">
          <label className="mb-2 block text-[14px] font-semibold text-zinc-100">Graduation target (ANSEM)</label>
          <input className={field} value={gradAnsem} onChange={(e) => setGradAnsem(e.target.value)} placeholder="e.g. 50" inputMode="decimal" />
          <p className="mt-2 text-[11.5px] leading-5 text-zinc-500">
            ANSEM launches bypass the CHANSE/USD oracle. Set how much ANSEM the curve raises before graduating.
          </p>
        </div>
      )}

      {/* Team token launch */}
      <div className="mt-6 rounded-[12px] border border-[#26262b] bg-[#161618] p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                style={{ ...POPPINS, fontWeight: 600, fontSize: "13.5px" }}
                className="text-zinc-100"
              >
                Team token launch
              </span>
            </div>
            <p
              style={{ ...POPPINS, fontWeight: 400, fontSize: "12px", lineHeight: "1.5" }}
              className="mt-1 text-zinc-500"
            >
              For an official team or project token. Governance over metadata is
              off.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={teamLaunch}
            aria-label="Team token launch"
            onClick={() => setTeamLaunch(!teamLaunch)}
            className={`relative flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
              teamLaunch ? "bg-[#6cf07f]" : "bg-white/15"
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                teamLaunch ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        {teamLaunch && (
          <p
            style={{ ...POPPINS, fontWeight: 400, fontSize: "11.5px", lineHeight: "1.5" }}
            className="ansem-fade-in mt-3 rounded-[9px] border border-[#6cf07f]/15 bg-[#6cf07f]/[0.05] px-3 py-2 text-zinc-400"
          >
            Holders cannot open proposals to change this token&apos;s metadata
            (name, image, links). Governance over metadata is disabled for team
            launches.
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={!valid}
        onClick={onContinue}
        style={CTA}
        className="mt-7 h-14 w-full rounded-[14px] bg-[#f1f7f3] text-[#0d0d0f] transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {!valid
          ? base === "ansem" && !(Number(gradAnsem) > 0)
            ? "Set a graduation target"
            : "Add a ticker and name"
          : "Review launch"}
      </button>
    </div>
  );
}

// ── Step 5: review ───────────────────────────────────────────────────────────
function ReviewStep({
  name,
  symbol,
  image,
  base,
  gradAnsem,
  teamLaunch,
  attachHorns,
  skimPct,
  ansemPct,
  chansePct,
  selectedHorns,
  connected,
  submitting,
  canSubmit,
  onEditDetails,
  onEditHorns,
  onEditFees,
  onLaunch,
}: {
  name: string;
  symbol: string;
  image: string;
  base: BaseChoice;
  gradAnsem: string;
  teamLaunch: boolean;
  attachHorns: boolean;
  skimPct: number;
  ansemPct: number;
  chansePct: number;
  selectedHorns: Horn[];
  connected: boolean;
  submitting: boolean;
  canSubmit: boolean;
  onEditDetails: () => void;
  onEditHorns: () => void;
  onEditFees: () => void;
  onLaunch: () => void;
}) {
  const ticker = symbol.trim() ? `$${symbol.trim().toUpperCase()}` : "$TICKER";
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <h2 style={HEADING} className="text-center text-white">
        Ready to launch
      </h2>
      <p style={BODY} className="mt-2 text-center text-zinc-400">
        One transaction and {ticker} goes live.
      </p>

      <div className="mt-14 space-y-5">
        {/* Token */}
        <ReviewSection label="Your token" onEdit={onEditDetails}>
          <div className="flex min-w-0 items-center gap-4">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="token" className="h-[72px] w-[72px] shrink-0 rounded-[10px] object-cover" />
            ) : (
              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[10px] bg-black/30 text-zinc-600">
                <Coins size={28} />
              </div>
            )}
            <div className="min-w-0">
              <span style={{ fontFamily: "var(--wiz-sans)" }} className="block truncate text-[18px] font-bold text-white">{ticker}</span>
              <span className="mt-1 block truncate text-[14px] text-zinc-400">{name.trim() || "Your token"}</span>
            </div>
          </div>
        </ReviewSection>

        <ReviewSection label="Launch denomination" onEdit={onEditDetails} compact>
          <div>
            <span className="text-[15px] font-semibold text-zinc-100">{base === "chanse" ? "CHANSE" : "ANSEM"}</span>
            {base === "ansem" && Number(gradAnsem) > 0 && (
              <span className="ml-2 text-[13px] text-zinc-500">Graduates at {gradAnsem} ANSEM</span>
            )}
          </div>
        </ReviewSection>

        <ReviewSection label="Attached Horns" onEdit={onEditHorns} compact>
          {!attachHorns ? (
            <span className="text-[14px] text-zinc-400">None — regular launch</span>
          ) : selectedHorns.length === 0 ? (
            <span className="text-[14px] text-zinc-100">Reward skim only</span>
          ) : (
            <span className="flex flex-wrap gap-2">
              {selectedHorns.map((h) => (
                <span key={h.slug} className="rounded-[7px] border border-[#6cf07f]/30 bg-[#6cf07f]/10 px-2.5 py-1 text-[12px] text-[#9ff5ae]">
                  {h.name}
                </span>
              ))}
            </span>
          )}
        </ReviewSection>

        <ReviewSection label="Token type" onEdit={onEditDetails} compact>
          {teamLaunch ? (
            <span className="text-[14px] text-zinc-100">
              Team launch
              <span className="text-zinc-500"> · metadata governance off</span>
            </span>
          ) : (
            <span className="text-[14px] text-zinc-400">Community · metadata governance on</span>
          )}
        </ReviewSection>

        <ReviewSection label="Fees go to" onEdit={onEditFees} compact>
          {attachHorns ? (
            <div className="text-[14px] text-zinc-100">
              Horn Vault · {skimPct}% of swap fees
              <span className="ml-2 text-zinc-500">{ansemPct}% ANSEM / {chansePct}% CHANSE</span>
            </div>
          ) : (
            <span className="text-[14px] text-zinc-400">No skim — all fees stay in the pool</span>
          )}
        </ReviewSection>

        <div>
          <p className="mb-2 text-[14px] font-semibold text-zinc-100">Ticker availability</p>
          <div className="flex min-h-[58px] items-center rounded-[10px] border border-[#26262b] bg-[#161618] px-4 text-[14px] text-[#6cf07f]">
            <Check size={16} weight="bold" className="mr-2" /> {ticker} is available
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={!canSubmit && connected}
        onClick={onLaunch}
        style={CTA}
        className="mt-12 h-14 w-full rounded-[14px] bg-[#f1f7f3] text-[#0d0d0f] transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {!connected ? "Connect wallet to launch" : submitting ? "Launching..." : `Launch ${ticker}`}
      </button>
      {!canSubmit && connected && !submitting && (
        <p className="mt-2 text-center text-[11.5px] text-zinc-500">
          Add a ticker and name{base === "ansem" ? ", and a graduation target," : ""} to launch.
        </p>
      )}
    </div>
  );
}

function ReviewSection({
  label,
  children,
  onEdit,
  compact = false,
}: {
  label: string;
  children: React.ReactNode;
  onEdit: () => void;
  compact?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-[14px] font-semibold text-zinc-100">{label}</p>
      <div className={`flex items-center justify-between gap-4 rounded-[10px] border border-[#26262b] bg-[#161618] px-4 ${compact ? "min-h-[64px] py-3" : "min-h-[104px] py-4"}`}>
        <div className="min-w-0 flex-1">{children}</div>
        <button type="button" onClick={onEdit} aria-label={`Edit ${label}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white">
          <PencilSimple size={22} weight="bold" />
        </button>
      </div>
    </div>
  );
}
