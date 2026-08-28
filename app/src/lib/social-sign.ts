/**
 * The exact action string a post signature binds. Shared by the client
 * (src/lib/social.ts) and the server (src/app/api/social/post/route.ts) so a
 * signature also covers whether an image / token / quote is attached, which
 * keeps replay protection meaningful for those fields too.
 *
 * The base is `post:${text}`; attachments append stable markers:
 *   :img            when an inline image is attached
 *   :tok:<address>  when a token preview is attached
 *   :q:<postId>     when the post quotes another post
 *
 * This lives in its own pure module (no client/server-only imports) precisely so
 * both sides import the same function and cannot drift. verify.ts is untouched.
 */
export function postSignAction(
  text: string,
  opts?: { image?: boolean | string; token?: string; quoteOf?: string },
): string {
  let action = `post:${text}`;
  if (opts?.image) action += ":img";
  if (opts?.token) action += `:tok:${opts.token}`;
  if (opts?.quoteOf) action += `:q:${opts.quoteOf}`;
  return action;
}

/*
 * Shared action-string builders for every OTHER social write. Same contract as
 * postSignAction: each returns ONLY the action portion that gets wrapped as
 * `ansem social: <action>\nts: <ts>` (via authMessage on the client and
 * socialAuthMessage on the server). Because both sides import these exact
 * functions, the signed message and the server-reconstructed message cannot
 * drift - which is precisely what silently broke edit-profile / like / repost /
 * follow / comment / reply when client and server each built the string inline.
 */

/** Editing one's own profile. No fields are bound beyond the action + ts. */
export function editProfileSignAction(): string {
  return "edit-profile";
}

/** Follow / unfollow. Binds the target so a signature can't be reused elsewhere. */
export function followSignAction(target: string, follow: boolean): string {
  return `${follow ? "follow" : "unfollow"}:${target}`;
}

/** Like / unlike. Binds the post id; like and unlike differ so a toggle re-signs. */
export function likeSignAction(postId: string, like: boolean): string {
  return `${like ? "like" : "unlike"}:${postId}`;
}

/** Repost / un-repost. Binds the post id; the two directions differ, as with like. */
export function repostSignAction(postId: string, repost: boolean): string {
  return `${repost ? "repost" : "unrepost"}:${postId}`;
}

/** Comment on a token. Binds the token address + the exact comment text. */
export function commentSignAction(token: string, text: string): string {
  return `comment:${token}:${text}`;
}

/** Reply to a post. Binds the parent post id + the exact reply text. */
export function replySignAction(postId: string, text: string): string {
  return `reply-post:${postId}:${text}`;
}
