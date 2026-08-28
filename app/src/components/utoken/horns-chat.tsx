"use client";

import { useEffect, useRef, useState } from "react";
import { PaperPlaneRight, Sparkle } from "@phosphor-icons/react";

type Msg = { role: "user" | "assistant"; content: string };

/** Inline Horns assistant. Lives under the code preview and is grounded in the
 *  currently selected contract (its source is sent to the model server-side). */
export function HornsChat({ focusName, focusSlug }: { focusName?: string; focusSlug?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const starters = focusName
    ? [`How does the ${focusName} work?`, `When would I use the ${focusName}?`, "Can one pool run several Horns?"]
    : ["What exactly is a Horn?", "How does the Horn Vault pay stakers?", "What stops a Horn from draining a pool?"];

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/horns-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, focus: focusSlug }),
      });
      const data = (await res.json()) as { reply?: string };
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "Something went wrong." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "The assistant is unavailable right now. Try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#1e1e22] bg-[#0e0e10]/80">
      <header className="flex items-center justify-between gap-3 border-b border-[#1e1e22] px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkle size={16} weight="fill" className="text-[#6cf07f]" />
          <span className="font-display text-[14px] font-semibold text-white">Ask the Horns assistant</span>
        </div>
        <span className="hidden font-mono text-[11px] text-zinc-600 sm:block">
          {focusName ? `grounded in ${focusName}` : "grounded in the contracts"}
        </span>
      </header>

      <div ref={scrollRef} className="max-h-[380px] min-h-[160px] space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="ansem-fade-in">
            <p className="text-[13px] leading-5 text-zinc-400">
              Ask anything about {focusName ? `the ${focusName}` : "the Horns"}. Answers are grounded in the
              contract source on this page.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-lg border border-[#1e1e22] bg-[#141416] px-3 py-1.5 text-left text-[12px] text-zinc-300 transition-colors hover:border-[#2a2a30] hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`ansem-fade-in flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-5 ${
                  m.role === "user" ? "bg-[#6cf07f] text-black" : "border border-[#1e1e22] bg-[#141416] text-zinc-200"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="ansem-fade-in flex justify-start">
            <div className="rounded-2xl border border-[#1e1e22] bg-[#141416] px-3 py-2 text-[13px] text-zinc-500">
              Thinking...
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-[#1e1e22] bg-[#111113] p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={focusName ? `Ask about the ${focusName}...` : "Ask about the Horns..."}
          className="h-10 flex-1 rounded-lg border border-[#1e1e22] bg-[#0c0c0e] px-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#2a2a30]"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#6cf07f] text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <PaperPlaneRight size={16} weight="fill" />
        </button>
      </form>
    </section>
  );
}
