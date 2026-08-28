"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, TrendUp, User } from "@phosphor-icons/react";
import { useTokens } from "@/hooks/use-tokens";
import { DEFAULT_TOKEN_SUPPLY } from "@/lib/chain-config";
import type { TokenListItem } from "@/lib/api";

type ProfileHit = { address: string; username?: string; displayName?: string; avatar?: string };
type TopUser = { address: string; image: string | null; launchedValue: number };
type Item =
  | { kind: "profile"; key: string; profile: ProfileHit }
  | { kind: "token"; key: string; token: TokenListItem }
  | { kind: "creator"; key: string; creator: TopUser };

type Ctx = { open: () => void; close: () => void };
const CommandSearchContext = createContext<Ctx>({ open: () => {}, close: () => {} });

export function useCommandSearch() {
  return useContext(CommandSearchContext);
}

export function CommandSearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Global "/" and ⌘K / Ctrl+K to open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
      if (!typing && e.key === "/") {
        e.preventDefault();
        setIsOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <CommandSearchContext.Provider value={value}>
      {children}
      {isOpen && <SearchModal onClose={close} />}
    </CommandSearchContext.Provider>
  );
}

function SearchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data: tokens } = useTokens();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const [profiles, setProfiles] = useState<ProfileHit[]>([]);

  // Debounced people search against the social backend.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setProfiles([]);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/social/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { profiles?: ProfileHit[] };
        if (!cancelled) setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
      } catch {
        /* ignore search errors */
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  const tokenResults = useMemo(() => {
    const src = tokens ?? [];
    const byCap = [...src].sort(
      (a, b) =>
        Number(b.current_price) * b.market.solUsd -
        Number(a.current_price) * a.market.solUsd,
    );
    if (!query.trim()) return byCap.slice(0, 5);
    const q = query.toLowerCase();
    return byCap
      .filter(
        (t) =>
          t.symbol?.toLowerCase().includes(q) ||
          t.name?.toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [tokens, query]);

  // Empty-state "Top users": aggregate launched value per creator, top 5.
  const topUsers = useMemo<TopUser[]>(() => {
    if (query.trim()) return [];
    const map = new Map<string, TopUser>();
    for (const t of tokens ?? []) {
      const c = t.creator ?? t.address;
      const row = map.get(c) ?? { address: c, image: null, launchedValue: 0 };
      row.launchedValue += (Number(t.current_price) / 1e6) * t.market.solUsd * DEFAULT_TOKEN_SUPPLY;
      if (!row.image && t.image) row.image = t.image;
      map.set(c, row);
    }
    return [...map.values()].sort((a, b) => b.launchedValue - a.launchedValue).slice(0, 5);
  }, [tokens, query]);

  // One flat, keyboard-navigable list. Empty state: tokens then top users.
  // Query state: matched people first, then tokens (unchanged).
  const items = useMemo<Item[]>(() => {
    if (!query.trim()) {
      return [
        ...tokenResults.map((t) => ({ kind: "token" as const, key: `t-${t.address}`, token: t })),
        ...topUsers.map((u) => ({ kind: "creator" as const, key: `c-${u.address}`, creator: u })),
      ];
    }
    return [
      ...profiles.map((p) => ({ kind: "profile" as const, key: `p-${p.address}`, profile: p })),
      ...tokenResults.map((t) => ({ kind: "token" as const, key: `t-${t.address}`, token: t })),
    ];
  }, [profiles, tokenResults, topUsers, query]);

  useEffect(() => setActive(0), [query]);

  const go = useCallback(
    (item?: Item) => {
      if (!item) return;
      onClose();
      if (item.kind === "profile") router.push(`/creator/${item.profile.address}`);
      else if (item.kind === "creator") router.push(`/creator/${item.creator.address}`);
      else router.push(`/token/${item.token.address}`);
    },
    [onClose, router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        go(items[active]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, active, go, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--hairline-strong)] bg-[#1c1c1e] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-[var(--hairline)] px-4">
          <MagnifyingGlass size={18} className="text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tokens or @usernames..."
            className="h-14 flex-1 bg-transparent font-sans text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <kbd className="rounded border border-[var(--hairline)] px-1.5 py-0.5 font-mono text-[11px] text-zinc-500">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[52vh] overflow-y-auto px-2 py-2">
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center font-sans text-[13px] text-zinc-500">
              {query.trim() ? `Nothing matches “${query}”.` : "Type to search tokens and people."}
            </p>
          ) : (
            <>
              {profiles.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-600">
                  <User size={12} /> People
                </div>
              )}
              {profiles.map((p, i) => {
                const idx = i;
                const label = p.displayName || (p.username ? `@${p.username}` : shortAddr(p.address));
                return (
                  <button
                    key={`p-${p.address}`}
                    type="button"
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(items[idx])}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${
                      idx === active ? "bg-[#26262a]" : "hover:bg-[#232326]"
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--hairline)] bg-[#202022]">
                      {p.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <User size={16} weight="fill" className="text-zinc-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-display text-[14px] font-semibold text-zinc-100">{label}</span>
                      {p.username && (
                        <span className="ml-2 font-mono text-[12px] text-zinc-500">@{p.username}</span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-600">Profile</span>
                  </button>
                );
              })}

              {tokenResults.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-600">
                  <TrendUp size={12} />
                  {query.trim() ? "Tokens" : "Top 5 by market cap"}
                </div>
              )}
              {tokenResults.map((t, i) => {
                const idx = profiles.length + i;
                const cap =
                  (Number(t.current_price) / 1e6) * t.market.solUsd * DEFAULT_TOKEN_SUPPLY;
                const change = t.price_change_24h;
                return (
                  <button
                    key={t.address}
                    type="button"
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(items[idx])}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${
                      idx === active ? "bg-[#26262a]" : "hover:bg-[#232326]"
                    }`}
                  >
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-[var(--hairline)] bg-[#202022]">
                      {t.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center font-mono text-xs text-zinc-600">
                          {t.symbol?.slice(0, 1)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-display text-[14px] font-semibold text-[#6cf07f]">
                        {t.symbol}
                      </span>
                      <span className="ml-2 truncate font-sans text-[13px] text-zinc-400">
                        {t.name}
                      </span>
                    </div>
                    <span className="font-mono text-[13px] font-semibold text-zinc-100">
                      {usd(cap)}
                    </span>
                    <span
                      className={`w-14 text-right font-mono text-[12px] ${
                        change == null ? "text-zinc-600" : change >= 0 ? "text-[#4ade80]" : "text-[#ff5b5b]"
                      }`}
                    >
                      {change == null ? "-" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}
                    </span>
                  </button>
                );
              })}

              {topUsers.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-600">
                  <User size={12} /> Top users
                </div>
              )}
              {topUsers.map((u, i) => {
                const idx = tokenResults.length + i;
                return (
                  <button
                    key={`c-${u.address}`}
                    type="button"
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(items[idx])}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${
                      idx === active ? "bg-[#26262a]" : "hover:bg-[#232326]"
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--hairline)] bg-[#202022]">
                      {u.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <User size={16} weight="fill" className="text-zinc-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[14px] font-semibold text-zinc-100">
                        {shortAddr(u.address)}
                      </span>
                    </div>
                    <span className="font-mono text-[13px] font-semibold text-zinc-100">
                      {usd(u.launchedValue)}
                    </span>
                    <span className="w-14 text-right font-mono text-[11px] uppercase tracking-wider text-zinc-600">
                      Creator
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-[var(--hairline)] px-4 py-2.5 font-mono text-[11px] text-zinc-600">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
        </div>
      </div>
    </div>
  );
}

function usd(v: number): string {
  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(v || 0);
}

function shortAddr(a: string): string {
  return a.length <= 14 ? a : `${a.slice(0, 8)}…${a.slice(-4)}`;
}
