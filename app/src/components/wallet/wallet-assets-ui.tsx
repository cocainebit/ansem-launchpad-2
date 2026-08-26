"use client";

import type { ReactNode } from "react";
import { Coins, SpinnerGap } from "@phosphor-icons/react";
import { ConnectButton } from "@/components/wallet/connect-button";

export function PageHeader({ title, description, count }: { title: string; description: string; count?: number }) {
  return <header className="rounded-[20px] border border-[#29292d] bg-[#121214] p-7"><div className="flex items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-[-0.03em]">{title}</h1><p className="mt-2 text-sm text-zinc-400">{description}</p></div>{count !== undefined && <span className="text-sm text-zinc-500">{count} {count === 1 ? "asset" : "assets"}</span>}</div></header>;
}

export function ConnectState({ title, description }: { title: string; description: string }) {
  return <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#202024] text-[#6cef4b]"><Coins size={26} /></span><h1 className="mt-5 text-2xl">{title}</h1><p className="mt-2 text-sm text-zinc-500">{description}</p><ConnectButton className="mt-6 h-10 rounded-lg bg-[#6cef4b] px-5 text-[#10250a] hover:bg-[#55d936]" /></div>;
}

export function LoadingState({ label }: { label: string }) { return <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-zinc-500"><SpinnerGap size={20} className="animate-spin" />{label}</div>; }
export function ErrorState({ message }: { message: string }) { return <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-5 text-center text-sm text-red-300">{message}</div>; }
export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex min-h-64 flex-col items-center justify-center rounded-[16px] border border-[#29292d] bg-[#111113] px-6 text-center"><span className="text-zinc-600">{icon}</span><h2 className="mt-3 text-base">{title}</h2><p className="mt-2 text-sm text-zinc-500">{description}</p></div>; }
export function AssetImage({ image, name, fallback }: { image: string | null; name: string; fallback: string }) { return image ? <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[#34343a] bg-[#202024]"><img src={image} alt={name} className="h-full w-full object-cover" /></div> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#34343a] bg-[#202024] text-zinc-500">{fallback}</span>; }
