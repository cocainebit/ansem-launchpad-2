"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SocialSignature } from "@/components/wallet/solana-wallet-provider";
import {
  postSignAction,
  editProfileSignAction,
  followSignAction,
  likeSignAction,
  repostSignAction,
  commentSignAction,
  replySignAction,
} from "@/lib/social-sign";

/**
 * Frontend social client - talks to the real server API (/api/social/*).
 * Reads are cached with react-query; writes are authenticated by a signature
 * from the connected wallet (ADR-36 where the wallet supports signArbitrary,
 * otherwise a SIGN_MODE_DIRECT sign doc), so a user can only edit their own
 * profile or act as themselves.
 */

export type Profile = {
  username?: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  banner?: string;
  twitter?: string;
  telegram?: string;
};

export type Graph = {
  /** Addresses that follow this user. */
  followers: string[];
  /** Addresses this user follows. */
  following: string[];
  followerCount: number;
  followingCount: number;
  viewerFollows: boolean;
};

/** Matches the server's socialAuthMessage(action, ts). */
function authMessage(action: string, ts: number): string {
  return `ansem social: ${action}\nts: ${ts}`;
}

export interface Signer {
  address: string | null;
  signSocial: (message: string) => Promise<SocialSignature>;
}

// ── reads ─────────────────────────────────────────────────────────────────

export function useProfile(address: string) {
  return useQuery({
    queryKey: ["social", "profile", address],
    queryFn: async (): Promise<Profile> => {
      const r = await fetch(`/api/social/profile/${address}`);
      if (!r.ok) return {};
      const j = (await r.json()) as { profile?: Profile };
      return j.profile ?? {};
    },
    enabled: Boolean(address),
    staleTime: 60_000,
  });
}

export function useGraph(address: string, viewer?: string | null) {
  return useQuery({
    queryKey: ["social", "graph", address, viewer ?? ""],
    queryFn: async (): Promise<Graph> => {
      const qs = viewer ? `?viewer=${encodeURIComponent(viewer)}` : "";
      const r = await fetch(`/api/social/graph/${address}${qs}`);
      if (!r.ok) return { followers: [], following: [], followerCount: 0, followingCount: 0, viewerFollows: false };
      return (await r.json()) as Graph;
    },
    enabled: Boolean(address),
    staleTime: 30_000,
  });
}

// ── writes (signed) ─────────────────────────────────────────────────────────

export async function saveProfile(address: string, profile: Profile, signer: Signer): Promise<Profile> {
  const ts = Date.now();
  const sig = await signer.signSocial(authMessage(editProfileSignAction(), ts));
  const r = await fetch("/api/social/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, profile, ts, ...sig }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string; code?: string };
    const err = new Error(body.error ?? "Could not save profile") as Error & { code?: string };
    err.code = body.code;
    throw err;
  }
  return ((await r.json()) as { profile: Profile }).profile;
}

export async function setFollow(
  follower: string,
  target: string,
  follow: boolean,
  signer: Signer,
): Promise<boolean> {
  const ts = Date.now();
  const sig = await signer.signSocial(authMessage(followSignAction(target, follow), ts));
  const r = await fetch("/api/social/follow", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ follower, target, follow, ts, ...sig }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not update follow");
  return ((await r.json()) as { following: boolean }).following;
}

// ── posts ("tweets") + token comments ───────────────────────────────────────

export type Post = {
  id: string;
  author: string;
  text: string;
  createdAt: number;
  /** Attached token address (a preview) or, on comments, the commented token. */
  token?: string;
  /** Inline image data URL. */
  image?: string;
  /** Id of a post this one quotes. */
  quoteOf?: string;
  /** Resolved + inlined by the server when this post quotes another. */
  quoted?: Post;
  /** Engagement counts (present on the feed list). */
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  /** Present when a viewer is supplied to usePosts. */
  viewerLiked?: boolean;
  viewerReposted?: boolean;
};

