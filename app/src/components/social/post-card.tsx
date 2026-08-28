"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChatCircle,
  Repeat,
  Heart,
  ShareNetwork,
  Quotes,
} from "@phosphor-icons/react";
import { useFloorWallet } from "@/components/wallet/solana-wallet-provider";
import {
  useProfile,
  useLikePost,
  useRepostPost,
  usePostReplies,
  addPostReply,
  type Post,
} from "@/lib/social";
import { Avatar, short, ago, errMsg, TokenPreviewBanner, PostIdentity } from "@/components/social/shared";
import { PostComposer } from "@/components/social/post-composer";

const REPLY_MAX = 500;
type Wallet = ReturnType<typeof useFloorWallet>;

/**
 * Twitter/X-style post row. NOT a bordered card: rows are separated by a hairline
 * bottom border by the list that renders them. Header inline, then body, then any
 * image / token preview / quoted embed, then the action row.
 */
export function PostCard({
  post,
  wallet,
  onChanged,
}: {
  post: Post;
  wallet: Wallet;
  onChanged?: () => Promise<void> | void;
}) {
  const profile = useProfile(post.author);
  const qc = useQueryClient();
  const p = profile.data ?? {};
  const name = p.displayName || (p.username ? `@${p.username}` : short(post.author));

  const likeM = useLikePost(wallet.address);
  const repostM = useRepostPost(wallet.address);
  const [showReplies, setShowReplies] = useState(false);
  const [repostMenu, setRepostMenu] = useState(false);
  const [quoting, setQuoting] = useState(false);

  function requireWallet(): boolean {
    if (!wallet.address) {
      toast.error("Connect your wallet first.");
      return false;
    }
    return true;
  }

  function onLike() {
    if (!requireWallet()) return;
    likeM.mutate(
      { postId: post.id, like: !post.viewerLiked, signer: wallet },
      { onError: (e) => toast.error("Could not like", { description: errMsg(e) }) },
    );
  }

  function onRepost() {
    setRepostMenu(false);
    if (!requireWallet()) return;
    repostM.mutate(
      { postId: post.id, repost: !post.viewerReposted, signer: wallet },
      { onError: (e) => toast.error("Could not repost", { description: errMsg(e) }) },
    );
  }

  function onQuote() {
    setRepostMenu(false);
    if (!requireWallet()) return;
    setQuoting(true);
  }

  async function onShare() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/feed#${post.id}`
        : `/feed#${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  async function refreshReplies() {
    await qc.invalidateQueries({ queryKey: ["social", "replies", post.id] });
    await qc.invalidateQueries({ queryKey: ["social", "posts"] });
  }

  return (
    <div className="ansem-fade-in flex gap-3 border-b border-[var(--hairline)] px-1 py-4">
      <Link href={`/creator/${post.author}`} className="shrink-0" aria-label={`${name}'s profile`}>
        <Avatar src={p.avatar} className="h-10 w-10" iconSize={20} />
      </Link>
      <div className="min-w-0 flex-1">
        <PostIdentity profile={p} address={post.author} createdAt={post.createdAt} />

        {post.text && (
          <p className="mt-0.5 whitespace-pre-wrap break-words font-sans text-[14px] leading-6 text-zinc-200">
            {post.text}
          </p>
        )}

        {/* Inline image */}
        {post.image && (
          <Link
            href={`/creator/${post.author}`}
            className="mt-2 block w-fit"
            onClick={(e) => e.preventDefault()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.image}
              alt=""
              className="max-h-[420px] w-full rounded-xl border border-[var(--hairline)] object-cover"
            />
          </Link>
        )}

        {/* Token preview banner */}
        {post.token && <TokenPreviewBanner address={post.token} />}

        {/* Quoted post embed */}
        {post.quoted && <QuotedPost post={post.quoted} />}

        {/* Action row */}
        <div className="relative mt-2 flex items-center gap-1 text-zinc-500">
          <ActionButton
            icon={<ChatCircle size={17} weight="regular" />}
            count={post.replyCount}
            label="Reply"
            active={showReplies}
            activeClass="text-[#6cf07f]"
            onClick={() => setShowReplies((s) => !s)}
          />

          <div className="relative">
            <ActionButton
              icon={<Repeat size={17} weight={post.viewerReposted ? "bold" : "regular"} />}
              count={post.repostCount}
              label="Repost"
              active={Boolean(post.viewerReposted)}
              activeClass="text-[#6cf07f]"
              busy={repostM.isPending}
              onClick={() => setRepostMenu((o) => !o)}
            />
            {repostMenu && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label="Close menu"
                  onClick={() => setRepostMenu(false)}
                />
                <div className="ansem-fade-in absolute left-0 top-9 z-20 w-40 overflow-hidden rounded-lg border border-[var(--hairline)] bg-[#1c1c1e] py-1 shadow-xl">
                  <button
                    type="button"
                    onClick={onRepost}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left font-sans text-[13px] text-zinc-200 hover:bg-[#232326]"
                  >
                    <Repeat size={15} weight="regular" />
                    {post.viewerReposted ? "Undo repost" : "Repost"}
                  </button>
                  <button
                    type="button"
                    onClick={onQuote}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left font-sans text-[13px] text-zinc-200 hover:bg-[#232326]"
                  >
                    <Quotes size={15} weight="regular" />
                    Quote
                  </button>
                </div>
              </>
            )}
          </div>

          <ActionButton
            icon={<Heart size={17} weight={post.viewerLiked ? "fill" : "regular"} />}
            count={post.likeCount}
            label="Like"
            active={Boolean(post.viewerLiked)}
            activeClass="text-[#ff5b5b]"
            busy={likeM.isPending}
            onClick={onLike}
          />
          <ActionButton
            icon={<ShareNetwork size={17} weight="regular" />}
            label="Share"
            active={false}
            activeClass="text-[#6cf07f]"
            onClick={() => void onShare()}
          />
        </div>

        {/* Inline quote composer */}
        {quoting && (
          <div className="ansem-fade-in mt-2">
            <PostComposer
              wallet={wallet}
              quoteOf={post}
              autoFocus
              placeholder="Add a comment"
              onCancel={() => setQuoting(false)}
              onPosted={async () => {
                setQuoting(false);
                await onChanged?.();
              }}
            />
          </div>
        )}

        {/* Replies */}
        {showReplies && <ReplyPanel post={post} wallet={wallet} onReplied={refreshReplies} />}
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  count,
  label,
  active,
  activeClass,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  count?: number;
  label: string;
  active: boolean;
  activeClass: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      className={`group flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[12px] tabular-nums transition-colors hover:bg-[#232326] disabled:opacity-50 ${
        active ? activeClass : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {icon}
      {count ? <span>{count}</span> : null}
    </button>
  );
}

/* ---------------- quoted post (rendered inside a card) ---------------- */

function QuotedPost({ post }: { post: Post }) {
  const profile = useProfile(post.author);
  const p = profile.data ?? {};
  const name = p.displayName || (p.username ? `@${p.username}` : short(post.author));

  return (
    <Link
      href={`/creator/${post.author}`}
      className="mt-2 block rounded-xl border border-[var(--hairline)] bg-[#161616] p-3 transition-colors hover:border-[var(--hairline-strong)]"
    >
      <div className="flex items-center gap-1.5">
        <Avatar src={p.avatar} className="h-5 w-5" iconSize={11} />
        <span className="truncate font-sans text-[13px] font-semibold text-zinc-200">{name}</span>
        <span className="text-[12px] text-zinc-600">·</span>
        <span className="font-mono text-[12px] text-zinc-600">{ago(post.createdAt)}</span>
      </div>
      {post.text && (
        <p className="mt-1 whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-zinc-300">
          {post.text}
        </p>
      )}
      {post.image && (
        <div className="mt-2 w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image}
            alt=""
            className="max-h-[220px] rounded-lg border border-[var(--hairline)] object-cover"
          />
        </div>
      )}
      {post.token && <TokenPreviewBanner address={post.token} size="sm" />}
    </Link>
  );
}

/* ---------------- reply panel ---------------- */

function ReplyPanel({
  post,
  wallet,
  onReplied,
}: {
  post: Post;
  wallet: Wallet;
  onReplied: () => Promise<void> | void;
}) {
  const replies = usePostReplies(post.id);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const trimmed = text.trim();
  const over = text.length > REPLY_MAX;

  async function send() {
    if (!wallet.address) {
      toast.error("Connect your wallet to reply.");
      return;
    }
    if (!trimmed || over) return;
    setBusy(true);
    try {
      await addPostReply(post.id, wallet.address, trimmed, wallet);
      setText("");
      await onReplied();
    } catch (e) {
      toast.error("Could not reply", { description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  const list = [...(replies.data ?? [])].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="ansem-fade-in mt-3 rounded-lg border border-[var(--hairline)] bg-[#161616] p-3">
      {wallet.address ? (
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Post your reply"
            rows={2}
            maxLength={REPLY_MAX}
            disabled={busy}
            aria-label="Compose a reply"
            className="min-w-0 flex-1 resize-none bg-transparent text-[13px] leading-5 text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <div className="flex flex-col items-end justify-between">
            <span
              className={`font-mono text-[10px] tabular-nums ${over ? "text-[#ff5b5b]" : "text-zinc-600"}`}
            >
              {text.length}/{REPLY_MAX}
            </span>
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !trimmed || over}
              className="h-7 rounded-md bg-[#6cf07f] px-3 font-sans text-[12px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Signing…" : "Reply"}
            </button>
          </div>
        </div>
      ) : (
        <p className="font-sans text-[12px] text-zinc-500">Connect your wallet to reply.</p>
      )}

      <div className="mt-3 space-y-3">
        {replies.isLoading ? (
          <p className="font-sans text-[12px] text-zinc-600">Loading replies…</p>
        ) : list.length === 0 ? (
          <p className="font-sans text-[12px] text-zinc-600">No replies yet.</p>
        ) : (
          list.map((r) => <ReplyRow key={r.id} reply={r} />)
        )}
      </div>
    </div>
  );
}

function ReplyRow({ reply }: { reply: Post }) {
  const profile = useProfile(reply.author);
  const p = profile.data ?? {};
  const name = p.displayName || (p.username ? `@${p.username}` : short(reply.author));
  return (
    <div className="ansem-fade-in flex gap-2.5">
      <Link href={`/creator/${reply.author}`} className="shrink-0">
        <Avatar src={p.avatar} className="h-7 w-7" iconSize={14} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <Link
            href={`/creator/${reply.author}`}
            className="truncate font-sans text-[13px] font-semibold text-zinc-200 hover:underline"
          >
            {name}
          </Link>
          <span className="font-mono text-[11px] text-zinc-600">{ago(reply.createdAt)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-zinc-300">
          {reply.text}
        </p>
      </div>
    </div>
  );
}
