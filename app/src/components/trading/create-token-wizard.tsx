"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Inter, Poppins } from "next/font/google";
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
  Sparkle,
  type Icon,
} from "@phosphor-icons/react";
import { useFloorWallet } from "@/components/wallet/solana-wallet-provider";
import { createToken } from "@/lib/ansem/launchpad-tx";
import { resolveTokenAddressFromTx, saveTeamLaunch } from "@/lib/token-meta";
import { HORNS, type Horn } from "@/lib/horns-catalog";
import { BASE_DENOMS } from "@/lib/floorlaunch/config";

// Fonts scoped to the create wizard only, matching app.long.xyz exactly. LONG
// mixes two families: Inter for headings + prose, and Poppins for the chrome
// (buttons, nav, step-item text, small hints). Both are attached via CSS
// variables on the root wrapper's className, never the global layout, so the
// rest of the app keeps its own stack.
const wizSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--wiz-sans",
  display: "swap",
});
const wizPoppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--wiz-poppins",
  display: "swap",
});

// LONG typography tokens, measured off app.long.xyz/create:
// - Heading (Inter 600, 26px, -0.26px tracking, 29.9px line-height)
// - Body / subtitle prose (Inter 400, 15px, 18px line-height)
// - CTA buttons + progress-bar nav labels (Poppins 600, 14px, normal tracking)
// - Step-item + hint text (Poppins; title 600 / sub 400; 14px, ~1.4 line-height)
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
  fontFamily: "var(--wiz-poppins)",
  fontWeight: 600,
  fontSize: "14px",
  letterSpacing: "normal",
};
// Poppins chrome family (weight set per element via className / style).
const POPPINS: React.CSSProperties = { fontFamily: "var(--wiz-poppins)" };
const GREEN = "#6cf07f";

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
// The revolving Horn NFT art (public/horns/ring/NN.png). Swap/extend by editing
// this list only.
const RING_ITEMS: RingEntry[] = [
  { img: "/horns/ring/01.png" },
  { img: "/horns/ring/02.png" },
  { img: "/horns/ring/03.png" },
  { img: "/horns/ring/04.png" },
  { img: "/horns/ring/05.png" },
  { img: "/horns/ring/06.png" },
  { img: "/horns/ring/07.png" },
  { img: "/horns/ring/08.png" },
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
  const [skimPct, setSkimPct] = useState(3);
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
      toast.success("Token launched", {
        id: "launch",
        description: `${symbol.toUpperCase()} is live on its bonding curve.`,
      });
      // Team launch: persist the flag against the freshly minted token address so
      // its page can disable metadata-change governance. Resolve the address from
      // the launch tx's single instantiate event, then sign a small off-chain
      // write. Never let this fault the launch itself.
      if (teamLaunch) {
        try {
          const tokenAddress = await resolveTokenAddressFromTx(hash);
          if (tokenAddress) {
            await saveTeamLaunch(tokenAddress, true, wallet);
          } else {
            toast.message("Launched. Team-launch flag pending", {
              description: "Could not read the new token address; set it later.",
            });
          }
        } catch {
          toast.message("Launched. Team-launch flag not saved", {
            description: "The launch went through; you can set the flag later.",
          });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["tokens"] });
      await wallet.refreshBalance();
      router.push("/");
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
    "h-11 w-full rounded-[8px] border border-white/10 bg-black/30 px-3.5 text-[14px] text-emerald-50 outline-none transition-colors placeholder:text-emerald-100/25 focus:border-[#6cf07f]/60";
  const chansePct = 100 - ansemPct;
  const selectedHorns = COMPOSABLE_HORNS.filter((h) => composite.includes(h.slug));

  return (
    <div
      className={`${wizSans.variable} ${wizPoppins.variable} relative mx-auto w-full max-w-[620px]`}
      style={{ fontFamily: "var(--wiz-sans)" }}
    >
      {/* Uniform LONG-style backdrop rgb(0,15,6), full-bleed, no card boundary */}
      <div aria-hidden className="fixed inset-0 -z-10 bg-[#000f06]" />
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
      <div className="relative">

        {/* Progress bar: Back <prev> on the left, <next> > on the right, green fill */}
        <div className="relative px-5 pt-4 sm:px-7">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goPrev}
              disabled={!prevKey}
              style={CTA}
              className="inline-flex items-center gap-1 text-emerald-100/50 transition-colors hover:text-emerald-50 disabled:pointer-events-none disabled:opacity-0"
            >
              <CaretLeft size={14} weight="bold" />
              Back
              <span className="text-emerald-100/30">{prevKey ? STEP_LABEL[prevKey] : ""}</span>
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!nextKey || (stepKey === "name" && !nameValid)}
              style={CTA}
              className="inline-flex items-center gap-1 text-emerald-100/70 transition-colors hover:text-emerald-50 disabled:pointer-events-none disabled:opacity-0"
            >
              <span className="text-[#6cf07f]">{nextKey ? STEP_LABEL[nextKey] : ""}</span>
              <CaretRight size={14} weight="bold" />
            </button>
          </div>
          <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${progress * 100}%`, background: GREEN, boxShadow: `0 0 12px ${GREEN}66` }}
            />
          </div>
        </div>

        {/* Step body */}
        <div key={stepKey} className="ansem-fade-in px-5 py-8 sm:px-9 sm:py-10">
          {stepKey === "intro" && (
            <IntroStep
              onChoose={() => {
                setAttachHorns(true);
                setStepKey("horn");
              }}
              onSkip={() => {
                setAttachHorns(false);
                setComposite([]);
                setStepKey("name");
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
              onContinue={() => setStepKey("skim")}
              onNoHorn={() => {
                setAttachHorns(false);
                setComposite([]);
                setStepKey("name");
              }}
            />
          )}

          {stepKey === "skim" && (
            <SkimStep
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
              onLaunch={submit}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: intro ────────────────────────────────────────────────────────────
function IntroStep({ onChoose, onSkip }: { onChoose: () => void; onSkip: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Circular collage of revolving Horn NFT art. The ring container slowly
          revolves; each mark counter-rotates to stay upright. */}
      <div className="relative mb-4 h-[236px] w-[236px]">
        <div aria-hidden className="absolute inset-0 rounded-full border border-white/[0.04]" />
        <div
          aria-hidden
          className="absolute inset-[82px] rounded-full border border-[#6cf07f]/15"
          style={{ background: "radial-gradient(circle, rgba(108,240,127,0.10), transparent 70%)" }}
        />
        <div aria-hidden className="wiz-orbit absolute inset-0">
          {RING.map((item, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2"
              style={{ transform: `translate(calc(-50% + ${item.x}px), calc(-50% + ${item.y}px))` }}
            >
              <span className="wiz-orbit-item flex h-16 w-16 items-center justify-center text-emerald-100/60">
                {item.img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.img}
                    alt=""
                    className="h-full w-full rounded-lg object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.55)]"
                  />
                ) : item.icon ? (
                  <item.icon size={24} weight="regular" />
                ) : null}
              </span>
            </span>
          ))}
        </div>
      </div>

      <h1 style={HEADING} className="text-white">
        Launch a coin
      </h1>
      <p style={BODY} className="mt-2 max-w-[380px] text-emerald-100/55">
        A fair-launch bonding curve on ANSEM. Bolt on a Horn to reshape how your pool trades
        and pays holders, or launch a plain coin. A Horn is optional.
      </p>

      <ol className="mt-4 w-full max-w-[400px] space-y-2 text-left">
        {[
          { t: "Pick a Horn", s: "Optional hooks that skim fees and reprice the pool." },
          { t: "Launch your coin on top of it", s: "Name it, fund the curve, graduate to the AMM." },
        ].map((it, i) => (
          <li key={i} className="flex items-start gap-3 rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
            <span
              style={{ ...POPPINS, fontWeight: 600 }}
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#6cf07f]/15 text-[12px] text-[#6cf07f]"
            >
              {i + 1}
            </span>
            <div>
              <p style={{ ...POPPINS, fontWeight: 600, fontSize: "14px", lineHeight: "1.4" }} className="text-emerald-50">{it.t}</p>
              <p style={{ ...POPPINS, fontWeight: 400, fontSize: "14px", lineHeight: "1.4" }} className="mt-0.5 text-emerald-100/45">{it.s}</p>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onChoose}
        style={CTA}
        className="mt-5 inline-flex h-12 w-full max-w-[400px] items-center justify-center gap-2 rounded-[10px] bg-[#6cf07f] text-[#04160b] transition-transform hover:brightness-105 active:scale-[0.99]"
      >
        <Sparkle size={17} weight="fill" />
        Choose a Horn
      </button>
      <button
        type="button"
        onClick={onSkip}
        style={{ ...POPPINS, fontWeight: 500, fontSize: "14px" }}
        className="mt-2 text-emerald-100/45 underline-offset-4 transition-colors hover:text-emerald-100/80 hover:underline"
      >
        Launch without a Horn
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
  onContinue,
  onNoHorn,
}: {
  query: string;
  setQuery: (v: string) => void;
  composite: string[];
  toggleHorn: (slug: string) => void;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  onContinue: () => void;
  onNoHorn: () => void;
}) {
  const q = query.trim().toLowerCase();
  const match = (h: Horn) =>
    !q ||
    h.name.toLowerCase().includes(q) ||
    h.tagline.toLowerCase().includes(q) ||
    h.blurb.toLowerCase().includes(q);
  const featured = COMPOSABLE_HORNS.filter((h) => FEATURED.includes(h.slug));

  return (
    <div>
      <h2 style={HEADING} className="text-white">
        Pick your Horn
      </h2>
      <p style={BODY} className="mt-2 text-emerald-100/55">
        It reshapes how your pool trades and pays holders. Stack a few, or pick one solo Horn.
      </p>
      <p style={{ ...POPPINS, fontWeight: 400, fontSize: "13px", lineHeight: "1.4" }} className="mt-3 flex items-start gap-2 rounded-[9px] border border-[#6cf07f]/15 bg-[#6cf07f]/[0.05] px-3 py-2 text-emerald-100/55">
        <ShieldCheck size={15} weight="fill" className="mt-[1px] shrink-0 text-[#6cf07f]/80" />
        At most one pricing Horn and one fee Horn. Some Horns run solo, so picking one can replace another.
      </p>

      {/* Search */}
      <div className="relative mt-5">
        <MagnifyingGlass size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-100/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Horns..."
          className="h-11 w-full rounded-[10px] border border-white/10 bg-black/30 pl-10 pr-3.5 text-[14px] text-emerald-50 outline-none placeholder:text-emerald-100/25 focus:border-[#6cf07f]/60"
        />
      </div>

      {/* Quick pick */}
      {!q && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100/35">Quick pick</p>
          <div className="flex flex-wrap gap-2">
            {featured.map((h) => {
              const Ic = hornIcon(h.slug);
              const on = composite.includes(h.slug);
              return (
                <button
                  key={h.slug}
                  type="button"
                  onClick={() => toggleHorn(h.slug)}
                  style={{ ...POPPINS, fontWeight: 500, fontSize: "13px" }}
                  className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 transition-colors ${
                    on
                      ? "border-[#6cf07f]/60 bg-[#6cf07f]/12 text-[#9ff5ae]"
                      : "border-white/10 bg-white/[0.02] text-emerald-100/70 hover:border-white/20 hover:text-emerald-50"
                  }`}
                >
                  <Ic size={16} weight={on ? "fill" : "regular"} />
                  {h.name}
                  {on && <Check size={14} weight="bold" className="text-[#6cf07f]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Category groups */}
      <div className="mt-6 space-y-6">
        {PICKER_GROUPS.map((grp) => {
          const rows = COMPOSABLE_HORNS.filter((h) => h.category === grp.category && match(h));
          if (rows.length === 0) return null;
          return (
            <div key={grp.label}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100/35">
                {grp.label}
              </p>
              <div className="space-y-2">
                {rows.map((h) => (
                  <HornRow
                    key={h.slug}
                    horn={h}
                    selected={composite.includes(h.slug)}
                    open={expanded === h.slug}
                    onToggleSelect={() => toggleHorn(h.slug)}
                    onToggleOpen={() => setExpanded(expanded === h.slug ? null : h.slug)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer nav */}
      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          onClick={onContinue}
          style={CTA}
          className="h-12 w-full rounded-[10px] bg-[#6cf07f] text-[#04160b] transition hover:brightness-105 active:scale-[0.99]"
        >
          {composite.length > 0
            ? `Continue with ${composite.length} ${composite.length === 1 ? "Horn" : "Horns"}`
            : "Continue with the reward skim"}
        </button>
        <button
          type="button"
          onClick={onNoHorn}
          style={{ ...POPPINS, fontWeight: 500, fontSize: "14px" }}
          className="text-emerald-100/45 underline-offset-4 transition-colors hover:text-emerald-100/80 hover:underline"
        >
          No Horn, launch a regular coin
        </button>
      </div>
    </div>
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
  const Ic = hornIcon(horn.slug);
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
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] transition-colors ${
              selected ? "bg-[#6cf07f] text-[#04160b]" : "bg-black/40 text-emerald-100/55"
            }`}
          >
            <Ic size={20} weight={selected ? "fill" : "regular"} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span style={{ ...POPPINS, fontWeight: 600, fontSize: "14px" }} className="truncate text-emerald-50">
                {horn.name}
              </span>
              {solo && (
                <span className="rounded-[4px] bg-white/10 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-emerald-100/60">
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
            <span style={{ ...POPPINS, fontWeight: 400, fontSize: "12.5px" }} className="mt-0.5 block truncate text-emerald-100/45">{horn.tagline}</span>
          </span>
        </button>

        {/* Select checkbox */}
        <button
          type="button"
          onClick={onToggleSelect}
          aria-label={selected ? "Deselect Horn" : "Select Horn"}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
            selected ? "border-[#6cf07f] bg-[#6cf07f] text-[#04160b]" : "border-white/20 text-transparent"
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
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-emerald-100/40 transition-colors hover:bg-white/5 hover:text-emerald-50"
        >
          <CaretDown size={15} weight="bold" className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="ansem-fade-in border-t border-white/[0.06] px-3 pb-3.5 pt-3">
          <p className="text-[12.5px] leading-5 text-emerald-100/60">{horn.blurb}</p>
          <p className="mt-2 text-[12px] font-medium text-[#6cf07f]/90">{changesLine(horn.category)}</p>
          <ul className="mt-2 space-y-1">
            {horn.points.slice(0, 2).map((p, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] leading-4 text-emerald-100/40">
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
  skimPct,
  setSkimPct,
  ansemPct,
  setAnsemPct,
  chansePct,
  onContinue,
}: {
  skimPct: number;
  setSkimPct: (v: number) => void;
  ansemPct: number;
  setAnsemPct: (v: number) => void;
  chansePct: number;
  onContinue: () => void;
}) {
  const skimBps = Math.round(skimPct * 100);
  return (
    <div>
      <h2 style={HEADING} className="text-white">
        Who gets the fees?
      </h2>
      <p style={BODY} className="mt-2 text-emerald-100/55">
        On ANSEM the skim goes to the Horn Vault, not a personal wallet. Stakers of ANSEM and
        CHANSE earn it. Set how much to skim and how to split the two sinks.
      </p>

      <div className="mt-6 rounded-[14px] border border-white/[0.07] bg-white/[0.02] p-5">
        {/* Skim slider */}
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-emerald-100/60">Skim to Horn Vault</span>
          <span style={{ ...POPPINS, fontWeight: 600 }} className="text-[#6cf07f]">{skimPct}% of swap fees</span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={skimPct}
          onChange={(e) => setSkimPct(Number(e.target.value))}
          className="ansem-range mt-3 w-full"
          aria-label="Skim percentage"
        />
        <p className="mt-2 text-[11.5px] text-emerald-100/40">
          {skimBps} bps of every swap fee is skimmed to the Vault when your coin graduates.
        </p>

        {/* Split */}
        <div className="mt-6 flex items-center justify-between text-[13px]">
          <span className="text-emerald-100/60">Sink split</span>
          <span style={{ ...POPPINS, fontWeight: 600 }}>
            <span className="text-[#6cf07f]">{ansemPct}%</span>
            <span className="text-emerald-100/40"> ANSEM / </span>
            <span className="text-[#8ab4ff]">{chansePct}%</span>
            <span className="text-emerald-100/40"> CHANSE</span>
          </span>
        </div>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
          <span style={{ width: `${ansemPct}%`, background: "#6cf07f" }} className="block h-full" />
          <span style={{ width: `${chansePct}%`, background: "#8ab4ff" }} className="block h-full" />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={ansemPct}
          onChange={(e) => setAnsemPct(Number(e.target.value))}
          className="ansem-range mt-3 w-full"
          aria-label="ANSEM share of the skim"
        />
      </div>

      <p className="mt-4 text-[11.5px] leading-5 text-emerald-100/40">
        Horns is in preview; the skim activates with the Horns program. Until then a Horn coin
        launches normally and the config is recorded for graduation.
      </p>

      <button
        type="button"
        onClick={onContinue}
        style={CTA}
        className="mt-7 h-12 w-full rounded-[10px] bg-[#6cf07f] text-[#04160b] transition hover:brightness-105 active:scale-[0.99]"
      >
        Next: name your token
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
    <div>
      <h2 style={HEADING} className="text-white">
        Name your token
      </h2>
      <p style={BODY} className="mt-2 text-emerald-100/55">
        This is how your coin shows up everywhere. Ticker and name are required.
      </p>

      {/* Live preview card */}
      <div className="mt-5 flex items-center gap-3.5 rounded-[14px] border border-[#6cf07f]/15 bg-[#6cf07f]/[0.04] p-4">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="token" className="h-14 w-14 shrink-0 rounded-[12px] object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[12px] bg-black/40 text-emerald-100/30">
            <Coins size={24} />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span style={{ fontFamily: "var(--wiz-sans)" }} className="truncate text-[17px] font-bold text-white">{ticker}</span>
            <span className="truncate text-[13px] text-emerald-100/50">{name.trim() || "Your token"}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <span className="rounded-[5px] border border-white/10 bg-black/30 px-1.5 py-0.5 text-emerald-100/50">
              Bonding curve
            </span>
            <span className="text-emerald-100/40">
              trades in {base === "chanse" ? "CHANSE" : "ANSEM"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-emerald-100/60">Ticker</label>
          <input className={field} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="MTK" maxLength={12} />
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-emerald-100/60">Name</label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="My Token" />
        </div>
      </div>

      {/* Image */}
      <div className="mt-4">
        <label className="mb-1.5 block text-[12.5px] font-medium text-emerald-100/60">Image</label>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
          className={`flex cursor-pointer items-center gap-4 rounded-[12px] border border-dashed px-4 py-4 transition ${
            dragOver ? "border-[#6cf07f] bg-[#6cf07f]/10" : "border-white/15 bg-black/20 hover:border-white/25"
          }`}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="token" className="h-12 w-12 shrink-0 rounded-[10px] object-cover" />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-black/40 text-emerald-100/40">
              <Plus size={20} />
            </div>
          )}
          <div className="min-w-0 text-[13px]">
            <p className="font-medium text-emerald-50">
              {imgBusy ? "Processing..." : image ? "Image ready, click to replace" : "Drag and drop or click to upload"}
            </p>
            <p className="mt-0.5 text-[11.5px] text-emerald-100/40">PNG, JPG or GIF. Downscaled to 256px and stored with the token.</p>
          </div>
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
          placeholder="...or paste an image URL"
        />
      </div>

      {/* Description */}
      <div className="mt-4">
        <label className="mb-1.5 block text-[12.5px] font-medium text-emerald-100/60">Description</label>
        <textarea
          className="w-full resize-none rounded-[8px] border border-white/10 bg-black/30 px-3.5 py-3 text-[14px] text-emerald-50 outline-none placeholder:text-emerald-100/25 focus:border-[#6cf07f]/60"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this token? (optional)"
        />
      </div>

      {/* Socials */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <input className={field} value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="Twitter" />
        <input className={field} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" />
        <input className={field} value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="Telegram" />
      </div>

      {/* Base denomination */}
      <div className="mt-6">
        <label className="mb-1.5 block text-[12.5px] font-medium text-emerald-100/60">Launch denomination</label>
        <div className="flex gap-2">
          {(["chanse", "ansem"] as BaseChoice[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBase(b)}
              style={{ ...POPPINS, fontWeight: 600 }}
              className={`flex-1 rounded-[9px] px-4 py-3 text-[13px] uppercase tracking-[0.06em] transition ${
                base === b ? "bg-[#6cf07f] text-[#04160b]" : "border border-white/10 bg-black/30 text-emerald-100/55 hover:text-white"
              }`}
            >
              {b === "chanse" ? "CHANSE" : "ANSEM"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] leading-5 text-emerald-100/40">
          The curve, buys and sells, and the graduated pool all trade in the chosen asset. The
          platform creation fee is paid in CHANSE either way.
        </p>
      </div>

      {base === "ansem" && (
        <div className="mt-4 ansem-fade-in">
          <label className="mb-1.5 block text-[12.5px] font-medium text-emerald-100/60">Graduation target (ANSEM)</label>
          <input className={field} value={gradAnsem} onChange={(e) => setGradAnsem(e.target.value)} placeholder="e.g. 50" inputMode="decimal" />
          <p className="mt-2 text-[11.5px] leading-5 text-emerald-100/40">
            ANSEM launches bypass the CHANSE/USD oracle. Set how much ANSEM the curve raises before graduating.
          </p>
        </div>
      )}

      {/* Team token launch */}
      <div className="mt-6 rounded-[12px] border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} weight="fill" className="shrink-0 text-[#6cf07f]/80" />
              <span
                style={{ ...POPPINS, fontWeight: 600, fontSize: "13.5px" }}
                className="text-emerald-50"
              >
                Team token launch
              </span>
            </div>
            <p
              style={{ ...POPPINS, fontWeight: 400, fontSize: "12px", lineHeight: "1.5" }}
              className="mt-1 text-emerald-100/45"
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
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              teamLaunch ? "bg-[#6cf07f]" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                teamLaunch ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        {teamLaunch && (
          <p
            style={{ ...POPPINS, fontWeight: 400, fontSize: "11.5px", lineHeight: "1.5" }}
            className="ansem-fade-in mt-3 rounded-[9px] border border-[#6cf07f]/15 bg-[#6cf07f]/[0.05] px-3 py-2 text-emerald-100/55"
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
        className="mt-7 h-12 w-full rounded-[10px] bg-[#6cf07f] text-[#04160b] transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
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
  onLaunch: () => void;
}) {
  const ticker = symbol.trim() ? `$${symbol.trim().toUpperCase()}` : "$TICKER";
  return (
    <div>
      <h2 style={HEADING} className="text-white">
        Ready to launch
      </h2>
      <p style={BODY} className="mt-2 text-emerald-100/55">
        Check the details. This deploys the bonding curve on-chain and cannot be edited after.
      </p>

      <div className="mt-6 space-y-3">
        {/* Token */}
        <div className="flex items-center gap-3.5 rounded-[14px] border border-white/[0.07] bg-white/[0.02] p-4">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="token" className="h-14 w-14 shrink-0 rounded-[12px] object-cover" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[12px] bg-black/40 text-emerald-100/30">
              <Coins size={24} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span style={{ fontFamily: "var(--wiz-sans)" }} className="truncate text-[18px] font-bold text-white">{ticker}</span>
              <span className="truncate text-[13px] text-emerald-100/50">{name.trim() || "Your token"}</span>
            </div>
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#6cf07f]">
              <Check size={12} weight="bold" /> Ticker looks available
            </span>
          </div>
        </div>

        <SummaryRow label="Base denomination">
          <span className="text-emerald-50">{base === "chanse" ? "CHANSE" : "ANSEM"}</span>
          {base === "ansem" && Number(gradAnsem) > 0 && (
            <span className="text-emerald-100/40"> · graduates at {gradAnsem} ANSEM</span>
          )}
        </SummaryRow>

        <SummaryRow label="Attached Horns">
          {!attachHorns ? (
            <span className="text-emerald-100/45">None, regular launch</span>
          ) : selectedHorns.length === 0 ? (
            <span className="text-emerald-50">Reward skim only</span>
          ) : (
            <span className="flex flex-wrap gap-1.5">
              {selectedHorns.map((h) => (
                <span key={h.slug} className="rounded-[6px] border border-[#6cf07f]/30 bg-[#6cf07f]/10 px-2 py-0.5 text-[12px] text-[#9ff5ae]">
                  {h.name}
                </span>
              ))}
            </span>
          )}
        </SummaryRow>

        <SummaryRow label="Token type">
          {teamLaunch ? (
            <span className="text-emerald-50">
              Team launch
              <span className="text-emerald-100/40"> · metadata governance off</span>
            </span>
          ) : (
            <span className="text-emerald-100/45">Community, metadata governance on</span>
          )}
        </SummaryRow>

        <SummaryRow label="Skim">
          {attachHorns ? (
            <span className="text-emerald-50">
              {skimPct}% of swap fees
              <span className="text-emerald-100/40">
                {" "}· {ansemPct}% ANSEM / {chansePct}% CHANSE
              </span>
            </span>
          ) : (
            <span className="text-emerald-100/45">No skim, all fees stay in the pool</span>
          )}
        </SummaryRow>
      </div>

      <button
        type="button"
        disabled={!canSubmit && connected}
        onClick={onLaunch}
        style={CTA}
        className="mt-7 h-13 w-full rounded-[10px] bg-[#6cf07f] py-3.5 text-[#04160b] transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {!connected ? "Connect wallet to launch" : submitting ? "Launching..." : `Launch ${ticker}`}
      </button>
      {!canSubmit && connected && !submitting && (
        <p className="mt-2 text-center text-[11.5px] text-emerald-100/40">
          Add a ticker and name{base === "ansem" ? ", and a graduation target," : ""} to launch.
        </p>
      )}
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 text-[13px]">
      <span className="shrink-0 text-emerald-100/45">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