/** Global (or by-author) timeline. Pass `viewer` to get like/repost flags + reconcile toggles. */
export function usePosts(viewer?: string | null, author?: string) {
  return useQuery({
    queryKey: ["social", "posts", author ?? "all", viewer ?? ""],
    queryFn: async (): Promise<Post[]> => {
      const params = new URLSearchParams();
      if (author) params.set("author", author);
      if (viewer) params.set("viewer", viewer);
      const qs = params.toString();
      const r = await fetch(`/api/social/post${qs ? `?${qs}` : ""}`);
      if (!r.ok) return [];
      return ((await r.json()) as { posts: Post[] }).posts ?? [];
    },
    staleTime: 15_000,
  });
}

/** Mutate every cached posts list so an optimistic toggle shows everywhere. */
function patchCachedPosts(
  qc: ReturnType<typeof useQueryClient>,
  postId: string,
  patch: (p: Post) => Post,
) {
  qc.setQueriesData<Post[]>({ queryKey: ["social", "posts"] }, (old) =>
    old ? old.map((p) => (p.id === postId ? patch(p) : p)) : old,
  );
  // Also patch the single-post detail cache (/post/[id]) so its counts + flags
  // reflect the same optimistic toggle.
  qc.setQueriesData<Post | null>({ queryKey: ["social", "post", postId] }, (old) =>
    old && old.id === postId ? patch(old) : old,
  );
}

