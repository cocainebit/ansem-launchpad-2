import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Real, server-side social store: profiles + a follow graph, persisted to disk
 * and shared across every viewer hitting this server. No external deps.
 *
 * Writes are serialized through an in-process queue and committed atomically
 * (temp file + rename). This is a single-process store; the shape is abstracted
 * so it can be swapped for Postgres/SQLite behind the same functions when the
 * app runs multi-instance / serverless.
 */

export type Profile = {
  /** Unique handle bound to this address (canonical lowercase, no leading @). */
  username?: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  banner?: string;
  twitter?: string;
  telegram?: string;
  updatedAt?: number;
};

/** 3-20 chars, lowercase letters / digits / underscore. */
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export class SocialError extends Error {
  constructor(public code: "username_taken" | "username_invalid", message: string) {
    super(message);
    this.name = "SocialError";
  }
}

/** Normalize a submitted handle: strip a leading @, lowercase, trim. */
export function canonicalUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export type Post = {
  id: string;
  author: string;
  text: string;
  createdAt: number;
  /** Present on comments: the token address the comment is on. Also carries an
   *  attached token preview when a post links a token. */
  token?: string;
  /** Inline image data URL attached to the post. */
  image?: string;
  /** Id of a post this one quotes. */
  quoteOf?: string;
  /** Resolved + inlined on read when this post has a quoteOf. */
  quoted?: Post;
  /** The post's id in the on-chain ansem-social contract, when it was relayed
   *  on-chain (its text + author are signature-verified by the contract). */
  onchainId?: string;
  /** The tx hash that recorded this post on-chain (for an explorer link). */
  txhash?: string;
};

/** Optional attachments for a new post. */
export type PostOpts = { image?: string; token?: string; quoteOf?: string };

export type FollowEvent = { follower: string; target: string; createdAt: number };

/** A post plus its engagement counts (and viewer flags when a viewer is given). */
export type PostWithMeta = Post & {
  likeCount: number;
  repostCount: number;
  replyCount: number;
  viewerLiked?: boolean;
  viewerReposted?: boolean;
};

type DB = {
  profiles: Record<string, Profile>;
  /** canonical username -> address (unique handle index) */
  usernames: Record<string, string>;
  /** follower address -> list of target addresses it follows */
  follows: Record<string, string[]>;
  /** user posts ("tweets"), newest last */
  posts: Post[];
  /** token address -> comments, newest last */
  comments: Record<string, Post[]>;
  /** follow events (for activity feeds), newest last */
  followEvents: FollowEvent[];
  /** post id -> addresses that liked it */
  postLikes: Record<string, string[]>;
  /** post id -> addresses that reposted it */
  postReposts: Record<string, string[]>;
  /** post id -> replies, newest last */
  postReplies: Record<string, Post[]>;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "social.json");

// Profiles persist to the indexer's Postgres (persistent, works on a
// serverless read-only filesystem where the disk store below cannot). When
// SOCIAL_WRITE_TOKEN is set, the four profile functions use the remote store;
// otherwise they fall back to the local disk store (dev convenience).
const SOCIAL_API_BASE = (
  process.env.SOCIAL_API_BASE ??
  process.env.NEXT_PUBLIC_INDEXER_HTTP ??
  "https://api.ansemchain.fun/api"
).replace(/\/$/, "");
const SOCIAL_WRITE_TOKEN = process.env.SOCIAL_WRITE_TOKEN ?? "";
const useRemoteProfiles = SOCIAL_WRITE_TOKEN.length > 0;
// The rest of the SocialFi layer (follow graph, posts/feed, likes/reposts/
// replies, comments) persists to the same indexer Postgres under the same
// condition. Reads hit the public GET routes; writes POST with the bearer.
const useRemoteSocial = SOCIAL_WRITE_TOKEN.length > 0;

/** Bearer-authenticated POST to a social write endpoint. */
async function socialWrite<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SOCIAL_API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${SOCIAL_WRITE_TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `social store HTTP ${res.status}`);
  return data;
}

let cache: DB | null = null;
/**
 * Mtime of the on-disk file that `cache` was built from. Next.js bundles each
 * route handler as its own module-graph instance, so this module (and its
 * `cache`) exists once PER ROUTE, not once per server. The disk file is the only
 * thing all routes share. If `load()` memoized `cache` forever, a profile written
 * by the POST /api/social/profile route would never be seen by the GET
 * /api/social/profile/[address] route (its own cache was populated earlier and
 * never refreshed) - which is exactly why a saved profile did not appear even on
 * reload. So we re-read whenever the file's mtime has moved since we last read.
 */
