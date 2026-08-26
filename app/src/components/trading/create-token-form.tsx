"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFloorWallet } from "@/components/wallet/solana-wallet-provider";
import { createToken } from "@/lib/ansem/launchpad-tx";
import { BASE_DENOMS } from "@/lib/floorlaunch/config";

type BaseChoice = "chanse" | "ansem";

/**
 * Downscale an uploaded image to a small square and return a JPEG data URL.
 * The launchpad stores this string on-chain as the token image, so it must be
 * compact: we cap it at 256px and re-encode so it renders everywhere with no
 * external host required.
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

export function CreateTokenForm() {
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
  const [gradAnsem, setGradAnsem] = useState(""); // ANSEM graduation target (whole ANSEM)
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const canSubmit = useMemo(
    () =>
      Boolean(wallet.connected) &&
      !submitting &&
      name.trim().length > 0 &&
      symbol.trim().length > 0 &&
      description.trim().length > 0 &&
      (base === "chanse" || Number(gradAnsem) > 0),
    [wallet.connected, submitting, name, symbol, description, base, gradAnsem],
  );

  async function submit() {
    if (!wallet.address) {
      await wallet.connect();
      return;
    }
    setSubmitting(true);
    toast.loading("Confirm the launch in your wallet…", { id: "launch" });
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
          base === "ansem"
            ? String(Math.round(Number(gradAnsem) * 1_000_000))
            : undefined,
      });
      toast.success("Token launched", {
        id: "launch",
        description: `${symbol.toUpperCase()} is live on its bonding curve.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["tokens"] });
      await wallet.refreshBalance();
      router.push("/");
      void hash;
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
    "h-11 w-full rounded-xl border border-[#29292d] bg-[#161618] px-4 text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#16a34a]";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-[13px] font-medium text-zinc-400">Name</label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="My Token" />
        </div>
        <div>
          <label className="mb-2 block text-[13px] font-medium text-zinc-400">Symbol</label>
          <input className={field} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="MTK" maxLength={12} />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-[13px] font-medium text-zinc-400">Image</label>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFile(e.dataTransfer.files?.[0]); }}
          className={`flex cursor-pointer items-center gap-4 rounded-xl border border-dashed px-4 py-4 transition ${
            dragOver ? "border-[#16a34a] bg-[#16a34a]/10" : "border-[#3a3a40] bg-[#161618] hover:border-[#4a4a52]"
          }`}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="token" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#202023] text-[22px] text-zinc-600">＋</div>
          )}
          <div className="min-w-0 text-[13px]">
            <p className="font-medium text-zinc-200">
              {imgBusy ? "Processing…" : image ? "Image ready — click to replace" : "Drag & drop or click to upload"}
            </p>
            <p className="mt-0.5 text-[12px] text-zinc-500">PNG, JPG or GIF. Downscaled to 256px and stored with the token.</p>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ""; }}
        />
        <input
          className={`${field} mt-2`}
          value={image.startsWith("data:") ? "" : image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="…or paste an image URL"
        />
      </div>

      <div>
        <label className="mb-2 block text-[13px] font-medium text-zinc-400">Description</label>
        <textarea
          className="w-full resize-none rounded-xl border border-[#29292d] bg-[#161618] px-4 py-3 text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#16a34a]"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this token?"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <input className={field} value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="Twitter (optional)" />
        <input className={field} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website (optional)" />
        <input className={field} value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="Telegram (optional)" />
      </div>

      <div>
        <label className="mb-2 block text-[13px] font-medium text-zinc-400">Launch denomination</label>
        <div className="flex gap-2">
          {(["chanse", "ansem"] as BaseChoice[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBase(b)}
              className={`flex-1 rounded-xl px-4 py-3 text-[14px] font-semibold transition ${
                base === b
                  ? "bg-[#16a34a] text-white"
                  : "border border-[#29292d] bg-[#161618] text-zinc-300 hover:text-white"
              }`}
            >
              {b === "chanse" ? "CHANSE" : "ANSEM"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-zinc-500">
          The bonding curve, buys and sells, and the graduated pool all trade in the
          chosen asset. The platform creation fee is paid in CHANSE either way.
        </p>
      </div>

      {base === "ansem" ? (
        <div>
          <label className="mb-2 block text-[13px] font-medium text-zinc-400">
            Graduation target (ANSEM)
          </label>
          <input
            className={field}
            value={gradAnsem}
            onChange={(e) => setGradAnsem(e.target.value)}
            placeholder="e.g. 50"
            inputMode="decimal"
          />
          <p className="mt-2 text-[12px] text-zinc-500">
            ANSEM launches bypass the CHANSE/USD oracle — set how much ANSEM the curve
            raises before graduating to the AMM.
          </p>
        </div>
      ) : null}

      <button
        type="button"
        disabled={!canSubmit && wallet.connected}
        onClick={submit}
        className="mt-1 h-12 rounded-xl bg-[#16a34a] text-[15px] font-bold text-white transition hover:bg-[#15803d] disabled:opacity-40"
      >
        {!wallet.connected
          ? "Connect wallet"
          : submitting
            ? "Launching…"
            : "Launch token"}
      </button>
    </div>
  );
}
