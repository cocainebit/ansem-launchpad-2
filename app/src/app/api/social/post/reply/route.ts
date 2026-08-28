import { NextResponse } from "next/server";
import { addPostReply, listPostReplies } from "@/lib/server/social-store";
import { verifySocial, socialAuthMessage, AUTH_MAX_AGE_MS, type SocialWriteBody } from "@/lib/server/verify";
import { replySignAction } from "@/lib/social-sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIX = "ansem";
const MAX_LEN = 500;

/** List a post's replies (?postId=). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const postId = url.searchParams.get("postId");
  if (!postId) return NextResponse.json({ error: "missing postId" }, { status: 400 });
  const replies = await listPostReplies(postId);
  return NextResponse.json({ replies });
}

/** Reply to a post. The signature binds the author to this post + text. */
export async function POST(req: Request) {
  let body: SocialWriteBody & {
    postId?: string;
    author?: string;
    text?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { postId, author, ts, signature, pubkey } = body;
  const text = (body.text ?? "").trim();
  if (!postId || !author || !text || !ts || !signature || !pubkey) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (text.length > MAX_LEN) {
    return NextResponse.json({ error: "too long" }, { status: 400 });
  }
  if (Math.abs(Date.now() - ts) > AUTH_MAX_AGE_MS) {
    return NextResponse.json({ error: "stale signature" }, { status: 401 });
  }
  const ok = await verifySocial({
    prefix: PREFIX,
    signer: author,
    message: socialAuthMessage(replySignAction(postId, text), ts),
    signatureB64: signature,
    pubkeyB64: pubkey,
    scheme: body.scheme,
    bodyBytesB64: body.bodyBytesB64,
    authInfoBytesB64: body.authInfoBytesB64,
    accountNumber: body.accountNumber,
    chainId: body.chainId,
  });
  if (!ok) {
    console.error("[social/post/reply] ADR-36 verify failed", { postId, author, ts });
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const reply = await addPostReply(postId, author, text);
  return NextResponse.json({ reply });
}