let cachedMtimeMs = -1;
let queue: Promise<unknown> = Promise.resolve();

function emptyDB(): DB {
  return {
    profiles: {},
    usernames: {},
    follows: {},
    posts: [],
    comments: {},
    followEvents: [],
    postLikes: {},
    postReposts: {},
    postReplies: {},
  };
}

/** Backfill any keys a persisted DB predates so callers never touch undefined. */
function normalize(db: DB): DB {
  if (!db.profiles) db.profiles = {};
  if (!db.usernames) db.usernames = {};
  if (!db.follows) db.follows = {};
  if (!db.posts) db.posts = [];
  if (!db.comments) db.comments = {};
  if (!db.followEvents) db.followEvents = [];
  if (!db.postLikes) db.postLikes = {};
  if (!db.postReposts) db.postReposts = {};
  if (!db.postReplies) db.postReplies = {};
  return db;
}

async function load(): Promise<DB> {
  let mtimeMs = -1;
  try {
    mtimeMs = (await fs.stat(DB_PATH)).mtimeMs;
  } catch {
    // No file yet: start empty and keep it until something is persisted.
    if (!cache) {
      cache = emptyDB();
      cachedMtimeMs = -1;
    }
    return normalize(cache);
  }
  // Re-read when we have nothing cached, or the file changed under us (another
  // route module, or another process, wrote to it since our last read).
  if (!cache || mtimeMs !== cachedMtimeMs) {
    try {
      cache = JSON.parse(await fs.readFile(DB_PATH, "utf8")) as DB;
    } catch {
      cache = emptyDB();
    }
    cachedMtimeMs = mtimeMs;
  }
  return normalize(cache);
}

async function persist(db: DB): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db), "utf8");
  await fs.rename(tmp, DB_PATH);
  // Track the freshly written file's mtime so this module's own next read does
  // not needlessly re-parse, while a DIFFERENT route module (with a different
  // cachedMtimeMs) still detects the change and reloads.
  cache = db;
  try {
    cachedMtimeMs = (await fs.stat(DB_PATH)).mtimeMs;
  } catch {
    cachedMtimeMs = -1;
  }
}

/** Serialize a read-modify-write so concurrent requests don't clobber. */
function withWrite<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  queue = run.then(
    () => {},
    () => {},
  );
  return run;
}

// ── reads ───────────────────────────────────────────────────────────────────

export async function getProfile(address: string): Promise<Profile> {
  if (useRemoteProfiles) {
    const res = await fetch(`${SOCIAL_API_BASE}/social/profile/${address}`, { cache: "no-store" });
    if (!res.ok) return {};
    return ((await res.json()) as { profile?: Profile }).profile ?? {};
  }
  const db = await load();
  return db.profiles[address] ?? {};
}

export async function getGraph(address: string): Promise<{
  followers: string[];
  following: string[];
  followerCount: number;
  followingCount: number;
}> {
  if (useRemoteSocial) {
    const res = await fetch(`${SOCIAL_API_BASE}/social/graph/${address}`, { cache: "no-store" });
    if (!res.ok) return { followers: [], following: [], followerCount: 0, followingCount: 0 };
    const d = (await res.json()) as {
      followers?: string[]; following?: string[]; followerCount?: number; followingCount?: number;
    };
    const followers = d.followers ?? [];
    const following = d.following ?? [];
    return {
      followers,
      following,
      followerCount: d.followerCount ?? followers.length,
      followingCount: d.followingCount ?? following.length,
    };
  }
  const db = await load();
  const following = db.follows[address] ?? [];
  const followers = Object.keys(db.follows).filter((f) => (db.follows[f] ?? []).includes(address));
  return { followers, following, followerCount: followers.length, followingCount: following.length };
}