/** A single post by id (+ engagement counts), for the isolated /post/[id] view. */
export function usePost(id: string, viewer?: string | null) {
  return useQuery({
    queryKey: ["social", "post", id, viewer ?? ""],
    queryFn: async (): Promise<Post | null> => {
      const qs = viewer ? `?viewer=${encodeURIComponent(viewer)}` : "";
      const r = await fetch(`/api/social/post/${encodeURIComponent(id)}${qs}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("Could not load post");
      return ((await r.json()) as { post: Post }).post;
    },
    enabled: Boolean(id),
    staleTime: 15_000,
    retry: false,
  });
}

/** Like / unlike a post, signed by the acting wallet. Returns the new count. */
export async function toggleLike(
  postId: string,
  viewer: string,
  like: boolean,
  signer: Signer,
): Promise<{ count: number }> {
  const ts = Date.now();
  const sig = await signer.signSocial(authMessage(likeSignAction(postId, like), ts));
  const r = await fetch("/api/social/post/like", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ postId, user: viewer, like, ts, ...sig }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not like");
  return (await r.json()) as { count: number };
}

/** Repost / un-repost a post, signed by the acting wallet. Returns the new count. */
export async function toggleRepost(
  postId: string,
  viewer: string,
  repost: boolean,
  signer: Signer,
): Promise<{ count: number }> {
  const ts = Date.now();
  const sig = await signer.signSocial(authMessage(repostSignAction(postId, repost), ts));
  const r = await fetch("/api/social/post/repost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ postId, user: viewer, repost, ts, ...sig }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not repost");
  return (await r.json()) as { count: number };
}

/** Optimistic like mutation: flips the cached flag/count, reconciles on settle. */
export function useLikePost(viewer?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, like, signer }: { postId: string; like: boolean; signer: Signer }) => {
      if (!viewer) throw new Error("Connect a wallet first.");
      return toggleLike(postId, viewer, like, signer);
    },
    onMutate: async ({ postId, like }) => {
      await qc.cancelQueries({ queryKey: ["social", "posts"] });
      await qc.cancelQueries({ queryKey: ["social", "post", postId] });
      const prev = qc.getQueriesData<Post[]>({ queryKey: ["social", "posts"] });
      const prevOne = qc.getQueriesData<Post | null>({ queryKey: ["social", "post", postId] });
      patchCachedPosts(qc, postId, (p) => ({
        ...p,
        viewerLiked: like,
        likeCount: Math.max(0, (p.likeCount ?? 0) + (like ? 1 : -1)),
      }));
      return { prev, prevOne };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));
      ctx?.prevOne.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: (_d, _e, { postId }) => {
      void qc.invalidateQueries({ queryKey: ["social", "posts"] });
      void qc.invalidateQueries({ queryKey: ["social", "post", postId] });
    },
  });
}

/** Optimistic repost mutation: flips the cached flag/count, reconciles on settle. */
export function useRepostPost(viewer?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, repost, signer }: { postId: string; repost: boolean; signer: Signer }) => {
      if (!viewer) throw new Error("Connect a wallet first.");
      return toggleRepost(postId, viewer, repost, signer);
    },
    onMutate: async ({ postId, repost }) => {
      await qc.cancelQueries({ queryKey: ["social", "posts"] });
      await qc.cancelQueries({ queryKey: ["social", "post", postId] });
      const prev = qc.getQueriesData<Post[]>({ queryKey: ["social", "posts"] });
      const prevOne = qc.getQueriesData<Post | null>({ queryKey: ["social", "post", postId] });
      patchCachedPosts(qc, postId, (p) => ({
        ...p,
        viewerReposted: repost,
        repostCount: Math.max(0, (p.repostCount ?? 0) + (repost ? 1 : -1)),
      }));
      return { prev, prevOne };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));
      ctx?.prevOne.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: (_d, _e, { postId }) => {
      void qc.invalidateQueries({ queryKey: ["social", "posts"] });
      void qc.invalidateQueries({ queryKey: ["social", "post", postId] });
    },
  });
}

/** A post's replies, newest first. */
export function usePostReplies(postId: string, enabled = true) {
  return useQuery({
    queryKey: ["social", "replies", postId],
    queryFn: async (): Promise<Post[]> => {
      const r = await fetch(`/api/social/post/reply?postId=${encodeURIComponent(postId)}`);
      if (!r.ok) return [];
      return ((await r.json()) as { replies: Post[] }).replies ?? [];
    },
    enabled: Boolean(postId) && enabled,
    staleTime: 15_000,
  });
}

/** Reply to a post, signed by the acting wallet. */
export async function addPostReply(
  postId: string,
  author: string,
  text: string,
  signer: Signer,
): Promise<Post> {
  const ts = Date.now();
  const sig = await signer.signSocial(authMessage(replySignAction(postId, text), ts));
  const r = await fetch("/api/social/post/reply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ postId, author, text, ts, ...sig }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not reply");
  return ((await r.json()) as { reply: Post }).reply;
}

/** Optional attachments for a new post. */
export type PostAttachments = { image?: string; token?: string; quoteOf?: string };

export async function addPost(
  author: string,
  text: string,
  signer: Signer,
  opts?: PostAttachments,
): Promise<Post> {
  const ts = Date.now();
  const action = postSignAction(text, {
    image: opts?.image,
    token: opts?.token,
    quoteOf: opts?.quoteOf,
  });
  const sig = await signer.signSocial(authMessage(action, ts));
  const r = await fetch("/api/social/post", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      author,
      text,
      image: opts?.image,
      token: opts?.token,
      quoteOf: opts?.quoteOf,
      ts,
      ...sig,
    }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not post");
  return ((await r.json()) as { post: Post }).post;
}

/** Convenience: quote an existing post with optional text / image / token. */
export function quotePost(
  author: string,
  text: string,
  quoteOf: string,
  signer: Signer,
  extra?: { image?: string; token?: string },
): Promise<Post> {
  return addPost(author, text, signer, { ...extra, quoteOf });
}

export type FollowEvent = { follower: string; target: string; createdAt: number };

export function useFollowEvents(target?: string) {
  return useQuery({
    queryKey: ["social", "events", target ?? "all"],
    queryFn: async (): Promise<FollowEvent[]> => {
      const qs = target ? `?target=${encodeURIComponent(target)}` : "";
      const r = await fetch(`/api/social/events${qs}`);
      if (!r.ok) return [];
      return ((await r.json()) as { events: FollowEvent[] }).events ?? [];
    },
    staleTime: 15_000,
  });
}

export function useComments(token: string) {
  return useQuery({
    queryKey: ["social", "comments", token],
    queryFn: async (): Promise<Post[]> => {
      const r = await fetch(`/api/social/comments/${token}`);
      if (!r.ok) return [];
      return ((await r.json()) as { comments: Post[] }).comments ?? [];
    },
    enabled: Boolean(token),
    staleTime: 15_000,
  });
}

export async function addComment(token: string, author: string, text: string, signer: Signer): Promise<Post> {
  const ts = Date.now();
  const sig = await signer.signSocial(authMessage(commentSignAction(token, text), ts));
  const r = await fetch("/api/social/comment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ author, token, text, ts, ...sig }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not comment");
  return ((await r.json()) as { comment: Post }).comment;
}
