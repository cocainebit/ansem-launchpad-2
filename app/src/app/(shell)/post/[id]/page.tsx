"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "@phosphor-icons/react";
import { useFloorWallet } from "@/components/wallet/solana-wallet-provider";
import { usePost } from "@/lib/social";
import { PostCard } from "@/components/social/post-card";
import { FeedShell } from "@/components/social/feed-rails";

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const wallet = useFloorWallet();

  const id = useMemo(() => {
    const raw = params.id as string;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [params.id]);

  const post = usePost(id, wallet.address);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["social", "post", id] });
    await qc.invalidateQueries({ queryKey: ["social", "replies", id] });
    await qc.invalidateQueries({ queryKey: ["social", "posts"] });
  }

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/feed");
  }

  return (
    <FeedShell>
      {/* Sticky header with a back affordance */}
      <div className="sticky top-0 z-10 -mx-1 flex items-center gap-4 border-b border-[var(--hairline)] bg-[#161616]/90 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/[0.06]"
        >
          <ArrowLeft size={18} weight="bold" />
        </button>
        <h1 className="font-display text-[18px] font-semibold tracking-tight text-white">Post</h1>
      </div>

      {post.isLoading ? (
        <p className="px-4 py-16 text-center font-sans text-[14px] text-zinc-500">Loading post…</p>
      ) : !post.data ? (
        <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
          <p className="font-sans text-[15px] text-zinc-300">This post could not be found.</p>
          <p className="font-sans text-[13px] text-zinc-600">
            It may have been removed, or the link is incorrect.
          </p>
          <button
            type="button"
            onClick={() => router.push("/feed")}
            className="mt-2 h-9 rounded-lg bg-[#6cf07f] px-4 font-sans text-[13px] font-semibold text-black transition-opacity hover:opacity-90"
          >
            Back to feed
          </button>
        </div>
      ) : (
        <div className="ansem-fade-in">
          <PostCard post={post.data} wallet={wallet} onChanged={refresh} expanded />
        </div>
      )}
    </FeedShell>
  );
}