export async function isFollowing(follower: string, target: string): Promise<boolean> {
  if (useRemoteSocial) {
    const res = await fetch(
      `${SOCIAL_API_BASE}/social/is-following?follower=${encodeURIComponent(follower)}&target=${encodeURIComponent(target)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return false;
    return ((await res.json()) as { following?: boolean }).following ?? false;
  }
  const db = await load();
  return (db.follows[follower] ?? []).includes(target);
}

// ── writes ──────────────────────────────────────────────────────────────────

export async function upsertProfile(address: string, profile: Profile): Promise<Profile> {
  if (useRemoteProfiles) {
    const res = await fetch(`${SOCIAL_API_BASE}/social/profile`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SOCIAL_WRITE_TOKEN}` },
      body: JSON.stringify({ address, profile }),
    });
    const data = (await res.json().catch(() => ({}))) as { profile?: Profile; error?: string; code?: string };
    if (!res.ok) {
      if (data.code === "username_taken") throw new SocialError("username_taken", data.error ?? "username taken");
      if (data.code === "username_invalid") throw new SocialError("username_invalid", data.error ?? "invalid username");
      throw new Error(data.error ?? `profile store HTTP ${res.status}`);
    }
    return data.profile ?? {};
  }
  return withWrite((db) => {
    const next: Profile = { ...profile, updatedAt: Date.now() };

    // Reconcile the unique username index. A profile save is a full replace, so
    // treat an absent/blank username as "release my handle".
    const oldHandle = db.profiles[address]?.username;
    let newHandle: string | undefined;
    const submitted = typeof profile.username === "string" ? canonicalUsername(profile.username) : "";
    if (submitted) {
      if (!USERNAME_RE.test(submitted)) {
        throw new SocialError("username_invalid", "username must be 3-20 chars: a-z, 0-9, _");
      }
      const owner = db.usernames[submitted];
      if (owner && owner !== address) {
        throw new SocialError("username_taken", `@${submitted} is taken`);
      }
      newHandle = submitted;
    }
    if (newHandle !== oldHandle) {
      if (oldHandle && db.usernames[oldHandle] === address) delete db.usernames[oldHandle];
      if (newHandle) db.usernames[newHandle] = address;
    }
    next.username = newHandle;

    // Drop empty fields so they don't overwrite with blanks.
    (Object.keys(next) as (keyof Profile)[]).forEach((k) => {
      if (next[k] === "" || next[k] == null) delete next[k];
    });
    db.profiles[address] = next;
    return next;
  });
}

