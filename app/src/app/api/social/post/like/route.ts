import { NextResponse } from "next/server";
import { togglePostLike } from "@/lib/server/social-store";
import { verifySocial, socialAuthMessage, AUTH_MAX_AGE_MS, type SocialWriteBody } from "@/lib/server/verify";
import { likeSignAction } from "@/lib/social-sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIX = "ansem";

/** Like / unlike a post as the caller. Requires a valid ADR-36 signature. */
export async function POST(req: Request) {
  let body: SocialWriteBody & {
    postId?: string;
    user?: string;
    like?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const { postId, user, like, ts, signature, pubkey } = body;
  if (!postId || !user || typeof like !== "boolean" || !ts || !signature || !pubkey) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (Math.abs(Date.now() - ts) > AUTH_MAX_AGE_MS) {
    return NextResponse.json({ error: "stale signature" }, { status: 401 });
  }

  const ok = await verifySocial({
    prefix: PREFIX,
    signer: user,
    message: socialAuthMessage(likeSignAction(postId, like), ts),
    signatureB64: signature,
    pubkeyB64: pubkey,
    scheme: body.scheme,
    bodyBytesB64: body.bodyBytesB64,
    authInfoBytesB64: body.authInfoBytesB64,
    accountNumber: body.accountNumber,
    chainId: body.chainId,
  });
  if (!ok) {
    console.error("[social/post/like] ADR-36 verify failed", { postId, user, like, ts });
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const { count } = await togglePostLike(postId, user, like);
  return NextResponse.json({ count, liked: like });
}