/** Resolve a handle (with or without leading @) to its bound address, or null. */
export async function resolveUsername(raw: string): Promise<string | null> {
  if (useRemoteProfiles) {
    const res = await fetch(`${SOCIAL_API_BASE}/social/resolve/${encodeURIComponent(canonicalUsername(raw))}`, { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { address?: string | null }).address ?? null;
  }
  const db = await load();
  const handle = canonicalUsername(raw);
  return db.usernames[handle] ?? null;
}

export type ProfileHit = { address: string } & Profile;

/** Search profiles by username, display name, or address prefix. */
export async function searchProfiles(query: string, limit = 8): Promise<ProfileHit[]> {
  if (useRemoteProfiles) {
    const res = await fetch(`${SOCIAL_API_BASE}/social/search?q=${encodeURIComponent(query)}&limit=${limit}`, { cache: "no-store" });
    if (!res.ok) return [];
    return ((await res.json()) as { hits?: ProfileHit[] }).hits ?? [];
  }
  const db = await load();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const bare = q.replace(/^@+/, "");
  const hits: Array<{ hit: ProfileHit; rank: number }> = [];
  for (const [address, profile] of Object.entries(db.profiles)) {
    const uname = (profile.username ?? "").toLowerCase();
    const dname = (profile.displayName ?? "").toLowerCase();
    let rank = -1;
    if (uname && uname === bare) rank = 0;
    else if (uname && uname.startsWith(bare)) rank = 1;
    else if (dname && dname.startsWith(q)) rank = 2;
    else if (uname && uname.includes(bare)) rank = 3;
    else if (dname && dname.includes(q)) rank = 4;
    else if (address.toLowerCase().startsWith(bare)) rank = 5;
    if (rank >= 0) hits.push({ hit: { address, ...profile }, rank });
  }
  hits.sort((a, b) => a.rank - b.rank);
  return hits.slice(0, Math.min(limit, 25)).map((h) => h.hit);
}

export function setFollow(follower: string, target: string, follow: boolean): Promise<boolean> {
  if (useRemoteSocial) {
    return socialWrite<{ following?: boolean }>("/social/follow", { follower, target, follow }).then(
      (d) => d.following ?? follow,
    );
  }
  return withWrite((db) => {
    const set = new Set(db.follows[follower] ?? []);
    const wasFollowing = set.has(target);
    if (follow) set.add(target);
    else set.delete(target);
    db.follows[follower] = [...set];
    // Log a follow event for activity feeds (only on a new follow).
    if (follow && !wasFollowing) {
      db.followEvents.push({ follower, target, createdAt: Date.now() });
    }
    return follow;
  });
}

export async function listFollowEvents(opts: { target?: string; limit?: number }): Promise<FollowEvent[]> {
  if (useRemoteSocial) {
    const qs = new URLSearchParams();
    if (opts.target) qs.set("target", opts.target);
    if (opts.limit != null) qs.set("limit", String(opts.limit));
    const res = await fetch(`${SOCIAL_API_BASE}/social/follow-events?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) return [];
    return ((await res.json()) as { events?: FollowEvent[] }).events ?? [];
  }
  const db = await load();
  const limit = Math.min(opts.limit ?? 50, 200);
  let list = db.followEvents;
  if (opts.target) list = list.filter((e) => e.target === opts.target || e.follower === opts.target);
  return [...list].reverse().slice(0, limit);
}

// ── posts + comments ─────────────────────────────────────────────────────────

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function listPosts(opts: {
  author?: string;
  limit?: number;
  viewer?: string;
}): Promise<PostWithMeta[]> {
  if (useRemoteSocial) {
    const qs = new URLSearchParams();
    if (opts.author) qs.set("author", opts.author);
    if (opts.viewer) qs.set("viewer", opts.viewer);
    if (opts.limit != null) qs.set("limit", String(opts.limit));
    const res = await fetch(`${SOCIAL_API_BASE}/social/posts?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) return [];
    return ((await res.json()) as { posts?: PostWithMeta[] }).posts ?? [];
  }
  const db = await load();
  const limit = Math.min(opts.limit ?? 50, 200);
  let list = db.posts;
  if (opts.author) list = list.filter((p) => p.author === opts.author);
  return [...list]
    .reverse()
    .slice(0, limit)
    .map((p) => withMeta(db, p, opts.viewer));
}

/** Attach engagement counts (and viewer flags when a viewer is supplied). */
function withMeta(db: DB, p: Post, viewer?: string): PostWithMeta {
  const likes = db.postLikes[p.id] ?? [];
  const reposts = db.postReposts[p.id] ?? [];
  const replies = db.postReplies[p.id] ?? [];
  const meta: PostWithMeta = {
    ...p,
    likeCount: likes.length,
    repostCount: reposts.length,
    replyCount: replies.length,
  };
  // Inline the quoted post (one pass) so the card can render it without a
  // second fetch. Guard against a self-reference / missing target.
  if (p.quoteOf && p.quoteOf !== p.id) {
    const q = db.posts.find((x) => x.id === p.quoteOf);
    if (q) meta.quoted = { ...q, quoted: undefined };
  }
  if (viewer) {
    meta.viewerLiked = likes.includes(viewer);
    meta.viewerReposted = reposts.includes(viewer);
  }
  return meta;
}

export function addPost(
  author: string,
  text: string,
  opts?: PostOpts & { onchainId?: string; txhash?: string },
): Promise<Post> {
  if (useRemoteSocial) {
    return socialWrite<{ post?: Post }>("/social/post", {
      author,
      text,
      image: opts?.image,
      token: opts?.token,
      quoteOf: opts?.quoteOf,
      onchainId: opts?.onchainId,
      txhash: opts?.txhash,
    }).then((d) => d.post ?? { id: newId(), author, text, createdAt: Date.now() });
  }
  return withWrite((db) => {
    const post: Post = { id: newId(), author, text, createdAt: Date.now() };
    if (opts?.image) post.image = opts.image;
    if (opts?.token) post.token = opts.token;
    if (opts?.quoteOf) post.quoteOf = opts.quoteOf;
    if (opts?.onchainId) post.onchainId = opts.onchainId;
    if (opts?.txhash) post.txhash = opts.txhash;
    db.posts.push(post);
    return post;
  });
}

/** Does a post with this id exist? (used to validate a quoteOf target). */
export async function postExists(id: string): Promise<boolean> {
  if (useRemoteSocial) {
    const res = await fetch(`${SOCIAL_API_BASE}/social/post-exists/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) return false;
    return ((await res.json()) as { exists?: boolean }).exists ?? false;
  }
  const db = await load();
  return db.posts.some((p) => p.id === id);
}

/**
 * A single post by id, with engagement counts (and viewer flags when a viewer is
 * supplied). Returns null when no post with that id exists. Backs the isolated
 * /post/[id] detail view.
 */
export async function getPost(id: string, viewer?: string): Promise<PostWithMeta | null> {
  if (useRemoteSocial) {
    const qs = viewer ? `?viewer=${encodeURIComponent(viewer)}` : "";
    const res = await fetch(`${SOCIAL_API_BASE}/social/post/${encodeURIComponent(id)}${qs}`, { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { post?: PostWithMeta | null }).post ?? null;
  }
  const db = await load();
  const p = db.posts.find((x) => x.id === id);
  if (!p) return null;
  return withMeta(db, p, viewer);
}

// ── post engagement: likes, reposts, replies ─────────────────────────────────

/** Toggle a viewer's like on a post. Returns the new like count. */
export function togglePostLike(postId: string, user: string, like: boolean): Promise<{ count: number }> {
  if (useRemoteSocial) {
    return socialWrite<{ count?: number }>("/social/post-like", { postId, user, like }).then((d) => ({
      count: d.count ?? 0,
    }));
  }
  return withWrite((db) => {
    const set = new Set(db.postLikes[postId] ?? []);
    if (like) set.add(user);
    else set.delete(user);
    db.postLikes[postId] = [...set];
    return { count: set.size };
  });
}

/** Toggle a viewer's repost of a post. Returns the new repost count. */
export function togglePostRepost(
  postId: string,
  user: string,
  repost: boolean,
): Promise<{ count: number }> {
  if (useRemoteSocial) {
    return socialWrite<{ count?: number }>("/social/post-repost", { postId, user, repost }).then((d) => ({
      count: d.count ?? 0,
    }));
  }
  return withWrite((db) => {
    const set = new Set(db.postReposts[postId] ?? []);
    if (repost) set.add(user);
    else set.delete(user);
    db.postReposts[postId] = [...set];
    return { count: set.size };
  });
}

export function addPostReply(
  postId: string,
  author: string,
  text: string,
  onchain?: { onchainId?: string; txhash?: string },
): Promise<Post> {
  if (useRemoteSocial) {
    return socialWrite<{ reply?: Post }>("/social/post-reply", {
      postId,
      author,
      text,
      onchainId: onchain?.onchainId,
      txhash: onchain?.txhash,
    }).then((d) => d.reply ?? { id: newId(), author, text, createdAt: Date.now() });
  }
  return withWrite((db) => {
    const reply: Post = { id: newId(), author, text, createdAt: Date.now() };
    if (onchain?.onchainId) reply.onchainId = onchain.onchainId;
    if (onchain?.txhash) reply.txhash = onchain.txhash;
    if (!db.postReplies[postId]) db.postReplies[postId] = [];
    db.postReplies[postId].push(reply);
    return reply;
  });
}

export async function listPostReplies(postId: string, limit = 100): Promise<Post[]> {
  if (useRemoteSocial) {
    const res = await fetch(
      `${SOCIAL_API_BASE}/social/replies?postId=${encodeURIComponent(postId)}&limit=${limit}`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    return ((await res.json()) as { replies?: Post[] }).replies ?? [];
  }
  const db = await load();
  const list = db.postReplies[postId] ?? [];
  return [...list].reverse().slice(0, Math.min(limit, 300));
}

export async function listComments(token: string, limit = 100): Promise<Post[]> {
  if (useRemoteSocial) {
    const res = await fetch(
      `${SOCIAL_API_BASE}/social/comments/${encodeURIComponent(token)}?limit=${limit}`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    return ((await res.json()) as { comments?: Post[] }).comments ?? [];
  }
  const db = await load();
  const list = db.comments[token] ?? [];
  return [...list].reverse().slice(0, Math.min(limit, 300));
}

export function addComment(token: string, author: string, text: string): Promise<Post> {
  if (useRemoteSocial) {
    return socialWrite<{ comment?: Post }>("/social/comment", { token, author, text }).then(
      (d) => d.comment ?? { id: newId(), author, text, token, createdAt: Date.now() },
    );
  }
  return withWrite((db) => {
    const comment: Post = { id: newId(), author, text, token, createdAt: Date.now() };
    if (!db.comments[token]) db.comments[token] = [];
    db.comments[token].push(comment);
    return comment;
  });
}
